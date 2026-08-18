from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}")
    p.write_text(text.replace(old, new, 1))


def replace_exact_count(path: str, old: str, new: str, expected: int) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"{path}: expected {expected} matches, found {count}")
    p.write_text(text.replace(old, new))


# Settlement: validate caller-independent amount/required fields before mutation.
replace_exact_count(
    'src/domain/finance/SettlementService.ts',
    "    await FinancialPeriodService.assertDateOpen(params.companyId, params.paymentDate, txContext);\n",
    "    if (!Number.isFinite(params.paymentAmount) || params.paymentAmount <= 0) {\n      throw new Error('Valor da liquidação deve ser maior que zero');\n    }\n    if (!params.financialAccountId || !params.paymentMethodId || !params.paymentDate) {\n      throw new Error('Conta financeira, forma de pagamento e data são obrigatórias');\n    }\n\n    await FinancialPeriodService.assertDateOpen(params.companyId, params.paymentDate, txContext);\n",
    2,
)

replace_exact_count(
    'src/domain/finance/SettlementService.ts',
    "      const paymentMethod = await txContext.getPaymentMethodRepo().findById(params.paymentMethodId);\n",
    "      const paymentMethodRepo = txContext.getPaymentMethodRepo?.();\n      if (!paymentMethodRepo) {\n        throw new Error('Forma de pagamento indisponível no contexto transacional');\n      }\n      const paymentMethod = await paymentMethodRepo.findById(params.paymentMethodId);\n",
    2,
)

# Server: settlement service import.
replace_once(
    'server.ts',
    "import { PayableService } from './src/domain/finance/PayableService';\n",
    "import { PayableService } from './src/domain/finance/PayableService';\nimport { SettlementService } from './src/domain/finance/SettlementService';\n",
)

settlement_routes = r'''  // SECURITY-2G4: settlement options and settlement commands are server-authoritative.
  // Tenant and audit identity are derived exclusively from the authenticated principal.
  app.get('/api/finance/settlement-options', async (req: Request, res: Response) => {
    const principal = requireFinancePrincipal(req, res);
    if (!principal) return;

    try {
      const options = await UnitOfWork.run(principal.companyId, async (txContext) => {
        const accountRepo = txContext.getAccountRepo();
        const paymentMethodRepo = txContext.getPaymentMethodRepo?.();
        if (!accountRepo.findAll || !paymentMethodRepo) {
          throw new Error('Settlement repositories unavailable');
        }
        const [accounts, paymentMethods] = await Promise.all([
          accountRepo.findAll(),
          paymentMethodRepo.findAll(),
        ]);
        return {
          accounts: accounts.filter((item: any) => item.status === 'ACTIVE'),
          paymentMethods: paymentMethods.filter((item: any) => item.active !== false),
        };
      });
      res.json(options);
    } catch (error) {
      sendFinanceCommandError(res, error);
    }
  });

  app.post('/api/finance/receivables/:id/receipt', async (req: Request, res: Response) => {
    const principal = requireFinancePrincipal(req, res);
    if (!principal) return;

    try {
      const result = await UnitOfWork.run(
        principal.companyId,
        async (txContext) =>
          await SettlementService.registerReceipt(
            {
              companyId: principal.companyId,
              obligationId: req.params.id,
              financialAccountId: req.body?.financialAccountId,
              paymentMethodId: req.body?.paymentMethodId,
              paymentAmount: Number(req.body?.paymentAmount),
              paymentDate: req.body?.paymentDate,
              description: req.body?.description,
              userId: principal.userId,
              userName: principal.name,
            },
            txContext
          ),
        { financialPeriodLock: 'SHARED' }
      );
      res.status(201).json({ item: result.receivable, transaction: result.transaction });
    } catch (error) {
      sendFinanceCommandError(res, error);
    }
  });

  app.post('/api/finance/payables/:id/payment', async (req: Request, res: Response) => {
    const principal = requireFinancePrincipal(req, res);
    if (!principal) return;

    try {
      const result = await UnitOfWork.run(
        principal.companyId,
        async (txContext) =>
          await SettlementService.registerPayment(
            {
              companyId: principal.companyId,
              obligationId: req.params.id,
              financialAccountId: req.body?.financialAccountId,
              paymentMethodId: req.body?.paymentMethodId,
              paymentAmount: Number(req.body?.paymentAmount),
              paymentDate: req.body?.paymentDate,
              description: req.body?.description,
              userId: principal.userId,
              userName: principal.name,
            },
            txContext
          ),
        { financialPeriodLock: 'SHARED' }
      );
      res.status(201).json({ item: result.payable, transaction: result.transaction });
    } catch (error) {
      sendFinanceCommandError(res, error);
    }
  });

'''
replace_once(
    'server.ts',
    "  // SECURITY-2G3: authenticated finance obligation reads use the same\n",
    settlement_routes + "  // SECURITY-2G3: authenticated finance obligation reads use the same\n",
)

client = r'''export interface SettlementAccountOption {
  id: string;
  name: string;
  type: string;
  currentBalance: number;
  status: string;
}

export interface SettlementPaymentMethodOption {
  id: string;
  name: string;
  active: boolean;
}

export interface SettlementOptions {
  accounts: SettlementAccountOption[];
  paymentMethods: SettlementPaymentMethodOption[];
}

export interface SettlementCommandInput {
  financialAccountId: string;
  paymentMethodId: string;
  paymentAmount: number;
  paymentDate: string;
  description?: string;
}

export class FinanceSettlementApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'FinanceSettlementApiError';
  }
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid settlement API response');
  }
  return value as JsonRecord;
}

function normalizeAccount(value: unknown): SettlementAccountOption {
  const row = asRecord(value);
  const currentBalance = Number(row.currentBalance);
  if (
    typeof row.id !== 'string' ||
    typeof row.name !== 'string' ||
    typeof row.type !== 'string' ||
    typeof row.status !== 'string' ||
    !Number.isFinite(currentBalance)
  ) {
    throw new Error('Invalid financial account response');
  }
  return { id: row.id, name: row.name, type: row.type, currentBalance, status: row.status };
}

function normalizePaymentMethod(value: unknown): SettlementPaymentMethodOption {
  const row = asRecord(value);
  if (typeof row.id !== 'string' || typeof row.name !== 'string' || typeof row.active !== 'boolean') {
    throw new Error('Invalid payment method response');
  }
  return { id: row.id, name: row.name, active: row.active };
}

async function requestJson(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, { ...init, credentials: 'include' });
  if (!response.ok) {
    let message = `Settlement API request failed (${response.status})`;
    try {
      const payload = asRecord(await response.json());
      if (typeof payload.error === 'string' && payload.error) message = payload.error;
    } catch {
      // Fail closed; never use local persistence as fallback.
    }
    throw new FinanceSettlementApiError(response.status, message);
  }
  return await response.json();
}

function postJson(body: SettlementCommandInput): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export class FinanceSettlementClient {
  static async getOptions(): Promise<SettlementOptions> {
    const payload = asRecord(await requestJson('/api/finance/settlement-options'));
    if (!Array.isArray(payload.accounts) || !Array.isArray(payload.paymentMethods)) {
      throw new Error('Invalid settlement options response');
    }
    return {
      accounts: payload.accounts.map(normalizeAccount),
      paymentMethods: payload.paymentMethods.map(normalizePaymentMethod),
    };
  }

  static async registerReceipt(receivableId: string, input: SettlementCommandInput): Promise<void> {
    await requestJson(`/api/finance/receivables/${encodeURIComponent(receivableId)}/receipt`, postJson(input));
  }

  static async registerPayment(payableId: string, input: SettlementCommandInput): Promise<void> {
    await requestJson(`/api/finance/payables/${encodeURIComponent(payableId)}/payment`, postJson(input));
  }
}
'''
Path('src/api/financeSettlementClient.ts').write_text(client)

tests = r'''import { FinanceSettlementApiError, FinanceSettlementClient } from '../financeSettlementClient';

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

const optionsPayload = {
  accounts: [{ id: 'acc-1', name: 'Banco', type: 'BANK', currentBalance: '123.45', status: 'ACTIVE' }],
  paymentMethods: [{ id: 'pm-1', name: 'PIX', active: true }],
};

async function run() {
  let passed = 0;
  try {
    responder = async () => new Response(JSON.stringify(optionsPayload), { status: 200, headers: { 'Content-Type': 'application/json' } });
    calls = [];
    const options = await FinanceSettlementClient.getOptions();
    assert(calls[0].url === '/api/finance/settlement-options', 'options URL');
    assert(calls[0].init?.credentials === 'include', 'options credentials');
    assert(options.accounts[0].currentBalance === 123.45 && options.paymentMethods[0].name === 'PIX', 'options normalization');
    passed++;

    responder = async () => new Response(JSON.stringify({ item: {}, transaction: {} }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    calls = [];
    await FinanceSettlementClient.registerReceipt('ar/1', { financialAccountId: 'acc-1', paymentMethodId: 'pm-1', paymentAmount: 50, paymentDate: '2026-08-18', description: 'receipt' });
    assert(calls[0].url === '/api/finance/receivables/ar%2F1/receipt', 'receipt URL');
    const rb = JSON.parse(String(calls[0].init?.body)) as Record<string, unknown>;
    assert(!('companyId' in rb) && !('userId' in rb) && !('userName' in rb), 'receipt identity must not come from browser');
    assert(calls[0].init?.credentials === 'include', 'receipt credentials');
    passed++;

    responder = async () => new Response(JSON.stringify({ item: {}, transaction: {} }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    calls = [];
    await FinanceSettlementClient.registerPayment('ap-1', { financialAccountId: 'acc-1', paymentMethodId: 'pm-1', paymentAmount: 40, paymentDate: '2026-08-18' });
    assert(calls[0].url === '/api/finance/payables/ap-1/payment', 'payment URL');
    const pb = JSON.parse(String(calls[0].init?.body)) as Record<string, unknown>;
    assert(!('companyId' in pb) && !('userId' in pb) && !('userName' in pb), 'payment identity must not come from browser');
    passed++;

    responder = async () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    let failedClosed = false;
    try { await FinanceSettlementClient.getOptions(); } catch (error) { failedClosed = error instanceof FinanceSettlementApiError && error.status === 401; }
    assert(failedClosed, '401 must fail closed');
    passed++;

    responder = async () => new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    failedClosed = false;
    try { await FinanceSettlementClient.registerPayment('ap-1', { financialAccountId: 'a', paymentMethodId: 'm', paymentAmount: 1, paymentDate: '2026-08-18' }); } catch (error) { failedClosed = error instanceof FinanceSettlementApiError && error.status === 403; }
    assert(failedClosed, '403 must fail closed');
    passed++;

    responder = async () => new Response(JSON.stringify({ accounts: [], paymentMethods: 'bad' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    let invalid = false;
    try { await FinanceSettlementClient.getOptions(); } catch { invalid = true; }
    assert(invalid, 'invalid options must fail closed');
    passed++;

    responder = async () => { throw new Error('network down'); };
    let networkClosed = false;
    try { await FinanceSettlementClient.getOptions(); } catch (error) { networkClosed = error instanceof Error && error.message === 'network down'; }
    assert(networkClosed, 'network error must propagate without local fallback');
    passed++;

    console.log(`FinanceSettlementClient ${passed}/7 PASS`);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

run().catch((error) => { console.error(error); process.exit(1); });
'''
Path('src/api/__tests__/financeSettlementClientTestRunner.ts').write_text(tests)

# PaymentModal: server-authoritative options and payment command.
p = Path('src/components/modals/PaymentModal.tsx')
text = p.read_text()
text = text.replace("import { AccountPayable, FinancialAccount, PaymentMethod } from '../../types/entities';\n", "import { AccountPayable } from '../../types/entities';\n")
text = text.replace("import { FinanceEngine } from '../../domain/finance/FinanceEngine';\n", '')
text = text.replace("import { FinancialAccountRepository, PaymentMethodRepository } from '../../persistence/repositories/localRepositories';\n", '')
text = text.replace("import { useAuth } from '../../hooks/useAuth';\n", '')
text = text.replace("import { X, CreditCard, AlertCircle } from 'lucide-react';\n", "import { X, CreditCard, AlertCircle } from 'lucide-react';\nimport { FinanceSettlementClient, SettlementAccountOption, SettlementPaymentMethodOption } from '../../api/financeSettlementClient';\n")
text = text.replace("  const { user } = useAuth();\n", '')
text = text.replace("  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);\n  const [methods, setMethods] = useState<PaymentMethod[]>([]);\n", "  const [accounts, setAccounts] = useState<SettlementAccountOption[]>([]);\n  const [methods, setMethods] = useState<SettlementPaymentMethodOption[]>([]);\n")
old = """  const loadOptions = async () => {\n    const accRepo = new FinancialAccountRepository();\n    const pmRepo = new PaymentMethodRepository();\n    const accList = await accRepo.findAllForCompany(user.companyId);\n    const pmList = await pmRepo.findAllForCompany(user.companyId);\n    setAccounts(accList);\n    setMethods(pmList);\n\n    if (accList.length > 0) setSelectedAccountId(accList[0].id);\n    if (pmList.length > 0) setSelectedMethodId(pmList[0].id);\n  };\n"""
new = """  const loadOptions = async () => {\n    try {\n      const options = await FinanceSettlementClient.getOptions();\n      setAccounts(options.accounts);\n      setMethods(options.paymentMethods);\n      if (options.accounts.length > 0) setSelectedAccountId(options.accounts[0].id);\n      if (options.paymentMethods.length > 0) setSelectedMethodId(options.paymentMethods[0].id);\n    } catch (err) {\n      setAccounts([]);\n      setMethods([]);\n      setError(err instanceof Error ? err.message : 'Erro ao carregar opções financeiras.');\n    }\n  };\n"""
if old not in text: raise SystemExit('PaymentModal loadOptions mismatch')
text = text.replace(old, new, 1)
old = """    if (payable.companyId !== user.companyId) {\n      setError('Erro de isolamento de tenant: O título a pagar não pertence à sua empresa.');\n      return;\n    }\n"""
if old not in text: raise SystemExit('PaymentModal tenant check mismatch')
text = text.replace(old, '', 1)
old = """      await FinanceEngine.registerPayment({\n        companyId: payable.companyId,\n        obligationId: payable.id,\n        financialAccountId: selectedAccountId,\n        paymentAmount: amount,\n        paymentDate,\n        paymentMethodId: selectedMethodId,\n        description: notes || 'Pagamento efetuado via portal operacional',\n        userId: user.userId,\n        userName: user.name,\n      });\n"""
new = """      await FinanceSettlementClient.registerPayment(payable.id, {\n        financialAccountId: selectedAccountId,\n        paymentAmount: amount,\n        paymentDate,\n        paymentMethodId: selectedMethodId,\n        description: notes || 'Pagamento efetuado via portal operacional',\n      });\n"""
if old not in text: raise SystemExit('PaymentModal submit mismatch')
text = text.replace(old, new, 1)
p.write_text(text)

# ReceiptModal: same migration.
p = Path('src/components/modals/ReceiptModal.tsx')
text = p.read_text()
text = text.replace("import { AccountReceivable, FinancialAccount, PaymentMethod } from '../../types/entities';\n", "import { AccountReceivable } from '../../types/entities';\n")
text = text.replace("import { FinanceEngine } from '../../domain/finance/FinanceEngine';\n", '')
text = text.replace("import { FinancialAccountRepository, PaymentMethodRepository } from '../../persistence/repositories/localRepositories';\n", '')
text = text.replace("import { useAuth } from '../../hooks/useAuth';\n", '')
text = text.replace("import { X, CheckCircle, AlertCircle } from 'lucide-react';\n", "import { X, CheckCircle, AlertCircle } from 'lucide-react';\nimport { FinanceSettlementClient, SettlementAccountOption, SettlementPaymentMethodOption } from '../../api/financeSettlementClient';\n")
text = text.replace("  const { user } = useAuth();\n", '')
text = text.replace("  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);\n  const [methods, setMethods] = useState<PaymentMethod[]>([]);\n", "  const [accounts, setAccounts] = useState<SettlementAccountOption[]>([]);\n  const [methods, setMethods] = useState<SettlementPaymentMethodOption[]>([]);\n")
old = """  const loadOptions = async () => {\n    const accRepo = new FinancialAccountRepository();\n    const pmRepo = new PaymentMethodRepository();\n    const accList = await accRepo.findAllForCompany(user.companyId);\n    const pmList = await pmRepo.findAllForCompany(user.companyId);\n    setAccounts(accList);\n    setMethods(pmList);\n\n    if (accList.length > 0) setSelectedAccountId(accList[0].id);\n    if (pmList.length > 0) setSelectedMethodId(pmList[0].id);\n  };\n"""
new = """  const loadOptions = async () => {\n    try {\n      const options = await FinanceSettlementClient.getOptions();\n      setAccounts(options.accounts);\n      setMethods(options.paymentMethods);\n      if (options.accounts.length > 0) setSelectedAccountId(options.accounts[0].id);\n      if (options.paymentMethods.length > 0) setSelectedMethodId(options.paymentMethods[0].id);\n    } catch (err) {\n      setAccounts([]);\n      setMethods([]);\n      setError(err instanceof Error ? err.message : 'Erro ao carregar opções financeiras.');\n    }\n  };\n"""
if old not in text: raise SystemExit('ReceiptModal loadOptions mismatch')
text = text.replace(old, new, 1)
old = """    if (receivable.companyId !== user.companyId) {\n      setError('Erro de isolamento de tenant: O título a receber não pertence à sua empresa.');\n      return;\n    }\n"""
if old not in text: raise SystemExit('ReceiptModal tenant check mismatch')
text = text.replace(old, '', 1)
old = """      await FinanceEngine.registerReceipt({\n        companyId: receivable.companyId,\n        obligationId: receivable.id,\n        financialAccountId: selectedAccountId,\n        paymentAmount: amount,\n        paymentDate,\n        paymentMethodId: selectedMethodId,\n        description: notes || 'Recebimento de título via portal operacional',\n        userId: user.userId,\n        userName: user.name,\n      });\n"""
new = """      await FinanceSettlementClient.registerReceipt(receivable.id, {\n        financialAccountId: selectedAccountId,\n        paymentAmount: amount,\n        paymentDate,\n        paymentMethodId: selectedMethodId,\n        description: notes || 'Recebimento de título via portal operacional',\n      });\n"""
if old not in text: raise SystemExit('ReceiptModal submit mismatch')
text = text.replace(old, new, 1)
p.write_text(text)
