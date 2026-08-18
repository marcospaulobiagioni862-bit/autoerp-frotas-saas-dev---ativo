from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)

# DREService: add transactional repository source while preserving all formulas.
p = Path('src/domain/finance/DREService.ts')
text = p.read_text()
if "import { ITransactionContext } from './ITransactionContext';" not in text:
    text = "import { ITransactionContext } from './ITransactionContext';\n" + text
text = replace_once(
    text,
    "    regime: AccountingRegime = AccountingRegime.ACCRUAL\n  ): Promise<DREReport> {",
    "    regime: AccountingRegime = AccountingRegime.ACCRUAL,\n    txContext?: ITransactionContext\n  ): Promise<DREReport> {",
    'DRE signature',
)
text = replace_once(
    text,
    "      const recs = await this.recRepo.findAllForCompany(companyId);\n      const pays = await this.payRepo.findAllForCompany(companyId);",
    "      const recs = txContext\n        ? await txContext.getReceivableRepo().findAll()\n        : await this.recRepo.findAllForCompany(companyId);\n      const pays = txContext\n        ? await txContext.getPayableRepo().findAll()\n        : await this.payRepo.findAllForCompany(companyId);",
    'DRE accrual repositories',
)
text = replace_once(
    text,
    "        grossRevenueAmount += r.originalAmount;\n        financialResultAmount += (r.fineAmount + r.interestAmount - r.discountAmount);",
    "        grossRevenueAmount += Number(r.originalAmount || 0);\n        financialResultAmount += (\n          Number(r.fineAmount || 0) +\n          Number(r.interestAmount || 0) -\n          Number(r.discountAmount || 0)\n        );",
    'DRE accrual receivable arithmetic',
)
text = replace_once(
    text,
    "        directCostsAmount += p.originalAmount;",
    "        directCostsAmount += Number(p.originalAmount || 0);",
    'DRE accrual payable arithmetic',
)
text = replace_once(
    text,
    "      const txs = await this.txRepo.findAllForCompany(companyId);",
    "      const txs = txContext\n        ? await txContext.getTransactionRepo().findAll()\n        : await this.txRepo.findAllForCompany(companyId);",
    'DRE cash repository',
)
text = replace_once(
    text,
    "        if (t.type === TransactionType.INCOME) grossRevenueAmount += t.amount;\n        else if (t.type === TransactionType.EXPENSE) directCostsAmount += t.amount;",
    "        if (t.type === TransactionType.INCOME) grossRevenueAmount += Number(t.amount || 0);\n        else if (t.type === TransactionType.EXPENSE) directCostsAmount += Number(t.amount || 0);",
    'DRE cash arithmetic',
)
p.write_text(text)

# Server: expose authenticated, tenant-scoped DRE endpoint.
p = Path('server.ts')
text = p.read_text()
if "import { DREService } from './src/domain/finance/DREService';" not in text:
    text = replace_once(
        text,
        "import { RenegotiationService } from './src/domain/finance/RenegotiationService';",
        "import { RenegotiationService } from './src/domain/finance/RenegotiationService';\nimport { DREService } from './src/domain/finance/DREService';",
        'server DRE import',
    )
if "import { AccountingRegime } from './src/types/enums';" not in text:
    text = replace_once(
        text,
        "import { UnitOfWork } from './src/db/uow';",
        "import { UnitOfWork } from './src/db/uow';\nimport { AccountingRegime } from './src/types/enums';",
        'server AccountingRegime import',
    )
marker = "  // SECURITY-2G6: receivable renegotiation is server-authoritative."
endpoint = """  // SECURITY-2G7B1: DRE is server-authoritative and tenant-scoped.\n  app.get('/api/finance/reports/dre', async (req: Request, res: Response) => {\n    const principal = requireFinancePrincipal(req, res);\n    if (!principal) return;\n\n    const periodStart = typeof req.query.start === 'string' ? req.query.start : '';\n    const periodEnd = typeof req.query.end === 'string' ? req.query.end : '';\n    const regime = req.query.regime === AccountingRegime.CASH\n      ? AccountingRegime.CASH\n      : req.query.regime === AccountingRegime.ACCRUAL\n        ? AccountingRegime.ACCRUAL\n        : null;\n    const datePattern = /^\\d{4}-\\d{2}-\\d{2}$/;\n\n    if (!datePattern.test(periodStart) || !datePattern.test(periodEnd) || periodStart > periodEnd || !regime) {\n      res.status(400).json({ error: 'Invalid DRE report parameters' });\n      return;\n    }\n\n    try {\n      const report = await UnitOfWork.run(principal.companyId, async (txContext) =>\n        await DREService.getDREReport(\n          principal.companyId,\n          periodStart,\n          periodEnd,\n          regime,\n          txContext\n        )\n      );\n      res.json({ report });\n    } catch (error) {\n      sendFinanceCommandError(res, error);\n    }\n  });\n\n"""
if "app.get('/api/finance/reports/dre'" not in text:
    text = replace_once(text, marker, endpoint + marker, 'server DRE endpoint')
p.write_text(text)

# Browser transport: no tenant/user identity fields and no local fallback.
Path('src/api/financeReportingClient.ts').write_text("""import { AccountingRegime } from '../types/enums';\nimport { DREReport } from '../types/reports';\n\nexport class FinanceReportingApiError extends Error {\n  constructor(public readonly status: number, message: string) {\n    super(message);\n    this.name = 'FinanceReportingApiError';\n  }\n}\n\ntype JsonRecord = Record<string, unknown>;\n\nfunction asRecord(value: unknown): JsonRecord {\n  if (!value || typeof value !== 'object' || Array.isArray(value)) {\n    throw new Error('Invalid finance reporting response');\n  }\n  return value as JsonRecord;\n}\n\nfunction finite(value: unknown): boolean {\n  return Number.isFinite(Number(value));\n}\n\nfunction validateDREReport(value: unknown): DREReport {\n  const report = asRecord(value);\n  const grossRevenue = asRecord(report.grossRevenue);\n  const directCosts = asRecord(report.directCosts);\n  const netIncome = asRecord(report.netIncome);\n  if (\n    typeof report.periodStart !== 'string' ||\n    typeof report.periodEnd !== 'string' ||\n    typeof report.regime !== 'string' ||\n    !finite(grossRevenue.amount) ||\n    !finite(directCosts.amount) ||\n    !finite(netIncome.amount) ||\n    !finite(report.netProfit)\n  ) {\n    throw new Error('Invalid DRE report payload');\n  }\n  return report as unknown as DREReport;\n}\n\nexport class FinanceReportingClient {\n  static async getDRE(\n    periodStart: string,\n    periodEnd: string,\n    regime: AccountingRegime\n  ): Promise<DREReport> {\n    const params = new URLSearchParams({ start: periodStart, end: periodEnd, regime });\n    const response = await fetch(`/api/finance/reports/dre?${params.toString()}`, {\n      method: 'GET',\n      credentials: 'include',\n    });\n\n    if (!response.ok) {\n      let message = `DRE report request failed (${response.status})`;\n      try {\n        const payload = asRecord(await response.json());\n        if (typeof payload.error === 'string' && payload.error) message = payload.error;\n      } catch {\n        // Fail closed: reporting never falls back to browser financial repositories.\n      }\n      throw new FinanceReportingApiError(response.status, message);\n    }\n\n    const payload = asRecord(await response.json());\n    return validateDREReport(payload.report);\n  }\n}\n""")

Path('src/api/__tests__/financeReportingClientTestRunner.ts').write_text("""import { FinanceReportingApiError, FinanceReportingClient } from '../financeReportingClient';\nimport { AccountingRegime } from '../../types/enums';\n\nconst report = {\n  periodStart: '2026-01-01', periodEnd: '2026-12-31', regime: AccountingRegime.CASH,\n  grossRevenue: { code: '1', description: 'gross', amount: 100 },\n  deductions: { code: '2', description: 'ded', amount: 0 },\n  netRevenue: { code: '3', description: 'net', amount: 100 },\n  directCosts: { code: '4', description: 'cost', amount: 40 },\n  grossProfit: { code: '5', description: 'profit', amount: 60 },\n  operatingExpenses: { code: '6', description: 'opex', amount: 0 },\n  operatingProfit: { code: '7', description: 'op', amount: 60 },\n  financialResult: { code: '8', description: 'fin', amount: 0 },\n  netIncome: { code: '9', description: 'income', amount: 60 },\n  netProfit: 60, breakdown: { maintenanceCosts: 16, insuranceCosts: 12, trackerCosts: 8, trafficTicketCosts: 4 },\n};\n\nexport class FinanceReportingClientTestRunner {\n  static async runAllTests() {\n    const originalFetch = globalThis.fetch;\n    let passed = 0;\n    const tests: Array<() => Promise<void>> = [];\n\n    tests.push(async () => {\n      let url = ''; let credentials: RequestCredentials | undefined;\n      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {\n        url = String(input); credentials = init?.credentials;\n        return new Response(JSON.stringify({ report }), { status: 200 });\n      }) as typeof fetch;\n      const result = await FinanceReportingClient.getDRE('2026-01-01','2026-12-31',AccountingRegime.CASH);\n      if (!url.includes('/api/finance/reports/dre?') || !url.includes('regime=CASH') || credentials !== 'include' || result.netProfit !== 60) {\n        throw new Error('DRE transport contract failed');\n      }\n    });\n\n    tests.push(async () => {\n      globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })) as typeof fetch;\n      let thrown: unknown; try { await FinanceReportingClient.getDRE('2026-01-01','2026-12-31',AccountingRegime.CASH); } catch (e) { thrown = e; }\n      if (!(thrown instanceof FinanceReportingApiError) || thrown.status !== 401) throw new Error('HTTP failure must fail closed');\n    });\n\n    tests.push(async () => {\n      globalThis.fetch = (async () => new Response(JSON.stringify({ report: { netProfit: 'bad' } }), { status: 200 })) as typeof fetch;\n      let failed = false; try { await FinanceReportingClient.getDRE('2026-01-01','2026-12-31',AccountingRegime.ACCRUAL); } catch { failed = true; }\n      if (!failed) throw new Error('Malformed report must fail closed');\n    });\n\n    tests.push(async () => {\n      let body: unknown = 'not-set';\n      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => { body = init?.body; return new Response(JSON.stringify({ report }), { status: 200 }); }) as typeof fetch;\n      await FinanceReportingClient.getDRE('2026-01-01','2026-12-31',AccountingRegime.CASH);\n      if (body !== undefined) throw new Error('DRE GET must not send browser identity/body');\n    });\n\n    try { for (const test of tests) { await test(); passed += 1; } } finally { globalThis.fetch = originalFetch; }\n    const result = { passed, failed: tests.length - passed, total: tests.length };\n    console.log(`FinanceReportingClient ${result.passed}/${result.total} PASS`);\n    return result;\n  }\n}\n\nif (process.argv[1]?.includes('financeReportingClientTestRunner')) {\n  FinanceReportingClientTestRunner.runAllTests().then(r => { if (r.failed) process.exit(1); }).catch(e => { console.error(e); process.exit(1); });\n}\n""")

# View: only DRE moves to server in B1. Profitability remains untouched for B2.
p = Path('src/components/finance/DREReportView.tsx')
text = p.read_text()
if "import { FinanceReportingClient } from '../../api/financeReportingClient';" not in text:
    text = replace_once(
        text,
        "import { FinanceEngine } from '../../domain/finance/FinanceEngine';",
        "import { FinanceEngine } from '../../domain/finance/FinanceEngine';\nimport { FinanceReportingClient } from '../../api/financeReportingClient';",
        'DRE view client import',
    )
text = replace_once(
    text,
    "        const dre = await FinanceEngine.getDREReport(companyId, startDate, endDate, regime);",
    "        const dre = await FinanceReportingClient.getDRE(startDate, endDate, regime);",
    'DRE view server call',
)
p.write_text(text)

print('SECURITY-2G7B1 patch applied')
