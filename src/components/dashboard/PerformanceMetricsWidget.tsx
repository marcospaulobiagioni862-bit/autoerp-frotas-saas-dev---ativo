import React, { useEffect, useState } from 'react';
import { 
  ContractRepository, 
  VehicleRepository, 
  AccountReceivableRepository, 
  AccountPayableRepository 
} from '../../persistence/repositories/localRepositories';
import { Contract, Vehicle, AccountReceivable, AccountPayable } from '../../types/entities';
import { ContractStatus, ObligationStatus, VehicleStatus } from '../../types/enums';
import { Gauge, TrendingUp, ShieldCheck, CheckCircle2, AlertTriangle, FileText, Car, DollarSign } from 'lucide-react';
import { Card, Badge, Skeleton } from '../ui';

interface PerformanceMetricsWidgetProps {
  vehicles?: Vehicle[];
  receivables?: AccountReceivable[];
  payables?: AccountPayable[];
  accounts?: any;
}

export const PerformanceMetricsWidget: React.FC<PerformanceMetricsWidgetProps> = ({
  vehicles: initialVehicles,
  receivables: initialReceivables,
  payables: initialPayables,
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [vehicles, setVehicles] = useState<Vehicle[]>(initialVehicles || []);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [receivables, setReceivables] = useState<AccountReceivable[]>(initialReceivables || []);
  const [payables, setPayables] = useState<AccountPayable[]>(initialPayables || []);

  useEffect(() => {
    async function fetchData() {
      try {
        const vehRepo = new VehicleRepository();
        const contractRepo = new ContractRepository();
        const recRepo = new AccountReceivableRepository();
        const payRepo = new AccountPayableRepository();

        const [vehList, contractList, recList, payList] = await Promise.all([
          initialVehicles && initialVehicles.length > 0 ? Promise.resolve(initialVehicles) : vehRepo.findAll(),
          contractRepo.findAll(),
          initialReceivables && initialReceivables.length > 0 ? Promise.resolve(initialReceivables) : recRepo.findAll(),
          initialPayables && initialPayables.length > 0 ? Promise.resolve(initialPayables) : payRepo.findAll(),
        ]);

        setVehicles(vehList);
        setContracts(contractList);
        setReceivables(recList);
        setPayables(payList);
      } catch (err) {
        console.error('Failed to load performance metrics data:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [initialVehicles, initialReceivables, initialPayables]);

  if (loading) {
    return (
      <Card padding="none" className="p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
        <Skeleton className="h-6 w-64 rounded" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      </Card>
    );
  }

  // 1. Active Contracts Factor (35% weight)
  const activeContracts = contracts.filter((c) => c.status === ContractStatus.ACTIVE && !c.isArchived);
  const totalContracts = contracts.length;
  const contractScore = totalContracts > 0 ? (activeContracts.length / Math.max(1, totalContracts)) * 100 : 85;

  // 2. Pending Financial Obligations Factor (35% weight)
  const today = new Date().toISOString().split('T')[0];
  const pendingRecs = receivables.filter(
    (r) => r.status === ObligationStatus.PENDING || r.status === ObligationStatus.PARTIALLY_PAID
  );
  const overdueRecs = pendingRecs.filter((r) => r.dueDate < today);
  const pendingPays = payables.filter(
    (p) => p.status === ObligationStatus.PENDING || p.status === ObligationStatus.PARTIALLY_PAID
  );
  const overduePays = pendingPays.filter((p) => p.dueDate < today);
  
  const totalObligations = receivables.length + payables.length;
  const totalOverdue = overdueRecs.length + overduePays.length;
  const financialScore = totalObligations > 0 
    ? Math.max(0, 100 - (totalOverdue / totalObligations) * 100) 
    : 90;

  // 3. Vehicle Operational Status Factor (30% weight)
  const operationalVehicles = vehicles.filter(
    (v) => (v.status === VehicleStatus.AVAILABLE || v.status === VehicleStatus.RENTED) && !v.isArchived
  );
  const vehicleScore = vehicles.length > 0 ? (operationalVehicles.length / vehicles.length) * 100 : 95;

  // Composite Operational Health Score (0 - 100)
  const healthScore = Math.round(
    contractScore * 0.35 + financialScore * 0.35 + vehicleScore * 0.30
  );

  const getScoreBadge = (score: number) => {
    if (score >= 90) return { label: 'Excelente (Tier A)', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300' };
    if (score >= 75) return { label: 'Estável (Tier B)', color: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-300' };
    if (score >= 50) return { label: 'Atenção Requerida', color: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300' };
    return { label: 'Crítico', color: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-300' };
  };

  const badgeInfo = getScoreBadge(healthScore);

  return (
    <Card padding="none" className="overflow-hidden border border-indigo-200/60 dark:border-indigo-900/40 shadow-sm bg-gradient-to-b from-white to-slate-50/50 dark:from-slate-900 dark:to-slate-900/90">
      {/* Header */}
      <div className="p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-indigo-900/30">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-600/30 rounded-xl text-indigo-400 border border-indigo-500/30">
            <Gauge className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              Performance Metrics — Operational Health Score
            </h3>
            <p className="text-[11px] text-slate-300">
              Métrica composta calculada via repositórios (Contratos ativos, obrigações financeiras e status de frota) • Somente Leitura
            </p>
          </div>
        </div>
        <span className={`px-3 py-1 text-xs font-bold rounded-full border shadow-sm ${badgeInfo.color}`}>
          {badgeInfo.label}
        </span>
      </div>

      {/* Body Content */}
      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
        {/* Big Score Gauge Display */}
        <div className="flex flex-col items-center justify-center p-6 bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-sm text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-bl-full pointer-events-none" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" /> Índice Geral
          </span>
          <div className="text-5xl font-black text-slate-900 dark:text-slate-100 font-mono tracking-tight my-2">
            {healthScore}
            <span className="text-lg text-slate-400 font-normal">/100</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-[240px]">
            Avaliação multidimensional em tempo real da eficiência operacional e estabilidade de caixa.
          </p>
        </div>

        {/* Detailed Metrics Breakdown */}
        <div className="lg:col-span-2 space-y-4">
          {/* Metric 1: Active Contracts */}
          <div className="p-3.5 bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200/70 dark:border-slate-700/60 shadow-xs">
            <div className="flex justify-between text-xs mb-1.5">
              <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-indigo-500" /> Contratos Ativos ({activeContracts.length} de {totalContracts} totais)
              </span>
              <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                {(isNaN(contractScore) ? 0 : contractScore).toFixed(1)}%
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, isNaN(contractScore) ? 0 : contractScore))}%` }}
              />
            </div>
          </div>

          {/* Metric 2: Financial Obligations Punctuality */}
          <div className="p-3.5 bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200/70 dark:border-slate-700/60 shadow-xs">
            <div className="flex justify-between text-xs mb-1.5">
              <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-emerald-500" /> Obrigações Financeiras ({totalOverdue} atrasadas / {totalObligations} total)
              </span>
              <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                {(isNaN(financialScore) ? 0 : financialScore).toFixed(1)}%
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-600 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, isNaN(financialScore) ? 0 : financialScore))}%` }}
              />
            </div>
          </div>

          {/* Metric 3: Vehicle Operational Status */}
          <div className="p-3.5 bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200/70 dark:border-slate-700/60 shadow-xs">
            <div className="flex justify-between text-xs mb-1.5">
              <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Car className="w-3.5 h-3.5 text-blue-500" /> Status Operacional da Frota ({operationalVehicles.length} ativos / {vehicles.length} total)
              </span>
              <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                {(isNaN(vehicleScore) ? 0 : vehicleScore).toFixed(1)}%
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, vehicleScore))}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};
