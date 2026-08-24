import React, { useEffect, useState } from 'react';
import { VehicleClient } from '../../api/vehicleClient';
import { Vehicle } from '../../types/entities';
import { VEHICLE_CATEGORIES, VehicleStatus } from '../../types/enums';
import {
  Car,
  Search,
  Filter,
  Plus,
  Gauge,
  Eye,
  Edit,
  Clock,
  ShieldCheck,
  User,
  AlertCircle,
  MoreVertical,
} from 'lucide-react';
import { Card, Badge, Input, Select, Button, Skeleton, ConfirmDialog, PageHeader } from '../ui';
import { VehicleFormModal } from './VehicleFormModal';
import { VehicleDetailsModal } from './VehicleDetailsModal';
import { RecordKmModal } from './RecordKmModal';
import { formatCurrencyBRL } from '../../shared/utils/currency';

export const FleetManagement: React.FC = () => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState<boolean>(true);

  // Modal States
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [vehicleToEdit, setVehicleToEdit] = useState<Vehicle | null>(null);

  const [selectedVehicleIdForDetails, setSelectedVehicleIdForDetails] = useState<string | null>(null);

  const [vehicleForKmRecord, setVehicleForKmRecord] = useState<Vehicle | null>(null);

  // Status Change Dialog
  const [vehicleForStatusChange, setVehicleForStatusChange] = useState<Vehicle | null>(null);
  const [targetStatus, setTargetStatus] = useState<VehicleStatus | null>(null);
  const [isConfirmingStatus, setIsConfirmingStatus] = useState<boolean>(false);

  useEffect(() => {
    loadVehicles();
  }, []);

  const loadVehicles = async () => {
    setLoading(true);
    try {
      const list = await VehicleClient.list();
      setVehicles(list);
    } catch (err) {
      console.error('Erro ao carregar veículos:', err);
    } finally {
      setLoading(false);
    }
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

  // Calculate Metrics
  const totalCount = vehicles.length;
  const rentedCount = vehicles.filter((v) => v.status === VehicleStatus.RENTED).length;
  const availableCount = vehicles.filter((v) => v.status === VehicleStatus.AVAILABLE).length;
  const maintenanceCount = vehicles.filter((v) => v.status === VehicleStatus.MAINTENANCE).length;
  const inactiveCount = vehicles.filter(
    (v) => v.status === VehicleStatus.INACTIVE || v.status === VehicleStatus.SOLD
  ).length;

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

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="Veículos"
        description="Cadastro, disponibilidade, odômetros, manutenções e ciclo de vida operacional da frota"
        breadcrumb="Operação • Gestão de Frota"
        primaryAction={{
          label: 'Novo Veículo',
          onClick: () => {
            setVehicleToEdit(null);
            setIsFormOpen(true);
          },
          icon: <Plus className="w-4 h-4" />
        }}
      />

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <span className="text-xs text-slate-400 block">Total Frota</span>
          <strong className="text-lg font-mono font-bold text-slate-900 dark:text-slate-100">
            {totalCount}
          </strong>
        </div>

        <div className="p-3 bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/50 rounded-xl">
          <span className="text-xs text-emerald-600 dark:text-emerald-400 block font-semibold">Locados</span>
          <strong className="text-lg font-mono font-bold text-emerald-700 dark:text-emerald-300">
            {rentedCount}
          </strong>
        </div>

        <div className="p-3 bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900/50 rounded-xl">
          <span className="text-xs text-blue-600 dark:text-blue-400 block font-semibold">Disponíveis</span>
          <strong className="text-lg font-mono font-bold text-blue-700 dark:text-blue-300">
            {availableCount}
          </strong>
        </div>

        <div className="p-3 bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/50 rounded-xl">
          <span className="text-xs text-amber-600 dark:text-amber-400 block font-semibold">Em Manutenção</span>
          <strong className="text-lg font-mono font-bold text-amber-700 dark:text-amber-300">
            {maintenanceCount}
          </strong>
        </div>

        <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <span className="text-xs text-slate-400 block">Inativos / Vendidos</span>
          <strong className="text-lg font-mono font-bold text-slate-600 dark:text-slate-400">
            {inactiveCount}
          </strong>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <Card padding="sm">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="w-full md:w-96">
            <Input
              type="text"
              placeholder="Buscar por placa, modelo, marca, RENAVAM ou chassi..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              icon={<Search className="w-4 h-4 text-slate-400" />}
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0 mr-1" />
            {[
              { id: 'ALL', label: 'Todos' },
              { id: 'AVAILABLE', label: 'Disponíveis' },
              { id: 'RENTED', label: 'Locados' },
              { id: 'MAINTENANCE', label: 'Em Manutenção' },
              { id: 'INACTIVE', label: 'Inativos' },
            ].map((st) => (
              <button
                key={st.id}
                onClick={() => setStatusFilter(st.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  statusFilter === st.id
                    ? 'bg-blue-600 text-white font-semibold shadow-2xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {st.label}
              </button>
            ))}
            <div className="w-52 shrink-0">
              <Select
                aria-label="Filtrar por categoria"
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                options={[
                  { value: 'ALL', label: 'Todas as categorias' },
                  ...VEHICLE_CATEGORIES.map((category) => ({ value: category, label: category })),
                ]}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Grid of Vehicles */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      ) : filteredVehicles.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <Car className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Nenhum veículo encontrado
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Ajuste os filtros de busca ou cadastre um novo veículo para sua frota de locação.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSearchTerm('');
              setStatusFilter('ALL');
              setCategoryFilter('ALL');
            }}
            className="mt-4"
          >
            Limpar Filtros
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredVehicles.map((vehicle) => {
            const isRented = vehicle.status === VehicleStatus.RENTED;
            const isMaintenance = vehicle.status === VehicleStatus.MAINTENANCE;
            const isAvailable = vehicle.status === VehicleStatus.AVAILABLE;

            return (
              <Card
                key={vehicle.id}
                padding="md"
                hoverEffect
                className="flex flex-col justify-between border-slate-200 dark:border-slate-800"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-black px-2.5 py-1 bg-slate-900 text-white rounded-md tracking-wider">
                      {vehicle.plate}
                    </span>
                    <Badge
                      variant={
                        isRented
                          ? 'success'
                          : isMaintenance
                          ? 'warning'
                          : isAvailable
                          ? 'info'
                          : 'default'
                      }
                    >
                      {isRented
                        ? 'Locado'
                        : isMaintenance
                        ? 'Em Manutenção'
                        : isAvailable
                        ? 'Disponível'
                        : vehicle.status}
                    </Badge>
                  </div>

                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-3">
                    {vehicle.brand} {vehicle.model}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Ano: {vehicle.yearFabrication}/{vehicle.yearModel} • Cor: {vehicle.color} • {vehicle.fuelType}
                  </p>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Quilometragem:</span>
                      <strong className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        {vehicle.currentKm.toLocaleString('pt-BR')} KM
                      </strong>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-400">Aluguel Semanal:</span>
                      <strong className="font-mono text-emerald-600 dark:text-emerald-400">
                        {formatCurrencyBRL(vehicle.rentalValueBase)} / sem
                      </strong>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-400">RENAVAM:</span>
                      <span className="font-mono text-slate-700 dark:text-slate-300">{vehicle.renavam}</span>
                    </div>
                  </div>
                </div>

                {/* Quick Action Buttons */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
                  <button
                    onClick={() => setSelectedVehicleIdForDetails(vehicle.id)}
                    className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold hover:underline"
                  >
                    <Eye className="w-3.5 h-3.5" /> Detalhes →
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setVehicleForKmRecord(vehicle)}
                      title="Registrar KM"
                      className="p-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Gauge className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => {
                        setVehicleToEdit(vehicle);
                        setIsFormOpen(true);
                      }}
                      title="Editar Veículo"
                      className="p-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Edit className="w-4 h-4" />
                    </button>

                    {isAvailable && (
                      <button
                        onClick={() => handleStatusChangeClick(vehicle, VehicleStatus.MAINTENANCE)}
                        title="Enviar para Manutenção"
                        className="px-2 py-1 text-[10px] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 rounded-md"
                      >
                        Oficina
                      </button>
                    )}

                    {isMaintenance && (
                      <button
                        onClick={() => handleStatusChangeClick(vehicle, VehicleStatus.AVAILABLE)}
                        title="Liberar da Oficina"
                        className="px-2 py-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 rounded-md"
                      >
                        Liberar
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modals */}
      <VehicleFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setVehicleToEdit(null);
        }}
        onSuccess={loadVehicles}
        vehicleToEdit={vehicleToEdit}
      />

      <VehicleDetailsModal
        isOpen={!!selectedVehicleIdForDetails}
        onClose={() => setSelectedVehicleIdForDetails(null)}
        vehicleId={selectedVehicleIdForDetails}
        onEditRequest={() => {
          const v = vehicles.find((x) => x.id === selectedVehicleIdForDetails);
          if (v) {
            setSelectedVehicleIdForDetails(null);
            setVehicleToEdit(v);
            setIsFormOpen(true);
          }
        }}
        onRecordKmRequest={() => {
          const v = vehicles.find((x) => x.id === selectedVehicleIdForDetails);
          if (v) {
            setSelectedVehicleIdForDetails(null);
            setVehicleForKmRecord(v);
          }
        }}
      />

      <RecordKmModal
        isOpen={!!vehicleForKmRecord}
        onClose={() => setVehicleForKmRecord(null)}
        onSuccess={loadVehicles}
        vehicle={vehicleForKmRecord}
      />

      <ConfirmDialog
        isOpen={isConfirmingStatus}
        onClose={() => setIsConfirmingStatus(false)}
        onConfirm={handleConfirmStatusChange}
        title="Alterar Status do Veículo"
        message={`Deseja alterar o status do veículo ${vehicleForStatusChange?.plate} para ${targetStatus}?`}
        confirmLabel="Confirmar Alteração"
        variant="warning"
        requireReason
        reasonPlaceholder="Informe a justificativa da alteração..."
      />
    </div>
  );
};
