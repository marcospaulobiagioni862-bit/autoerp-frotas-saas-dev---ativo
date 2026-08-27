import React from 'react';
import type { ManagementReportData } from '../../domain/reports/ManagementReportsService';
import { Card } from '../ui';

interface ManagementReportsFleetTabProps {
  fleet: ManagementReportData['fleet'];
}

export const ManagementReportsFleetTab: React.FC<ManagementReportsFleetTabProps> = ({ fleet }) => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <Card padding="sm">
        <span className="text-xs font-semibold text-slate-500 uppercase">Taxa de Disponibilidade</span>
        <h3 className="text-3xl font-black text-emerald-600 mt-1 font-mono">{fleet.availabilityRate}%</h3>
        <p className="text-xs text-slate-500 mt-1">{fleet.available} veículos prontos para locação</p>
      </Card>
      <Card padding="sm">
        <span className="text-xs font-semibold text-slate-500 uppercase">Taxa de Utilização</span>
        <h3 className="text-3xl font-black text-blue-600 mt-1 font-mono">{fleet.utilizationRate}%</h3>
        <p className="text-xs text-slate-500 mt-1">{fleet.rented} veículos atualmente alugados</p>
      </Card>
      <Card padding="sm">
        <span className="text-xs font-semibold text-slate-500 uppercase">Taxa de Indisponibilidade / Parados</span>
        <h3 className="text-3xl font-black text-amber-600 mt-1 font-mono">{fleet.stoppedRate}%</h3>
        <p className="text-xs text-slate-500 mt-1">{fleet.maintenance + fleet.inactive + fleet.blocked} na oficina ou inativos</p>
      </Card>
    </div>

    <Card padding="none" className="overflow-hidden">
      <div className="p-4 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 font-bold text-xs uppercase tracking-wider">
        Detalhamento da Frota por Status
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {[
          { label: 'Disponíveis', count: fleet.available, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40' },
          { label: 'Alugados', count: fleet.rented, color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/40' },
          { label: 'Em Manutenção', count: fleet.maintenance, color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40' },
          { label: 'Inativos', count: fleet.inactive, color: 'text-slate-600 bg-slate-100 dark:bg-slate-800' },
          { label: 'Bloqueados', count: fleet.blocked, color: 'text-rose-600 bg-rose-50 dark:bg-rose-950/40' },
        ].map((item) => (
          <div key={item.label} className="p-4 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{item.label}</span>
            <div className="flex items-center gap-3">
              <span className={`px-2.5 py-1 rounded-lg text-xs font-bold font-mono ${item.color}`}>
                {item.count} veículo(s)
              </span>
              <span className="text-xs text-slate-400 font-mono w-12 text-right">
                {fleet.totalVehicles > 0 ? Math.round((item.count / fleet.totalVehicles) * 100) : 0}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  </div>
);
