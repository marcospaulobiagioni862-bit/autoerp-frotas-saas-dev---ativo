import React, { lazy, Suspense, useEffect, useState } from 'react';
import { VehicleClient } from '../../api/vehicleClient';
import { Vehicle } from '../../types/entities';
import { VEHICLE_CATEGORIES, VehicleStatus } from '../../types/enums';
import { Car, Search, Filter, Plus, Gauge, Eye, Edit, Sparkles, Archive, RotateCcw } from 'lucide-react';
import { Card, Badge, Input, Select, Button, Skeleton, ConfirmDialog, PageHeader } from '../ui';
import { LazyModuleErrorBoundary } from '../common/LazyModuleErrorBoundary';
import { formatCurrencyBRL } from '../../shared/utils/currency';
import { VehicleSaleModal } from './VehicleSaleModal';
import { VehicleArchiveModal } from './VehicleArchiveModal';
import { VehicleRestoreModal } from './VehicleRestoreModal';
import { ArchivedVehicleHistoryModal } from './ArchivedVehicleHistoryModal';
import {
  VEHICLE_STATUS_FILTERS,
  vehicleMatchesStatusFilter,
  vehicleManualStatusOptions,
  vehicleStatusBadgeVariant,
  vehicleStatusLabel,
} from './vehicleStatusPresentation';

const VehicleFormModal=lazy(()=>import('./VehicleFormModal').then(module=>({default:module.VehicleFormModal})));
const VehicleDetailsModal=lazy(()=>import('./VehicleDetailsModal').then(module=>({default:module.VehicleDetailsModal})));
const RecordKmModal=lazy(()=>import('./RecordKmModal').then(module=>({default:module.RecordKmModal})));
const VehicleKmBatchModal=lazy(()=>import('./VehicleKmBatchModal').then(module=>({default:module.VehicleKmBatchModal})));
const VehicleDocumentIntakeModal=lazy(()=>import('./VehicleDocumentIntakeModal').then(module=>({default:module.VehicleDocumentIntakeModal})));

export const FleetManagement: React.FC = () => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | VehicleStatus>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [sortOption, setSortOption] = useState<'PLATE' | 'MODEL' | 'KM' | 'STATUS'>('PLATE');
  const [loading, setLoading] = useState<boolean>(true);

  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [isVehicleAiOpen, setIsVehicleAiOpen] = useState<boolean>(false);
  const [vehicleToEdit, setVehicleToEdit] = useState<Vehicle | null>(null);
  const [selectedVehicleIdForDetails, setSelectedVehicleIdForDetails] = useState<string | null>(null);
  const [readOnlyVehicleIdForHistory, setReadOnlyVehicleIdForHistory] = useState<string | null>(null);
  const [vehicleForKmRecord, setVehicleForKmRecord] = useState<Vehicle | null>(null);
  const [isKmBatchOpen, setIsKmBatchOpen] = useState<boolean>(false);
  const [vehicleForSale, setVehicleForSale] = useState<Vehicle | null>(null);
  const [vehicleForArchive, setVehicleForArchive] = useState<Vehicle | null>(null);
  const [vehicleForRestore, setVehicleForRestore] = useState<Vehicle | null>(null);

  const [vehicleForStatusChange, setVehicleForStatusChange] = useState<Vehicle | null>(null);
  const [targetStatus, setTargetStatus] = useState<VehicleStatus | null>(null);
  const [isConfirmingStatus, setIsConfirmingStatus] = useState<boolean>(false);

  useEffect(() => {
    void loadVehicles();
  }, [showArchived]);

  const loadVehicles = async () => {
    setLoading(true);
    try {
      const list = showArchived ? await VehicleClient.listArchived() : await VehicleClient.list();
      setVehicles(list);
    } catch (err) {
      console.error('Erro ao carregar veículos:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleArchivedView = () => {
    setSearchTerm('');
    setStatusFilter('ALL');
    setCategoryFilter('ALL');
    setShowArchived((current) => !current);
  };

  const filteredVehicles = vehicles.filter((v) => {
    const s = searchTerm.toLowerCase();
    const matchesSearch =
      v.plate.toLowerCase().includes(s) ||
      v.brand.toLowerCase().includes(s) ||
      v.model.toLowerCase().includes(s);
    const matchesStatus = vehicleMatchesStatusFilter(v.status, statusFilter);
    const matchesCategory = categoryFilter === 'ALL' || v.category === categoryFilter;
    return matchesSearch && matchesStatus && matchesCategory;
  }).sort((a, b) => {
    if (sortOption === 'MODEL') return `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`, 'pt-BR');
    if (sortOption === 'KM') return a.currentKm - b.currentKm;
    if (sortOption === 'STATUS') return vehicleStatusLabel(a.status).localeCompare(vehicleStatusLabel(b.status), 'pt-BR');
    return a.plate.localeCompare(b.plate, 'pt-BR');
  });

  const totalCount = vehicles.length;
  const rentedCount = vehicles.filter((v) => v.status === VehicleStatus.RENTED).length;
  const availableCount = vehicles.filter((v) => v.status === VehicleStatus.AVAILABLE).length;
  const reservedCount = vehicles.filter((v) => v.status === VehicleStatus.RESERVED).length;
  const maintenanceCount = vehicles.filter((v) => vehicleMatchesStatusFilter(v.status, VehicleStatus.MAINTENANCE)).length;
  const inactiveCount = vehicles.filter((v) => v.status === VehicleStatus.INACTIVE || v.status === VehicleStatus.SOLD).length;

  const handleStatusChangeClick = (vehicle: Vehicle, newStatus: VehicleStatus) => {
    setVehicleForStatusChange(vehicle);
    setTargetStatus(newStatus);
    setIsConfirmingStatus(true);
  };

  const handleConfirmStatusChange = async (reason?: string) => {
    if (!vehicleForStatusChange || !targetStatus) return;
    try {
      await VehicleClient.changeStatus(vehicleForStatusChange.id, targetStatus, reason);
      await loadVehicles();
    } catch (err: any) {
      alert(err.message || 'Erro ao alterar status do veículo.');
    } finally {
      setIsConfirmingStatus(false);
      setVehicleForStatusChange(null);
      setTargetStatus(null);
    }
  };

  const fleetModalResetKey = isVehicleAiOpen
    ? 'vehicle-ai-intake'
    : isFormOpen
    ? `form:${vehicleToEdit?.id ?? 'new'}`
    : selectedVehicleIdForDetails
      ? `details:${selectedVehicleIdForDetails}`
      : vehicleForKmRecord
        ? `km:${vehicleForKmRecord.id}`
        : isKmBatchOpen
          ? 'km-batch'
          : 'none';

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title={showArchived ? 'Veículos Arquivados' : 'Veículos'}
        description={showArchived
          ? 'Histórico preservado da frota fora da operação; veículos vendidos podem retornar ao estoque por ação explícita e auditável'
          : 'Cadastro, disponibilidade, odômetros, manutenções e ciclo de vida operacional da frota'}
        breadcrumb="Operação • Gestão de Frota"
        primaryAction={showArchived ? undefined : {
          label: 'Novo Veículo',
          onClick: () => {
            setVehicleToEdit(null);
            setIsFormOpen(true);
          },
          icon: <Plus className="w-4 h-4" />
        }}
      />

      {!showArchived && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => setIsKmBatchOpen(true)} className="gap-2">
            <Gauge className="w-4 h-4" /> Atualizar KM em lote
          </Button>
          <Button variant="outline" onClick={() => setIsVehicleAiOpen(true)} className="gap-2">
            <Sparkles className="w-4 h-4" /> Cadastrar por documento com IA
          </Button>
        </div>
      )}

      {!showArchived && (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl"><span className="text-xs text-slate-400 block">Total Frota</span><strong className="text-lg font-mono font-bold text-slate-900 dark:text-slate-100">{totalCount}</strong></div>
          <div className="p-3 bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/50 rounded-xl"><span className="text-xs text-emerald-600 dark:text-emerald-400 block font-semibold">Locados</span><strong className="text-lg font-mono font-bold text-emerald-700 dark:text-emerald-300">{rentedCount}</strong></div>
          <div className="p-3 bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900/50 rounded-xl"><span className="text-xs text-blue-600 dark:text-blue-400 block font-semibold">Disponíveis</span><strong className="text-lg font-mono font-bold text-blue-700 dark:text-blue-300">{availableCount}</strong></div>
          <div className="p-3 bg-white dark:bg-slate-900 border border-violet-200 dark:border-violet-900/50 rounded-xl"><span className="text-xs text-violet-600 dark:text-violet-400 block font-semibold">Reservados</span><strong className="text-lg font-mono font-bold text-violet-700 dark:text-violet-300">{reservedCount}</strong></div>
          <div className="p-3 bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/50 rounded-xl"><span className="text-xs text-amber-600 dark:text-amber-400 block font-semibold">Em Manutenção</span><strong className="text-lg font-mono font-bold text-amber-700 dark:text-amber-300">{maintenanceCount}</strong></div>
          <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl"><span className="text-xs text-slate-400 block">Inativos</span><strong className="text-lg font-mono font-bold text-slate-600 dark:text-slate-400">{inactiveCount}</strong></div>
        </div>
      )}

      {showArchived && (
        <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 text-xs text-slate-600 dark:text-slate-300">
          {totalCount} veículo(s) vendido(s) ou arquivado(s). O histórico é preservado; apenas veículos vendidos e ainda não arquivados podem retornar ao estoque.
        </div>
      )}

      <Card padding="sm">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="w-full md:max-w-xl md:flex-1">
            <Input type="text" placeholder="Buscar por placa, marca ou modelo..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} icon={<Search className="w-4 h-4 text-slate-400" />}/>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 w-full md:w-auto">
            <Button variant="outline" size="sm" onClick={toggleArchivedView}>{showArchived ? 'Voltar à frota ativa' : 'Ver vendidos / arquivados'}</Button>
            {!showArchived && <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0 mr-1" />}
            {!showArchived && VEHICLE_STATUS_FILTERS.map((st) => (
              <button key={st.id} onClick={() => setStatusFilter(st.id)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-500 ${statusFilter === st.id ? 'bg-blue-600 text-white font-semibold shadow-2xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>{st.label}</button>
            ))}
            <div className="w-52 shrink-0">
              <Select aria-label="Filtrar por categoria" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} options={[{ value: 'ALL', label: 'Todas as categorias' }, ...VEHICLE_CATEGORIES.map((category) => ({ value: category, label: category }))]}/>
            </div>
            <div className="w-44 shrink-0">
              <Select aria-label="Ordenar veículos" value={sortOption} onChange={(event) => setSortOption(event.target.value as typeof sortOption)} options={[
                { value: 'PLATE', label: 'Ordenar: placa' },
                { value: 'MODEL', label: 'Ordenar: modelo' },
                { value: 'KM', label: 'Ordenar: KM' },
                { value: 'STATUS', label: 'Ordenar: status' },
              ]}/>
            </div>
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"><Skeleton className="h-56 w-full"/><Skeleton className="h-56 w-full"/><Skeleton className="h-56 w-full"/></div>
      ) : filteredVehicles.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <Car className="w-12 h-12 text-slate-300 mx-auto mb-3"/>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{showArchived ? 'Nenhum veículo vendido ou arquivado' : 'Nenhum veículo encontrado'}</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">{showArchived ? 'Veículos vendidos ou arquivados aparecem aqui sem perder seus históricos.' : 'Ajuste os filtros de busca ou cadastre um novo veículo para sua frota de locação.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredVehicles.map((vehicle) => {
            const isAvailable = vehicle.status === VehicleStatus.AVAILABLE;
            const allManualStatusOptions = vehicleManualStatusOptions(vehicle.status);
            const manualStatusOptions = allManualStatusOptions.filter((option) => option.value !== VehicleStatus.SOLD && option.value !== VehicleStatus.ARCHIVED);
            const canArchive = allManualStatusOptions.some((option) => option.value === VehicleStatus.ARCHIVED);
            const canPlaceOutOfUse = vehicle.status !== VehicleStatus.RENTED && vehicle.status !== VehicleStatus.INACTIVE && vehicle.status !== VehicleStatus.SOLD && vehicle.status !== VehicleStatus.ARCHIVED;
            const canMarkSold = [VehicleStatus.AVAILABLE, VehicleStatus.DAMAGED, VehicleStatus.INACTIVE].includes(vehicle.status);
            const isReadOnlyTerminal = showArchived || vehicle.status === VehicleStatus.SOLD || vehicle.status === VehicleStatus.ARCHIVED;

            return (
              <Card key={vehicle.id} padding="md" hoverEffect className="flex flex-col justify-between border-slate-200 dark:border-slate-800">
                <div>
                  <div className="flex items-center justify-between gap-2"><span className="font-mono text-sm font-black px-2.5 py-1 bg-slate-900 text-white rounded-md tracking-wider">{vehicle.plate}</span><Badge variant={vehicleStatusBadgeVariant(vehicle.status)}>{vehicleStatusLabel(vehicle.status)}</Badge></div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-3">{vehicle.brand} {vehicle.model}</h3>
                  <p className="text-xs text-slate-500">Ano: {vehicle.yearFabrication}/{vehicle.yearModel} • Cor: {vehicle.color} • {vehicle.fuelType}</p>
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                    <div className="flex justify-between"><span className="text-slate-400">Quilometragem:</span><strong className="font-mono tabular-nums text-slate-900 dark:text-slate-100">{vehicle.currentKm.toLocaleString('pt-BR')} KM</strong></div>
                    <div className="flex justify-between"><span className="text-slate-400">Aluguel Semanal:</span><strong className="font-mono text-emerald-600 dark:text-emerald-400">{vehicle.rentalValueBase > 0 ? `${formatCurrencyBRL(vehicle.rentalValueBase)} / sem` : 'Não definido'}</strong></div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2 text-xs">
                  <div className="flex items-center justify-between gap-2"><span className="font-semibold text-slate-700 dark:text-slate-300">{isReadOnlyTerminal ? 'Histórico do veículo' : 'Ações do veículo'}</span></div>

                  {isReadOnlyTerminal ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={() => setReadOnlyVehicleIdForHistory(vehicle.id)} className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-blue-600 dark:text-blue-400 font-semibold border rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">
                        <Eye className="w-3.5 h-3.5"/> Abrir histórico somente leitura
                      </button>
                      {vehicle.status === VehicleStatus.SOLD && !vehicle.isArchived && (
                        <button onClick={() => setVehicleForRestore(vehicle)} title="Retornar veículo vendido ao estoque" className="inline-flex items-center gap-1 px-3 py-2 text-[10px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 rounded-lg border border-emerald-200 dark:border-emerald-900"><RotateCcw className="w-3.5 h-3.5"/>Retornar ao estoque</button>
                      )}
                      {!showArchived && vehicle.status === VehicleStatus.SOLD && canArchive && (
                        <button onClick={() => setVehicleForArchive(vehicle)} title="Arquivar / remover da frota" className="inline-flex items-center gap-1 px-3 py-2 text-[10px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:text-rose-300 rounded-lg border border-rose-200 dark:border-rose-900"><Archive className="w-3.5 h-3.5"/>Arquivar / remover</button>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <button onClick={() => setSelectedVehicleIdForDetails(vehicle.id)} className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg bg-blue-600 px-3 py-2 font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"><Eye className="w-3.5 h-3.5"/> Detalhes</button>
                      <details className="relative">
                        <summary aria-label={`Mais ações para ${vehicle.plate}`} className="list-none cursor-pointer rounded-lg border border-slate-200 px-3 py-2 text-base font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">⋮</summary>
                        <div className="absolute right-0 z-20 mt-1 w-56 space-y-1 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                          {(manualStatusOptions.length > 0 || canMarkSold) && (
                            <Select
                              aria-label={`Alterar status do veículo ${vehicle.plate}`}
                              value=""
                              onChange={(event) => {
                                const nextValue = event.target.value;
                                if (nextValue === '__SELL__') {
                                  setVehicleForSale(vehicle);
                                  return;
                                }
                                if (nextValue) handleStatusChangeClick(vehicle, nextValue as VehicleStatus);
                              }}
                              options={[
                                { value: '', label: 'Alterar status...', disabled: true },
                                ...manualStatusOptions,
                                ...(canMarkSold ? [{ value: '__SELL__', label: 'Vender veículo...' }] : []),
                              ]}
                            />
                          )}
                          <button onClick={() => setVehicleForKmRecord(vehicle)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"><Gauge className="w-4 h-4"/>Registrar KM</button>
                          <button onClick={() => { setVehicleToEdit(vehicle); setIsFormOpen(true); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"><Edit className="w-4 h-4"/>Editar</button>
                          {isAvailable && <button onClick={() => handleStatusChangeClick(vehicle, VehicleStatus.MAINTENANCE)} className="w-full rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40">Enviar para manutenção</button>}
                          {canPlaceOutOfUse && <button onClick={() => handleStatusChangeClick(vehicle, VehicleStatus.INACTIVE)} className="w-full rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Colocar fora de uso</button>}
                          {canMarkSold && <button onClick={() => setVehicleForSale(vehicle)} className="w-full rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Marcar como vendido</button>}
                          {canArchive && <button onClick={() => setVehicleForArchive(vehicle)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/30"><Archive className="w-3.5 h-3.5"/>Arquivar / remover</button>}
                        </div>
                      </details>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <LazyModuleErrorBoundary resetKey={fleetModalResetKey} onRetry={()=>window.location.reload()}>
        <Suspense fallback={<div role="status" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20"><div className="rounded-xl bg-white px-4 py-3 text-sm text-slate-600 shadow-xl dark:bg-slate-900 dark:text-slate-300">Carregando dados do veículo...</div></div>}>
          {isVehicleAiOpen&&<VehicleDocumentIntakeModal
            isOpen
            onClose={() => setIsVehicleAiOpen(false)}
            onCreated={async (vehicleId) => { await loadVehicles(); setSelectedVehicleIdForDetails(vehicleId); }}
            onExistingFound={(vehicle) => {
              setIsVehicleAiOpen(false);
              if (vehicle.isArchived || vehicle.status === VehicleStatus.SOLD || vehicle.status === VehicleStatus.ARCHIVED) {
                setReadOnlyVehicleIdForHistory(vehicle.id);
              } else {
                setSelectedVehicleIdForDetails(vehicle.id);
              }
            }}
            onManualRequested={() => { setIsVehicleAiOpen(false); setVehicleToEdit(null); setIsFormOpen(true); }}
          />}
          {isFormOpen&&<VehicleFormModal isOpen onClose={() => { setIsFormOpen(false); setVehicleToEdit(null); }} onSuccess={loadVehicles} vehicleToEdit={vehicleToEdit}/>} 
          {selectedVehicleIdForDetails&&<VehicleDetailsModal isOpen onClose={() => setSelectedVehicleIdForDetails(null)} vehicleId={selectedVehicleIdForDetails}
            onEditRequest={() => { const v = vehicles.find((x) => x.id === selectedVehicleIdForDetails); if (v) { setSelectedVehicleIdForDetails(null); setVehicleToEdit(v); setIsFormOpen(true); } }}
            onRecordKmRequest={() => { const v = vehicles.find((x) => x.id === selectedVehicleIdForDetails); if (v) { setSelectedVehicleIdForDetails(null); setVehicleForKmRecord(v); } }}
            onStatusChangeRequest={(status) => { const v = vehicles.find((x) => x.id === selectedVehicleIdForDetails); if (v) { setSelectedVehicleIdForDetails(null); handleStatusChangeClick(v,status); } }}
            onSaleRequest={() => { const v = vehicles.find((x) => x.id === selectedVehicleIdForDetails); if (v) { setSelectedVehicleIdForDetails(null); setVehicleForSale(v); } }}
            onArchiveRequest={() => { const v = vehicles.find((x) => x.id === selectedVehicleIdForDetails); if (v) { setSelectedVehicleIdForDetails(null); setVehicleForArchive(v); } }}/>} 
          {vehicleForKmRecord&&<RecordKmModal isOpen onClose={() => setVehicleForKmRecord(null)} onSuccess={loadVehicles} vehicle={vehicleForKmRecord}/>} 
          {isKmBatchOpen&&<VehicleKmBatchModal isOpen vehicles={vehicles} onClose={() => setIsKmBatchOpen(false)} onSuccess={loadVehicles}/>}
        </Suspense>
      </LazyModuleErrorBoundary>

      {vehicleForSale&&<VehicleSaleModal isOpen vehicle={vehicleForSale} onClose={() => setVehicleForSale(null)} onSuccess={loadVehicles}/>} 
      {vehicleForArchive&&<VehicleArchiveModal isOpen vehicle={vehicleForArchive} onClose={() => setVehicleForArchive(null)} onSuccess={loadVehicles}/>} 
      {vehicleForRestore&&<VehicleRestoreModal isOpen vehicle={vehicleForRestore} onClose={() => setVehicleForRestore(null)} onSuccess={loadVehicles}/>} 
      {readOnlyVehicleIdForHistory&&<ArchivedVehicleHistoryModal isOpen vehicleId={readOnlyVehicleIdForHistory} onClose={() => setReadOnlyVehicleIdForHistory(null)}/>} 

      <ConfirmDialog
        isOpen={isConfirmingStatus}
        onClose={() => setIsConfirmingStatus(false)}
        onConfirm={handleConfirmStatusChange}
        title={targetStatus === VehicleStatus.INACTIVE ? 'Colocar veículo fora de uso' : 'Alterar Status do Veículo'}
        message={targetStatus === VehicleStatus.INACTIVE ? `Deseja colocar o veículo ${vehicleForStatusChange?.plate} fora de uso? O histórico não será apagado.` : `Deseja alterar o status do veículo ${vehicleForStatusChange?.plate} para ${targetStatus ? vehicleStatusLabel(targetStatus) : ''}?`}
        confirmLabel="Confirmar Alteração"
        variant="warning"
      />
    </div>
  );
};