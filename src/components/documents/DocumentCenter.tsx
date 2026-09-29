import React, { useEffect, useState } from 'react';
import { AttachmentClient } from '../../api/attachmentClient';
import { DriverClient } from '../../api/driverClient';
import { VehicleClient } from '../../api/vehicleClient';
import type { FileAttachment } from '../../types/entities/audit';
import { Search, X } from 'lucide-react';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { AttachmentList } from './AttachmentList';
import {
  createDocumentCenterActiveFilters,
  createDocumentCenterResultSummary,
  DOCUMENT_CENTER_DEFAULT_FILTERS,
  hasActiveDocumentCenterFilters,
  resetDocumentCenterFilter,
  type DocumentCenterFilterKey,
  type DocumentCenterFilterState,
} from './documentAiStatusFilter';

type DocumentValidityFilter = 'ALL' | 'EXPIRED' | 'DUE_7' | 'DUE_15' | 'VALID' | 'NO_EXPIRATION';

function daysToExpiration(expirationDate?: string): number | undefined {
  if (!expirationDate) return undefined;
  const expiration = Date.parse(`${expirationDate}T00:00:00Z`);
  if (!Number.isFinite(expiration)) return undefined;
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((expiration - today) / 86_400_000);
}

function matchesValidityFilter(expirationDate: string | undefined, filter: DocumentValidityFilter): boolean {
  if (filter === 'ALL') return true;
  const days = daysToExpiration(expirationDate);
  if (filter === 'NO_EXPIRATION') return days === undefined;
  if (days === undefined) return false;
  if (filter === 'EXPIRED') return days < 0;
  if (filter === 'DUE_7') return days >= 0 && days <= 7;
  if (filter === 'DUE_15') return days >= 8 && days <= 15;
  return days > 15;
}

interface DocumentCenterProps {
  focusFileName?: string;
  onFocusConsumed?: () => void;
}

export function DocumentCenter({ focusFileName, onFocusConsumed }: DocumentCenterProps = {}) {
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState(DOCUMENT_CENTER_DEFAULT_FILTERS.searchTerm);
  const [entityTypeFilter, setEntityTypeFilter] = useState(DOCUMENT_CENTER_DEFAULT_FILTERS.entityType);
  const [documentTypeFilter, setDocumentTypeFilter] = useState(DOCUMENT_CENTER_DEFAULT_FILTERS.documentType);
  const [driverNamesById, setDriverNamesById] = useState<Record<string, string>>({});
  const [vehicleLabelsById, setVehicleLabelsById] = useState<Record<string, string>>({});
  const [validityFilter, setValidityFilter] = useState<DocumentValidityFilter>('ALL');

  const fetchDocuments = async () => {
    setLoading(true);
    setError(null);
    try {
      const [attachmentsResult, driversResult, vehiclesResult] = await Promise.allSettled([
        AttachmentClient.list(),
        DriverClient.list(),
        VehicleClient.list(),
      ]);
      if (attachmentsResult.status === 'rejected') throw attachmentsResult.reason;
      setAttachments(attachmentsResult.value.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      if (driversResult.status === 'fulfilled') {
        setDriverNamesById(Object.fromEntries(driversResult.value.map((driver) => [driver.id, driver.fullName])));
      } else {
        setDriverNamesById({});
      }
      if (vehiclesResult.status === 'fulfilled') {
        setVehicleLabelsById(Object.fromEntries(vehiclesResult.value.map((vehicle) => [
          vehicle.id,
          `${vehicle.plate} ${vehicle.brand} ${vehicle.model} ${vehicle.version || ''}`.trim(),
        ])));
      } else {
        setVehicleLabelsById({});
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar documentos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchDocuments();
  }, []);

  useEffect(() => {
    if (!focusFileName) return;
    setSearchTerm(focusFileName);
    setEntityTypeFilter(DOCUMENT_CENTER_DEFAULT_FILTERS.entityType);
    setDocumentTypeFilter(DOCUMENT_CENTER_DEFAULT_FILTERS.documentType);
    onFocusConsumed?.();
  }, [focusFileName, onFocusConsumed]);

  const INTERNAL_DOCUMENT_ENTITY_TYPES = new Set(['DriverDocumentIntake','VehicleDocumentIntake','TrafficTicketDocumentIntake']);
  const libraryAttachments = attachments.filter((attachment) =>
    !attachment.isArchived && !INTERNAL_DOCUMENT_ENTITY_TYPES.has(String(attachment.entityType || ''))
  );
  const availableAttachmentCount = libraryAttachments.length;
  const baseFilteredAttachments = libraryAttachments.filter((att) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      att.fileName.toLowerCase().includes(term) ||
      (att.description || '').toLowerCase().includes(term) ||
      att.entityId.toLowerCase().includes(term) ||
      (driverNamesById[att.entityId] || '').toLowerCase().includes(term) ||
      (vehicleLabelsById[att.entityId] || '').toLowerCase().includes(term);
    const matchesEntity = entityTypeFilter === 'ALL' || att.entityType === entityTypeFilter;
    const matchesDoc = documentTypeFilter === 'ALL' || att.documentType === documentTypeFilter;
    const matchesValidity = matchesValidityFilter(att.expirationDate, validityFilter);
    return matchesSearch && matchesEntity && matchesDoc && matchesValidity && !att.isArchived;
  });
  const currentFilters: DocumentCenterFilterState = {
    searchTerm,
    entityType: entityTypeFilter,
    documentType: documentTypeFilter,
    statusFilter: DOCUMENT_CENTER_DEFAULT_FILTERS.statusFilter,
    sort: DOCUMENT_CENTER_DEFAULT_FILTERS.sort,
  };
  const activeFilters = createDocumentCenterActiveFilters(currentFilters);
  const filtersActive = hasActiveDocumentCenterFilters(currentFilters) || validityFilter !== 'ALL';
  const applyFilterState = (filters: DocumentCenterFilterState) => {
    setSearchTerm(filters.searchTerm);
    setEntityTypeFilter(filters.entityType);
    setDocumentTypeFilter(filters.documentType);
    setExtractionStatusFilter(filters.statusFilter);
    setExtractionSort(filters.sort);
  };
  const clearFilters = () => {
    applyFilterState(DOCUMENT_CENTER_DEFAULT_FILTERS);
    setValidityFilter('ALL');
  };
  const removeActiveFilter = (key: DocumentCenterFilterKey) => {
    applyFilterState(resetDocumentCenterFilter(currentFilters, key));
  };
  const resultSummary = createDocumentCenterResultSummary(
    availableAttachmentCount,
    filteredAttachments.length,
    filtersActive,
  );

  const entityTypes = Array.from(new Set(attachments.map((item) => item.entityType).filter(Boolean)));
  const docTypes = Array.from(new Set(attachments.map((item) => item.documentType).filter((value): value is string => Boolean(value))));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Central de Documentos</h1>
          <p className="text-sm text-gray-500 mt-1">Consulte os documentos salvos no ERP em um só lugar.</p>
        </div>
      </div>

      <Card>
        <div className="p-4 border-b flex flex-wrap items-center justify-between gap-3">
          <span className="font-semibold text-lg">Filtros de Busca</span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={clearFilters}
              disabled={!filtersActive}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 enabled:hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-300"
            >
              Limpar filtros
            </button>
          </div>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Buscar</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input placeholder="Placa, veículo, motorista, arquivo ou ID..." className="pl-9" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Módulo (Entidade)</label>
              <Select value={entityTypeFilter} onChange={(event) => setEntityTypeFilter(event.target.value)}>
                <option value="ALL">Todos os Módulos</option>
                {entityTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo de Documento</label>
              <Select value={documentTypeFilter} onChange={(event) => setDocumentTypeFilter(event.target.value)}>
                <option value="ALL">Todos os Tipos</option>
                {docTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Validade</label>
              <Select value={validityFilter} onChange={(event) => setValidityFilter(event.target.value as DocumentValidityFilter)}>
                <option value="ALL">Todas as validades</option>
                <option value="EXPIRED">Vencidos</option>
                <option value="DUE_7">Vence em até 7 dias</option>
                <option value="DUE_15">Vence entre 8 e 15 dias</option>
                <option value="VALID">Mais de 15 dias</option>
                <option value="NO_EXPIRATION">Sem validade informada</option>
              </Select>
            </div>
          </div>
          {activeFilters.length > 0 ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Filtros ativos</span>
              {activeFilters.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => removeActiveFilter(filter.key)}
                  aria-label={`Remover ${filter.label}`}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-gray-300 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-white dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-900"
                >
                  <span className="truncate">{filter.label}</span>
                  <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </Card>

      <Card>
        <div className="p-4 border-b font-semibold text-lg">
          Resultados ({resultSummary.filtered ? `${resultSummary.visible} de ${resultSummary.total}` : resultSummary.visible})
        </div>
        <div className="p-4">
          {loading ? (
            <div className="text-center py-10 text-gray-500">Carregando documentos...</div>
          ) : error ? (
            <div className="text-center py-10 text-red-500">{error}</div>
          ) : resultSummary.filteredEmpty ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center dark:border-gray-700 dark:bg-gray-800/60">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Nenhum documento corresponde aos filtros atuais.</p>
              <p className="mt-1 text-xs text-gray-500">Os {resultSummary.total} anexos autorizados continuam disponíveis.</p>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-3 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-white dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-900"
              >
                Restaurar visão completa
              </button>
            </div>
          ) : (
            <AttachmentList
              attachments={filteredAttachments}
              onRefresh={() => void fetchDocuments()}
              showDocumentAiControls={false}
            />
          )}
        </div>
      </Card>
    </div>
  );
}
