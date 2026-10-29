import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Car,
  ChevronLeft,
  ChevronRight,
  FileCheck,
  FileText,
  Folder,
  FolderOpen,
  Plus,
  Radio,
  Receipt,
  Search,
  Shield,
  Upload,
  User,
  Video,
  Wrench,
  X,
} from 'lucide-react';
import { AttachmentClient } from '../../api/attachmentClient';
import { DocumentAiClient } from '../../api/documentAiClient';
import { ContractClient } from '../../api/contractClient';
import { DriverClient } from '../../api/driverClient';
import { InsuranceClient } from '../../api/insuranceClient';
import { MaintenanceClient } from '../../api/maintenanceClient';
import { TrackerClient } from '../../api/trackerClient';
import { TrafficTicketClient } from '../../api/trafficTicketClient';
import { VehicleClient } from '../../api/vehicleClient';
import type { FileAttachment } from '../../types/entities/audit';
import type { Contract, Driver, Insurance, Tracker, TrafficTicket, Vehicle, WorkOrder } from '../../types/entities';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { ModalContainer } from '../ui/ModalContainer';
import { AttachmentList } from './AttachmentList';
import { FileUpload } from './FileUpload';
import { DocumentAlertSettingsForm } from './DocumentAlertSettingsForm';
import { documentTypeLabel } from '../../shared/utils/documentTypeLabel';
import { formatCurrencyBRL } from '../../shared/utils/currency';
import {
  VEHICLE_DOCUMENT_FOLDERS,
  groupAttachmentsIntoVehicleFolders,
  type VehicleDocumentFolderDef,
} from '../fleet/vehicleDocumentFolderDefinitions';

export type DocumentCenterPerspective = 'ALL' | 'VEHICLE' | 'DRIVER' | 'CONTRACT';

export interface DocumentCenterProps {
  focusFileName?: string;
  onFocusConsumed?: () => void;
  initialPerspective?: DocumentCenterPerspective;
  initialEntityId?: string;
  isModal?: boolean;
  onClose?: () => void;
}

type RelationMaps = {
  vehicleByAttachment: Record<string, string>;
  driverByAttachment: Record<string, string>;
  contractByAttachment: Record<string, string>;
  contextByAttachment: Record<string, string>;
};

const INTERNAL_ENTITY_TYPES = new Set([
  'DriverDocumentIntake',
  'VehicleDocumentIntake',
  'TrafficTicketDocumentIntake',
]);

function isUserFile(item: FileAttachment): boolean {
  return (
    !item.isArchived &&
    (item.contentState === 'AVAILABLE' || item.contentState === 'MISSING') &&
    (item.storageProvider === 'SERVER_FS' || item.storageProvider === 'R2') &&
    !INTERNAL_ENTITY_TYPES.has(String(item.entityType || ''))
  );
}

const FOLDER_ICONS: Record<string, React.ElementType> = {
  crlv: FileCheck,
  vistoria: FileText,
  vistoria_cautelar: Shield,
  checklist: Video,
  nf_entrada: Receipt,
  nf_saida: Receipt,
  atpv: FileCheck,
  rastreador: Radio,
  apolice_seguro: Shield,
  nf_pecas: Wrench,
  nf_servico: Wrench,
  outros: Folder,
};

export function DocumentCenter({
  focusFileName,
  onFocusConsumed,
  initialPerspective = 'ALL',
  initialEntityId = '',
  isModal = false,
  onClose,
}: DocumentCenterProps = {}) {
  const [perspective, setPerspective] = useState<DocumentCenterPerspective>(initialPerspective);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(
    initialPerspective === 'VEHICLE' ? initialEntityId : ''
  );
  const [selectedDriverId, setSelectedDriverId] = useState<string>(
    initialPerspective === 'DRIVER' ? initialEntityId : ''
  );
  const [selectedContractId, setSelectedContractId] = useState<string>(
    initialPerspective === 'CONTRACT' ? initialEntityId : ''
  );

  const [activeFolderKey, setActiveFolderKey] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [documentTypeFilter, setDocumentTypeFilter] = useState('ALL');
  const [vehicleFilter, setVehicleFilter] = useState('ALL');
  const [driverFilter, setDriverFilter] = useState('ALL');

  // Pagination state (requirement: true pagination)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 10;

  // Contextual upload modal
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadDocType, setUploadDocType] = useState('OUTROS');

  // Data states
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [serverTotal, setServerTotal] = useState<number>(0);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [tickets, setTickets] = useState<TrafficTicket[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [insurances, setInsurances] = useState<Insurance[]>([]);
  const [trackers, setTrackers] = useState<Tracker[]>([]);
  const [relations, setRelations] = useState<RelationMaps>({
    vehicleByAttachment: {},
    driverByAttachment: {},
    contractByAttachment: {},
    contextByAttachment: {},
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Technical AI status remains internal to the ERP and is intentionally not rendered in this user-facing library.
      void DocumentAiClient.attachmentStatuses().catch(() => undefined);

      // Justificativa arquitetural (PH-060 / AUTOERP-85):
      // As listas de entidades relacionais (Veículos, Motoristas, Contratos, Ordens, Multas, Seguros e Rastreadores)
      // são mantidas como catálogos leves de metadados para popular os selects de filtro das 3 óticas e
      // resolver os rótulos de contexto (placa, modelo, motorista) dos anexos paginados.
      const [
        attachmentsPagedResult,
        vehiclesResult,
        driversResult,
        contractsResult,
        ticketsResult,
        workOrdersResult,
        insurancesResult,
        trackersResult,
      ] = await Promise.allSettled([
        AttachmentClient.listPaged({
          entityType: perspective === 'VEHICLE' && selectedVehicleId ? 'Vehicle' : perspective === 'DRIVER' && selectedDriverId ? 'Driver' : perspective === 'CONTRACT' && selectedContractId ? 'Contract' : undefined,
          entityId: perspective === 'VEHICLE' && selectedVehicleId ? selectedVehicleId : perspective === 'DRIVER' && selectedDriverId ? selectedDriverId : perspective === 'CONTRACT' && selectedContractId ? selectedContractId : undefined,
          limit: pageSize,
          offset: (currentPage - 1) * pageSize,
        }),
        VehicleClient.list(),
        DriverClient.list(),
        ContractClient.list(),
        TrafficTicketClient.list(),
        MaintenanceClient.listWorkOrders(),
        InsuranceClient.list(),
        TrackerClient.list(),
      ]);

      if (attachmentsPagedResult.status === 'rejected') throw attachmentsPagedResult.reason;
      const rawAttachments = attachmentsPagedResult.value.items.filter(isUserFile);
      setAttachments(rawAttachments);
      setServerTotal(attachmentsPagedResult.value.total);

      const loadedVehicles = vehiclesResult.status === 'fulfilled' ? vehiclesResult.value : [];
      const loadedDrivers = driversResult.status === 'fulfilled' ? driversResult.value : [];
      const loadedContracts = contractsResult.status === 'fulfilled' ? contractsResult.value : [];
      const loadedTickets = ticketsResult.status === 'fulfilled' ? ticketsResult.value : [];
      const loadedWorkOrders = workOrdersResult.status === 'fulfilled' ? workOrdersResult.value : [];
      const loadedInsurances = insurancesResult.status === 'fulfilled' ? insurancesResult.value : [];
      const loadedTrackers = trackersResult.status === 'fulfilled' ? trackersResult.value : [];

      setVehicles(loadedVehicles);
      setDrivers(loadedDrivers);
      setContracts(loadedContracts);
      setTickets(loadedTickets);
      setWorkOrders(loadedWorkOrders);
      setInsurances(loadedInsurances);
      setTrackers(loadedTrackers);

      // Default selected entities if not provided
      if (!selectedVehicleId && loadedVehicles.length > 0) {
        setSelectedVehicleId(loadedVehicles[0].id);
      }
      if (!selectedDriverId && loadedDrivers.length > 0) {
        setSelectedDriverId(loadedDrivers[0].id);
      }
      if (!selectedContractId && loadedContracts.length > 0) {
        setSelectedContractId(loadedContracts[0].id);
      }

      // Map relational graph
      const ticketById = Object.fromEntries(loadedTickets.map((item) => [item.id, item]));
      const workOrderById = Object.fromEntries(loadedWorkOrders.map((item) => [item.id, item]));
      const insuranceById = Object.fromEntries(loadedInsurances.map((item) => [item.id, item]));
      const trackerById = Object.fromEntries(loadedTrackers.map((item) => [item.id, item]));
      const contractById = Object.fromEntries(loadedContracts.map((item) => [item.id, item]));
      const vehicleById = Object.fromEntries(loadedVehicles.map((item) => [item.id, item]));
      const driverById = Object.fromEntries(loadedDrivers.map((item) => [item.id, item]));

      const vehicleByAttachment: Record<string, string> = {};
      const driverByAttachment: Record<string, string> = {};
      const contractByAttachment: Record<string, string> = {};
      const contextByAttachment: Record<string, string> = {};

      for (const attachment of rawAttachments) {
        const type = String(attachment.entityType || attachment.entityName || '');
        let vehicleId: string | undefined;
        let driverId: string | undefined;
        let contractId: string | undefined;

        if (type === 'Vehicle') {
          vehicleId = attachment.entityId;
        } else if (type === 'Driver') {
          driverId = attachment.entityId;
        } else if (type === 'Contract') {
          contractId = attachment.entityId;
          const ctr = contractById[attachment.entityId];
          if (ctr) {
            vehicleId = ctr.vehicleId;
            driverId = ctr.driverId;
          }
        } else if (type === 'TrafficTicket') {
          vehicleId = ticketById[attachment.entityId]?.vehicleId;
          driverId = ticketById[attachment.entityId]?.driverId;
        } else if (type === 'MaintenanceWorkOrder') {
          vehicleId = workOrderById[attachment.entityId]?.vehicleId;
        } else if (type === 'Insurance') {
          vehicleId = insuranceById[attachment.entityId]?.vehicleId;
        } else if (type === 'Tracker') {
          vehicleId = trackerById[attachment.entityId]?.vehicleId;
        }

        if (vehicleId) vehicleByAttachment[attachment.id] = vehicleId;
        if (driverId) driverByAttachment[attachment.id] = driverId;
        if (contractId) contractByAttachment[attachment.id] = contractId;

        const vehicle = vehicleId ? vehicleById[vehicleId] : undefined;
        const driver = driverId ? driverById[driverId] : undefined;
        const vehicleLabel = vehicle ? `${vehicle.plate} — ${vehicle.brand} ${vehicle.model}` : '';
        const driverLabel = driver?.fullName || '';
        contextByAttachment[attachment.id] = [vehicleLabel, driverLabel].filter(Boolean).join(' • ');
      }

      setRelations({ vehicleByAttachment, driverByAttachment, contractByAttachment, contextByAttachment });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar a Central de Documentos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!focusFileName) return;
    setSearchTerm(focusFileName);
    setPerspective('ALL');
    setDocumentTypeFilter('ALL');
    setVehicleFilter('ALL');
    setDriverFilter('ALL');
    onFocusConsumed?.();
  }, [focusFileName, onFocusConsumed]);

  // Reset pagination on filter or perspective changes
  useEffect(() => {
    setCurrentPage(1);
  }, [perspective, selectedVehicleId, selectedDriverId, selectedContractId, activeFolderKey, searchTerm, documentTypeFilter, vehicleFilter, driverFilter]);

  // Fetch new page on pagination change from server
  useEffect(() => {
    let active = true;
    const fetchPage = async () => {
      try {
        const entityType = perspective === 'VEHICLE' && selectedVehicleId ? 'Vehicle' : perspective === 'DRIVER' && selectedDriverId ? 'Driver' : perspective === 'CONTRACT' && selectedContractId ? 'Contract' : undefined;
        const entityId = perspective === 'VEHICLE' && selectedVehicleId ? selectedVehicleId : perspective === 'DRIVER' && selectedDriverId ? selectedDriverId : perspective === 'CONTRACT' && selectedContractId ? selectedContractId : undefined;
        const res = await AttachmentClient.listPaged({
          entityType,
          entityId,
          limit: pageSize,
          offset: (currentPage - 1) * pageSize,
        });
        if (!active) return;
        setAttachments(res.items.filter(isUserFile));
        setServerTotal(res.total);
      } catch (err: unknown) {
        // Silently preserve previous items or handle
      }
    };
    void fetchPage();
    return () => { active = false; };
  }, [currentPage, pageSize, perspective, selectedVehicleId, selectedDriverId, selectedContractId]);

  // Active entities in focus
  const currentVehicle = useMemo(
    () => vehicles.find((v) => v.id === selectedVehicleId),
    [vehicles, selectedVehicleId]
  );
  const currentDriver = useMemo(
    () => drivers.find((d) => d.id === selectedDriverId),
    [drivers, selectedDriverId]
  );
  const currentContract = useMemo(
    () => contracts.find((c) => c.id === selectedContractId),
    [contracts, selectedContractId]
  );

  // Contracts related to current vehicle (exact same contract.id, graph relation)
  const vehicleContracts = useMemo(() => {
    if (!selectedVehicleId) return [];
    return contracts.filter((c) => c.vehicleId === selectedVehicleId);
  }, [contracts, selectedVehicleId]);

  // Contracts related to current driver (exact same contract.id, graph relation)
  const driverContracts = useMemo(() => {
    if (!selectedDriverId) return [];
    return contracts.filter((c) => c.driverId === selectedDriverId);
  }, [contracts, selectedDriverId]);

  // Vehicle attachments grouped into folders
  const currentVehicleAttachments = useMemo(() => {
    if (!selectedVehicleId) return [];
    return attachments.filter((att) => relations.vehicleByAttachment[att.id] === selectedVehicleId);
  }, [attachments, relations.vehicleByAttachment, selectedVehicleId]);

  const vehicleGroupedFolders = useMemo(() => {
    return groupAttachmentsIntoVehicleFolders(currentVehicleAttachments);
  }, [currentVehicleAttachments]);

  // Checking missing mandatory documents for vehicle: CRLV
  const vehicleHasCrlv = useMemo(() => {
    const crlvFolder = vehicleGroupedFolders['crlv'];
    return Boolean(crlvFolder && crlvFolder.items.length > 0);
  }, [vehicleGroupedFolders]);

  // Driver attachments
  const currentDriverAttachments = useMemo(() => {
    if (!selectedDriverId) return [];
    return attachments.filter((att) => relations.driverByAttachment[att.id] === selectedDriverId);
  }, [attachments, relations.driverByAttachment, selectedDriverId]);

  // Checking missing mandatory documents for driver: CNH
  const driverHasCnh = useMemo(() => {
    return currentDriverAttachments.some(
      (item) => String(item.documentType || '').trim().toUpperCase() === 'CNH' || item.fileName.toLowerCase().includes('cnh')
    );
  }, [currentDriverAttachments]);

  // Contract attachments
  const currentContractAttachments = useMemo(() => {
    if (!selectedContractId) return [];
    return attachments.filter((att) => att.entityId === selectedContractId || relations.contractByAttachment[att.id] === selectedContractId);
  }, [attachments, relations.contractByAttachment, selectedContractId]);

  // Active contract related documents (from vehicle and driver)
  const contractLinkedVehicleDocs = useMemo(() => {
    if (!currentContract?.vehicleId) return [];
    return attachments.filter((att) => relations.vehicleByAttachment[att.id] === currentContract.vehicleId);
  }, [attachments, relations.vehicleByAttachment, currentContract?.vehicleId]);

  const contractLinkedDriverDocs = useMemo(() => {
    if (!currentContract?.driverId) return [];
    return attachments.filter((att) => relations.driverByAttachment[att.id] === currentContract.driverId);
  }, [attachments, relations.driverByAttachment, currentContract?.driverId]);

  // Filter items according to active perspective
  const perspectiveFilteredAttachments = useMemo(() => {
    let pool: FileAttachment[] = [];

    if (perspective === 'ALL') {
      pool = attachments;
    } else if (perspective === 'VEHICLE') {
      if (activeFolderKey === 'ALL') {
        pool = currentVehicleAttachments;
      } else {
        const folder = vehicleGroupedFolders[activeFolderKey];
        pool = folder ? folder.items : [];
      }
    } else if (perspective === 'DRIVER') {
      pool = currentDriverAttachments;
    } else if (perspective === 'CONTRACT') {
      pool = currentContractAttachments;
    }

    const term = searchTerm.trim().toLocaleLowerCase('pt-BR');

    return pool.filter((item) => {
      const context = relations.contextByAttachment[item.id] || '';
      const matchesSearch =
        !term ||
        [
          item.fileName,
          item.documentType || '',
          context,
          // Support search by vehicle plate, driver name, CPF, or contract number
          ...vehicles.filter((v) => relations.vehicleByAttachment[item.id] === v.id).map((v) => `${v.plate} ${v.brand} ${v.model}`),
          ...drivers.filter((d) => relations.driverByAttachment[item.id] === d.id).map((d) => `${d.fullName} ${d.cpf}`),
          ...contracts.filter((c) => relations.contractByAttachment[item.id] === c.id || c.id === item.entityId).map((c) => c.contractNumber || c.id),
        ].some((value) => value.toLocaleLowerCase('pt-BR').includes(term));

      const matchesType = documentTypeFilter === 'ALL' || item.documentType === documentTypeFilter;
      const matchesVehicle = vehicleFilter === 'ALL' || relations.vehicleByAttachment[item.id] === vehicleFilter;
      const matchesDriver = driverFilter === 'ALL' || relations.driverByAttachment[item.id] === driverFilter;

      return matchesSearch && matchesType && matchesVehicle && matchesDriver;
    });
  }, [
    perspective,
    attachments,
    currentVehicleAttachments,
    vehicleGroupedFolders,
    activeFolderKey,
    currentDriverAttachments,
    currentContractAttachments,
    searchTerm,
    documentTypeFilter,
    vehicleFilter,
    driverFilter,
    relations,
    vehicles,
    drivers,
    contracts,
  ]);

  // Server-Side Pagination: the server delivers only the current page (limit/offset)
  const totalCount = serverTotal > 0 ? serverTotal : perspectiveFilteredAttachments.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + perspectiveFilteredAttachments.length, totalCount);
  const paginatedAttachments = perspectiveFilteredAttachments;

  // Upload handler pre-configured for current perspective
  const handleOpenUpload = (suggestedType = 'OUTROS') => {
    setUploadDocType(suggestedType);
    setUploadModalOpen(true);
  };

  const getUploadEntityConfig = () => {
    if (perspective === 'VEHICLE' && selectedVehicleId) {
      return { entityType: 'Vehicle', entityId: selectedVehicleId, label: currentVehicle?.plate || 'Veículo' };
    }
    if (perspective === 'DRIVER' && selectedDriverId) {
      return { entityType: 'Driver', entityId: selectedDriverId, label: currentDriver?.fullName || 'Motorista' };
    }
    if (perspective === 'CONTRACT' && selectedContractId) {
      return { entityType: 'Contract', entityId: selectedContractId, label: currentContract?.contractNumber || 'Contrato' };
    }
    return { entityType: 'Vehicle', entityId: selectedVehicleId || '', label: 'Geral' };
  };

  const uploadTarget = getUploadEntityConfig();

  return (
    <div className="space-y-6">
      {/* 1. Header & Perspective Tabs */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-graphite-900 dark:text-white">Central de Documentos</h1>
          <p className="text-xs text-graphite-500">
            Três óticas sobre o grafo relacional da frota — veículo, motorista e contrato sem duplicar arquivos.
          </p>
        </div>

        {/* Perspective Selector Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-graphite-100 dark:bg-graphite-800 border border-graphite-200 dark:border-graphite-700">
          <button
            type="button"
            onClick={() => { setPerspective('ALL'); setActiveFolderKey('ALL'); }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              perspective === 'ALL'
                ? 'bg-white dark:bg-graphite-900 text-graphite-900 dark:text-graphite-100 shadow-sm'
                : 'text-graphite-600 dark:text-graphite-400 hover:text-graphite-900'
            }`}
          >
            Todos os Documentos
          </button>
          <button
            type="button"
            id="tab-perspective-vehicle"
            onClick={() => { setPerspective('VEHICLE'); setActiveFolderKey('ALL'); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              perspective === 'VEHICLE'
                ? 'bg-action-primary text-white shadow-sm'
                : 'text-graphite-600 dark:text-graphite-400 hover:text-graphite-900'
            }`}
          >
            <Car className="w-3.5 h-3.5" />
            Ótica do Veículo
          </button>
          <button
            type="button"
            id="tab-perspective-driver"
            onClick={() => { setPerspective('DRIVER'); setActiveFolderKey('ALL'); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              perspective === 'DRIVER'
                ? 'bg-action-primary text-white shadow-sm'
                : 'text-graphite-600 dark:text-graphite-400 hover:text-graphite-900'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            Ótica do Motorista
          </button>
          <button
            type="button"
            id="tab-perspective-contract"
            onClick={() => { setPerspective('CONTRACT'); setActiveFolderKey('ALL'); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              perspective === 'CONTRACT'
                ? 'bg-action-primary text-white shadow-sm'
                : 'text-graphite-600 dark:text-graphite-400 hover:text-graphite-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Ótica do Contrato
          </button>
        </div>
      </div>

      {/* 2. Perspective Context Bar */}
      {perspective === 'VEHICLE' && (
        <Card className="p-4 space-y-4 border-action-primary/30 bg-action-primary/[0.02]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-action-primary/10 text-action-primary">
                <Car className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-action-primary">Ótica do Veículo</span>
                <div className="flex items-center gap-2">
                  <Select
                    value={selectedVehicleId}
                    onChange={(e) => setSelectedVehicleId(e.target.value)}
                    className="font-bold text-sm"
                  >
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.plate} — {v.brand} {v.model} ({v.yearModel || v.yearFabrication})
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </div>

            <Button size="sm" variant="primary" onClick={() => handleOpenUpload('CRLV')}>
              <Plus className="w-4 h-4 mr-1" /> Anexar ao Veículo
            </Button>
          </div>

          {/* Missing CRLV Alert (Mandatory: Must shout, not stay silent!) */}
          {!vehicleHasCrlv && (
            <div
              id="crlv-missing-alert"
              className="p-3.5 rounded-xl border border-error-border bg-error-bg text-error-text flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
            >
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-5 h-5 shrink-0 text-error-icon" />
                <div>
                  <strong className="block text-sm">CRLV Faltante: Este veículo ainda não possui documento CRLV anexado!</strong>
                  <span className="text-xs opacity-90">O veículo não pode circular nem ter contrato ativado sem CRLV vigente.</span>
                </div>
              </div>
              <Button size="sm" variant="danger" onClick={() => handleOpenUpload('CRLV')}>
                <Upload className="w-3.5 h-3.5 mr-1" /> Anexar CRLV Agora
              </Button>
            </div>
          )}

          {/* Folders (11 Canonical categories from PH-055) */}
          <div>
            <span className="text-xs font-bold text-graphite-600 dark:text-graphite-400 block mb-2">
              Pastas de Documentos do Veículo (11 Tipos Canônicos)
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setActiveFolderKey('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  activeFolderKey === 'ALL'
                    ? 'bg-graphite-900 text-white dark:bg-white dark:text-graphite-900 border-transparent'
                    : 'bg-white dark:bg-graphite-800 text-graphite-700 dark:text-graphite-300 border-graphite-200 dark:border-graphite-700'
                }`}
              >
                Todas ({currentVehicleAttachments.length})
              </button>
              {VEHICLE_DOCUMENT_FOLDERS.map((folder) => {
                const count = vehicleGroupedFolders[folder.key]?.items.length || 0;
                const Icon = FOLDER_ICONS[folder.key] || Folder;
                return (
                  <button
                    key={folder.key}
                    type="button"
                    onClick={() => setActiveFolderKey(folder.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      activeFolderKey === folder.key
                        ? 'bg-action-primary text-white border-transparent'
                        : count > 0
                        ? 'bg-white dark:bg-graphite-800 text-graphite-800 dark:text-graphite-200 border-graphite-200 dark:border-graphite-700'
                        : 'bg-graphite-50 dark:bg-graphite-900 text-graphite-400 border-dashed border-graphite-200 dark:border-graphite-800'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{folder.shortLabel}</span>
                    <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-graphite-200/50 dark:bg-graphite-700/50">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Relational Contracts of Vehicle (Zero Duplication, canonical contract.id) */}
          <div className="pt-3 border-t border-graphite-200 dark:border-graphite-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-graphite-600 dark:text-graphite-400">
                Contratos deste Veículo (Grafo Relacional)
              </span>
              <span className="text-[11px] text-graphite-500 font-mono">
                {vehicleContracts.length} contrato(s) registrado(s)
              </span>
            </div>

            {vehicleContracts.length === 0 ? (
              <p className="text-xs text-graphite-400 italic">Nenhum contrato vinculado a este veículo.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {vehicleContracts.map((contract) => {
                  const isActive = contract.status === 'ACTIVE';
                  const driver = drivers.find((d) => d.id === contract.driverId);
                  return (
                    <div
                      key={contract.id}
                      data-contract-id={contract.id}
                      className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                        isActive
                          ? 'border-success-border bg-success-bg/40 dark:bg-success-bg/10'
                          : 'border-graphite-200 bg-white dark:border-graphite-800 dark:bg-graphite-900'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <strong className="font-mono text-sm">#{contract.contractNumber || contract.id.slice(0, 8)}</strong>
                          <Badge variant={isActive ? 'success' : 'neutral'}>
                            {isActive ? 'Contrato Ativo' : contract.status}
                          </Badge>
                        </div>
                        <span className="font-mono font-bold text-success-text">
                          {formatCurrencyBRL(Number(contract.rentalAmount || 0))}
                        </span>
                      </div>
                      <p className="text-graphite-600 dark:text-graphite-300">
                        Motorista: <strong>{driver?.fullName || contract.driverId}</strong>
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-graphite-400">
                        <span>Início: {contract.startDate} {contract.endDate && `• Término: ${contract.endDate}`}</span>
                        <span className="font-mono">ID: {contract.id}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      )}

      {perspective === 'DRIVER' && (
        <Card className="p-4 space-y-4 border-action-primary/30 bg-action-primary/[0.02]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-action-primary/10 text-action-primary">
                <User className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-action-primary">Ótica do Motorista</span>
                <div className="flex items-center gap-2">
                  <Select
                    value={selectedDriverId}
                    onChange={(e) => setSelectedDriverId(e.target.value)}
                    className="font-bold text-sm"
                  >
                    {drivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.fullName} — CPF {d.cpf}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </div>

            <Button size="sm" variant="primary" onClick={() => handleOpenUpload('CNH')}>
              <Plus className="w-4 h-4 mr-1" /> Anexar ao Motorista
            </Button>
          </div>

          {/* Missing CNH Alert */}
          {!driverHasCnh && (
            <div
              id="cnh-missing-alert"
              className="p-3.5 rounded-xl border border-warning-border bg-warning-bg text-warning-text flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
            >
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-5 h-5 shrink-0 text-warning-icon" />
                <div>
                  <strong className="block text-sm">CNH Faltante: Este motorista não possui CNH anexada!</strong>
                  <span className="text-xs opacity-90">Anexe ou envie o link seguro de intake complementar para regularização.</span>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => handleOpenUpload('CNH')}>
                <Upload className="w-3.5 h-3.5 mr-1" /> Anexar CNH
              </Button>
            </div>
          )}

          {/* Relational Contracts of Driver (Exact same contract.id) */}
          <div className="pt-3 border-t border-graphite-200 dark:border-graphite-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-graphite-600 dark:text-graphite-400">
                Contratos deste Motorista (Grafo Relacional)
              </span>
              <span className="text-[11px] text-graphite-500 font-mono">
                {driverContracts.length} contrato(s) registrado(s)
              </span>
            </div>

            {driverContracts.length === 0 ? (
              <p className="text-xs text-graphite-400 italic">Nenhum contrato vinculado a este motorista.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {driverContracts.map((contract) => {
                  const isActive = contract.status === 'ACTIVE';
                  const vehicle = vehicles.find((v) => v.id === contract.vehicleId);
                  return (
                    <div
                      key={contract.id}
                      data-contract-id={contract.id}
                      className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                        isActive
                          ? 'border-success-border bg-success-bg/40 dark:bg-success-bg/10'
                          : 'border-graphite-200 bg-white dark:border-graphite-800 dark:bg-graphite-900'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <strong className="font-mono text-sm">#{contract.contractNumber || contract.id.slice(0, 8)}</strong>
                          <Badge variant={isActive ? 'success' : 'neutral'}>
                            {isActive ? 'Contrato Ativo' : contract.status}
                          </Badge>
                        </div>
                        <span className="font-mono font-bold text-success-text">
                          {formatCurrencyBRL(Number(contract.rentalAmount || 0))}
                        </span>
                      </div>
                      <p className="text-graphite-600 dark:text-graphite-300">
                        Veículo: <strong>{vehicle ? `${vehicle.plate} — ${vehicle.brand} ${vehicle.model}` : contract.vehicleId}</strong>
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-graphite-400">
                        <span>Início: {contract.startDate} {contract.endDate && `• Término: ${contract.endDate}`}</span>
                        <span className="font-mono">ID: {contract.id}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      )}

      {perspective === 'CONTRACT' && (
        <Card className="p-4 space-y-4 border-action-primary/30 bg-action-primary/[0.02]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-action-primary/10 text-action-primary">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-action-primary">Ótica do Contrato</span>
                <div className="flex items-center gap-2">
                  <Select
                    value={selectedContractId}
                    onChange={(e) => setSelectedContractId(e.target.value)}
                    className="font-bold text-sm font-mono"
                  >
                    {contracts.map((c) => (
                      <option key={c.id} value={c.id}>
                        Contrato #{c.contractNumber || c.id.slice(0, 8)} — {c.status}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </div>

            <Button size="sm" variant="primary" onClick={() => handleOpenUpload('CONTRATO')}>
              <Plus className="w-4 h-4 mr-1" /> Anexar ao Contrato
            </Button>
          </div>

          {currentContract && (
            <div data-contract-id={currentContract.id} className="p-3 bg-white dark:bg-graphite-900 rounded-xl border border-graphite-200 dark:border-graphite-800 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-graphite-400 block">Veículo Vinculado</span>
                <strong>{vehicles.find((v) => v.id === currentContract.vehicleId)?.plate || 'Não vinculado'}</strong>
              </div>
              <div>
                <span className="text-graphite-400 block">Motorista Vinculado</span>
                <strong>{drivers.find((d) => d.id === currentContract.driverId)?.fullName || 'Não vinculado'}</strong>
              </div>
              <div>
                <span className="text-graphite-400 block">Aluguel Semanal</span>
                <strong className="font-mono text-success-text">{formatCurrencyBRL(Number(currentContract.rentalAmount || 0))}</strong>
              </div>
            </div>
          )}

          {/* Relational Cross-Documents: Vigentes na época do contrato */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            <div className="p-3 border rounded-xl bg-graphite-50 dark:bg-graphite-900/50 space-y-2 text-xs">
              <span className="font-bold text-graphite-700 dark:text-graphite-300 flex items-center gap-1.5">
                <Car className="w-4 h-4 text-action-primary" /> Documentos do Veículo Vinculado
              </span>
              {contractLinkedVehicleDocs.length === 0 ? (
                <p className="text-graphite-400 italic text-[11px]">Nenhum documento do veículo disponível.</p>
              ) : (
                <div className="space-y-1">
                  {contractLinkedVehicleDocs.slice(0, 3).map((d) => (
                    <div key={d.id} className="flex justify-between text-[11px] p-1.5 bg-white dark:bg-graphite-800 rounded border">
                      <span className="truncate max-w-[200px]">{d.fileName}</span>
                      <Badge variant="neutral">{d.documentType || 'DOC'}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-3 border rounded-xl bg-graphite-50 dark:bg-graphite-900/50 space-y-2 text-xs">
              <span className="font-bold text-graphite-700 dark:text-graphite-300 flex items-center gap-1.5">
                <User className="w-4 h-4 text-action-primary" /> Documentos do Motorista Vinculado
              </span>
              {contractLinkedDriverDocs.length === 0 ? (
                <p className="text-graphite-400 italic text-[11px]">Nenhum documento do motorista disponível.</p>
              ) : (
                <div className="space-y-1">
                  {contractLinkedDriverDocs.slice(0, 3).map((d) => (
                    <div key={d.id} className="flex justify-between text-[11px] p-1.5 bg-white dark:bg-graphite-800 rounded border">
                      <span className="truncate max-w-[200px]">{d.fileName}</span>
                      <Badge variant="neutral">{d.documentType || 'DOC'}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* 3. Search Bar and Global Filters */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite-400" />
            <Input
              className="pl-9 text-xs"
              placeholder="Buscar por nome do arquivo, tipo, placa, motorista, CPF ou nº de contrato..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {perspective === 'ALL' && (
            <div className="flex flex-wrap gap-2">
              <Select
                value={vehicleFilter}
                onChange={(e) => setVehicleFilter(e.target.value)}
                className="text-xs min-w-[140px]"
              >
                <option value="ALL">Todos os Veículos</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.plate} — {v.brand} {v.model}
                  </option>
                ))}
              </Select>

              <Select
                value={driverFilter}
                onChange={(e) => setDriverFilter(e.target.value)}
                className="text-xs min-w-[140px]"
              >
                <option value="ALL">Todos os Motoristas</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.fullName}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {searchTerm && (
            <Button size="sm" variant="outline" onClick={() => setSearchTerm('')}>
              <X className="w-3.5 h-3.5 mr-1" /> Limpar
            </Button>
          )}
        </div>
      </Card>

      {/* 4. Document Files List with True Pagination */}
      <Card>
        <div className="flex flex-wrap items-center justify-between border-b p-4 text-sm font-semibold">
          <div className="flex items-center gap-2">
            <span>Arquivos Encontrados</span>
            <Badge variant="neutral">
              {totalCount} registro(s)
            </Badge>
          </div>

          <div className="text-xs text-graphite-500 font-normal">
            Página <strong>{currentPage}</strong> de <strong>{totalPages}</strong>
          </div>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="py-10 text-center text-graphite-500">Carregando documentos...</div>
          ) : error ? (
            <div className="py-10 text-center text-error-icon">{error}</div>
          ) : perspectiveFilteredAttachments.length === 0 ? (
            <div className="rounded-lg border border-dashed border-graphite-300 bg-graphite-50 p-8 text-center dark:border-graphite-700 dark:bg-graphite-800/60">
              <p className="text-sm font-medium text-graphite-700 dark:text-graphite-200">
                Nenhum documento encontrado para este filtro ou ótica.
              </p>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => handleOpenUpload()}>
                <Upload className="w-3.5 h-3.5 mr-1.5" /> Anexar Primeiro Documento
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <AttachmentList
                attachments={paginatedAttachments}
                onRefresh={() => void loadData()}
                showDocumentAiControls={false}
                showExpirationState
                contextLabels={relations.contextByAttachment}
              />

              {/* Real Pagination Controls */}
              {totalPages > 1 && (
                <div
                  id="document-center-pagination"
                  className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-graphite-200 dark:border-graphite-800 text-xs text-graphite-600 dark:text-graphite-300"
                >
                  <div>
                    Mostrando <strong>{startIndex + 1}</strong> a <strong>{endIndex}</strong> de <strong>{totalCount}</strong> arquivos
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
                    </Button>
                    <span className="px-2">
                      {currentPage} / {totalPages}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Próxima <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* 5. Contextual Upload Modal */}
      {uploadModalOpen && (
        <ModalContainer
          isOpen={uploadModalOpen}
          onClose={() => setUploadModalOpen(false)}
          title={`Anexar Documento — ${uploadTarget.label}`}
          maxWidth="max-w-md"
        >
          <div className="space-y-4">
            <div className="p-3 bg-graphite-50 dark:bg-graphite-900 rounded-lg text-xs space-y-1">
              <p>
                <strong>Vínculo Automático:</strong> {uploadTarget.entityType} ({uploadTarget.label})
              </p>
              <p className="text-graphite-500">O arquivo será gravado diretamente no storage e vinculado sem duplicidade.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-graphite-600 dark:text-graphite-400 mb-1">
                Tipo do Documento *
              </label>
              <Select value={uploadDocType} onChange={(e) => setUploadDocType(e.target.value)}>
                {VEHICLE_DOCUMENT_FOLDERS.map((f) => (
                  <option key={f.canonicalDocType} value={f.canonicalDocType}>
                    {f.name} ({f.canonicalDocType})
                  </option>
                ))}
              </Select>
            </div>

            <FileUpload
              entityType={uploadTarget.entityType}
              entityId={uploadTarget.entityId}
              documentType={uploadDocType}
              onUploadComplete={() => {
                setUploadModalOpen(false);
                void loadData();
              }}
              multiple={true}
            />

            <div className="flex justify-end pt-2 border-t">
              <Button variant="outline" onClick={() => setUploadModalOpen(false)}>
                Fechar
              </Button>
            </div>
          </div>
        </ModalContainer>
      )}
    </div>
  );
}
