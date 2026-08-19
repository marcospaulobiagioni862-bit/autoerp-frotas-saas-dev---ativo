import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { UnitOfWork } from '../../db/uow';
import { runAlertScheduler } from '../alertScheduler';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function rowsOf(result: any): any[] {
  return Array.isArray(result?.rows) ? result.rows : [];
}

const COMPANY_A = 'i5a-scheduler-company-a';
const COMPANY_B = 'i5a-scheduler-company-b';
const NOW = new Date('2026-08-19T12:00:00.000Z');
const D7 = '2026-08-26';

export class AlertSchedulerIntegrationRunner {
  static async runAllTests(): Promise<void> {
    await db.execute(sql`
      INSERT INTO companies (id, document, name, status, created_at, updated_at) VALUES
        (${COMPANY_A}, 'I5A-SCH-A', 'I5A Scheduler A', 'ACTIVE', NOW(), NOW()),
        (${COMPANY_B}, 'I5A-SCH-B', 'I5A Scheduler B', 'ACTIVE', NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE', updated_at = NOW()
    `);

    await db.execute(sql`
      INSERT INTO documents (
        id, company_id, subject_type, subject_id, document_type, expiration_date,
        version_number, is_current, is_archived, cost, created_by, created_at, updated_at
      ) VALUES
        ('i5a-scheduler-doc-a', ${COMPANY_A}, 'VEHICLE', 'vehicle-a', 'CRLV', ${D7}, 1, true, false, 0, 'scheduler-test', NOW(), NOW()),
        ('i5a-scheduler-doc-b', ${COMPANY_B}, 'DRIVER', 'driver-b', 'COMPROVANTE_RESIDENCIA', ${D7}, 1, true, false, 0, 'scheduler-test', NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET expiration_date = EXCLUDED.expiration_date, is_current = true, is_archived = false, updated_at = NOW()
    `);

    const bucket = '2026-08-19T12:00Z-test-concurrency';
    const concurrent = await Promise.all([
      runAlertScheduler({ now: NOW, executionBucket: bucket, instanceId: 'instance-a' }),
      runAlertScheduler({ now: NOW, executionBucket: bucket, instanceId: 'instance-b' }),
    ]);
    assert(concurrent.filter((item) => item.acquired).length === 1, 'same scheduler bucket must be acquired exactly once');
    const winner = concurrent.find((item) => item.acquired)!;
    assert(winner.status === 'SUCCESS', `scheduler winner status ${winner.status}`);
    assert(winner.companiesFailed === 0, 'scheduler tenant failures detected');
    assert(winner.notificationsCreated === 2, `expected 2 created notifications, got ${winner.notificationsCreated}`);

    const notificationsA = await UnitOfWork.run(COMPANY_A, async (tx) =>
      await tx.getNotificationRepo().findAllByCompany(COMPANY_A)
    );
    const notificationsB = await UnitOfWork.run(COMPANY_B, async (tx) =>
      await tx.getNotificationRepo().findAllByCompany(COMPANY_B)
    );
    assert(notificationsA.length === 1, `company A expected one notification, got ${notificationsA.length}`);
    assert(notificationsB.length === 1, `company B expected one notification, got ${notificationsB.length}`);
    assert(notificationsA[0].idempotencyKey === 'DOCUMENT:i5a-scheduler-doc-a:v1:D7', 'company A key mismatch');
    assert(notificationsB[0].idempotencyKey === 'DOCUMENT:i5a-scheduler-doc-b:v1:D7', 'company B key mismatch');

    const retry = await runAlertScheduler({
      now: NOW,
      executionBucket: '2026-08-19T12:00Z-test-retry',
      instanceId: 'instance-retry',
    });
    assert(retry.acquired, 'retry/new scheduler bucket must acquire');
    assert(retry.status === 'SUCCESS', `retry status ${retry.status}`);
    assert(retry.notificationsCreated === 0, `retry created duplicates: ${retry.notificationsCreated}`);
    assert(retry.tenantResults.reduce((sum, item) => sum + item.existing, 0) === 2, 'retry must observe both existing notifications');

    const total = rowsOf(await db.execute(sql`
      SELECT count(*)::int AS count FROM notifications
      WHERE company_id IN (${COMPANY_A}, ${COMPANY_B})
    `));
    assert(Number(total[0]?.count || 0) === 2, 'notification uniqueness failed after retry');

    const schedulerRuns = rowsOf(await db.execute(sql`
      SELECT job_key, execution_bucket, status FROM scheduler_runs
      WHERE execution_bucket IN (${bucket}, '2026-08-19T12:00Z-test-retry')
      ORDER BY execution_bucket
    `));
    assert(schedulerRuns.length === 2, `expected exactly 2 scheduler run rows, got ${schedulerRuns.length}`);
    assert(schedulerRuns.every((item) => item.status === 'SUCCESS'), 'scheduler run status persistence mismatch');

    console.log('SECURITY-2I5A scheduler integration PASS');
  }
}
