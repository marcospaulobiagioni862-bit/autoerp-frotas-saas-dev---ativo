import React, { lazy, Suspense, useState, useEffect, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Search,
  Car,
  Eye,
  Edit2,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import {
  Card,
  Badge,
  Button,
  Select,
  Skeleton,
  ConfirmDialog,
  PageHeader,
} from '../ui';
import { LazyModuleErrorBoundary } from '../common/LazyModuleErrorBoundary';
import { DriverClient } from '../../api/driverClient';
import { VehicleClient } from '../../api/vehicleClient';
import { Driver } from '../../types/entities';
import { DriverStatus, DocumentStatus } from '../../types/enums';

const DriverFormModal=lazy(()=>import('./DriverFormModal').then(module=>({default:module.DriverFormModal})));
const DriverDetailsModal=lazy(()=>import('./DriverDetailsModal').then(module=>({default:module.DriverDetailsModal})));

interface DriversManagementProps {
  companyId: string;
  onSelectVehicle?: (vehicleId: string) => void;
}

function evaluateCnhStatus(expiration: string): { status: DocumentStatus; daysToExpiration: number } {
  const parsed = new Date(`${expiration}T00:00:00Z`).getTime();
  if (!Number.isFinite(parsed)) return { status: DocumentStatus.PENDING, daysToExpiration: 0 };
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const daysToExpiration = Math.ceil((parsed - today) / 86_400_000);
  if (daysToExpiration < 0) return { status: DocumentStatus.EXPIRED, daysToExpiration };
  if (daysToExpiration <= 30) return { status: DocumentStatus.EXPIRING_SOON, daysToExpiration };
  return { status: DocumentStatus.VALID, daysToExpiration };
}

export const DriversManagement: React.FC<DriversManagementProps> = ({ onSelectVehicle }) => {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehiclesMap, setVehiclesMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [deletingDriver, setDeletingDriver] = useState<Driver | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [allDrivers, allVehicles] = await Promise.all([
        DriverClient.list(),
        VehicleClient.list(),
      ]);
      const vMap: Record<string, string> = {};
      allVehicles.forEach((vehicle) => {
        vMap[vehicle.id] = `${vehicle.brand} ${vehicle.model} (${vehicle.plate})`;
      });
      setDrivers(allDrivers);
      setVehiclesMap(vMap);
    } catch (err) {
      console.error('Erro ao carregar lista server-authoritative de motoristas:', err);
      setDrivers([]);
      setVehiclesMap({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const kpis = useMemo(() => {
    const result = {
      total: drivers.length,
      active: 0,
      inactive: 0,
      blocked: 0,
      pendingDocs: 0,
      cnhExpiring: 0,
      cnhExpired: 0,
    };
    drivers.forEach((driver) => {
      if (driver.status === DriverStatus.ACTIVE) result.active++;
      if (driver.status === DriverStatus.INACTIVE) result.inactive++;
      if (driver.status === DriverStatus.BLOCKED) result.blocked++;
      if (driver.status === DriverStatus.PENDING_DOCS || driver.status === DriverStatus.PENDING) result.pendingDocs++;
      const cnhEval = evaluateCnhStatus(driver.cnhExpiration);
      if (cnhEval.status === DocumentStatus.EXPIRED) result.cnhExpired++;
      if (cnhEval.status === DocumentStatus.EXPIRING_SOON) result.cnhExpiring++;
    });
    return result;
  }, [drivers]);

  const filteredDrivers = useMemo(() => {
    return drivers.filter((driver) => {
      const search = searchTerm.toLowerCase();
      const matchSearch =
        !search ||
        driver.fullName.toLowerCase().includes(search) ||
        driver.cpf.includes(search) ||
        driver.cnhNumber.includes(search) ||
        driver.phone.includes(search);
      if (!matchSearch) return false;
      if (statusFilter === 'ALL') return true;
      if (statusFilter === 'ACTIVE') return driver.status === DriverStatus.ACTIVE;
      if (statusFilter === 'INACTIVE') return driver.status === DriverStatus.INACTIVE;
      if (statusFilter === 'BLOCKED') return driver.status === DriverStatus.BLOCKED;
      if (statusFilter === 'PENDING_DOCS') {
        return driver.status === DriverStatus.PENDING_DOCS || driver.status === DriverStatus.PENDING;
      }
      const cnhEval = evaluateCnhStatus(driver.cnhExpiration);
      if (statusFilter === 'CNH_EXPIRED') return cnhEval.status === DocumentStatus.EXPIRED;
      if (statusFilter === 'CNH_EXPIRING') return cnhEval.status === DocumentStatus.EXPIRING_SOON;
      if (statusFilter === 'WITH_VEHICLE') return !!driver.currentVehicleId;
      if (statusFilter === 'WITHOUT_VEHICLE') return !driver.currentVehicleId;
      return true;
    });
  }, [drivers, searchTerm, statusFilter]);

  const handleOpenCreate = () => {
    setEditingDriver(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (driver: Driver, event: React.MouseEvent) => {
    event.stopPropagation();
    setEditingDriver(driver);
    setIsFormOpen(true);
  };

  const handleOpenDetails = (driverId: string) => {
    setSelectedDriverId(driverId);
    setIsDetailsOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingDriver) return;
    setDeleteLoading(true);
    try {
      await DriverClient.archive(deletingDriver.id);
      setDeletingDriver(null);
      await loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao arquivar o motorista.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const getStatusBadge = (status: DriverStatus) => {
    switch (status) {
      case DriverStatus.ACTIVE:
        return <Badge variant="success">Ativo</Badge>;
      case DriverStatus.INACTIVE:
        return <Badge variant="neutral">Inativo</Badge>;
      case DriverStatus.BLOCKED:
        return <Badge variant="danger">Bloqueado</Badge>;
      case DriverStatus.PENDING_DOCS:
      case DriverStatus.PENDING:
        return <Badge variant="warning">Pendente Docs</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const driverModalResetKey = isFormOpen
    ? `form:${editingDriver?.id ?? 'new'}`
    : isDetailsOpen
      ? `details:${selectedDriverId ?? 'none'}`
      : 'none';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Motoristas"
        description="Controle operacional, validação de CNH, contratos e histórico de motoristas"
        breadcrumb="Operação • Gestão de Motoristas"
        primaryAction={{
          label: 'Novo Motorista',
          onClick: handleOpenCreate,
          icon: <UserPlus className="w-4 h-4" />,
        }}
        secondaryActions={
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className="w-4 h-4 mr-1.5" />
            Atualizar
          </Button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <Card className="p-3 border-l-4 border-l-emerald-500">
          <span className="text-[11px] font-medium text-slate-500 block">Total</span>
          <strong className="text-lg font-bold text-slate-900 dark:text-slate-100 font-mono">{kpis.total}</strong>
        </Card>
        <Card className="p-3 border-l-4 border-l-emerald-600">
          <span className="text-[11px] font-medium text-slate-500 block">Ativos</span>
          <strong className="text-lg font-bold text-emerald-600 dark:text-emerald-400 font-mono">{kpis.active}</strong>
        </Card>
        <Card className="p-3 border-l-4 border-l-slate-400">
          <span className="text-[11px] font-medium text-slate-500 block">Inativos</span>
          <strong className="text-lg font-bold text-slate-600 dark:text-slate-400 font-mono">{kpis.inactive}</strong>
        </Card>
        <Card className="p-3 border-l-4 border-l-rose-500">
          <span className="text-[11px] font-medium text-slate-500 block">Bloqueados</span>
          <strong className="text-lg font-bold text-rose-600 dark:text-rose-400 font-mono">{kpis.blocked}</strong>
        </Card>
        <Card className="p-3 border-l-4 border-l-amber-500">
          <span className="text-[11px] font-medium text-slate-500 block">Pend. Docs</span>
          <strong className="text-lg font-bold text-amber-600 dark:text-amber-400 font-mono">{kpis.pendingDocs}</strong>
        </Card>
        <Card className="p-3 border-l-4 border-l-amber-600">
          <span className="text-[11px] font-medium text-slate-500 block">CNH Vencendo</span>
          <strong className="text-lg font-bold text-amber-600 dark:text-amber-400 font-mono">{kpis.cnhExpiring}</strong>
        </Card>
        <Card className="p-3 border-l-4 border-l-rose-600">
          <span className="text-[11px] font-medium text-slate-500 block">CNH Vencida</span>
          <strong className="text-lg font-bold text-rose-600 dark:text-rose-400 font-mono">{kpis.cnhExpired}</strong>
        </Card>
      </div>

      <Card className="p-4 space-y-3 sm:space-y-0 sm:flex sm:items-center sm:gap-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Buscar por nome, CPF, CNH ou telefone..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
        <div className="w-full sm:w-64">
          <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="ALL">Todos os Filtros</option>
            <option value="ACTIVE">Ativos</option>
            <option value="INACTIVE">Inativos</option>
            <option value="BLOCKED">Bloqueados</option>
            <option value="PENDING_DOCS">Pendentes de Documentação</option>
            <option value="CNH_EXPIRING">CNH Vencendo (&lt;= 30 dias)</option>
            <option value="CNH_EXPIRED">CNH Vencida</option>
            <option value="WITH_VEHICLE">Com Veículo Alocado</option>
            <option value="WITHOUT_VEHICLE">Sem Veículo Alocado</option>
          </Select>
        </div>
      </Card>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      ) : filteredDrivers.length === 0 ? (
        <Card className="p-12 text-center text-slate-400 space-y-2">
          <Users className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
          <p className="font-semibold text-sm">Nenhum motorista encontrado.</p>
          <p className="text-xs">Tente ajustar a busca ou os filtros aplicados.</p>
        </Card>
      ) : (
        <>
          <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <th className="p-3.5">Motorista / CPF</th>
                  <th className="p-3.5">CNH / Categoria</th>
                  <th className="p-3.5">Validade CNH</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5">Veículo Alocado</th>
                  <th className="p-3.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {filteredDrivers.map((driver) => {
                  const cnhEval = evaluateCnhStatus(driver.cnhExpiration);
                  const vehicleName = driver.currentVehicleId ? vehiclesMap[driver.currentVehicleId] : null;
                  return (
                    <tr
                      key={driver.id}
                      onClick={() => handleOpenDetails(driver.id)}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                    >
                      <td className="p-3.5">
                        <div className="font-bold text-slate-900 dark:text-slate-100">{driver.fullName}</div>
                        <div className="text-[11px] text-slate-500 font-mono">CPF: {driver.cpf} • Tel: {driver.phone}</div>
                      </td>
                      <td className="p-3.5">
                        <div className="font-mono font-semibold text-slate-800 dark:text-slate-200">{driver.cnhNumber}</div>
                        <div className="text-[11px] text-slate-400">
                          Cat. <span className="font-bold text-slate-700 dark:text-slate-300">{driver.cnhCategory}</span>
                        </div>
                      </td>
                      <td className="p-3.5">
                        <div className="font-mono text-slate-800 dark:text-slate-200">{driver.cnhExpiration}</div>
                        {cnhEval.status === DocumentStatus.EXPIRED && (
                          <span className="text-[10px] font-semibold text-rose-600 block">Vencida há {Math.abs(cnhEval.daysToExpiration)}d</span>
                        )}
                        {cnhEval.status === DocumentStatus.EXPIRING_SOON && (
                          <span className="text-[10px] font-semibold text-amber-600 block">Vence em {cnhEval.daysToExpiration}d</span>
                        )}
                      </td>
                      <td className="p-3.5">{getStatusBadge(driver.status)}</td>
                      <td className="p-3.5 text-slate-600 dark:text-slate-400">
                        {vehicleName ? (
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            <Car className="w-3.5 h-3.5" />{vehicleName}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Sem veículo</span>
                        )}
                      </td>
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1" onClick={(event) => event.stopPropagation()}>
                          <Button size="sm" variant="ghost" onClick={() => handleOpenDetails(driver.id)} title="Ver Detalhes">
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={(event) => handleOpenEdit(driver, event)} title="Editar">
                            <Edit2 className="w-4 h-4 text-blue-600" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setDeletingDriver(driver)} title="Arquivar / Remover">
                            <Trash2 className="w-4 h-4 text-rose-600" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-3">
            {filteredDrivers.map((driver) => {
              const vehicleName = driver.currentVehicleId ? vehiclesMap[driver.currentVehicleId] : null;
              return (
                <Card
                  key={driver.id}
                  onClick={() => handleOpenDetails(driver.id)}
                  className="p-4 space-y-3 cursor-pointer hover:border-emerald-500/50 transition-all"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">{driver.fullName}</h3>
                      <p className="text-xs text-slate-500 font-mono">CPF: {driver.cpf}</p>
                    </div>
                    {getStatusBadge(driver.status)}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div>
                      <span className="text-slate-400 block text-[10px]">CNH</span>
                      <strong className="font-mono">{driver.cnhNumber} ({driver.cnhCategory})</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Validade CNH</span>
                      <strong className="font-mono">{driver.cnhExpiration}</strong>
                    </div>
                  </div>
                  {vehicleName && (
                    <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 pt-1">
                      <Car className="w-4 h-4" />{vehicleName}
                    </div>
                  )}
                  <div
                    className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Button size="sm" variant="outline" onClick={() => handleOpenDetails(driver.id)}>
                      <Eye className="w-4 h-4 mr-1" />Detalhes
                    </Button>
                    <Button size="sm" variant="outline" onClick={(event) => handleOpenEdit(driver, event)}>
                      <Edit2 className="w-4 h-4 mr-1" />Editar
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <LazyModuleErrorBoundary resetKey={driverModalResetKey} onRetry={()=>window.location.reload()}>
        <Suspense fallback={<div role="status" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20"><div className="rounded-xl bg-white px-4 py-3 text-sm text-slate-600 shadow-xl dark:bg-slate-900 dark:text-slate-300">Carregando dados do motorista...</div></div>}>
          {isFormOpen&&<DriverFormModal
            isOpen
            onClose={() => setIsFormOpen(false)}
            driverToEdit={editingDriver}
            onSuccess={loadData}
          />}
          {isDetailsOpen&&selectedDriverId&&<DriverDetailsModal
            isOpen
            onClose={() => setIsDetailsOpen(false)}
            driverId={selectedDriverId}
            onSelectVehicle={onSelectVehicle}
            onDriverUpdated={loadData}
          />}
        </Suspense>
      </LazyModuleErrorBoundary>

      <ConfirmDialog
        isOpen={!!deletingDriver}
        onClose={() => setDeletingDriver(null)}
        onConfirm={handleDelete}
        title="Descartar / Arquivar Motorista"
        message={`Deseja remover ${deletingDriver?.fullName}? O arquivamento é lógico e preserva o histórico operacional e financeiro.`}
        confirmText="Confirmar Arquivamento"
        confirmVariant="danger"
        isLoading={deleteLoading}
      />
    </div>
  );
};