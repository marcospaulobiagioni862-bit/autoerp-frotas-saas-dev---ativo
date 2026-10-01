import React, { useEffect, useRef, useState } from 'react';
import { FinanceReportingClient } from '../../api/financeReportingClient';
import { VehicleClient } from '../../api/vehicleClient';
import type { Vehicle } from '../../types/entities';
import { AccountingRegime } from '../../types/enums';
import type { DREReport, VehicleProfitabilityReport } from '../../types/reports';
import { PieChart, Calendar, Car } from 'lucide-react';
import { Card, Select, Skeleton } from '../ui';
import { DREStatement } from './DREStatement';
import { useAuth } from '../../hooks/useAuth';
import { VehicleProfitabilityBreakdown } from './VehicleProfitabilityBreakdown';
import {
  currentReportingMonthRange,
  currentReportingYearRange,
  lastReportingDaysRange,
} from '../../shared/utils/reportingPeriod';

export const DREReportView: React.FC = () => {
  const [regime, setRegime] = useState<AccountingRegime>(AccountingRegime.CASH);
  const defaultRange = currentReportingMonthRange();
  const [startDate, setStartDate] = useState(defaultRange.start);
  const [endDate, setEndDate] = useState(defaultRange.end);
  const [dreReport, setDreReport] = useState<DREReport | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [vehicleProfit, setVehicleProfit] = useState<VehicleProfitabilityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const lastCompanyIdRef = useRef<string | undefined>(user?.companyId);

  const applyPreset = (preset: 'MONTH' | '30_DAYS' | 'YEAR') => {
    const next = preset === 'MONTH' ? currentReportingMonthRange() : preset === '30_DAYS' ? lastReportingDaysRange(30) : currentReportingYearRange();
    setStartDate(next.start);
    setEndDate(next.end);
  };

  useEffect(() => {
    let active = true;

    const loadReports = async () => {
      let switchingTenant = false;
      if (lastCompanyIdRef.current !== user?.companyId) {
        setDreReport(null);
        setVehicles([]);
        setVehicleProfit(null);
        setSelectedVehicleId('');
        lastCompanyIdRef.current = user?.companyId;
        switchingTenant = true;
      }

      if (!user?.companyId) {
        setDreReport(null);
        setVehicles([]);
        setVehicleProfit(null);
        setSelectedVehicleId('');
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const [dre, vehicleList] = await Promise.all([
          FinanceReportingClient.getDRE(startDate, endDate, regime),
          VehicleClient.list(),
        ]);

        let selected = switchingTenant ? '' : selectedVehicleId;
        let profitability: VehicleProfitabilityReport | null = null;
        if (vehicleList.length > 0) {
          const validSelection = selected && vehicleList.some((vehicle) => vehicle.id === selected);
          selected = validSelection ? selected : vehicleList[0].id;
          profitability = await FinanceReportingClient.getVehicleProfitability(selected, startDate, endDate, regime);
        } else {
          selected = '';
        }

        if (!active) return;
        setDreReport(dre);
        setVehicles(vehicleList);
        setSelectedVehicleId(selected);
        setVehicleProfit(profitability);
      } catch (error) {
        if (!active) return;
        console.error('Erro ao gerar DRE/Rentabilidade:', error);
        setDreReport(null);
        setVehicles([]);
        setVehicleProfit(null);
        setSelectedVehicleId('');
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadReports();
    return () => { active = false; };
  }, [regime, startDate, endDate, selectedVehicleId, user?.companyId]);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <PieChart className="w-6 h-6 text-indigo-600" />
            {regime === AccountingRegime.CASH ? 'Resultado Gerencial — Caixa' : 'DRE Gerencial'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {regime === AccountingRegime.CASH
              ? 'Entradas e saídas efetivadas no período. A rentabilidade por veículo aparece em uma seção separada.'
              : 'Receitas e despesas por competência no período. A rentabilidade por veículo aparece em uma seção separada.'}
          </p>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl shrink-0">
          <button
            onClick={() => setRegime(AccountingRegime.CASH)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${regime === AccountingRegime.CASH ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}`}
          >
            Regime de Caixa
          </button>
          <button
            onClick={() => setRegime(AccountingRegime.ACCRUAL)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${regime === AccountingRegime.ACCRUAL ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}`}
          >
            Regime de Competência
          </button>
        </div>
      </div>

      <Card padding="sm">
        <div className="mb-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => applyPreset('MONTH')} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">Mês atual</button>
          <button type="button" onClick={() => applyPreset('30_DAYS')} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">Últimos 30 dias</button>
          <button type="button" onClick={() => applyPreset('YEAR')} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">Ano atual</button>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <span className="font-semibold text-slate-500">Personalizado</span>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="font-semibold text-slate-700 dark:text-slate-300">Período de Análise:</span>
          </div>
          <label className="flex items-center gap-2 text-slate-500">
            De:
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs font-mono" />
          </label>
          <label className="flex items-center gap-2 text-slate-500">
            Até:
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs font-mono" />
          </label>
        </div>
      </Card>

      {loading || !dreReport ? (
        <div className="p-6 space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <DREStatement report={dreReport} />

          <Card padding="md" className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Car className="w-4 h-4 text-blue-600" /> Rentabilidade por Veículo
              </h3>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Selecionar veículo:</label>
              <Select
                value={selectedVehicleId}
                onChange={(event) => setSelectedVehicleId(event.target.value)}
                options={vehicles.map((vehicle) => ({ value: vehicle.id, label: `${vehicle.plate} • ${vehicle.brand} ${vehicle.model}` }))}
              />
            </div>

            {vehicleProfit ? (
              <VehicleProfitabilityBreakdown report={vehicleProfit} />
            ) : (
              <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800/50">Nenhum veículo disponível para o período selecionado.</p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
};
