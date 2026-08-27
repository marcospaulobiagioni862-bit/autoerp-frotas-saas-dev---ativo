import React, { useEffect, useState, useRef } from 'react';
import { FinanceReportingClient } from '../../api/financeReportingClient';
import { VehicleClient } from '../../api/vehicleClient';
import { Vehicle } from '../../types/entities';
import { AccountingRegime } from '../../types/enums';
import { DREReport, VehicleProfitabilityReport } from '../../types/reports/index';
import { PieChart, Calendar, Car } from 'lucide-react';
import { Card, Select, Skeleton } from '../ui';
import { useAuth } from '../../hooks/useAuth';

const formatCurrency = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const DREReportView: React.FC = () => {
  const [regime, setRegime] = useState<AccountingRegime>(AccountingRegime.CASH);
  const [startDate, setStartDate] = useState<string>('2026-01-01');
  const [endDate, setEndDate] = useState<string>('2026-12-31');
  const [dreReport, setDreReport] = useState<DREReport | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [vehicleProfit, setVehicleProfit] = useState<VehicleProfitabilityReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const { user } = useAuth();
  const lastCompanyIdRef = useRef<string | undefined>(user?.companyId);

  useEffect(() => {
    let isActive = true;

    const loadReports = async () => {
      let isSwitchingTenant = false;
      if (lastCompanyIdRef.current !== user?.companyId) {
        setDreReport(null);
        setVehicles([]);
        setVehicleProfit(null);
        setSelectedVehicleId('');
        lastCompanyIdRef.current = user?.companyId;
        isSwitchingTenant = true;
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
        const [dre, vehList] = await Promise.all([
          FinanceReportingClient.getDRE(startDate, endDate, regime),
          VehicleClient.list(),
        ]);
        
        let vProfit = null;
        let finalSelectedVehicleId = isSwitchingTenant ? '' : selectedVehicleId;

        if (vehList.length > 0) {
          const isVehicleValid = finalSelectedVehicleId && vehList.some(v => v.id === finalSelectedVehicleId);
          const vId = isVehicleValid ? finalSelectedVehicleId : vehList[0].id;
          finalSelectedVehicleId = vId;
          vProfit = await FinanceReportingClient.getVehicleProfitability(vId, startDate, endDate, regime);
        } else {
          finalSelectedVehicleId = '';
        }

        if (isActive) {
          setDreReport(dre);
          setVehicles(vehList);
          if (finalSelectedVehicleId !== selectedVehicleId) {
            setSelectedVehicleId(finalSelectedVehicleId);
          }
          setVehicleProfit(vProfit);
        }
      } catch (err) {
        if (isActive) {
          console.error('Erro ao gerar DRE/Rentabilidade:', err);
          setDreReport(null);
          setVehicles([]);
          setVehicleProfit(null);
          setSelectedVehicleId('');
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    loadReports();

    return () => {
      isActive = false;
    };
  }, [regime, startDate, endDate, selectedVehicleId, user?.companyId]);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <PieChart className="w-6 h-6 text-indigo-600" />
            Demonstrativo de Resultado do Exercício (DRE) & Rentabilidade
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Relatório gerencial com alternância entre Regime de Caixa (CASH) e Competência (ACCRUAL).
          </p>
        </div>

        {/* Regime Switcher */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl shrink-0">
          <button
            onClick={() => setRegime(AccountingRegime.CASH)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              regime === AccountingRegime.CASH
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Regime de Caixa (Efetivado)
          </button>
          <button
            onClick={() => setRegime(AccountingRegime.ACCRUAL)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              regime === AccountingRegime.ACCRUAL
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Regime de Competência (Gerado)
          </button>
        </div>
      </div>

      {/* Date Range Filter */}
      <Card padding="sm">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="font-semibold text-slate-700 dark:text-slate-300">Período de Análise:</span>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-slate-500">De:</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs font-mono"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-slate-500">Até:</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs font-mono"
            />
          </div>
        </div>
      </Card>

      {loading || !dreReport ? (
        <div className="p-6 space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* DRE Summary Table */}
          <Card padding="md" className="lg:col-span-2 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Estrutura de Resultados • {regime === AccountingRegime.CASH ? 'Regime de Caixa' : 'Regime de Competência'}
              </h3>
              <span className="text-xs font-mono text-slate-500">{startDate} a {endDate}</span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center p-3 bg-emerald-50/70 dark:bg-emerald-950/20 rounded-lg font-bold text-slate-900 dark:text-slate-100">
                <span>(+) Receita Operacional Bruta (Locações / Multas)</span>
                <span className="text-emerald-700 dark:text-emerald-400 font-mono tabular-nums text-sm">
                  R$ {dreReport.grossRevenue.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/20 rounded-lg space-y-1.5">
                <div className="flex justify-between items-center font-bold text-slate-900 dark:text-slate-100">
                  <span>(-) Custos Diretos & Despesas Operacionais</span>
                  <span className="text-indigo-700 dark:text-indigo-400 font-mono tabular-nums text-sm">
                    R$ {dreReport.operatingExpenses.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="pl-4 space-y-1 text-[11px] text-slate-600 dark:text-slate-400 border-l-2 border-indigo-200 dark:border-indigo-800">
                  <div className="flex justify-between">
                    <span>Manutenções & Peças:</span>
                    <span className="font-mono tabular-nums">R$ {(dreReport.breakdown?.maintenanceCosts || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Seguros da Frota:</span>
                    <span className="font-mono tabular-nums">R$ {(dreReport.breakdown?.insuranceCosts || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Rastreamento & Telemetria:</span>
                    <span className="font-mono tabular-nums">R$ {(dreReport.breakdown?.trackerCosts || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Multas de Trânsito:</span>
                    <span className="font-mono tabular-nums">R$ {(dreReport.breakdown?.trafficTicketCosts || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center p-4 bg-slate-900 text-white rounded-xl font-black text-sm mt-4 shadow-md">
                <span>(=) Resultado Líquido do Período</span>
                <span className={`font-mono tabular-nums text-base ${dreReport.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  R$ {dreReport.netProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </Card>

          {/* Vehicle Profitability Matrix Card */}
          <Card padding="md" className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Car className="w-4 h-4 text-blue-600" /> Rentabilidade por Veículo
              </h3>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Selecionar Veículo da Frota:
              </label>
              <Select
                value={selectedVehicleId}
                onChange={(e) => setSelectedVehicleId(e.target.value)}
                options={vehicles.map((v) => ({
                  value: v.id,
                  label: `${v.plate} - ${v.brand} ${v.model} (${v.status})`,
                }))}
              />
            </div>

            {vehicleProfit && (
              <div className="space-y-4 pt-2 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-emerald-50 p-3 dark:bg-emerald-950/30">
                    <span className="block text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400">Receita total</span>
                    <strong className="mt-1 block font-mono text-sm text-emerald-700 dark:text-emerald-300">{formatCurrency(vehicleProfit.totalIncome)}</strong>
                  </div>
                  <div className="rounded-lg bg-indigo-50 p-3 dark:bg-indigo-950/30">
                    <span className="block text-[10px] font-bold uppercase text-indigo-700 dark:text-indigo-400">Despesa total</span>
                    <strong className="mt-1 block font-mono text-sm text-indigo-700 dark:text-indigo-300">{formatCurrency(vehicleProfit.totalExpense)}</strong>
                  </div>
                </div>

                <section>
                  <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Composição das receitas</h4>
                  <dl className="space-y-1.5 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    {[
                      ['Locação', vehicleProfit.rentalIncome],
                      ['KM excedente', vehicleProfit.kmExcessIncome],
                      ['Multas reembolsadas', vehicleProfit.finesReimbursedIncome],
                      ['Outras receitas', vehicleProfit.otherIncome],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="flex justify-between gap-3">
                        <dt className="text-slate-500">{label}</dt>
                        <dd className="font-mono tabular-nums">{formatCurrency(Number(value))}</dd>
                      </div>
                    ))}
                  </dl>
                </section>

                <section>
                  <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Composição das despesas</h4>
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-lg border border-slate-200 p-3 dark:border-slate-800 xl:grid-cols-2">
                    {[
                      ['Manutenção', vehicleProfit.maintenanceExpense],
                      ['Seguro', vehicleProfit.insuranceExpense],
                      ['Rastreador', vehicleProfit.trackerExpense],
                      ['Documentação', vehicleProfit.documentationExpense],
                      ['Multas da empresa', vehicleProfit.finesCompanyExpense],
                      ['Financiamento', vehicleProfit.financingExpense],
                      ['Depreciação', vehicleProfit.depreciationExpense],
                      ['Outras despesas', vehicleProfit.otherExpense],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="flex justify-between gap-3">
                        <dt className="text-slate-500">{label}</dt>
                        <dd className="font-mono tabular-nums">{formatCurrency(Number(value))}</dd>
                      </div>
                    ))}
                  </dl>
                </section>

                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/60">
                    <span className="block text-[9px] font-bold uppercase text-slate-500">KM no período</span>
                    <strong className="mt-1 block font-mono">{vehicleProfit.kmTraveledPeriod.toLocaleString('pt-BR')} km</strong>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/60">
                    <span className="block text-[9px] font-bold uppercase text-slate-500">Receita/KM</span>
                    <strong className="mt-1 block font-mono">{formatCurrency(vehicleProfit.revenuePerKm)}</strong>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/60">
                    <span className="block text-[9px] font-bold uppercase text-slate-500">Custo/KM</span>
                    <strong className="mt-1 block font-mono">{formatCurrency(vehicleProfit.costPerKm)}</strong>
                  </div>
                </div>

                <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 dark:border-blue-900/40 dark:bg-blue-950/30">
                  <span className="block text-[10px] font-bold uppercase text-blue-600 dark:text-blue-400">Lucro líquido individual</span>
                  <strong className={`mt-1 block font-mono text-base ${vehicleProfit.netProfit >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
                    {formatCurrency(vehicleProfit.netProfit)}
                  </strong>
                  <span className="mt-1 block text-[11px] text-slate-500">
                    Margem: <strong className="font-mono text-slate-800 dark:text-slate-200">{vehicleProfit.profitMarginPercentage.toFixed(1)}%</strong>
                  </span>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
};
