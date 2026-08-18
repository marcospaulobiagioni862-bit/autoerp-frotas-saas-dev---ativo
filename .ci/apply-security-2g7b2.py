from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)

# ProfitabilityService: preserve formulas, move financial repository authority to txContext when supplied.
Path('src/domain/finance/ProfitabilityService.ts').write_text("""import { ITransactionContext } from './ITransactionContext';
import {
  FinancialTransactionRepository,
  AccountReceivableRepository,
  AccountPayableRepository,
  VehicleRepository,
} from '../../persistence/repositories/localRepositories';
import { AccountingRegime, TransactionType, OriginType, ObligationStatus } from '../../types/enums';
import { VehicleProfitabilityReport } from '../../types/reports';
import { roundCurrency } from '../../shared/utils/currency';

export class ProfitabilityService {
  private static txRepo = new FinancialTransactionRepository();
  private static recRepo = new AccountReceivableRepository();
  private static payRepo = new AccountPayableRepository();
  private static vehicleRepo = new VehicleRepository();

  public static async getVehicleProfitability(
    companyId: string,
    vehicleId: string,
    periodStart: string,
    periodEnd: string,
    regime: AccountingRegime = AccountingRegime.CASH,
    txContext?: ITransactionContext
  ): Promise<VehicleProfitabilityReport> {
    // Vehicle metadata is display-only in the current report UI. The trusted
    // server path does not depend on browser/local vehicle metadata for any
    // financial calculation. Local lookup remains only for legacy test/DEV.
    const vehicle = txContext
      ? null
      : await this.vehicleRepo.findByIdForCompany(vehicleId, companyId);

    let rentalIncome = 0;
    let kmExcessIncome = 0;
    let finesReimbursedIncome = 0;
    let otherIncome = 0;

    let maintenanceExpense = 0;
    let insuranceExpense = 0;
    let trackerExpense = 0;
    let documentationExpense = 0;
    let finesCompanyExpense = 0;
    let financingExpense = 0;
    let otherExpense = 0;

    const dateKey = (value?: string) => (value || '').slice(0, 10);
    const isDepositText = (desc?: string, origin?: string) => {
      const text = (desc || '').toLowerCase();
      return text.includes('caução') || text.includes('caucao') || origin === OriginType.SECURITY_DEPOSIT;
    };

    if (regime === AccountingRegime.CASH) {
      const allTx = txContext
        ? (await txContext.getTransactionRepo().findAll()).filter((t) => t.vehicleId === vehicleId)
        : await this.txRepo.findByVehicleIdForCompany(companyId, vehicleId);
      const allPayables = txContext
        ? (await txContext.getPayableRepo().findAll()).filter((p) => p.vehicleId === vehicleId)
        : await this.payRepo.findByVehicleIdForCompany(companyId, vehicleId);
      const allReceivables = txContext
        ? (await txContext.getReceivableRepo().findAll()).filter((r) => r.vehicleId === vehicleId)
        : await this.recRepo.findByVehicleIdForCompany(companyId, vehicleId);

      const payMap = new Map(allPayables.map((p) => [p.id, p]));
      const recMap = new Map(allReceivables.map((r) => [r.id, r]));

      const periodTx = allTx.filter(
        (t) =>
          t.vehicleId === vehicleId &&
          !t.isReversed &&
          dateKey(t.transactionDate) >= periodStart &&
          dateKey(t.transactionDate) <= periodEnd &&
          t.type !== TransactionType.TRANSFER &&
          t.type !== TransactionType.REVERSAL &&
          !isDepositText(t.description)
      );

      for (const t of periodTx) {
        const amount = Number(t.amount || 0);
        if (t.type === TransactionType.INCOME) {
          let recOrigin: OriginType | undefined = undefined;
          if (t.receivableId && recMap.has(t.receivableId)) {
            recOrigin = recMap.get(t.receivableId)?.originType;
          }

          if (recOrigin === OriginType.KM_EXCESS || t.description.toLowerCase().includes('excesso km')) {
            kmExcessIncome += amount;
          } else if (recOrigin === OriginType.TRAFFIC_TICKET_DRIVER || t.description.toLowerCase().includes('reembolso de multa')) {
            finesReimbursedIncome += amount;
          } else {
            rentalIncome += amount;
          }
        } else if (t.type === TransactionType.EXPENSE) {
          let payOrigin: OriginType | undefined = undefined;
          if (t.payableId && payMap.has(t.payableId)) {
            payOrigin = payMap.get(t.payableId)?.originType;
          }

          const desc = t.description.toLowerCase();

          if (payOrigin === OriginType.MAINTENANCE || desc.includes('manutenção') || desc.includes('manutencao') || desc.includes('pneus') || desc.includes('óleo') || desc.includes('retífica')) {
            maintenanceExpense += amount;
          } else if (payOrigin === OriginType.INSURANCE || desc.includes('seguro')) {
            insuranceExpense += amount;
          } else if (payOrigin === OriginType.TRACKER || desc.includes('rastreador')) {
            trackerExpense += amount;
          } else if (payOrigin === OriginType.DOCUMENTATION || desc.includes('ipva') || desc.includes('licenciamento') || desc.includes('documentação')) {
            documentationExpense += amount;
          } else if (payOrigin === OriginType.TRAFFIC_TICKET_COMPANY || desc.includes('multa')) {
            finesCompanyExpense += amount;
          } else if (payOrigin === OriginType.FINANCING || desc.includes('financiamento')) {
            financingExpense += amount;
          } else {
            otherExpense += amount;
          }
        }
      }
    } else {
      // ACCRUAL REGIME
      const receivables = txContext
        ? (await txContext.getReceivableRepo().findAll()).filter((r) => r.vehicleId === vehicleId)
        : await this.recRepo.findByVehicleIdForCompany(companyId, vehicleId);
      const payables = txContext
        ? (await txContext.getPayableRepo().findAll()).filter((p) => p.vehicleId === vehicleId)
        : await this.payRepo.findByVehicleIdForCompany(companyId, vehicleId);

      const periodRec = receivables.filter(
        (r) =>
          r.vehicleId === vehicleId &&
          r.status !== ObligationStatus.CANCELLED &&
          dateKey(r.competenceDate) >= periodStart &&
          dateKey(r.competenceDate) <= periodEnd &&
          !isDepositText(r.description, r.originType)
      );

      for (const r of periodRec) {
        const amount = Number(r.originalAmount || 0);
        if (r.originType === OriginType.KM_EXCESS) {
          kmExcessIncome += amount;
        } else if (r.originType === OriginType.TRAFFIC_TICKET_DRIVER) {
          finesReimbursedIncome += amount;
        } else {
          rentalIncome += amount;
        }
      }

      const periodPay = payables.filter(
        (p) =>
          p.vehicleId === vehicleId &&
          p.status !== ObligationStatus.CANCELLED &&
          dateKey(p.competenceDate) >= periodStart &&
          dateKey(p.competenceDate) <= periodEnd &&
          !isDepositText(p.description, p.originType)
      );

      for (const p of periodPay) {
        const amount = Number(p.originalAmount || 0);
        if (p.originType === OriginType.MAINTENANCE) {
          maintenanceExpense += amount;
        } else if (p.originType === OriginType.INSURANCE) {
          insuranceExpense += amount;
        } else if (p.originType === OriginType.TRACKER) {
          trackerExpense += amount;
        } else if (p.originType === OriginType.DOCUMENTATION) {
          documentationExpense += amount;
        } else if (p.originType === OriginType.TRAFFIC_TICKET_COMPANY) {
          finesCompanyExpense += amount;
        } else if (p.originType === OriginType.FINANCING) {
          financingExpense += amount;
        } else {
          otherExpense += amount;
        }
      }
    }

    const totalIncome = roundCurrency(rentalIncome + kmExcessIncome + finesReimbursedIncome + otherIncome);
    const totalExpense = roundCurrency(
      maintenanceExpense +
        insuranceExpense +
        trackerExpense +
        documentationExpense +
        finesCompanyExpense +
        financingExpense +
        otherExpense
    );

    const netProfit = roundCurrency(totalIncome - totalExpense);
    const profitMarginPercentage = totalIncome > 0 ? roundCurrency((netProfit / totalIncome) * 100) : 0;

    return {
      vehicleId,
      plate: vehicle?.plate || '',
      model: vehicle?.model || '',
      brand: vehicle?.brand || '',
      status: vehicle?.status || '',
      regime,
      periodStart,
      periodEnd,
      kmTraveledPeriod: 0,
      rentalIncome: roundCurrency(rentalIncome),
      kmExcessIncome: roundCurrency(kmExcessIncome),
      finesReimbursedIncome: roundCurrency(finesReimbursedIncome),
      otherIncome: roundCurrency(otherIncome),
      totalIncome,
      grossRevenue: totalIncome,
      maintenanceExpense: roundCurrency(maintenanceExpense),
      insuranceExpense: roundCurrency(insuranceExpense),
      trackerExpense: roundCurrency(trackerExpense),
      documentationExpense: roundCurrency(documentationExpense),
      finesCompanyExpense: roundCurrency(finesCompanyExpense),
      financingExpense: roundCurrency(financingExpense),
      depreciationExpense: 0,
      otherExpense: roundCurrency(otherExpense),
      totalExpense,
      totalExpenses: totalExpense,
      netProfit,
      profitMarginPercentage,
      marginPercentage: profitMarginPercentage,
      costPerKm: 0,
      revenuePerKm: 0,
    };
  }
}
""")

# Server: add ProfitabilityService endpoint after DRE endpoint, before G6.
p = Path('server.ts')
text = p.read_text()
if "import { ProfitabilityService } from './src/domain/finance/ProfitabilityService';" not in text:
    text = replace_once(
        text,
        "import { DREService } from './src/domain/finance/DREService';",
        "import { DREService } from './src/domain/finance/DREService';\nimport { ProfitabilityService } from './src/domain/finance/ProfitabilityService';",
        'server profitability import',
    )
marker = "  // SECURITY-2G6: receivable renegotiation is server-authoritative."
endpoint = """  // SECURITY-2G7B2: vehicle profitability financial values are server-authoritative.\n  app.get('/api/finance/reports/vehicle-profitability', async (req: Request, res: Response) => {\n    const principal = requireFinancePrincipal(req, res);\n    if (!principal) return;\n\n    const vehicleId = typeof req.query.vehicleId === 'string' ? req.query.vehicleId.trim() : '';\n    const periodStart = typeof req.query.start === 'string' ? req.query.start : '';\n    const periodEnd = typeof req.query.end === 'string' ? req.query.end : '';\n    const regime = req.query.regime === AccountingRegime.CASH\n      ? AccountingRegime.CASH\n      : req.query.regime === AccountingRegime.ACCRUAL\n        ? AccountingRegime.ACCRUAL\n        : null;\n    const datePattern = /^\\d{4}-\\d{2}-\\d{2}$/;\n\n    if (!vehicleId || !datePattern.test(periodStart) || !datePattern.test(periodEnd) || periodStart > periodEnd || !regime) {\n      res.status(400).json({ error: 'Invalid vehicle profitability parameters' });\n      return;\n    }\n\n    try {\n      const report = await UnitOfWork.run(principal.companyId, async (txContext) =>\n        await ProfitabilityService.getVehicleProfitability(\n          principal.companyId,\n          vehicleId,\n          periodStart,\n          periodEnd,\n          regime,\n          txContext\n        )\n      );\n      res.json({ report });\n    } catch (error) {\n      sendFinanceCommandError(res, error);\n    }\n  });\n\n"""
if "app.get('/api/finance/reports/vehicle-profitability'" not in text:
    text = replace_once(text, marker, endpoint + marker, 'server profitability endpoint')
p.write_text(text)

# Reporting client: DRE + vehicle profitability transports, both fail closed.
Path('src/api/financeReportingClient.ts').write_text("""import { AccountingRegime } from '../types/enums';\nimport { DREReport, VehicleProfitabilityReport } from '../types/reports';\n\nexport class FinanceReportingApiError extends Error {\n  constructor(public readonly status: number, message: string) {\n    super(message);\n    this.name = 'FinanceReportingApiError';\n  }\n}\n\ntype JsonRecord = Record<string, unknown>;\n\nfunction asRecord(value: unknown): JsonRecord {\n  if (!value || typeof value !== 'object' || Array.isArray(value)) {\n    throw new Error('Invalid finance reporting response');\n  }\n  return value as JsonRecord;\n}\n\nfunction finite(value: unknown): boolean {\n  return Number.isFinite(Number(value));\n}\n\nfunction validateDREReport(value: unknown): DREReport {\n  const report = asRecord(value);\n  const grossRevenue = asRecord(report.grossRevenue);\n  const directCosts = asRecord(report.directCosts);\n  const netIncome = asRecord(report.netIncome);\n  if (\n    typeof report.periodStart !== 'string' ||\n    typeof report.periodEnd !== 'string' ||\n    typeof report.regime !== 'string' ||\n    !finite(grossRevenue.amount) ||\n    !finite(directCosts.amount) ||\n    !finite(netIncome.amount) ||\n    !finite(report.netProfit)\n  ) {\n    throw new Error('Invalid DRE report payload');\n  }\n  return report as unknown as DREReport;\n}\n\nfunction validateVehicleProfitabilityReport(value: unknown): VehicleProfitabilityReport {\n  const report = asRecord(value);\n  const numericFields = [\n    'rentalIncome', 'kmExcessIncome', 'finesReimbursedIncome', 'otherIncome',\n    'totalIncome', 'grossRevenue', 'maintenanceExpense', 'insuranceExpense',\n    'trackerExpense', 'documentationExpense', 'finesCompanyExpense',\n    'financingExpense', 'depreciationExpense', 'otherExpense', 'totalExpense',\n    'totalExpenses', 'netProfit', 'profitMarginPercentage', 'marginPercentage',\n    'costPerKm', 'revenuePerKm',\n  ];\n  if (\n    typeof report.vehicleId !== 'string' ||\n    typeof report.periodStart !== 'string' ||\n    typeof report.periodEnd !== 'string' ||\n    typeof report.regime !== 'string' ||\n    numericFields.some((field) => !finite(report[field]))\n  ) {\n    throw new Error('Invalid vehicle profitability payload');\n  }\n  return report as unknown as VehicleProfitabilityReport;\n}\n\nasync function errorMessage(response: Response, fallback: string): Promise<string> {\n  try {\n    const payload = asRecord(await response.json());\n    if (typeof payload.error === 'string' && payload.error) return payload.error;\n  } catch {\n    // Fail closed: reporting never falls back to browser financial repositories.\n  }\n  return fallback;\n}\n\nexport class FinanceReportingClient {\n  static async getDRE(\n    periodStart: string,\n    periodEnd: string,\n    regime: AccountingRegime\n  ): Promise<DREReport> {\n    const params = new URLSearchParams({ start: periodStart, end: periodEnd, regime });\n    const response = await fetch(`/api/finance/reports/dre?${params.toString()}`, {\n      method: 'GET',\n      credentials: 'include',\n    });\n\n    if (!response.ok) {\n      throw new FinanceReportingApiError(\n        response.status,\n        await errorMessage(response, `DRE report request failed (${response.status})`)\n      );\n    }\n\n    const payload = asRecord(await response.json());\n    return validateDREReport(payload.report);\n  }\n\n  static async getVehicleProfitability(\n    vehicleId: string,\n    periodStart: string,\n    periodEnd: string,\n    regime: AccountingRegime\n  ): Promise<VehicleProfitabilityReport> {\n    const params = new URLSearchParams({ vehicleId, start: periodStart, end: periodEnd, regime });\n    const response = await fetch(`/api/finance/reports/vehicle-profitability?${params.toString()}`, {\n      method: 'GET',\n      credentials: 'include',\n    });\n\n    if (!response.ok) {\n      throw new FinanceReportingApiError(\n        response.status,\n        await errorMessage(response, `Vehicle profitability request failed (${response.status})`)\n      );\n    }\n\n    const payload = asRecord(await response.json());\n    return validateVehicleProfitabilityReport(payload.report);\n  }\n}\n""")

# Transport tests: preserve DRE coverage and add profitability coverage.
Path('src/api/__tests__/financeReportingClientTestRunner.ts').write_text("""import { FinanceReportingApiError, FinanceReportingClient } from '../financeReportingClient';\nimport { AccountingRegime } from '../../types/enums';\n\nconst dreReport = {\n  periodStart: '2026-01-01', periodEnd: '2026-12-31', regime: AccountingRegime.CASH,\n  grossRevenue: { code: '1', description: 'gross', amount: 100 },\n  deductions: { code: '2', description: 'ded', amount: 0 },\n  netRevenue: { code: '3', description: 'net', amount: 100 },\n  directCosts: { code: '4', description: 'cost', amount: 40 },\n  grossProfit: { code: '5', description: 'profit', amount: 60 },\n  operatingExpenses: { code: '6', description: 'opex', amount: 0 },\n  operatingProfit: { code: '7', description: 'op', amount: 60 },\n  financialResult: { code: '8', description: 'fin', amount: 0 },\n  netIncome: { code: '9', description: 'income', amount: 60 },\n  netProfit: 60, breakdown: { maintenanceCosts: 16, insuranceCosts: 12, trackerCosts: 8, trafficTicketCosts: 4 },\n};\n\nconst profitabilityReport = {\n  vehicleId: 'veh-1', plate: '', model: '', brand: '', status: '', regime: AccountingRegime.CASH,\n  periodStart: '2026-01-01', periodEnd: '2026-12-31', kmTraveledPeriod: 0,\n  rentalIncome: 1000, kmExcessIncome: 100, finesReimbursedIncome: 50, otherIncome: 0, totalIncome: 1150, grossRevenue: 1150,\n  maintenanceExpense: 200, insuranceExpense: 100, trackerExpense: 50, documentationExpense: 25, finesCompanyExpense: 10,\n  financingExpense: 15, depreciationExpense: 0, otherExpense: 20, totalExpense: 420, totalExpenses: 420,\n  netProfit: 730, profitMarginPercentage: 63.48, marginPercentage: 63.48, costPerKm: 0, revenuePerKm: 0,\n};\n\nexport class FinanceReportingClientTestRunner {\n  static async runAllTests() {\n    const originalFetch = globalThis.fetch;\n    let passed = 0;\n    const tests: Array<() => Promise<void>> = [];\n\n    tests.push(async () => {\n      let url = ''; let credentials: RequestCredentials | undefined;\n      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {\n        url = String(input); credentials = init?.credentials;\n        return new Response(JSON.stringify({ report: dreReport }), { status: 200 });\n      }) as typeof fetch;\n      const result = await FinanceReportingClient.getDRE('2026-01-01','2026-12-31',AccountingRegime.CASH);\n      if (!url.includes('/api/finance/reports/dre?') || !url.includes('regime=CASH') || credentials !== 'include' || result.netProfit !== 60) throw new Error('DRE transport contract failed');\n    });\n\n    tests.push(async () => {\n      globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })) as typeof fetch;\n      let thrown: unknown; try { await FinanceReportingClient.getDRE('2026-01-01','2026-12-31',AccountingRegime.CASH); } catch (e) { thrown = e; }\n      if (!(thrown instanceof FinanceReportingApiError) || thrown.status !== 401) throw new Error('DRE HTTP failure must fail closed');\n    });\n\n    tests.push(async () => {\n      globalThis.fetch = (async () => new Response(JSON.stringify({ report: { netProfit: 'bad' } }), { status: 200 })) as typeof fetch;\n      let failed = false; try { await FinanceReportingClient.getDRE('2026-01-01','2026-12-31',AccountingRegime.ACCRUAL); } catch { failed = true; }\n      if (!failed) throw new Error('Malformed DRE must fail closed');\n    });\n\n    tests.push(async () => {\n      let body: unknown = 'not-set';\n      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => { body = init?.body; return new Response(JSON.stringify({ report: dreReport }), { status: 200 }); }) as typeof fetch;\n      await FinanceReportingClient.getDRE('2026-01-01','2026-12-31',AccountingRegime.CASH);\n      if (body !== undefined) throw new Error('DRE GET must not send browser identity/body');\n    });\n\n    tests.push(async () => {\n      let url = ''; let credentials: RequestCredentials | undefined;\n      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {\n        url = String(input); credentials = init?.credentials;\n        return new Response(JSON.stringify({ report: profitabilityReport }), { status: 200 });\n      }) as typeof fetch;\n      const result = await FinanceReportingClient.getVehicleProfitability('veh-1','2026-01-01','2026-12-31',AccountingRegime.CASH);\n      if (!url.includes('/api/finance/reports/vehicle-profitability?') || !url.includes('vehicleId=veh-1') || credentials !== 'include' || result.netProfit !== 730) throw new Error('Profitability transport contract failed');\n    });\n\n    tests.push(async () => {\n      globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })) as typeof fetch;\n      let thrown: unknown; try { await FinanceReportingClient.getVehicleProfitability('veh-1','2026-01-01','2026-12-31',AccountingRegime.CASH); } catch (e) { thrown = e; }\n      if (!(thrown instanceof FinanceReportingApiError) || thrown.status !== 401) throw new Error('Profitability HTTP failure must fail closed');\n    });\n\n    tests.push(async () => {\n      globalThis.fetch = (async () => new Response(JSON.stringify({ report: { vehicleId: 'veh-1', netProfit: 'bad' } }), { status: 200 })) as typeof fetch;\n      let failed = false; try { await FinanceReportingClient.getVehicleProfitability('veh-1','2026-01-01','2026-12-31',AccountingRegime.ACCRUAL); } catch { failed = true; }\n      if (!failed) throw new Error('Malformed profitability must fail closed');\n    });\n\n    tests.push(async () => {\n      let body: unknown = 'not-set'; let url = '';\n      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => { body = init?.body; url = String(input); return new Response(JSON.stringify({ report: profitabilityReport }), { status: 200 }); }) as typeof fetch;\n      await FinanceReportingClient.getVehicleProfitability('veh-1','2026-01-01','2026-12-31',AccountingRegime.CASH);\n      if (body !== undefined || /companyId=|userId=|userName=/.test(url)) throw new Error('Profitability GET must not send browser authority');\n    });\n\n    try { for (const test of tests) { await test(); passed += 1; } } finally { globalThis.fetch = originalFetch; }\n    const result = { passed, failed: tests.length - passed, total: tests.length };\n    console.log(`FinanceReportingClient ${result.passed}/${result.total} PASS`);\n    return result;\n  }\n}\n\nif (process.argv[1]?.includes('financeReportingClientTestRunner')) {\n  FinanceReportingClientTestRunner.runAllTests().then(r => { if (r.failed) process.exit(1); }).catch(e => { console.error(e); process.exit(1); });\n}\n""")

# View: financial profitability values move to server; local vehicle list remains presentation-only.
p = Path('src/components/finance/DREReportView.tsx')
text = p.read_text()
text = text.replace("import { FinanceEngine } from '../../domain/finance/FinanceEngine';\n", '')
text = replace_once(
    text,
    "          vProfit = await FinanceEngine.getVehicleProfitability(companyId, vId, startDate, endDate, regime);",
    "          vProfit = await FinanceReportingClient.getVehicleProfitability(vId, startDate, endDate, regime);",
    'view profitability call',
)
p.write_text(text)

print('SECURITY-2G7B2 patch applied')
