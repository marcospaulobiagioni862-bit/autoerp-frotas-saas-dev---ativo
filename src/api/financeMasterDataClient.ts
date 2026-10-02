import { isFinancialDreGroup, type FinancialDreGroup } from '../shared/utils/financialDreGroups';
export interface FinanceMasterAccount {
  id: string;
  name: string;
  type: string;
  institution?: string | null;
  accountNumber?: string | null;
  agency?: string | null;
  pixKey?: string | null;
  initialBalance: number;
  currentBalance: number;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface FinanceMasterPaymentMethod {
  id: string;
  name: string;
  type: string;
  active: boolean;
}

export interface FinanceMasterCategory {
  dreGroup?: FinancialDreGroup | null;
  id: string;
  name: string;
  type: 'INCOME' | 'EXPENSE' | 'BOTH';
  parentId?: string | null;
  active: boolean;
}

export interface FinanceMasterDataSnapshot {
  accounts: FinanceMasterAccount[];
  paymentMethods: FinanceMasterPaymentMethod[];
  categories: FinanceMasterCategory[];
}

type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid finance master-data response');
  return value as RecordValue;
}
function account(value: unknown): FinanceMasterAccount {
  const row = record(value); const initialBalance = Number(row.initialBalance); const currentBalance = Number(row.currentBalance);
  if (typeof row.id !== 'string' || typeof row.name !== 'string' || typeof row.type !== 'string' || (row.status !== 'ACTIVE' && row.status !== 'INACTIVE') || !Number.isFinite(initialBalance) || !Number.isFinite(currentBalance)) throw new Error('Invalid finance account response');
  return { id: row.id, name: row.name, type: row.type, institution: typeof row.institution === 'string' ? row.institution : null, accountNumber: typeof row.accountNumber === 'string' ? row.accountNumber : null, agency: typeof row.agency === 'string' ? row.agency : null, pixKey: typeof row.pixKey === 'string' ? row.pixKey : null, initialBalance, currentBalance, status: row.status };
}
function method(value: unknown): FinanceMasterPaymentMethod {
  const row = record(value); if (typeof row.id !== 'string' || typeof row.name !== 'string' || typeof row.type !== 'string' || typeof row.active !== 'boolean') throw new Error('Invalid payment method response');
  return { id: row.id, name: row.name, type: row.type, active: row.active };
}
function category(value: unknown): FinanceMasterCategory {
  const row = record(value); if (typeof row.id !== 'string' || typeof row.name !== 'string' || !['INCOME','EXPENSE','BOTH'].includes(String(row.type)) || typeof row.active !== 'boolean') throw new Error('Invalid financial category response');
  return { id: row.id, name: row.name, type: row.type as FinanceMasterCategory['type'], parentId: typeof row.parentId === 'string' ? row.parentId : null, dreGroup: isFinancialDreGroup(row.dreGroup) ? row.dreGroup : null, active: row.active };
}
async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, { ...init, credentials: 'include' });
  if (!response.ok) {
    let message = `Finance master-data request failed (${response.status})`;
    try { const payload = record(await response.json()); if (typeof payload.error === 'string') message = payload.error; } catch { /* fail closed */ }
    throw new Error(message);
  }
  return response.json();
}
function json(methodName: 'POST' | 'PATCH', body: unknown): RequestInit { return { method: methodName, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }

export class FinanceMasterDataClient {
  static async list(): Promise<FinanceMasterDataSnapshot> {
    const payload = record(await request('/api/finance/master-data'));
    if (!Array.isArray(payload.accounts) || !Array.isArray(payload.paymentMethods) || !Array.isArray(payload.categories)) throw new Error('Invalid finance master-data response');
    return { accounts: payload.accounts.map(account), paymentMethods: payload.paymentMethods.map(method), categories: payload.categories.map(category) };
  }
  static async createAccount(input: { name:string; type:string; initialBalance:number }): Promise<void> { await request('/api/finance/master-data/accounts', json('POST', input)); }
  static async setAccountStatus(id:string, status:'ACTIVE'|'INACTIVE'): Promise<void> { await request(`/api/finance/master-data/accounts/${encodeURIComponent(id)}`, json('PATCH', { status })); }
  static async createPaymentMethod(input:{name:string;type:string}): Promise<void> { await request('/api/finance/master-data/payment-methods', json('POST', input)); }
  static async setPaymentMethodActive(id:string, active:boolean): Promise<void> { await request(`/api/finance/master-data/payment-methods/${encodeURIComponent(id)}`, json('PATCH', { active })); }
  static async createCategory(input:{name:string;type:'INCOME'|'EXPENSE'|'BOTH';parentId?:string;dreGroup?:FinancialDreGroup}): Promise<void> { await request('/api/finance/master-data/categories', json('POST', input)); }
  static async setCategoryDreGroup(id:string, dreGroup:FinancialDreGroup|null): Promise<void> { await request(`/api/finance/master-data/categories/${encodeURIComponent(id)}`, json('PATCH', { dreGroup })); }
  static async setCategoryActive(id:string, active:boolean): Promise<void> { await request(`/api/finance/master-data/categories/${encodeURIComponent(id)}`, json('PATCH', { active })); }
}
