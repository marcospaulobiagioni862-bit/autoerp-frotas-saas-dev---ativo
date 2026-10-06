import React from 'react';
import { AccountingRegime } from '../../types/enums';
import type { DREReport } from '../../types/reports';
import { Card } from '../ui/Card';
import { formatDateBR } from '../../shared/utils/date';

export function DREStatement({ report: dreReport }: { report: DREReport }) {
  const { regime, periodStart: startDate, periodEnd: endDate } = dreReport;
  return (
    <Card padding="md" className="space-y-4">
      <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
          {regime === AccountingRegime.CASH ? 'Resultado Gerencial — Caixa' : 'DRE Gerencial'}
        </h3>
        <span className="text-xs font-mono text-slate-500">{formatDateBR(startDate)} a {formatDateBR(endDate)}</span>
      </div>

      <div className="space-y-2 text-xs">
        <div className="flex justify-between items-center p-3 bg-emerald-50/70 dark:bg-emerald-950/20 rounded-lg font-bold text-slate-900 dark:text-slate-100">
          <span>(+) Receita operacional bruta</span>
          <span className="text-emerald-700 dark:text-emerald-400 font-mono tabular-nums text-sm">R$ {dreReport.grossRevenue.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
        </div>

        <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/20 rounded-lg space-y-1.5">
          <div className="flex justify-between items-center font-bold text-slate-900 dark:text-slate-100">
            <span>(-) Custos e despesas dos lançamentos</span>
            <span className="text-indigo-700 dark:text-indigo-400 font-mono tabular-nums text-sm">R$ {dreReport.directCosts.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="pl-4 space-y-1 text-[11px] text-slate-600 dark:text-slate-400 border-l-2 border-indigo-200 dark:border-indigo-800">
            <div className="flex justify-between"><span>Manutenções & Peças:</span><span className="font-mono">R$ {(dreReport.breakdown?.maintenanceCosts || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
            <div className="flex justify-between"><span>Seguros da Frota:</span><span className="font-mono">R$ {(dreReport.breakdown?.insuranceCosts || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
            <div className="flex justify-between"><span>Rastreamento:</span><span className="font-mono">R$ {(dreReport.breakdown?.trackerCosts || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
            <div className="flex justify-between"><span>Multas de Trânsito:</span><span className="font-mono">R$ {(dreReport.breakdown?.trafficTicketCosts || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
            <div className="flex justify-between"><span>Outros custos e despesas:</span><span className="font-mono">R$ {(dreReport.breakdown?.otherCosts || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
          </div>
        </div>

        <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400"><span>(-) Despesas operacionais adicionais</span><span className="font-mono">R$ {dreReport.operatingExpenses.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
        <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400"><span>(-) Deduções da receita</span><span className="font-mono">R$ {dreReport.deductions.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
        <div className="flex justify-between font-bold text-slate-900 dark:text-slate-100"><span>(=) Resultado operacional</span><span className="font-mono">R$ {dreReport.operatingProfit.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
        <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400"><span>(+/-) Resultado financeiro</span><span className="font-mono">R$ {dreReport.financialResult.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>

        <div className="flex justify-between items-center p-4 bg-slate-900 text-white rounded-xl font-black text-sm mt-4 shadow-md">
          <span>(=) Resultado Líquido do Período</span>
          <span className={`font-mono tabular-nums text-base ${dreReport.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>R$ {dreReport.netProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
        </div>
      </div>
    </Card>
  );
}
