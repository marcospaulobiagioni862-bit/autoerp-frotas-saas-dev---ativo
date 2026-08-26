import React, { useEffect, useState } from 'react';
import { AttachmentClient } from '../../api/attachmentClient';
import { DocumentAiClient, type DocumentAiAttachmentStatus } from '../../api/documentAiClient';
import type { FileAttachment } from '../../types/entities/audit';
import { Search } from 'lucide-react';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { AttachmentList } from './AttachmentList';
import { DocumentAiReviewPanel } from './DocumentAiReviewPanel';
import {
  createDocumentAiStatusCounts,
  DOCUMENT_CENTER_DEFAULT_FILTERS,
  getDocumentAiActionRequiredSelection,
  hasActiveDocumentCenterFilters,
  matchesDocumentAiStatusFilter,
  sortDocumentAiAttachments,
  type DocumentAiStatusFilter,
  type DocumentAiStatusSort,
} from './documentAiStatusFilter';

export function DocumentCenter() {
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState(DOCUMENT_CENTER_DEFAULT_FILTERS.searchTerm);
  const [entityTypeFilter, setEntityTypeFilter] = useState(DOCUMENT_CENTER_DEFAULT_FILTERS.entityType);
  const [documentTypeFilter, setDocumentTypeFilter] = useState(DOCUMENT_CENTER_DEFAULT_FILTERS.documentType);
  const [extractionStatusFilter, setExtractionStatusFilter] = useState<DocumentAiStatusFilter>(DOCUMENT_CENTER_DEFAULT_FILTERS.statusFilter);
  const [extractionSort, setExtractionSort] = useState<DocumentAiStatusSort>(DOCUMENT_CENTER_DEFAULT_FILTERS.sort);
  const [documentAiRefreshKey, setDocumentAiRefreshKey] = useState(0);
  const [attachmentStatuses, setAttachmentStatuses] = useState<Record<string, DocumentAiAttachmentStatus>>({});
  const [attachmentStatusesUnavailable, setAttachmentStatusesUnavailable] = useState(false);

  const fetchDocuments = async () => {
    setLoading(true);
    setError(null);
    try {
      const [attachmentsResult, statusesResult] = await Promise.allSettled([
        AttachmentClient.list(),
        DocumentAiClient.attachmentStatuses(),
      ]);
      if (attachmentsResult.status === 'rejected') throw attachmentsResult.reason;
      setAttachments(attachmentsResult.value.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      if (statusesResult.status === 'fulfilled') {
        setAttachmentStatuses(Object.fromEntries(statusesResult.value.map((item) => [item.attachmentId, item])));
        setAttachmentStatusesUnavailable(false);
      } else {
        setAttachmentStatuses({});
        setAttachmentStatusesUnavailable(true);
        setExtractionStatusFilter('ALL');
        setExtractionSort('ATTACHMENT_NEWEST');
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

  const baseFilteredAttachments = attachments.filter((att) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      att.fileName.toLowerCase().includes(term) ||
      (att.description || '').toLowerCase().includes(term) ||
      att.entityId.toLowerCase().includes(term);
    const matchesEntity = entityTypeFilter === 'ALL' || att.entityType === entityTypeFilter;
    const matchesDoc = documentTypeFilter === 'ALL' || att.documentType === documentTypeFilter;
    return matchesSearch && matchesEntity && matchesDoc && !att.isArchived;
  });
  const extractionStatusCounts = createDocumentAiStatusCounts(
    baseFilteredAttachments.map((attachment) => attachment.id),
    attachmentStatuses,
    attachmentStatusesUnavailable,
  );
  const statusFilteredAttachments = baseFilteredAttachments.filter((attachment) =>
    matchesDocumentAiStatusFilter(
      attachment.id,
      extractionStatusFilter,
      attachmentStatuses,
      attachmentStatusesUnavailable,
    ),
  );
  const filteredAttachments = sortDocumentAiAttachments<FileAttachment>(
    statusFilteredAttachments,
    extractionSort,
    attachmentStatuses,
  );
  const statusCountLabel = (count: number | null) => count === null ? '—' : String(count);
  const actionRequiredSelection = getDocumentAiActionRequiredSelection(attachmentStatusesUnavailable);
  const focusActionRequired = () => {
    if (!actionRequiredSelection) return;
    setExtractionStatusFilter(actionRequiredSelection.statusFilter);
    setExtractionSort(actionRequiredSelection.sort);
  };
  const filtersActive = hasActiveDocumentCenterFilters({
    searchTerm,
    entityType: entityTypeFilter,
    documentType: documentTypeFilter,
    statusFilter: extractionStatusFilter,
    sort: extractionSort,
  });
  const clearFilters = () => {
    setSearchTerm(DOCUMENT_CENTER_DEFAULT_FILTERS.searchTerm);
    setEntityTypeFilter(DOCUMENT_CENTER_DEFAULT_FILTERS.entityType);
    setDocumentTypeFilter(DOCUMENT_CENTER_DEFAULT_FILTERS.documentType);
    setExtractionStatusFilter(DOCUMENT_CENTER_DEFAULT_FILTERS.statusFilter);
    setExtractionSort(DOCUMENT_CENTER_DEFAULT_FILTERS.sort);
  };

  const entityTypes = Array.from(new Set(attachments.map((item) => item.entityType).filter(Boolean)));
  const docTypes = Array.from(new Set(attachments.map((item) => item.documentType).filter((value): value is string => Boolean(value))));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Central de Documentos</h1>
          <p className="text-sm text-gray-500 mt-1">Gerencie os anexos server-side do sistema em um só lugar.</p>
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
            <button
              type="button"
              onClick={focusActionRequired}
              disabled={!actionRequiredSelection}
              className="rounded-md border border-amber-500 px-3 py-1.5 text-sm font-medium text-amber-700 enabled:hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-amber-300"
            >
              Priorizar ações necessárias
            </button>
          </div>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Buscar</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input placeholder="Nome do arquivo, ID..." className="pl-9" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estado da Extração</label>
              <Select
                value={extractionStatusFilter}
                onChange={(event) => setExtractionStatusFilter(event.target.value as DocumentAiStatusFilter)}
                disabled={attachmentStatusesUnavailable}
              >
                <option value="ALL">Todos os Estados ({statusCountLabel(extractionStatusCounts.ALL)})</option>
                <option value="NONE">Sem extração ({statusCountLabel(extractionStatusCounts.NONE)})</option>
                <option value="ACTION_REQUIRED">Ação necessária ({statusCountLabel(extractionStatusCounts.ACTION_REQUIRED)})</option>
                <option value="PENDING">Na fila ({statusCountLabel(extractionStatusCounts.PENDING)})</option>
                <option value="PROCESSING">Processando ({statusCountLabel(extractionStatusCounts.PROCESSING)})</option>
                <option value="REVIEW_REQUIRED">Revisão necessária ({statusCountLabel(extractionStatusCounts.REVIEW_REQUIRED)})</option>
                <option value="APPROVED">Aprovada ({statusCountLabel(extractionStatusCounts.APPROVED)})</option>
                <option value="REJECTED">Rejeitada ({statusCountLabel(extractionStatusCounts.REJECTED)})</option>
                <option value="FAILED">Falhou ({statusCountLabel(extractionStatusCounts.FAILED)})</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ordenação</label>
              <Select
                value={extractionSort}
                onChange={(event) => setExtractionSort(event.target.value as DocumentAiStatusSort)}
                disabled={attachmentStatusesUnavailable}
              >
                <option value="ATTACHMENT_NEWEST">Anexo mais recente</option>
                <option value="REVIEW_PRIORITY">Prioridade de triagem</option>
                <option value="EXTRACTION_UPDATED_DESC">Extração atualizada recentemente</option>
                <option value="EXTRACTION_UPDATED_ASC">Extração atualizada há mais tempo</option>
              </Select>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-4 border-b">
          <h2 className="font-semibold text-lg">Revisão assistida por IA</h2>
          <p className="text-sm text-gray-500 mt-1">Confira propostas e confiança antes de registrar aprovação ou rejeição.</p>
        </div>
        <DocumentAiReviewPanel refreshKey={documentAiRefreshKey} />
      </Card>

      <Card>
        <div className="p-4 border-b font-semibold text-lg">Resultados ({filteredAttachments.length})</div>
        <div className="p-4">
          {loading ? (
            <div className="text-center py-10 text-gray-500">Carregando documentos...</div>
          ) : error ? (
            <div className="text-center py-10 text-red-500">{error}</div>
          ) : (
            <AttachmentList
              attachments={filteredAttachments}
              onRefresh={() => void fetchDocuments()}
              attachmentStatuses={attachmentStatuses}
              attachmentStatusesUnavailable={attachmentStatusesUnavailable}
              onDocumentAiRequested={() => {
                setDocumentAiRefreshKey((current) => current + 1);
                void fetchDocuments();
              }}
            />
          )}
        </div>
      </Card>
    </div>
  );
}
