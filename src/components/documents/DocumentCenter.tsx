import React, { useEffect, useMemo, useState } from 'react';
import { AttachmentClient } from '../../api/attachmentClient';
import { ContractClient } from '../../api/contractClient';
import { DriverClient } from '../../api/driverClient';
import { InsuranceClient } from '../../api/insuranceClient';
import { MaintenanceClient } from '../../api/maintenanceClient';
import { TrackerClient } from '../../api/trackerClient';
import { TrafficTicketClient } from '../../api/trafficTicketClient';
import { VehicleClient } from '../../api/vehicleClient';
import type { FileAttachment } from '../../types/entities/audit';
import { Search } from 'lucide-react';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { AttachmentList } from './AttachmentList';

interface DocumentCenterProps {
  focusFileName?: string;
  onFocusConsumed?: () => void;
}

type RelationMaps = {
  vehicleByAttachment: Record<string, string>;
  driverByAttachment: Record<string, string>;
  contextByAttachment: Record<string, string>;
};

const INTERNAL_ENTITY_TYPES = new Set([
  'DriverDocumentIntake',
  'VehicleDocumentIntake',
  'TrafficTicketDocumentIntake',
]);

function isUserFile(item: FileAttachment): boolean {
  return !item.isArchived
    && item.contentState === 'AVAILABLE'
    && (item.storageProvider === 'SERVER_FS' || item.storageProvider === 'R2')
    && !INTERNAL_ENTITY_TYPES.has(String(item.entityType || ''));
}

export function DocumentCenter({ focusFileName, onFocusConsumed }: DocumentCenterProps = {}) {
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [vehicles, setVehicles] = useState<Array<{ id: string; plate: string; brand: string; model: string; version?: string }>>([]);
  const [drivers, setDrivers] = useState<Array<{ id: string; fullName: string }>>([]);
  const [relations, setRelations] = useState<RelationMaps>({ vehicleByAttachment: {}, driverByAttachment: {}, contextByAttachment: {} });
  const [searchTerm, setSearchTerm] = useState('');
  const [documentTypeFilter, setDocumentTypeFilter] = useState('ALL');
  const [vehicleFilter, setVehicleFilter] = useState('ALL');
  const [driverFilter, setDriverFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [attachmentsResult, vehiclesResult, driversResult, ticketsResult, workOrdersResult, insurancesResult, trackersResult, contractsResult] =
        await Promise.allSettled([
          AttachmentClient.list(),
          VehicleClient.list(),
          DriverClient.list(),
          TrafficTicketClient.list(),
          MaintenanceClient.listWorkOrders(),
          InsuranceClient.list(),
          TrackerClient.list(),
          ContractClient.list(),
        ]);

      if (attachmentsResult.status === 'rejected') throw attachmentsResult.reason;
      const nextAttachments = attachmentsResult.value.filter(isUserFile)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setAttachments(nextAttachments);

      const nextVehicles = vehiclesResult.status === 'fulfilled' ? vehiclesResult.value : [];
      const nextDrivers = driversResult.status === 'fulfilled' ? driversResult.value : [];
      setVehicles(nextVehicles.map((item) => ({ id: item.id, plate: item.plate, brand: item.brand, model: item.model, version: item.version })));
      setDrivers(nextDrivers.map((item) => ({ id: item.id, fullName: item.fullName })));

      const ticketById = Object.fromEntries((ticketsResult.status === 'fulfilled' ? ticketsResult.value : []).map((item) => [item.id, item]));
      const workOrderById = Object.fromEntries((workOrdersResult.status === 'fulfilled' ? workOrdersResult.value : []).map((item) => [item.id, item]));
      const insuranceById = Object.fromEntries((insurancesResult.status === 'fulfilled' ? insurancesResult.value : []).map((item) => [item.id, item]));
      const trackerById = Object.fromEntries((trackersResult.status === 'fulfilled' ? trackersResult.value : []).map((item) => [item.id, item]));
      const contractById = Object.fromEntries((contractsResult.status === 'fulfilled' ? contractsResult.value : []).map((item) => [item.id, item]));
      const vehicleById = Object.fromEntries(nextVehicles.map((item) => [item.id, item]));
      const driverById = Object.fromEntries(nextDrivers.map((item) => [item.id, item]));

      const vehicleByAttachment: Record<string, string> = {};
      const driverByAttachment: Record<string, string> = {};
      const contextByAttachment: Record<string, string> = {};

      for (const attachment of nextAttachments) {
        const type = String(attachment.entityType || attachment.entityName || '');
        let vehicleId: string | undefined;
        let driverId: string | undefined;

        if (type === 'Vehicle') vehicleId = attachment.entityId;
        else if (type === 'Driver') driverId = attachment.entityId;
        else if (type === 'TrafficTicket') {
          vehicleId = ticketById[attachment.entityId]?.vehicleId;
          driverId = ticketById[attachment.entityId]?.driverId;
        } else if (type === 'MaintenanceWorkOrder') {
          vehicleId = workOrderById[attachment.entityId]?.vehicleId;
        } else if (type === 'Insurance') {
          vehicleId = insuranceById[attachment.entityId]?.vehicleId;
        } else if (type === 'Tracker') {
          vehicleId = trackerById[attachment.entityId]?.vehicleId;
        } else if (type === 'Contract') {
          vehicleId = contractById[attachment.entityId]?.vehicleId;
          driverId = contractById[attachment.entityId]?.driverId;
        }

        if (vehicleId) vehicleByAttachment[attachment.id] = vehicleId;
        if (driverId) driverByAttachment[attachment.id] = driverId;

        const vehicle = vehicleId ? vehicleById[vehicleId] : undefined;
        const driver = driverId ? driverById[driverId] : undefined;
        const vehicleLabel = vehicle ? `${vehicle.plate} — ${vehicle.brand} ${vehicle.model}` : '';
        const driverLabel = driver?.fullName || '';
        contextByAttachment[attachment.id] = [vehicleLabel, driverLabel].filter(Boolean).join(' • ');
      }

      setRelations({ vehicleByAttachment, driverByAttachment, contextByAttachment });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar a Central de Documentos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!focusFileName) return;
    setSearchTerm(focusFileName);
    setDocumentTypeFilter('ALL');
    setVehicleFilter('ALL');
    setDriverFilter('ALL');
    onFocusConsumed?.();
  }, [focusFileName, onFocusConsumed]);

  const documentTypes = useMemo(
    () => Array.from(new Set(attachments.map((item) => item.documentType).filter((value): value is string => Boolean(value)))).sort(),
    [attachments],
  );

  const vehicleOptions = useMemo(() => {
    const ids = new Set(Object.values(relations.vehicleByAttachment));
    return vehicles.filter((vehicle) => ids.has(vehicle.id))
      .sort((a, b) => a.plate.localeCompare(b.plate));
  }, [vehicles, relations.vehicleByAttachment]);

  const driverOptions = useMemo(() => {
    const ids = new Set(Object.values(relations.driverByAttachment));
    return drivers.filter((driver) => ids.has(driver.id))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [drivers, relations.driverByAttachment]);

  const filteredAttachments = useMemo(() => {
    const term = searchTerm.trim().toLocaleLowerCase('pt-BR');
    return attachments.filter((item) => {
      const context = relations.contextByAttachment[item.id] || '';
      const matchesSearch = !term || [item.fileName, item.documentType || '', context]
        .some((value) => value.toLocaleLowerCase('pt-BR').includes(term));
      const matchesType = documentTypeFilter === 'ALL' || item.documentType === documentTypeFilter;
      const matchesVehicle = vehicleFilter === 'ALL' || relations.vehicleByAttachment[item.id] === vehicleFilter;
      const matchesDriver = driverFilter === 'ALL' || relations.driverByAttachment[item.id] === driverFilter;
      return matchesSearch && matchesType && matchesVehicle && matchesDriver;
    });
  }, [attachments, relations, searchTerm, documentTypeFilter, vehicleFilter, driverFilter]);

  const filtersActive = Boolean(searchTerm.trim()) || documentTypeFilter !== 'ALL' || vehicleFilter !== 'ALL' || driverFilter !== 'ALL';
  const clearFilters = () => {
    setSearchTerm('');
    setDocumentTypeFilter('ALL');
    setVehicleFilter('ALL');
    setDriverFilter('ALL');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Central de Documentos</h1>
        <p className="mt-1 text-sm text-gray-500">Biblioteca dos arquivos salvos no ERP.</p>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <span className="text-lg font-semibold">Localizar documento</span>
          <button
            type="button"
            onClick={clearFilters}
            disabled={!filtersActive}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 enabled:hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-300"
          >
            Limpar filtros
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Arquivo</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                className="pl-9"
                placeholder="Nome do arquivo..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Tipo de documento</label>
            <Select value={documentTypeFilter} onChange={(event) => setDocumentTypeFilter(event.target.value)}>
              <option value="ALL">Todos</option>
              {documentTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Veículo</label>
            <Select value={vehicleFilter} onChange={(event) => setVehicleFilter(event.target.value)}>
              <option value="ALL">Todos</option>
              {vehicleOptions.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>{vehicle.plate} — {vehicle.brand} {vehicle.model}</option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Motorista</label>
            <Select value={driverFilter} onChange={(event) => setDriverFilter(event.target.value)}>
              <option value="ALL">Todos</option>
              {driverOptions.map((driver) => <option key={driver.id} value={driver.id}>{driver.fullName}</option>)}
            </Select>
          </div>
        </div>
      </Card>

      <Card>
        <div className="border-b p-4 text-lg font-semibold">
          Arquivos ({filteredAttachments.length}{filtersActive ? ` de ${attachments.length}` : ''})
        </div>
        <div className="p-4">
          {loading ? (
            <div className="py-10 text-center text-gray-500">Carregando documentos...</div>
          ) : error ? (
            <div className="py-10 text-center text-red-500">{error}</div>
          ) : filteredAttachments.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center dark:border-gray-700 dark:bg-gray-800/60">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Nenhum arquivo encontrado.</p>
              {filtersActive && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-3 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-white dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-900"
                >
                  Limpar filtros
                </button>
              )}
            </div>
          ) : (
            <AttachmentList
              attachments={filteredAttachments}
              onRefresh={() => void load()}
              showDocumentAiControls={false}
              showExpirationState={false}
              contextLabels={relations.contextByAttachment}
            />
          )}
        </div>
      </Card>
    </div>
  );
}
