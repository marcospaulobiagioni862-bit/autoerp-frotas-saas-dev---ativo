from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match, found {count}")
    p.write_text(text.replace(old, new, 1))


replace_once(
    'src/domain/finance/ITransactionContext.ts',
    """export interface ITransactionReceivableRepository {\n  findById(id: string): Promise<AccountReceivable | null>;\n  findByIdempotencyKey(key: string): Promise<AccountReceivable | null>;\n  create(item: AccountReceivable): Promise<AccountReceivable>;\n""",
    """export interface ITransactionReceivableRepository {\n  findById(id: string): Promise<AccountReceivable | null>;\n  findByIdempotencyKey(key: string): Promise<AccountReceivable | null>;\n  findAll(filters?: TransactionFilterOptions): Promise<AccountReceivable[]>;\n  create(item: AccountReceivable): Promise<AccountReceivable>;\n"""
)
replace_once(
    'src/domain/finance/ITransactionContext.ts',
    """export interface ITransactionPayableRepository {\n  findById(id: string): Promise<AccountPayable | null>;\n  findByIdempotencyKey(key: string): Promise<AccountPayable | null>;\n  create(item: AccountPayable): Promise<AccountPayable>;\n""",
    """export interface ITransactionPayableRepository {\n  findById(id: string): Promise<AccountPayable | null>;\n  findByIdempotencyKey(key: string): Promise<AccountPayable | null>;\n  findAll(filters?: TransactionFilterOptions): Promise<AccountPayable[]>;\n  create(item: AccountPayable): Promise<AccountPayable>;\n"""
)

marker = """  // SECURITY-2G2: finance obligation commands cross the server trust boundary.\n  // Tenant and audit identity come only from the authenticated principal; client\n  // supplied companyId/userId/userName fields are intentionally not consumed.\n"""
insert = """  // SECURITY-2G3: authenticated finance obligation reads use the same\n  // UnitOfWork/RLS tenant boundary as the command endpoints.\n  app.get('/api/finance/receivables', async (req: Request, res: Response) => {\n    const principal = requireFinancePrincipal(req, res);\n    if (!principal) return;\n\n    try {\n      const items = await UnitOfWork.run(principal.companyId, async (txContext) =>\n        await txContext.getReceivableRepo().findAll()\n      );\n      res.json({ items });\n    } catch (error) {\n      sendFinanceCommandError(res, error);\n    }\n  });\n\n  app.get('/api/finance/payables', async (req: Request, res: Response) => {\n    const principal = requireFinancePrincipal(req, res);\n    if (!principal) return;\n\n    try {\n      const items = await UnitOfWork.run(principal.companyId, async (txContext) =>\n        await txContext.getPayableRepo().findAll()\n      );\n      res.json({ items });\n    } catch (error) {\n      sendFinanceCommandError(res, error);\n    }\n  });\n\n""" + marker
replace_once('server.ts', marker, insert)

client = '''import type { AccountPayable, AccountReceivable } from '../types/entities';

export interface CreateReceivableRequest {
  originType: string;
  originId: string;
  vehicleId?: string;
  driverId?: string;
  contractId?: string;
  categoryId: string;
  description: string;
  totalAmount: number;
  dueDate: string;
  competenceDate?: string;
  installmentsCount?: number;
  recurrenceDaysInterval?: number;
}

export interface CreatePayableRequest extends CreateReceivableRequest {
  supplierId?: string;
  idempotencyKey?: string;
}

export class FinanceObligationApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'FinanceObligationApiError';
  }
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid finance API response');
  }
  return value as JsonRecord;
}

function numberField(record: JsonRecord, key: string): number {
  const value = Number(record[key]);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid finance API numeric field: ${key}`);
  }
  return value;
}

function dateField(record: JsonRecord, key: string): string {
  const value = record[key];
  if (typeof value !== 'string') {
    throw new Error(`Invalid finance API date field: ${key}`);
  }
  return value.slice(0, 10);
}

function normalizeReceivable(value: unknown): AccountReceivable {
  const record = asRecord(value);
  return {
    ...record,
    originalAmount: numberField(record, 'originalAmount'),
    discountAmount: numberField(record, 'discountAmount'),
    fineAmount: numberField(record, 'fineAmount'),
    interestAmount: numberField(record, 'interestAmount'),
    updatedAmount: numberField(record, 'updatedAmount'),
    paidAmount: numberField(record, 'paidAmount'),
    balanceAmount: numberField(record, 'balanceAmount'),
    dueDate: dateField(record, 'dueDate'),
    competenceDate: dateField(record, 'competenceDate'),
  } as unknown as AccountReceivable;
}

function normalizePayable(value: unknown): AccountPayable {
  const record = asRecord(value);
  return {
    ...record,
    originalAmount: numberField(record, 'originalAmount'),
    discountAmount: numberField(record, 'discountAmount'),
    fineAmount: numberField(record, 'fineAmount'),
    interestAmount: numberField(record, 'interestAmount'),
    updatedAmount: numberField(record, 'updatedAmount'),
    paidAmount: numberField(record, 'paidAmount'),
    balanceAmount: numberField(record, 'balanceAmount'),
    dueDate: dateField(record, 'dueDate'),
    competenceDate: dateField(record, 'competenceDate'),
  } as unknown as AccountPayable;
}

async function requestJson(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, { ...init, credentials: 'include' });
  if (!response.ok) {
    let message = `Finance API request failed (${response.status})`;
    try {
      const payload = asRecord(await response.json());
      if (typeof payload.error === 'string' && payload.error) message = payload.error;
    } catch {
      // Fail closed; no local fallback.
    }
    throw new FinanceObligationApiError(response.status, message);
  }
  return await response.json();
}

function jsonRequest(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function itemsFromPayload(payload: unknown): unknown[] {
  const record = asRecord(payload);
  if (!Array.isArray(record.items)) throw new Error('Invalid finance API items response');
  return record.items;
}

export class FinanceObligationClient {
  static async listReceivables(): Promise<AccountReceivable[]> {
    return itemsFromPayload(await requestJson('/api/finance/receivables')).map(normalizeReceivable);
  }

  static async createReceivable(input: CreateReceivableRequest): Promise<AccountReceivable[]> {
    return itemsFromPayload(await requestJson('/api/finance/receivables', jsonRequest(input))).map(normalizeReceivable);
  }

  static async cancelReceivable(id: string, reason: string): Promise<AccountReceivable> {
    const payload = asRecord(await requestJson(`/api/finance/receivables/${encodeURIComponent(id)}/cancel`, jsonRequest({ reason })));
    return normalizeReceivable(payload.item);
  }

  static async listPayables(): Promise<AccountPayable[]> {
    return itemsFromPayload(await requestJson('/api/finance/payables')).map(normalizePayable);
  }

  static async createPayable(input: CreatePayableRequest): Promise<AccountPayable[]> {
    return itemsFromPayload(await requestJson('/api/finance/payables', jsonRequest(input))).map(normalizePayable);
  }

  static async cancelPayable(id: string, reason: string): Promise<AccountPayable> {
    const payload = asRecord(await requestJson(`/api/finance/payables/${encodeURIComponent(id)}/cancel`, jsonRequest({ reason })));
    return normalizePayable(payload.item);
  }
}
'''
Path('src/api').mkdir(parents=True, exist_ok=True)
Path('src/api/financeObligationClient.ts').write_text(client)

p = Path('src/components/finance/ReceivablesView.tsx')
text = p.read_text()
text = text.replace("import { AccountReceivableRepository } from '../../persistence/repositories/localRepositories';\n", '')
text = text.replace("import { FinanceEngine } from '../../domain/finance/FinanceEngine';\n", '')
text = text.replace("import { useAuth } from '../../hooks/useAuth';\n", '')
text = text.replace("import { ObligationStatus, OriginType } from '../../types/enums';\n", "import { ObligationStatus, OriginType } from '../../types/enums';\nimport { FinanceObligationClient } from '../../api/financeObligationClient';\n")
text = text.replace("  const { user } = useAuth();\n", '')
replace_old = """  const loadReceivables = async () => {\n    setLoading(true);\n    const repo = new AccountReceivableRepository();\n    const list = await repo.findAllForCompany(user.companyId);\n    setReceivables(list.sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime()));\n    setLoading(false);\n  };\n"""
replace_new = """  const loadReceivables = async () => {\n    setLoading(true);\n    try {\n      const list = await FinanceObligationClient.listReceivables();\n      setReceivables(list.sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime()));\n    } catch (err) {\n      const message = err instanceof Error ? err.message : 'Erro ao carregar contas a receber.';\n      alert(message);\n      setReceivables([]);\n    } finally {\n      setLoading(false);\n    }\n  };\n"""
if replace_old not in text: raise SystemExit('ReceivablesView load block mismatch')
text = text.replace(replace_old, replace_new, 1)
replace_old = """      await FinanceEngine.createReceivable({\n        companyId: user.companyId,\n        originType: OriginType.MANUAL,\n        originId: 'manual-' + Date.now(),\n        categoryId,\n        description,\n        totalAmount: parseFloat(totalAmount),\n        dueDate,\n        competenceDate: competenceDate || dueDate,\n        installmentsCount: parseInt(installmentsCount) || 1,\n        driverId: driverId.trim() || undefined,\n        vehicleId: vehicleId.trim() || undefined,\n        contractId: contractId.trim() || undefined,\n        userId: user.userId,\n        userName: user.name,\n      });\n"""
replace_new = """      await FinanceObligationClient.createReceivable({\n        originType: OriginType.MANUAL,\n        originId: 'manual-' + Date.now(),\n        categoryId,\n        description,\n        totalAmount: parseFloat(totalAmount),\n        dueDate,\n        competenceDate: competenceDate || dueDate,\n        installmentsCount: parseInt(installmentsCount) || 1,\n        driverId: driverId.trim() || undefined,\n        vehicleId: vehicleId.trim() || undefined,\n        contractId: contractId.trim() || undefined,\n      });\n"""
if replace_old not in text: raise SystemExit('ReceivablesView create block mismatch')
text = text.replace(replace_old, replace_new, 1)
replace_old = """      const item = receivables.find((r) => r.id === cancelTargetId);\n      if (!item || item.companyId !== user.companyId) {\n        alert('Erro de tenant: O título a receber não pertence à empresa da sessão atual.');\n        setCancelTargetId(null);\n        return;\n      }\n      await FinanceEngine.cancelReceivable(\n        user.companyId,\n        cancelTargetId,\n        'Cancelamento via interface',\n        user.userId,\n        user.name\n      );\n"""
replace_new = """      const item = receivables.find((r) => r.id === cancelTargetId);\n      if (!item) {\n        alert('Título a receber não encontrado na lista atual.');\n        setCancelTargetId(null);\n        return;\n      }\n      await FinanceObligationClient.cancelReceivable(cancelTargetId, 'Cancelamento via interface');\n"""
if replace_old not in text: raise SystemExit('ReceivablesView cancel block mismatch')
text = text.replace(replace_old, replace_new, 1)
text = text.replace('Esta operação será auditada e enviada via FinanceEngine.', 'Esta operação será auditada e processada no servidor.')
p.write_text(text)

p = Path('src/components/finance/PayablesView.tsx')
text = p.read_text()
text = text.replace("import { AccountPayableRepository } from '../../persistence/repositories/localRepositories';\n", '')
text = text.replace("import { FinanceEngine } from '../../domain/finance/FinanceEngine';\n", '')
text = text.replace("import { useAuth } from '../../hooks/useAuth';\n", '')
text = text.replace("import { ObligationStatus, OriginType } from '../../types/enums';\n", "import { ObligationStatus, OriginType } from '../../types/enums';\nimport { FinanceObligationClient } from '../../api/financeObligationClient';\n")
text = text.replace("  const { user } = useAuth();\n", '')
replace_old = """  const loadPayables = async () => {\n    setLoading(true);\n    const repo = new AccountPayableRepository();\n    const list = await repo.findAllForCompany(user.companyId);\n    setPayables(list.sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime()));\n    setLoading(false);\n  };\n"""
replace_new = """  const loadPayables = async () => {\n    setLoading(true);\n    try {\n      const list = await FinanceObligationClient.listPayables();\n      setPayables(list.sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime()));\n    } catch (err) {\n      const message = err instanceof Error ? err.message : 'Erro ao carregar contas a pagar.';\n      alert(message);\n      setPayables([]);\n    } finally {\n      setLoading(false);\n    }\n  };\n"""
if replace_old not in text: raise SystemExit('PayablesView load block mismatch')
text = text.replace(replace_old, replace_new, 1)
replace_old = """      await FinanceEngine.createPayable({\n        companyId: user.companyId,\n        originType: OriginType.MANUAL,\n        originId: 'manual-' + Date.now(),\n        categoryId,\n        description,\n        totalAmount: parseFloat(totalAmount),\n        dueDate,\n        competenceDate: competenceDate || dueDate,\n        installmentsCount: parseInt(installmentsCount) || 1,\n        supplierId: supplierId.trim() || undefined,\n        driverId: driverId.trim() || undefined,\n        vehicleId: vehicleId.trim() || undefined,\n        contractId: contractId.trim() || undefined,\n        userId: user.userId,\n        userName: user.name,\n      });\n"""
replace_new = """      await FinanceObligationClient.createPayable({\n        originType: OriginType.MANUAL,\n        originId: 'manual-' + Date.now(),\n        categoryId,\n        description,\n        totalAmount: parseFloat(totalAmount),\n        dueDate,\n        competenceDate: competenceDate || dueDate,\n        installmentsCount: parseInt(installmentsCount) || 1,\n        supplierId: supplierId.trim() || undefined,\n        driverId: driverId.trim() || undefined,\n        vehicleId: vehicleId.trim() || undefined,\n        contractId: contractId.trim() || undefined,\n      });\n"""
if replace_old not in text: raise SystemExit('PayablesView create block mismatch')
text = text.replace(replace_old, replace_new, 1)
replace_old = """      const item = payables.find((p) => p.id === cancelTargetId);\n      if (!item || item.companyId !== user.companyId) {\n        alert('Erro de tenant: O título a pagar não pertence à empresa da sessão atual.');\n        setCancelTargetId(null);\n        return;\n      }\n      await FinanceEngine.cancelPayable(\n        user.companyId,\n        cancelTargetId,\n        'Cancelamento manual via interface',\n        user.userId,\n        user.name\n      );\n"""
replace_new = """      const item = payables.find((p) => p.id === cancelTargetId);\n      if (!item) {\n        alert('Título a pagar não encontrado na lista atual.');\n        setCancelTargetId(null);\n        return;\n      }\n      await FinanceObligationClient.cancelPayable(cancelTargetId, 'Cancelamento manual via interface');\n"""
if replace_old not in text: raise SystemExit('PayablesView cancel block mismatch')
text = text.replace(replace_old, replace_new, 1)
text = text.replace('Esta operação será registrada e enviada via FinanceEngine.', 'Esta operação será auditada e processada no servidor.')
p.write_text(text)

test_runner = '''import { FinanceObligationApiError, FinanceObligationClient } from '../financeObligationClient';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const originalFetch = globalThis.fetch;
let calls: Array<{ url: string; init?: RequestInit }> = [];
let responder: (url: string, init?: RequestInit) => Promise<Response>;

globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  calls.push({ url, init });
  return await responder(url, init);
};

const row = {
  id: 'ob-1', companyId: 'tenant-a', originType: 'MANUAL', originId: 'origin-1',
  categoryId: 'cat-1', description: 'Teste', originalAmount: '100.50', discountAmount: '0',
  fineAmount: '0', interestAmount: '0', updatedAmount: '100.50', paidAmount: '0',
  balanceAmount: '100.50', dueDate: '2026-08-20T00:00:00.000Z', competenceDate: '2026-08-18T00:00:00.000Z',
  status: 'PENDING', idempotencyKey: 'idem-1'
};

async function run() {
  let passed = 0;
  try {
    responder = async () => new Response(JSON.stringify({ items: [row] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    calls = [];
    const receivables = await FinanceObligationClient.listReceivables();
    assert(calls[0].url === '/api/finance/receivables', 'receivable list URL');
    assert(calls[0].init?.credentials === 'include', 'receivable list credentials');
    assert(receivables[0].originalAmount === 100.5 && receivables[0].dueDate === '2026-08-20', 'receivable normalization');
    passed++;

    responder = async () => new Response(JSON.stringify({ items: [row] }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    calls = [];
    await FinanceObligationClient.createReceivable({ originType: 'MANUAL', originId: 'o', categoryId: 'c', description: 'd', totalAmount: 10, dueDate: '2026-08-20' });
    const rb = JSON.parse(String(calls[0].init?.body)) as Record<string, unknown>;
    assert(calls[0].init?.credentials === 'include', 'receivable create credentials');
    assert(!('companyId' in rb) && !('userId' in rb) && !('userName' in rb), 'receivable identity must not come from browser');
    passed++;

    responder = async () => new Response(JSON.stringify({ item: row }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    calls = [];
    await FinanceObligationClient.cancelReceivable('ar/1', 'reason');
    assert(calls[0].url === '/api/finance/receivables/ar%2F1/cancel', 'receivable cancel URL');
    passed++;

    responder = async () => new Response(JSON.stringify({ items: [row] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    calls = [];
    const payables = await FinanceObligationClient.listPayables();
    assert(calls[0].url === '/api/finance/payables', 'payable list URL');
    assert(payables[0].balanceAmount === 100.5, 'payable normalization');
    passed++;

    responder = async () => new Response(JSON.stringify({ items: [row] }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    calls = [];
    await FinanceObligationClient.createPayable({ originType: 'MANUAL', originId: 'o', categoryId: 'c', description: 'd', totalAmount: 10, dueDate: '2026-08-20' });
    const pb = JSON.parse(String(calls[0].init?.body)) as Record<string, unknown>;
    assert(!('companyId' in pb) && !('userId' in pb) && !('userName' in pb), 'payable identity must not come from browser');
    passed++;

    responder = async () => new Response(JSON.stringify({ item: row }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    calls = [];
    await FinanceObligationClient.cancelPayable('ap-1', 'reason');
    assert(calls[0].init?.credentials === 'include', 'payable cancel credentials');
    passed++;

    responder = async () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    let closed = false;
    try { await FinanceObligationClient.listReceivables(); } catch (error) { closed = error instanceof FinanceObligationApiError && error.status === 401; }
    assert(closed, '401 must fail closed without local fallback');
    passed++;

    console.log(`FinanceObligationClient ${passed}/7 PASS`);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

run().catch((error) => { console.error(error); process.exit(1); });
'''
Path('src/api/__tests__').mkdir(parents=True, exist_ok=True)
Path('src/api/__tests__/financeObligationClientTestRunner.ts').write_text(test_runner)
