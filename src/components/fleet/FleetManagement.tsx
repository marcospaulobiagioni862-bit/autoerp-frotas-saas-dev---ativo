import React, { lazy, Suspense, useEffect, useState } from 'react';
import { VehicleClient } from '../../api/vehicleClient';
import { Vehicle } from '../../types/entities';
import { VEHICLE_CATEGORIES, VehicleStatus } from '../../types/enums';
import { Car, Search, Filter, Plus, Gauge, Eye, Edit, Sparkles, Archive } from 'lucide-react';
import { Card, Badge, Input, Select, Button, Skeleton, ConfirmDialog, PageHeader } from '../ui';
import { LazyModuleErrorBoundary } from '../common/LazyModuleErrorBoundary';
import { formatCurrencyBRL } from '../../shared/utils/currency';
import { VehicleSaleModal } from './VehicleSaleModal';
import { VehicleArchiveModal } from './VehicleArchiveModal';
import { ArchivedVehicleHistoryModal } from './ArchivedVehicleHistoryModal';
import {
  VEHICLE_STATUS_FILTERS,
  vehicleManualStatusOptions,
  vehicleStatusBadgeVariant,
  vehicleStatusLabel,
} from './vehicleStatusPresentation';

const VehicleFormModal=lazy(()=>import('./VehicleFormModal').then(module=>({default:module.VehicleFormModal})));
const VehicleDetailsModal=lazy(()=>import('./VehicleDetailsModal').then(module=>({default:module.VehicleDetailsModal})));
const RecordKmModal=lazy(()=>import('./RecordKmModal').then(module=>({default:module.RecordKmModal})));
const VehicleDocumentIntakeModal=lazy(()=>import('./VehicleDocumentIntakeModal').then(module=>({default:module.VehicleDocumentIntakeModal})));

export const FleetManagement: React.FC = () => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState<boolean>(true);

  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [isVehicleAiOpen, setIsVehicleAiOpen] = useState<boolean>(false);
  const [vehicleToEdit, setVehicleToEdit] = useState<Vehicle | null>(null);
  const [selectedVehicleIdForDetails, setSelectedVehicleIdForDetails] = useState<string | null>(null);
  const [readOnlyVehicleIdForHistory, setReadOnlyVehicleIdForHistory] = useState<string | null>(null);
  const [vehicleForKmRecord, setVehicleForKmRecord] = useState<Vehicle | null>(null);
  const [vehicleForSale, setVehicleForSale] = useState<Vehicle | null>(null);
  const [vehicleForArchive, setVehicleForArchive] = useState<Vehicle | null>(null);

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
      v.model.toLowerCase().includes(s) ||
      v.renavam.toLowerCase().includes(s) ||
      v.chassis.toLowerCase().includes(s);
    const matchesStatus = statusFilter === 'ALL' || v.status === statusFilter;
    const matchesCategory = categoryFilter === 'ALL' || v.category === categoryFilter;
    return matchesSearch && matchesStatus && matchesCategory;
  });

  const totalCount = vehicles.length;
  const rentedCount = vehicles.filter((v) => v.status === VehicleStatus.RENTED).length;
  const availableCount = vehicles.filter((v) => v.status === VehicleStatus.AVAILABLE).length;
  const maintenanceCount = vehicles.filter((v) => v.status === VehicleStatus.MAINTENANCE).length;
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
        : 'none';

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title={showArchived ? 'Veículos Arquivados' : 'Veículos'}
        description={showArchived
          ? 'Histórico preservado da frota fora da operação, disponível somente para consulta'
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
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => setIsVehicleAiOpen(true)} className="gap-2">
            <Sparkles className="w-4 h-4" /> Cadastrar por documento com IA
          </Button>
        </div>
      )}

      {!showArchived && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl"><span className="text-xs text-slate-400 block">Total Frota</span><strong className="text-lg font-mono font-bold text-slate-900 dark:text-slate-100">{totalCount}</strong></div>
          <div className="p-3 bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/50 rounded-xl"><span className="text-xs text-emerald-600 dark:text-emerald-400 block font-semibold">Locados</span><strong className="text-lg font-mono font-bold text-emerald-700 dark:text-emerald-300">{rentedCount}</strong></div>
          <div className="p-3 bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900/50 rounded-xl"><span className="text-xs text-blue-600 dark:text-blue-400 block font-semibold">Disponíveis</span><strong className="text-lg font-mono font-bold text-blue-700 dark:text-blue-300">{availableCount}</strong></div>
          <div className="p-3 bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/50 rounded-xl"><span className="text-xs text-amber-600 dark:text-amber-400 block font-semibold">Em Manutenção</span><strong className="text-lg font-mono font-bold text-amber-700 dark:text-amber-300">{maintenanceCount}</strong></div>
          <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl"><span className="text-xs text-slate-400 block">Inativos</span><strong className="text-lg font-mono font-bold text-slate-600 dark:text-slate-400">{inactiveCount}</strong></div>
        </div>
      )}

      {showArchived && (
        <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 text-xs text-slate-600 dark:text-slate-300">
          {totalCount} veículo(s) vendido(s) ou arquivado(s). Esta área é somente leitura; o histórico não foi apagado.
        </div>
      )}

      <Card padding="sm">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="w-full md:w-96">
            <Input type="text" placeholder="Buscar por placa, modelo, marca, RENAVAM ou chassi..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} icon={<Search className="w-4 h-4 text-slate-400" />}/>
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
            <Button variant="outline" size="sm" onClick={toggleArchivedView}>{showArchived ? 'Voltar à frota ativa' : 'Ver vendidos / arquivados'}</Button>
            {!showArchived && <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0 mr-1" />}
            {!showArchived && VEHICLE_STATUS_FILTERS.map((st) => (
              <button key={st.id} onClick={() => setStatusFilter(st.id)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-500 ${statusFilter === st.id ? 'bg-blue-600 text-white font-semibold shadow-2xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>{st.label}</button>
            ))}
            <div className="w-52 shrink-0">
              <Select aria-label="Filtrar por categoria" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} options={[{ value: 'ALL', label: 'Todas as categorias' }, ...VEHICLE_CATEGORIES.map((category) => ({ value: category, label: category }))]}/>
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
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">{showArchived ? 'Veículos vendidos ou arquivados aparecem aqui somente para consulta, sem perder seus históricos.' : 'Ajuste os filtros de busca ou cadastre um novo veículo para sua frota de locação.'}</p>
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
                    <div className="flex justify-between"><span className="text-slate-400">Aluguel Semanal:</span><strong className="font-mono text-emerald-600 dark:text-emerald-400">{formatCurrencyBRL(vehicle.rentalValueBase)} / sem</strong></div>
                    <div className="flex justify-between"><span className="text-slate-400">RENAVAM:</span><span className="font-mono text-slate-700 dark:text-slate-300">{vehicle.renavam}</span></div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2 text-xs">
                  <div className="flex items-center justify-between gap-2"><span className="font-semibold text-slate-700 dark:text-slate-300">{isReadOnlyTerminal ? 'Histórico do veículo' : 'Ações do veículo'}</span><span className="text-[10px] text-slate-400">O histórico não será apagado.</span></div>

                  {isReadOnlyTerminal ? (
                    <div className="flex items-center gap-2">
                      <button onClick={() => setReadOnlyVehicleIdForHistory(vehicle.id)} className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-blue-600 dark:text-blue-400 font-semibold border rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">
                        <Eye className="w-3.5 h-3.5"/> Abrir histórico somente leitura
                      </button>
                      {!showArchived && vehicle.status === VehicleStatus.SOLD && canArchive && (
                        <button onClick={() => setVehicleForArchive(vehicle)} title="Arquivar / remover da frota" className="inline-flex items-center gap-1 px-3 py-2 text-[10px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:text-rose-300 rounded-lg border border-rose-200 dark:border-rose-900"><Archive className="w-3.5 h-3.5"/>Arquivar / remover</button>
                      )}
                    </div>
                  ) : (
                    <>
                      {manualStatusOptions.length > 0 && (
                        <Select aria-label={`Alterar status do veículo ${vehicle.plate}`} value="" onChange={(event) => { const nextStatus = event.target.value as VehicleStatus; if (nextStatus) handleStatusChangeClick(vehicle, nextStatus); }} options={[{ value: '', label: 'Alterar status...', disabled: true }, ...manualStatusOptions]}/>
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <button onClick={() => setSelectedVehicleIdForDetails(vehicle.id)} className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold hover:underline"><Eye className="w-3.5 h-3.5"/> Detalhes →</button>
                        <div className="flex items-center gap-1 flex-wrap justify-end">
                          {canPlaceOutOfUse && <button onClick={() => handleStatusChangeClick(vehicle, VehicleStatus.INACTIVE)} title="Colocar fora de uso" aria-label={`Colocar ${vehicle.plate} fora de uso`} className="px-2 py-1 text-[10px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 rounded-md">Fora de uso</button>}
                          {canMarkSold && <button onClick={() => setVehicleForSale(vehicle)} title="Marcar veículo como vendido" aria-label={`Marcar ${vehicle.plate} como vendido`} className="px-2 py-1 text-[10px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 rounded-md">Vendido</button>}
                          {canArchive && <button onClick={() => setVehicleForArchive(vehicle)} title="Arquivar / remover da frota" aria-label={`Arquivar ${vehicle.plate}`} className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:text-rose-300 rounded-md border border-rose-200 dark:border-rose-900"><Archive className="w-3 h-3"/>Arquivar / remover</button>}
                          <button onClick={() => setVehicleForKmRecord(vehicle)} title="Registrar KM" className="p-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"><Gauge className="w-4 h-4"/></button>
                          <button onClick={() => { setVehicleToEdit(vehicle); setIsFormOpen(true); }} title="Editar Veículo" className="p-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"><Edit className="w-4 h-4"/></button>
                          {isAvailable && <button onClick={() => handleStatusChangeClick(vehicle, VehicleStatus.MAINTENANCE)} title="Enviar para Manutenção" className="px-2 py-1 text-[10px] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 rounded-md">Oficina</button>}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <LazyModuleErrorBoundary resetKey={fleetModalResetKey} onRetry={()=>window.location.reload()}>
        <Suspense fallback={<div role="status" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20"><div className="rounded-xl bg-white px-4 py-3 text-sm text-slate-600 shadow-xl dark:bg-slate-900 dark:text-slate-300">Carregando dados do veículo...</div></div>}>
          {isVehicleAiOpen&&<VehicleDocumentIntakeModal isOpen onClose={() => setIsVehicleAiOpen(false)} onCreated={async (vehicleId) => { await loadVehicles(); setSelectedVehicleIdForDetails(vehicleId); }}/>}
          {isFormOpen&&<VehicleFormModal isOpen onClose={() => { setIsFormOpen(false); setVehicleToEdit(null); }} onSuccess={loadVehicles} vehicleToEdit={vehicleToEdit}/>} 
          {selectedVehicleIdForDetails&&<VehicleDetailsModal isOpen onClose={() => setSelectedVehicleIdForDetails(null)} vehicleId={selectedVehicleIdForDetails}
            onEditRequest={() => { const v = vehicles.find((x) => x.id === selectedVehicleIdForDetails); if (v) { setSelectedVehicleIdForDetails(null); setVehicleToEdit(v); setIsFormOpen(true); } }}
            onRecordKmRequest={() => { const v = vehicles.find((x) => x.id === selectedVehicleIdForDetails); if (v) { setSelectedVehicleIdForDetails(null); setVehicleForKmRecord(v); } }}
            onStatusChangeRequest={(status) => { const v = vehicles.find((x) => x.id === selectedVehicleIdForDetails); if (v) { setSelectedVehicleIdForDetails(null); handleStatusChangeClick(v,status); } }}
            onSaleRequest={() => { const v = vehicles.find((x) => x.id === selectedVehicleIdForDetails); if (v) { setSelectedVehicleIdForDetails(null); setVehicleForSale(v); } }}
            onArchiveRequest={() => { const v = vehicles.find((x) => x.id === selectedVehicleIdForDetails); if (v) { setSelectedVehicleIdForDetails(null); setVehicleForArchive(v); } }}/>} 
          {vehicleForKmRecord&&<RecordKmModal isOpen onClose={() => setVehicleForKmRecord(null)} onSuccess={loadVehicles} vehicle={vehicleForKmRecord}/>} 
        </Suspense>
      </LazyModuleErrorBoundary>

      {vehicleForSale&&<VehicleSaleModal isOpen vehicle={vehicleForSale} onClose={() => setVehicleForSale(null)} onSuccess={loadVehicles}/>} 
      {vehicleForArchive&&<VehicleArchiveModal isOpen vehicle={vehicleForArchive} onClose={() => setVehicleForArchive(null)} onSuccess={loadVehicles}/>} 
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