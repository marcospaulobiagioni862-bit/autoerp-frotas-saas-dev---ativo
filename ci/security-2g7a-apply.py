from pathlib import Path
import re


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match, found {count}")
    p.write_text(text.replace(old, new, 1))

# Server-authoritative finance overview read.
server_marker = "  // SECURITY-2G6: receivable renegotiation is server-authoritative.\n"
overview_route = r'''  // SECURITY-2G7A: finance overview is server-authoritative and tenant-scoped.
  app.get('/api/finance/overview', async (req: Request, res: Response) => {
    const principal = requireFinancePrincipal(req, res);
    if (!principal) return;

    try {
      const summary = await UnitOfWork.run(principal.companyId, async (txContext) => {
        const accountRepo = txContext.getAccountRepo();
        if (!accountRepo.findAll) {
          throw new Error('Financial account listing is unavailable');
        }

        const [receivables, payables, accounts] = await Promise.all([
          txContext.getReceivableRepo().findAll(),
          txContext.getPayableRepo().findAll(),
          accountRepo.findAll(),
        ]);

        const totalReceivable = receivables
          .filter((item) => item.status === 'PENDING' || item.status === 'PARTIALLY_PAID')
          .reduce((sum, item) => sum + Number(item.balanceAmount || 0), 0);

        const totalPayable = payables
          .filter((item) => item.status === 'PENDING' || item.status === 'PARTIALLY_PAID')
          .reduce((sum, item) => sum + Number(item.balanceAmount || 0), 0);

        const totalBalance = accounts
          .reduce((sum, account) => sum + Number(account.currentBalance || 0), 0);

        return { totalReceivable, totalPayable, totalBalance };
      });

      res.json(summary);
    } catch (error) {
      sendFinanceCommandError(res, error);
    }
  });

'''
replace_once('server.ts', server_marker, overview_route + server_marker)

# Fail-closed browser transport.
client = r'''export interface FinanceOverviewSummary {
  totalReceivable: number;
  totalPayable: number;
  totalBalance: number;
}

export class FinanceOverviewApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'FinanceOverviewApiError';
  }
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid finance overview response');
  }
  return value as JsonRecord;
}

function finiteNumber(record: JsonRecord, key: keyof FinanceOverviewSummary): number {
  const value = Number(record[key]);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid finance overview field: ${key}`);
  }
  return value;
}

export class FinanceOverviewClient {
  static async getOverview(): Promise<FinanceOverviewSummary> {
    const response = await fetch('/api/finance/overview', {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      let message = `Finance overview request failed (${response.status})`;
      try {
        const payload = asRecord(await response.json());
        if (typeof payload.error === 'string' && payload.error) {
          message = payload.error;
        }
      } catch {
        // Fail closed. Never fall back to browser financial repositories.
      }
      throw new FinanceOverviewApiError(response.status, message);
    }

    const payload = asRecord(await response.json());
    return {
      totalReceivable: finiteNumber(payload, 'totalReceivable'),
      totalPayable: finiteNumber(payload, 'totalPayable'),
      totalBalance: finiteNumber(payload, 'totalBalance'),
    };
  }
}
'''
Path('src/api').mkdir(parents=True, exist_ok=True)
Path('src/api/financeOverviewClient.ts').write_text(client)

# Dedicated transport tests.
test = r'''import { FinanceOverviewApiError, FinanceOverviewClient } from '../financeOverviewClient';

export class FinanceOverviewClientTestRunner {
  static async runAllTests() {
    const originalFetch = globalThis.fetch;
    let passed = 0;
    const tests: Array<() => Promise<void>> = [];

    tests.push(async () => {
      let seenUrl = '';
      let seenCredentials: RequestCredentials | undefined;
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        seenUrl = String(input);
        seenCredentials = init?.credentials;
        return new Response(JSON.stringify({ totalReceivable: 10, totalPayable: 5, totalBalance: 30 }), { status: 200 });
      }) as typeof fetch;
      const result = await FinanceOverviewClient.getOverview();
      if (seenUrl !== '/api/finance/overview' || seenCredentials !== 'include' || result.totalBalance !== 30) {
        throw new Error('overview request contract failed');
      }
    });

    tests.push(async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify({
        totalReceivable: '100.50', totalPayable: '20.25', totalBalance: '80.25',
      }), { status: 200 })) as typeof fetch;
      const result = await FinanceOverviewClient.getOverview();
      if (result.totalReceivable !== 100.5 || result.totalPayable !== 20.25 || result.totalBalance !== 80.25) {
        throw new Error('numeric normalization failed');
      }
    });

    tests.push(async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })) as typeof fetch;
      let thrown: unknown;
      try { await FinanceOverviewClient.getOverview(); } catch (error) { thrown = error; }
      if (!(thrown instanceof FinanceOverviewApiError) || thrown.status !== 401) {
        throw new Error('HTTP failure must fail closed');
      }
    });

    tests.push(async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify({
        totalReceivable: 1, totalPayable: 2, totalBalance: 'not-a-number',
      }), { status: 200 })) as typeof fetch;
      let failed = false;
      try { await FinanceOverviewClient.getOverview(); } catch { failed = true; }
      if (!failed) throw new Error('invalid payload must be rejected');
    });

    try {
      for (const run of tests) {
        await run();
        passed += 1;
      }
    } finally {
      globalThis.fetch = originalFetch;
    }

    const result = { passed, failed: tests.length - passed, total: tests.length };
    console.log(`FinanceOverviewClient ${result.passed}/${result.total} PASS`);
    return result;
  }
}

if (process.argv[1]?.includes('financeOverviewClientTestRunner')) {
  FinanceOverviewClientTestRunner.runAllTests().then((result) => {
    if (result.failed) process.exit(1);
  }).catch((error) => { console.error(error); process.exit(1); });
}
'''
Path('src/api/__tests__').mkdir(parents=True, exist_ok=True)
Path('src/api/__tests__/financeOverviewClientTestRunner.ts').write_text(test)

# FinanceOverviewView uses only the server transport for financial summary data.
p = Path('src/components/finance/FinanceOverviewView.tsx')
text = p.read_text()
text = text.replace("import { AccountReceivableRepository, AccountPayableRepository, FinancialAccountRepository, FinancialTransactionRepository } from '../../persistence/repositories/localRepositories';\n", '')
text = text.replace("import { useAuth } from '../../hooks/useAuth';\n", '')
needle = "import { formatCurrencyBRL } from '../../shared/utils/currency';\n"
if needle not in text:
    raise SystemExit('FinanceOverviewView currency import marker missing')
text = text.replace(needle, needle + "import { FinanceOverviewClient } from '../../api/financeOverviewClient';\n", 1)
text = text.replace("  const { user } = useAuth();\n", '')
pattern = re.compile(r"  const loadSummary = async \(\) => \{.*?\n  \};", re.S)
match = pattern.search(text)
if not match:
    raise SystemExit('FinanceOverviewView loadSummary block missing')
new_block = r'''  const loadSummary = async () => {
    try {
      const summary = await FinanceOverviewClient.getOverview();
      setTotalReceivable(summary.totalReceivable);
      setTotalPayable(summary.totalPayable);
      setTotalBalance(summary.totalBalance);
    } catch (err) {
      console.error('Erro ao carregar resumo financeiro:', err);
      setTotalReceivable(0);
      setTotalPayable(0);
      setTotalBalance(0);
    } finally {
      setLoading(false);
    }
  };'''
text = text[:match.start()] + new_block + text[match.end():]
p.write_text(text)
