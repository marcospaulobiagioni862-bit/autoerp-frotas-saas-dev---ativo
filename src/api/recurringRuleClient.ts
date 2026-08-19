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
function record(value: unknown): JsonRecord { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid recurring payload'); return value as JsonRecord; }
function rule(value: unknown): RecurringRuleItem {
  const item = record(value); const statuses = new Set(['ACTIVE','PAUSED','CANCELLED','COMPLETED']);
  if (typeof item.id !== 'string' || typeof item.companyId !== 'string' || typeof item.description !== 'string' || typeof item.amount !== 'number' ||
      typeof item.status !== 'string' || !statuses.has(item.status) || typeof item.createdAt !== 'string' || typeof item.updatedAt !== 'string' || typeof item.legacyIncomplete !== 'boolean') {
    throw new Error('Invalid recurring rule payload');
  }
  return item as unknown as RecurringRuleItem;
}
function run(value: unknown): RecurringRunItem {
  const item = record(value); const statuses = new Set(['CLAIMED','SUCCEEDED','SKIPPED','FAILED']);
  if (typeof item.id !== 'string' || typeof item.companyId !== 'string' || typeof item.ruleId !== 'string' || typeof item.scheduledFor !== 'string' ||
      typeof item.periodRef !== 'string' || typeof item.status !== 'string' || !statuses.has(item.status) || typeof item.attemptCount !== 'number' || typeof item.startedAt !== 'string') {
    throw new Error('Invalid recurring run payload');
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
  static async list(): Promise<RecurringRuleItem[]> { const p = await request('/api/recurring-rules'); if (!Array.isArray(p.items)) throw new Error('Invalid recurring list payload'); return p.items.map(rule); }
  static async get(id: string): Promise<RecurringRuleItem> { return rule((await request(`/api/recurring-rules/${encodeURIComponent(id)}`)).item); }
  static async runs(id: string): Promise<RecurringRunItem[]> { const p = await request(`/api/recurring-rules/${encodeURIComponent(id)}/runs`); if (!Array.isArray(p.items)) throw new Error('Invalid recurring runs payload'); return p.items.map(run); }
  static async create(input: CreateRecurringRuleRequest): Promise<RecurringRuleItem> { return rule((await request('/api/recurring-rules', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(input) })).item); }
  static async update(id: string, input: UpdateRecurringRuleRequest): Promise<RecurringRuleItem> { return rule((await request(`/api/recurring-rules/${encodeURIComponent(id)}`, { method:'PATCH', headers:{'content-type':'application/json'}, body:JSON.stringify(input) })).item); }
  private static async lifecycle(id: string, action: 'pause'|'resume'|'cancel'): Promise<RecurringRuleItem> { return rule((await request(`/api/recurring-rules/${encodeURIComponent(id)}/${action}`, { method:'POST', headers:{'content-type':'application/json'}, body:'{}' })).item); }
  static pause(id: string) { return this.lifecycle(id, 'pause'); }
  static resume(id: string) { return this.lifecycle(id, 'resume'); }
  static cancel(id: string) { return this.lifecycle(id, 'cancel'); }
}
