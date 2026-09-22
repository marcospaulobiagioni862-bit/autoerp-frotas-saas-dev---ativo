import React, { lazy, Suspense, useState, useEffect, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Search,
  Car,
  Eye,
  Edit2,
  Archive,
  RefreshCw,
  ScanLine,
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
import type { ApprovedCnhDriverDraft } from '../../api/driverDocumentIntakeClient';
import { Driver } from '../../types/entities';
import { DriverStatus, DocumentStatus } from '../../types/enums';
import { matchesDriverSearch } from './driverSearch';
import { formatDateBR } from '../../shared/utils/date';

const DriverFormModal = lazy(() => import('./DriverFormModal').then(module => ({ default: module.DriverFormModal })));
const DriverDetailsModal = lazy(() => import('./DriverDetailsModal').then(module => ({ default: module.DriverDetailsModal })));
const DriverCnhIntakeModal = lazy(() => import('./DriverCnhIntakeModal').then(module => ({ default: module.DriverCnhIntakeModal })));

interface DriversManagementProps {
  companyId: string;
  onSelectVehicle?: (vehicleId: string) => void;
}

function maskCpf(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11) return '***';
  return `***.***.***-${digits.slice(-2)}`;
}

function maskCnh(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '—';
  return `${'•'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : '—';
}

function earLabel(value: boolean | undefined): string {
  return value === true ? 'EAR: Sim' : value === false ? 'EAR: Não' : 'EAR: Pendente';
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sortOption, setSortOption] = useState<'NAME' | 'CNH_EXPIRY' | 'STATUS'>('NAME');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [isCnhIntakeOpen, setIsCnhIntakeOpen] = useState(false);
  const [cnhRenewalDriverId, setCnhRenewalDriverId] = useState<string | null>(null);
  const [cnhDraft, setCnhDraft] = useState<ApprovedCnhDriverDraft | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [deletingDriver, setDeletingDriver] = useState<Driver | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [driversResult, vehiclesResult] = await Promise.allSettled([
        DriverClient.list(),
        VehicleClient.list(),
      ]);

      if (driversResult.status === 'rejected') {
        console.error('Erro ao carregar lista server-authoritative de motoristas:', driversResult.reason);
        setDrivers([]);
        setVehiclesMap({});
        setLoadError(driversResult.reason instanceof Error ? driversResult.reason.message : 'Falha ao carregar motoristas.');
        return;
      }

      setDrivers(driversResult.value);

      if (vehiclesResult.status === 'fulfilled') {
        const vMap: Record<string, string> = {};
        vehiclesResult.value.forEach((vehicle) => {
          vMap[vehicle.id] = `${vehicle.brand} ${vehicle.model} (${vehicle.plate})`;
        });
        setVehiclesMap(vMap);
      } else {
        console.warn('Falha ao carregar enriquecimento de veículos para motoristas:', vehiclesResult.reason);
        setVehiclesMap({});
      }
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
      if (!matchesDriverSearch(driver, searchTerm)) return false;
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
    }).sort((a, b) => {
      if (sortOption === 'CNH_EXPIRY') return a.cnhExpiration.localeCompare(b.cnhExpiration);
      if (sortOption === 'STATUS') return String(a.status).localeCompare(String(b.status), 'pt-BR');
      return a.fullName.localeCompare(b.fullName, 'pt-BR');
    });
  }, [drivers, searchTerm, statusFilter, sortOption]);

  const handleOpenCreate = () => {
    setEditingDriver(null);
    setCnhDraft(null);
    setIsFormOpen(true);
  };

  const handleOpenCnhIntake = () => {
    setCnhRenewalDriverId(null);
    setEditingDriver(null);
    setCnhDraft(null);
    setIsFormOpen(false);
    setIsCnhIntakeOpen(true);
  };

  const handleCnhDraftReady = (draft: ApprovedCnhDriverDraft) => {
    setCnhRenewalDriverId(null);
    setCnhDraft(draft);
    setEditingDriver(null);
    setIsCnhIntakeOpen(false);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (driver: Driver, event: React.MouseEvent) => {
    event.stopPropagation();
    setCnhDraft(null);
    setEditingDriver(driver);
    setIsFormOpen(true);
  };

  const handleOpenDetails = (driverId: string) => {
    setSelectedDriverId(driverId);
    setIsDetailsOpen(true);
  };

  const handleOpenCnhRenewal = (driverId: string) => {
    setSelectedDriverId(driverId);
    setIsDetailsOpen(false);
    setCnhRenewalDriverId(driverId);
    setIsCnhIntakeOpen(true);
  };

  const handleCnhRenewed = (driverId: string) => {
    setIsCnhIntakeOpen(false);
    setCnhRenewalDriverId(null);
    setSelectedDriverId(driverId);
    setIsDetailsOpen(true);
    void loadData();
  };

  const handleExistingDriverDetected = (driverId: string) => {
    setIsCnhIntakeOpen(false);
    setCnhRenewalDriverId(null);
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
        return <Badge variant="warning">Documentação pendente</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const driverModalResetKey = isCnhIntakeOpen
    ? `cnh-intake:${cnhRenewalDriverId ?? 'new'}`
    : isFormOpen
      ? `form:${editingDriver?.id ?? (cnhDraft ? 'new-cnh' : 'new')}`
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
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleOpenCnhIntake}>
              <ScanLine className="w-4 h-4 mr-1.5" />
              Cadastrar pela CNH
            </Button>
          </div>
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
          <span className="text-[11px] font-medium text-slate-500 block">Documentos pendentes</span>
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
            <option value="ALL">Filtros</option>
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
        <div className="w-full sm:w-52">
          <Select value={sortOption} onChange={(event) => setSortOption(event.target.value as typeof sortOption)}>
            <option value="NAME">Ordenar: nome</option>
            <option value="CNH_EXPIRY">Ordenar: validade CNH</option>
            <option value="STATUS">Ordenar: status</option>
          </Select>
        </div>
      </Card>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      ) : loadError ? (
        <Card className="p-8 text-center space-y-3 border-rose-200 dark:border-rose-900">
          <Users className="w-10 h-10 mx-auto text-rose-400" />
          <p className="font-semibold text-sm text-rose-700 dark:text-rose-300">Não foi possível carregar os motoristas.</p>
          <p className="text-xs text-slate-500">{loadError}</p>
          <Button size="sm" variant="outline" onClick={()=>void loadData()}><RefreshCw className="w-4 h-4 mr-1.5"/>Tentar novamente</Button>
        </Card>
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
                        <div className="text-[11px] text-slate-500 font-mono">CPF: {maskCpf(driver.cpf)} • Tel: {maskPhone(driver.phone)}</div>
                      </td>
                      <td className="p-3.5">
                        <div className="font-mono font-semibold text-slate-800 dark:text-slate-200">{maskCnh(driver.cnhNumber)}</div>
                        <div className="text-[11px] text-slate-400">
                          Cat. <span className="font-bold text-slate-700 dark:text-slate-300">{driver.cnhCategory}</span> • {earLabel(driver.cnhEar)}
                        </div>
                      </td>
                      <td className="p-3.5">
                        <div className="font-mono text-slate-800 dark:text-slate-200">{formatDateBR(driver.cnhExpiration)}</div>
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
                          onSelectVehicle && driver.currentVehicleId ? (
                            <button
                              type="button"
                              onClick={(event) => { event.stopPropagation(); onSelectVehicle(driver.currentVehicleId!); }}
                              className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 hover:underline"
                            >
                              <Car className="w-3.5 h-3.5" />{vehicleName}
                            </button>
                          ) : (
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                              <Car className="w-3.5 h-3.5" />{vehicleName}
                            </span>
                          )
                        ) : (
                          <span className="text-slate-400 italic">Sem veículo</span>
                        )}
                      </td>
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                          <Button size="sm" variant="primary" onClick={() => handleOpenDetails(driver.id)}>
                            <Eye className="w-4 h-4 mr-1" />Detalhes
                          </Button>
                          <details className="relative">
                            <summary aria-label={`Mais ações para ${driver.fullName}`} className="list-none cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-base font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">⋮</summary>
                            <div className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-slate-200 bg-white p-2 text-left shadow-xl dark:border-slate-700 dark:bg-slate-900">
                              <button onClick={(event) => handleOpenEdit(driver, event)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                                <Edit2 className="w-4 h-4" />Editar
                              </button>
                              <button onClick={() => setDeletingDriver(driver)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/30">
                                <Archive className="w-4 h-4" />Arquivar
                              </button>
                            </div>
                          </details>
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
                      <p className="text-xs text-slate-500 font-mono">CPF: {maskCpf(driver.cpf)}</p>
                    </div>
                    {getStatusBadge(driver.status)}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div>
                      <span className="text-slate-400 block text-[10px]">CNH</span>
                      <strong className="font-mono">{maskCnh(driver.cnhNumber)} ({driver.cnhCategory})</strong><span className="block text-[10px] text-slate-400 mt-0.5">{earLabel(driver.cnhEar)}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Validade CNH</span>
                      <strong className="font-mono">{formatDateBR(driver.cnhExpiration)}</strong>
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
                    <Button size="sm" variant="primary" onClick={() => handleOpenDetails(driver.id)}>
                      <Eye className="w-4 h-4 mr-1" />Detalhes
                    </Button>
                    <details className="relative">
                      <summary aria-label={`Mais ações para ${driver.fullName}`} className="list-none cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-base font-bold text-slate-600 dark:border-slate-700 dark:text-slate-300">⋮</summary>
                      <div className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-slate-200 bg-white p-2 text-left shadow-xl dark:border-slate-700 dark:bg-slate-900">
                        <button onClick={(event) => handleOpenEdit(driver, event)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"><Edit2 className="w-4 h-4"/>Editar</button>
                        <button onClick={() => setDeletingDriver(driver)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/30"><Archive className="w-4 h-4"/>Arquivar</button>
                      </div>
                    </details>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <LazyModuleErrorBoundary resetKey={driverModalResetKey} onRetry={() => window.location.reload()}>
        <Suspense fallback={<div role="status" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20"><div className="rounded-xl bg-white px-4 py-3 text-sm text-slate-600 shadow-xl dark:bg-slate-900 dark:text-slate-300">Carregando dados do motorista...</div></div>}>
          {isCnhIntakeOpen && <DriverCnhIntakeModal
            isOpen
            onClose={() => {
              setIsCnhIntakeOpen(false);
              setCnhRenewalDriverId(null);
            }}
            onDraftReady={handleCnhDraftReady}
            expectedDriverId={cnhRenewalDriverId || undefined}
            onRenewed={handleCnhRenewed}
            onExistingDriver={handleExistingDriverDetected}
          />}
          {isFormOpen && <DriverFormModal
            isOpen
            onClose={() => {
              setIsFormOpen(false);
              setCnhDraft(null);
            }}
            driverToEdit={editingDriver}
            initialCnhDraft={editingDriver ? null : cnhDraft}
            onSuccess={loadData}
          />}
          {isDetailsOpen && selectedDriverId && <DriverDetailsModal
            isOpen
            onClose={() => setIsDetailsOpen(false)}
            driverId={selectedDriverId}
            onSelectVehicle={onSelectVehicle}
            onDriverUpdated={loadData}
            onRenewCnh={handleOpenCnhRenewal}
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