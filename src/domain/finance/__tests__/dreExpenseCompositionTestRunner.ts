import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DREStatement } from '../../../components/finance/DREStatement';
import { DREService } from '../DREService';
import type { ITransactionContext } from '../ITransactionContext';
import { AccountingRegime, ObligationStatus, OriginType } from '../../../types/enums';

const companyId = 'dre-company-a';
const inPeriod = '2026-09-10';
const outsidePeriod = '2026-10-10';
const category = { id: 'traffic', companyId, name: 'Multas de trânsito', type: 'EXPENSE', active: true };

function context(receivables: any[], payables: any[], categories: any[] = [category]): ITransactionContext {
  return {
    getReceivableRepo: () => ({ findAll: async () => receivables }),
    getPayableRepo: () => ({ findAll: async () => payables }),
    getTransactionRepo: () => ({ findAll: async () => [] }),
    getFinancialCategories: async () => categories,
  } as unknown as ITransactionContext;
}

const revenue = { id: 'revenue', companyId, originType: OriginType.CONTRACT_RENT, originalAmount: 500,
  fineAmount: 0, interestAmount: 0, discountAmount: 0, competenceDate: inPeriod,
  description: 'Aluguel', status: ObligationStatus.PENDING };
const expense = { id: 'expense', companyId, originType: OriginType.MANUAL, categoryId: category.id,
  originalAmount: 120, fineAmount: 0, interestAmount: 0, discountAmount: 0,
  competenceDate: inPeriod, description: 'Despesa classificada como multa', status: ObligationStatus.PENDING };

function reconcile(report: Awaited<ReturnType<typeof DREService.getDREReport>>): void {
  const breakdown = report.breakdown!;
  const sum = (breakdown.maintenanceCosts || 0) + (breakdown.insuranceCosts || 0) +
    (breakdown.trackerCosts || 0) + (breakdown.trafficTicketCosts || 0) + (breakdown.otherCosts || 0);
  assert.equal(sum, report.directCosts.amount, 'expense composition must reconcile with direct costs');
  assert.equal(report.netProfit, report.grossRevenue.amount - report.deductions.amount - sum -
    report.operatingExpenses.amount + report.financialResult.amount, 'net result must reconcile with presented components');
}

const period = ['2026-09-01', '2026-09-30'] as const;
const revenueOnly = await DREService.getDREReport(companyId, ...period, AccountingRegime.ACCRUAL, context([revenue], []));
assert.equal(revenueOnly.netProfit, 500);
assert.equal(revenueOnly.directCosts.amount, 0);
reconcile(revenueOnly);

const report = await DREService.getDREReport(companyId, ...period, AccountingRegime.ACCRUAL, context(
  [revenue, { ...revenue, id: 'other-revenue', companyId: 'dre-company-b', originalAmount: 900 }],
  [expense, { ...expense, id: 'cancelled', status: ObligationStatus.CANCELLED, cancelledAt: inPeriod, balanceAmount: 800, originalAmount: 800 },
    { ...expense, id: 'other-company', companyId: 'dre-company-b', originalAmount: 700 },
    { ...expense, id: 'other-period', competenceDate: outsidePeriod, originalAmount: 600 }],
  [category, { ...category, id: 'foreign-category', companyId: 'dre-company-b', name: 'Seguro' }],
));
assert.equal(report.grossRevenue.amount, 500, 'revenue must respect tenant and period');
assert.equal(report.directCosts.amount, 120, 'expense must enter costs once');
assert.equal(report.breakdown?.trafficTicketCosts, 120, 'persisted traffic category must drive composition even for MANUAL origin');
assert.equal(report.breakdown?.otherCosts, 0);
assert.equal(report.netProfit, 380, 'expense must affect net result once');
reconcile(report);

const installments = [125.40, 125.40, 125.40, 125.40, 125.40, 125.40, 125.40, 50, 50]
  .map((originalAmount, index) => ({ ...expense, id: `installment-${index}`, originalAmount }));
const cancelled = Array.from({ length: 3 }, (_, index) => ({ ...expense, id: `cancelled-${index}`,
  originalAmount: 125.40, status: ObligationStatus.CANCELLED }));
const homologation = await DREService.getDREReport(companyId, ...period, AccountingRegime.ACCRUAL,
  context([{ ...revenue, originalAmount: 2350 }], [...installments, ...cancelled]));
assert.equal(homologation.grossRevenue.amount, 2350);
assert.equal(homologation.directCosts.amount, 977.80);
assert.equal(homologation.breakdown?.trafficTicketCosts, 977.80);
assert.equal(homologation.operatingExpenses.amount, 0);
assert.equal(homologation.operatingProfit.amount, 1372.20);
assert.equal(homologation.netProfit, 1372.20);
reconcile(homologation);
const html = renderToStaticMarkup(createElement(DREStatement, { report: homologation }));
const visibleText = html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ');
assert.match(visibleText, /Custos e despesas dos lançamentosR\$ 977,80/);
assert.match(visibleText, /Multas de Trânsito:R\$ 977,80/);
assert.match(visibleText, /Resultado operacionalR\$ 1\.372,20/);
assert.match(visibleText, /Resultado Líquido do PeríodoR\$ 1\.372,20/);

const unknown = await DREService.getDREReport(companyId, ...period, AccountingRegime.ACCRUAL,
  context([revenue], [{ ...expense, categoryId: 'unknown' }, { ...expense, id: 'foreign', categoryId: 'foreign' }],
    [{ ...category, id: 'foreign', companyId: 'other-company' }]));
assert.equal(unknown.breakdown?.otherCosts, 240, 'unclassified and foreign categories must remain visible');
assert.equal(unknown.breakdown?.trafficTicketCosts, 0);
reconcile(unknown);

console.log('DRE expense composition: PASS (including September homologation 2350 - 977.80 = 1372.20)');
