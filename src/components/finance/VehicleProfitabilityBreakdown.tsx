import React from 'react';
import type { VehicleProfitabilityReport } from '../../types/reports';

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const number = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

interface VehicleProfitabilityBreakdownProps {
 report: VehicleProfitabilityReport;
}

const Metric: React.FC<{ label: string; value: string; emphasize?: boolean }> = ({ label, value, emphasize }) => (
 <div className={`rounded-lg border p-2.5 ${emphasize ? 'border-info-border bg-info-bg ' : 'border-graphite-200 dark:border-graphite-800'}`}>
 <div className="text-[10px] font-bold uppercase tracking-wide text-graphite-400">{label}</div>
 <div className="mt-1 font-mono text-xs font-semibold tabular-nums text-graphite-900 dark:text-graphite-100">{value}</div>
 </div>
);

export const VehicleProfitabilityBreakdown: React.FC<VehicleProfitabilityBreakdownProps> = ({ report }) => {
 const hasFinancialActivity = report.totalIncome !== 0 || report.totalExpense !== 0;
 const hasKmBase = report.kmTraveledPeriod > 0;
 const hasMarginBase = hasFinancialActivity && report.totalIncome > 0;

 const income = [
 ['Locação', report.rentalIncome],
 ['KM excedente', report.kmExcessIncome],
 ['Multas reembolsadas', report.finesReimbursedIncome],
 ['Outras receitas', report.otherIncome],
 ] as const;

 const expenses = [
 ['Manutenção', report.maintenanceExpense],
 ['Seguro', report.insuranceExpense],
 ['Rastreador', report.trackerExpense],
 ['Documentação', report.documentationExpense],
 ['Multas da empresa', report.finesCompanyExpense],
 ['Financiamento', report.financingExpense],
 ['Depreciação', report.depreciationExpense],
 ['Outras despesas', report.otherExpense],
 ] as const;

 return (
 <div className="space-y-4 text-xs">
 <div className="grid grid-cols-2 gap-2">
 <Metric label="KM no período" value={`${number(report.kmTraveledPeriod)} km`} />
 <Metric label="Margem" value={hasMarginBase ? `${report.profitMarginPercentage.toFixed(1)}%` : '—'} />
 </div>

 {!hasFinancialActivity && (
 <p className="rounded-lg border border-dashed border-graphite-200 p-3 text-xs text-graphite-500 dark:border-graphite-800">
 Sem dados financeiros no período selecionado.
 </p>
 )}

 <section>
 <div className="mb-2 flex items-center justify-between">
 <h4 className="text-[11px] font-bold uppercase tracking-wide text-graphite-500">Receitas</h4>
 <strong className="font-mono text-success-icon ">{money(report.totalIncome)}</strong>
 </div>
 <div className="grid grid-cols-2 gap-2">
 {income.map(([label, value]) => <Metric key={label} label={label} value={money(value)} />)}
 </div>
 </section>

 <section>
 <div className="mb-2 flex items-center justify-between">
 <h4 className="text-[11px] font-bold uppercase tracking-wide text-graphite-500">Custos e despesas</h4>
 <strong className="font-mono text-badge-navy-t1-text ">{money(report.totalExpense)}</strong>
 </div>
 <div className="grid grid-cols-2 gap-2">
 {expenses.map(([label, value]) => <Metric key={label} label={label} value={money(value)} />)}
 </div>
 </section>

 <section className="grid grid-cols-2 gap-2">
 <Metric label="Receita por KM" value={hasKmBase ? money(report.revenuePerKm) : 'Não calculável'} />
 <Metric label="Custo por KM" value={hasKmBase ? money(report.costPerKm) : 'Não calculável'} />
 <Metric label="Lucro líquido" value={hasFinancialActivity ? money(report.netProfit) : '—'} emphasize />
 <Metric label="Margem líquida" value={hasMarginBase ? `${report.profitMarginPercentage.toFixed(1)}%` : '—'} emphasize />
 </section>
 </div>
 );
};
