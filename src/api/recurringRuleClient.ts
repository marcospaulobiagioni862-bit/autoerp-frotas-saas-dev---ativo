import type { OriginType, RecurringFrequency } from '../types/enums';

export type RecurringRuleStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'COMPLETED';
export interface RecurringRuleItem {
  id: string; companyId: string; originType?: OriginType; originId?: string; description: string; amount: number;
  frequency?: RecurringFrequency; startDate?: string; endDate?: string; nextGenerationDate?: string;
  lastGeneratedReference?: string; categoryId?: string; vehicleId?: string; driverId?: string; supplierId?: string;
  paymentMethodId?: string; status: RecurringRuleStatus; createdBy?: string; createdAt: string; updatedAt: string;
  legacyIncomplete: boolean;
}
export interface RecurringRunItem {
  id: string; companyId: string; ruleId: string; scheduledFor: string; periodRef: string;
  status: 'CLAIMED' | 'SUCCEEDED' | 'SKIPPED' | 'FAILED'; attemptCount: number; startedAt: string;
  finishedAt?: string; resultEntityType?: string; resultEntityId?: string; errorCode?: string; errorMessage?: string; workerId?: string;
}
export interface CreateRecurringRuleRequest {
  originType: OriginType; originId?: string; description: string; amount: number; frequency: RecurringFrequency;
  startDate: string; endDate?: string; nextGenerationDate?: string; categoryId: string;
  vehicleId?: string; driverId?: string; supplierId?: string; paymentMethodId?: string;
}
export type UpdateRecurringRuleRequest = Partial<Omit<CreateRecurringRuleRequest, 'originType' | 'originId'>>;

type JsonRecord = Record<string, unknown>;
const RULE_STATUSES = new Set(['ACTIVE', 'PAUSED', 'CANCELLED', 'COMPLETED']);
const RUN_STATUSES = new Set(['CLAIMED', 'SUCCEEDED', 'SKIPPED', 'FAILED']);
const ORIGIN_TYPES = new Set(['CONTRACT_RENT', 'TRACKER']);
const FREQUENCIES = new Set(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL']);

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid recurring payload');
  return value as JsonRecord;
}

function optionalString(item: JsonRecord, key: string): void {
  if (item[key] !== undefined && typeof item[key] !== 'string') throw new Error('Invalid recurring payload');
}

function rule(value: unknown): RecurringRuleItem {
  const item = record(value);
  if (
    typeof item.id !== 'string' ||
    typeof item.companyId !== 'string' ||
    typeof item.description !== 'string' ||
    typeof item.amount !== 'number' ||
    !Number.isFinite(item.amount) || item.amount < 0 ||
    typeof item.status !== 'string' || !RULE_STATUSES.has(item.status) ||
    typeof item.createdAt !== 'string' ||
    typeof item.updatedAt !== 'string' ||
    typeof item.legacyIncomplete !== 'boolean'
  ) {
    throw new Error('Invalid recurring rule payload');
  }

  for (const key of [
    'originId', 'startDate', 'endDate', 'nextGenerationDate', 'lastGeneratedReference',
    'categoryId', 'vehicleId', 'driverId', 'supplierId', 'paymentMethodId', 'createdBy',
  ]) optionalString(item, key);

  if (item.originType !== undefined && (typeof item.originType !== 'string' || !ORIGIN_TYPES.has(item.originType))) {
    throw new Error('Invalid recurring rule payload');
  }
  if (item.frequency !== undefined && (typeof item.frequency !== 'string' || !FREQUENCIES.has(item.frequency))) {
    throw new Error('Invalid recurring rule payload');
  }

  return item as unknown as RecurringRuleItem;
}

function run(value: unknown): RecurringRunItem {
  const item = record(value);
  if (
    typeof item.id !== 'string' ||
    typeof item.companyId !== 'string' ||
    typeof item.ruleId !== 'string' ||
    typeof item.scheduledFor !== 'string' ||
    typeof item.periodRef !== 'string' ||
    typeof item.status !== 'string' || !RUN_STATUSES.has(item.status) ||
    typeof item.attemptCount !== 'number' || !Number.isInteger(item.attemptCount) || item.attemptCount < 1 ||
    typeof item.startedAt !== 'string'
  ) {
    throw new Error('Invalid recurring run payload');
  }

  for (const key of ['finishedAt', 'resultEntityType', 'resultEntityId', 'errorCode', 'errorMessage', 'workerId']) {
    optionalString(item, key);
  }

  return item as unknown as RecurringRunItem;
}

async function request(path: string, init?: RequestInit): Promise<JsonRecord> {
  const response = await fetch(path, { credentials: 'include', ...init });
  if (!response.ok) {
    let message = `Recurring request failed (${response.status})`;
    try { const payload = record(await response.json()); if (typeof payload.error === 'string') message = payload.error; } catch {}
    throw new Error(message);
  }
  return record(await response.json());
}

export class RecurringRuleClient {
  static async list(): Promise<RecurringRuleItem[]> {
    const payload = await request('/api/recurring-rules');
    if (!Array.isArray(payload.items)) throw new Error('Invalid recurring list payload');
    return payload.items.map(rule);
  }

  static async get(id: string): Promise<RecurringRuleItem> {
    return rule((await request(`/api/recurring-rules/${encodeURIComponent(id)}`)).item);
  }

  static async runs(id: string): Promise<RecurringRunItem[]> {
    const payload = await request(`/api/recurring-rules/${encodeURIComponent(id)}/runs`);
    if (!Array.isArray(payload.items)) throw new Error('Invalid recurring runs payload');
    return payload.items.map(run);
  }

  static async create(input: CreateRecurringRuleRequest): Promise<RecurringRuleItem> {
    return rule((await request('/api/recurring-rules', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    })).item);
  }

  static async update(id: string, input: UpdateRecurringRuleRequest): Promise<RecurringRuleItem> {
    return rule((await request(`/api/recurring-rules/${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    })).item);
  }

  private static async lifecycle(id: string, action: 'pause' | 'resume' | 'cancel'): Promise<RecurringRuleItem> {
    return rule((await request(`/api/recurring-rules/${encodeURIComponent(id)}/${action}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })).item);
  }

  static pause(id: string) { return this.lifecycle(id, 'pause'); }
  static resume(id: string) { return this.lifecycle(id, 'resume'); }
  static cancel(id: string) { return this.lifecycle(id, 'cancel'); }
}
