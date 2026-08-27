import React from 'react';
import type { VehicleProfitabilityReport } from '../../types/reports';

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const number = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

interface VehicleProfitabilityBreakdownProps {
  report: VehicleProfitabilityReport;
}

const Metric: React.FC<{ label: string; value: string; emphasize?: boolean }> = ({ label, value, emphasize }) => (
  <div className={`rounded-lg border p-2.5 ${emphasize ? 'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30' : 'border-slate-200 dark:border-slate-800'}`}>
    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
    <div className="mt-1 font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-100">{value}</div>
  </div>
);

export const VehicleProfitabilityBreakdown: React.FC<VehicleProfitabilityBreakdownProps> = ({ report }) => {
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
        <Metric label="Margem" value={`${report.profitMarginPercentage.toFixed(1)}%`} />
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Receitas</h4>
          <strong className="font-mono text-emerald-600 dark:text-emerald-400">{money(report.totalIncome)}</strong>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {income.map(([label, value]) => <Metric key={label} label={label} value={money(value)} />)}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Custos e despesas</h4>
          <strong className="font-mono text-indigo-600 dark:text-indigo-400">{money(report.totalExpense)}</strong>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {expenses.map(([label, value]) => <Metric key={label} label={label} value={money(value)} />)}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2">
        <Metric label="Receita por KM" value={money(report.revenuePerKm)} />
        <Metric label="Custo por KM" value={money(report.costPerKm)} />
        <Metric label="Lucro líquido" value={money(report.netProfit)} emphasize />
        <Metric label="Resultado por KM" value={report.kmTraveledPeriod > 0 ? money(report.netProfit / report.kmTraveledPeriod) : money(0)} emphasize />
      </section>
    </div>
  );
};
