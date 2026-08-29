import React, { useEffect, useMemo, useState } from 'react';
import { Clock3 } from 'lucide-react';
import type { Vehicle, WorkOrder } from '../../types/entities';
import { Badge, Card } from '../ui';
import { deriveMaintenanceSlaMetrics, formatMaintenanceDuration } from './maintenanceSla';

interface Props {
  vehicles: Vehicle[];
  workOrders: WorkOrder[];
}

function statusLabel(status: WorkOrder['status']): string {
  if (status === 'COMPLETED') return 'Concluída';
  if (status === 'CANCELLED') return 'Cancelada';
  if (status === 'IN_PROGRESS') return 'Em andamento';
  if (status === 'WAITING_PARTS') return 'Aguardando peças';
  if (status === 'WAITING_APPROVAL') return 'Aguardando aprovação';
  return 'Aberta';
}

export const MaintenanceSlaSummary: React.FC<Props> = ({ vehicles, workOrders }) => {
  const [nowIso, setNowIso] = useState(() => new Date().toISOString());

  useEffect(() => {
    const timer = window.setInterval(() => setNowIso(new Date().toISOString()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const vehicleLabel = (id: string) => {
    const vehicle = vehicles.find((item) => item.id === id);
    return vehicle ? `${vehicle.plate} — ${vehicle.brand} ${vehicle.model}` : id;
  };

  const rows = useMemo(
    () => workOrders
      .map((workOrder) => ({
        workOrder,
        metrics: deriveMaintenanceSlaMetrics(workOrder, nowIso),
      }))
      .sort((a, b) => Date.parse(b.workOrder.openedAt) - Date.parse(a.workOrder.openedAt))
      .slice(0, 12),
    [workOrders, nowIso],
  );

  return (
    <Card padding="none">
      <div className="p-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2 font-semibold">
          <Clock3 className="w-4 h-4" />
          Tempo real de oficina
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Métricas consultivas derivadas dos timestamps autoritativos da OS. Estados de espera não têm duração histórica estimada nesta etapa.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="p-3 text-left">OS / Veículo</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-left">Até iniciar</th>
              <th className="p-3 text-left">Trabalho ativo</th>
              <th className="p-3 text-left">Indisponibilidade</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-slate-500">Nenhuma OS para medir.</td></tr>
            )}
            {rows.map(({ workOrder, metrics }) => (
              <tr key={workOrder.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="p-3">
                  <strong>{workOrder.number}</strong>
                  <div className="text-slate-500">{vehicleLabel(workOrder.vehicleId)}</div>
                </td>
                <td className="p-3">
                  <Badge variant={workOrder.status === 'COMPLETED' ? 'success' : workOrder.status === 'CANCELLED' ? 'danger' : workOrder.status === 'OPEN' ? 'neutral' : 'warning'}>
                    {statusLabel(workOrder.status)}
                  </Badge>
                  {metrics.isFrozen && <div className="mt-1 text-[10px] text-slate-500">tempo encerrado</div>}
                </td>
                <td className="p-3 font-mono">{formatMaintenanceDuration(metrics.waitToStartMs)}</td>
                <td className="p-3 font-mono">{formatMaintenanceDuration(metrics.activeWorkMs)}</td>
                <td className="p-3 font-mono font-semibold">{formatMaintenanceDuration(metrics.knownDowntimeMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};
