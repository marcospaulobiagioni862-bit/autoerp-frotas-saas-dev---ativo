import { randomUUID } from 'node:crypto';
import os from 'node:os';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { materializeCompanyAlerts, type AlertMaterializationResult } from '../domain/notifications/notificationMaterializer';

export const ALERT_SCHEDULER_JOB_KEY = 'ALERT_MATERIALIZATION';
const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;

export interface AlertSchedulerRunResult {
  acquired: boolean;
  runId?: string;
  executionBucket: string;
  status?: 'SUCCESS' | 'FAILED';
  companiesEvaluated: number;
  companiesFailed: number;
  notificationsCreated: number;
  tenantResults: AlertMaterializationResult[];
  errors: Array<{ companyId: string; message: string }>;
}

function rowsOf(result: any): any[] {
  return Array.isArray(result?.rows) ? result.rows : [];
}

export function schedulerExecutionBucket(now = new Date()): string {
  return now.toISOString().slice(0, 13) + ':00Z';
}

function schedulerIntervalMs(): number {
  const raw = Number(process.env.AUTOERP_SCHEDULER_INTERVAL_MS || DEFAULT_INTERVAL_MS);
  if (!Number.isFinite(raw) || raw < 60_000) return DEFAULT_INTERVAL_MS;
  return Math.floor(raw);
}

function schedulerInstanceId(): string {
  return process.env.AUTOERP_SCHEDULER_INSTANCE_ID || `${os.hostname()}:${process.pid}`;
}

async function acquireSchedulerRun(
  executionBucket: string,
  now: Date,
  instanceId: string
): Promise<string | null> {
  const id = randomUUID();
  const result = await db.execute(sql`
    INSERT INTO scheduler_runs (
      id, job_key, execution_bucket, started_at, status, instance_id, created_at
    ) VALUES (
      ${id}, ${ALERT_SCHEDULER_JOB_KEY}, ${executionBucket}, ${now.toISOString()}, 'RUNNING', ${instanceId}, ${now.toISOString()}
    )
    ON CONFLICT (job_key, execution_bucket) DO NOTHING
    RETURNING id
  `);
  return rowsOf(result)[0]?.id ? String(rowsOf(result)[0].id) : null;
}

async function finishSchedulerRun(
  runId: string,
  status: 'SUCCESS' | 'FAILED',
  metrics: Record<string, unknown>,
  errorMessage?: string
): Promise<void> {
  const finishedAt = new Date().toISOString();
  await db.execute(sql`
    UPDATE scheduler_runs SET
      finished_at = ${finishedAt},
      status = ${status},
      error_message = ${errorMessage || null},
      metrics_json = ${JSON.stringify(metrics)}
    WHERE id = ${runId}
  `);
}

async function activeCompanyIds(): Promise<string[]> {
  const result = await db.execute(sql`
    SELECT id FROM companies WHERE status = 'ACTIVE' ORDER BY id
  `);
  return rowsOf(result).map((row) => String(row.id));
}

export async function runAlertScheduler(options?: {
  now?: Date;
  executionBucket?: string;
  instanceId?: string;
}): Promise<AlertSchedulerRunResult> {
  const now = options?.now || new Date();
  const executionBucket = options?.executionBucket || schedulerExecutionBucket(now);
  const instanceId = options?.instanceId || schedulerInstanceId();
  const runId = await acquireSchedulerRun(executionBucket, now, instanceId);

  if (!runId) {
    return {
      acquired: false,
      executionBucket,
      companiesEvaluated: 0,
      companiesFailed: 0,
      notificationsCreated: 0,
      tenantResults: [],
      errors: [],
    };
  }

  const tenantResults: AlertMaterializationResult[] = [];
  const errors: Array<{ companyId: string; message: string }> = [];

  try {
    const companyIds = await activeCompanyIds();
    for (const companyId of companyIds) {
      try {
        tenantResults.push(await materializeCompanyAlerts(companyId, now));
      } catch (error) {
        errors.push({
          companyId,
          message: error instanceof Error ? error.message : 'Unknown tenant scheduler failure',
        });
      }
    }

    const notificationsCreated = tenantResults.reduce((sum, item) => sum + item.created, 0);
    const status: 'SUCCESS' | 'FAILED' = errors.length === 0 ? 'SUCCESS' : 'FAILED';
    const metrics = {
      companiesEvaluated: companyIds.length,
      companiesSucceeded: tenantResults.length,
      companiesFailed: errors.length,
      notificationsCreated,
      notificationsExisting: tenantResults.reduce((sum, item) => sum + item.existing, 0),
    };
    await finishSchedulerRun(runId, status, metrics, errors.length ? JSON.stringify(errors) : undefined);

    return {
      acquired: true,
      runId,
      executionBucket,
      status,
      companiesEvaluated: companyIds.length,
      companiesFailed: errors.length,
      notificationsCreated,
      tenantResults,
      errors,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Scheduler execution failed';
    await finishSchedulerRun(runId, 'FAILED', { fatal: true }, message).catch(() => {});
    throw error;
  }
}

let schedulerTimer: NodeJS.Timeout | null = null;

export function startAlertScheduler(): void {
  if (process.env.AUTOERP_SCHEDULER_ENABLED !== 'true') return;
  if (schedulerTimer) return;

  const execute = () => {
    void runAlertScheduler().catch((error) => {
      console.error('AUTOERP_ALERT_SCHEDULER_FAILURE', error);
    });
  };

  execute();
  schedulerTimer = setInterval(execute, schedulerIntervalMs());
  schedulerTimer.unref?.();
}

export function stopAlertSchedulerForTests(): void {
  if (!schedulerTimer) return;
  clearInterval(schedulerTimer);
  schedulerTimer = null;
}
