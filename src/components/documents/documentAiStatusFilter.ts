import type { DocumentAiAttachmentStatus } from '../../api/documentAiClient';

export const DOCUMENT_AI_STATUS_FILTERS = [
  'ALL',
  'NONE',
  'ACTION_REQUIRED',
  'PENDING',
  'PROCESSING',
  'REVIEW_REQUIRED',
  'APPROVED',
  'REJECTED',
  'FAILED',
] as const;

export type DocumentAiStatusFilter = (typeof DOCUMENT_AI_STATUS_FILTERS)[number];

export function matchesDocumentAiStatusFilter(
  attachmentId: string,
  filter: DocumentAiStatusFilter,
  statuses: Readonly<Record<string, DocumentAiAttachmentStatus>>,
  statusesUnavailable: boolean,
): boolean {
  if (filter === 'ALL' || statusesUnavailable) return true;
  const current = statuses[attachmentId];
  if (filter === 'NONE') return current === undefined;
  if (filter === 'ACTION_REQUIRED') {
    return current?.status === 'REVIEW_REQUIRED' || current?.status === 'FAILED';
  }
  return current?.status === filter;
}

export type DocumentAiStatusCounts = Record<DocumentAiStatusFilter, number | null>;

export function createDocumentAiStatusCounts(
  attachmentIds: ReadonlyArray<string>,
  statuses: Readonly<Record<string, DocumentAiAttachmentStatus>>,
  statusesUnavailable: boolean,
): DocumentAiStatusCounts {
  const uniqueAttachmentIds = Array.from(new Set(attachmentIds));
  const counts: DocumentAiStatusCounts = {
    ALL: uniqueAttachmentIds.length,
    NONE: statusesUnavailable ? null : 0,
    ACTION_REQUIRED: statusesUnavailable ? null : 0,
    PENDING: statusesUnavailable ? null : 0,
    PROCESSING: statusesUnavailable ? null : 0,
    REVIEW_REQUIRED: statusesUnavailable ? null : 0,
    APPROVED: statusesUnavailable ? null : 0,
    REJECTED: statusesUnavailable ? null : 0,
    FAILED: statusesUnavailable ? null : 0,
  };
  if (statusesUnavailable) return counts;

  for (const attachmentId of uniqueAttachmentIds) {
    const status = statuses[attachmentId]?.status;
    if (!status) {
      counts.NONE = (counts.NONE ?? 0) + 1;
    } else {
      counts[status] = (counts[status] ?? 0) + 1;
      if (status === 'REVIEW_REQUIRED' || status === 'FAILED') {
        counts.ACTION_REQUIRED = (counts.ACTION_REQUIRED ?? 0) + 1;
      }
    }
  }
  return counts;
}

export const DOCUMENT_AI_STATUS_SORTS = [
  'ATTACHMENT_NEWEST',
  'REVIEW_PRIORITY',
  'EXTRACTION_UPDATED_DESC',
  'EXTRACTION_UPDATED_ASC',
] as const;

export type DocumentAiStatusSort = (typeof DOCUMENT_AI_STATUS_SORTS)[number];

export type DocumentAiActionRequiredSelection = Readonly<{
  statusFilter: 'ACTION_REQUIRED';
  sort: 'REVIEW_PRIORITY';
}>;

export function getDocumentAiActionRequiredSelection(
  statusesUnavailable: boolean,
): DocumentAiActionRequiredSelection | null {
  return statusesUnavailable ? null : {
    statusFilter: 'ACTION_REQUIRED',
    sort: 'REVIEW_PRIORITY',
  };
}

export type DocumentCenterFilterState = Readonly<{
  searchTerm: string;
  entityType: string;
  documentType: string;
  statusFilter: DocumentAiStatusFilter;
  sort: DocumentAiStatusSort;
}>;

export type DocumentCenterFilterKey = keyof DocumentCenterFilterState;

export type DocumentCenterActiveFilter = Readonly<{
  key: DocumentCenterFilterKey;
  label: string;
}>;

export const DOCUMENT_CENTER_DEFAULT_FILTERS: DocumentCenterFilterState = Object.freeze({
  searchTerm: '',
  entityType: 'ALL',
  documentType: 'ALL',
  statusFilter: 'ALL',
  sort: 'ATTACHMENT_NEWEST',
});

const DOCUMENT_AI_STATUS_FILTER_LABELS: Readonly<Record<DocumentAiStatusFilter, string>> = {
  ALL: 'Todos os estados',
  NONE: 'Sem extração',
  ACTION_REQUIRED: 'Ação necessária',
  PENDING: 'Na fila',
  PROCESSING: 'Processando',
  REVIEW_REQUIRED: 'Revisão necessária',
  APPROVED: 'Aprovada',
  REJECTED: 'Rejeitada',
  FAILED: 'Falhou',
};

const DOCUMENT_AI_STATUS_SORT_LABELS: Readonly<Record<DocumentAiStatusSort, string>> = {
  ATTACHMENT_NEWEST: 'Anexo mais recente',
  REVIEW_PRIORITY: 'Prioridade de triagem',
  EXTRACTION_UPDATED_DESC: 'Extração atualizada recentemente',
  EXTRACTION_UPDATED_ASC: 'Extração atualizada há mais tempo',
};

export function createDocumentCenterActiveFilters(
  filters: DocumentCenterFilterState,
): DocumentCenterActiveFilter[] {
  const activeFilters: DocumentCenterActiveFilter[] = [];
  if (filters.searchTerm !== DOCUMENT_CENTER_DEFAULT_FILTERS.searchTerm) {
    activeFilters.push({ key: 'searchTerm', label: `Busca: ${filters.searchTerm}` });
  }
  if (filters.entityType !== DOCUMENT_CENTER_DEFAULT_FILTERS.entityType) {
    activeFilters.push({ key: 'entityType', label: `Módulo: ${filters.entityType}` });
  }
  if (filters.documentType !== DOCUMENT_CENTER_DEFAULT_FILTERS.documentType) {
    activeFilters.push({ key: 'documentType', label: `Tipo: ${filters.documentType}` });
  }
  if (filters.statusFilter !== DOCUMENT_CENTER_DEFAULT_FILTERS.statusFilter) {
    activeFilters.push({
      key: 'statusFilter',
      label: `Estado: ${DOCUMENT_AI_STATUS_FILTER_LABELS[filters.statusFilter]}`,
    });
  }
  if (filters.sort !== DOCUMENT_CENTER_DEFAULT_FILTERS.sort) {
    activeFilters.push({
      key: 'sort',
      label: `Ordenação: ${DOCUMENT_AI_STATUS_SORT_LABELS[filters.sort]}`,
    });
  }
  return activeFilters;
}

export function resetDocumentCenterFilter(
  filters: DocumentCenterFilterState,
  key: DocumentCenterFilterKey,
): DocumentCenterFilterState {
  return {
    ...filters,
    [key]: DOCUMENT_CENTER_DEFAULT_FILTERS[key],
  };
}

export function hasActiveDocumentCenterFilters(filters: DocumentCenterFilterState): boolean {
  return filters.searchTerm !== DOCUMENT_CENTER_DEFAULT_FILTERS.searchTerm
    || filters.entityType !== DOCUMENT_CENTER_DEFAULT_FILTERS.entityType
    || filters.documentType !== DOCUMENT_CENTER_DEFAULT_FILTERS.documentType
    || filters.statusFilter !== DOCUMENT_CENTER_DEFAULT_FILTERS.statusFilter
    || filters.sort !== DOCUMENT_CENTER_DEFAULT_FILTERS.sort;
}

export type DocumentCenterResultSummary = Readonly<{
  total: number;
  visible: number;
  filtered: boolean;
  filteredEmpty: boolean;
}>;

export function createDocumentCenterResultSummary(
  total: number,
  visible: number,
  filtersActive: boolean,
): DocumentCenterResultSummary {
  if (!Number.isInteger(total) || total < 0 || !Number.isInteger(visible) || visible < 0 || visible > total) {
    throw new Error('Invalid document result summary');
  }
  return {
    total,
    visible,
    filtered: filtersActive,
    filteredEmpty: filtersActive && total > 0 && visible === 0,
  };
}

const DOCUMENT_AI_REVIEW_PRIORITY: Readonly<Record<DocumentAiAttachmentStatus['status'], number>> = {
  REVIEW_REQUIRED: 0,
  FAILED: 1,
  PROCESSING: 2,
  PENDING: 3,
  REJECTED: 5,
  APPROVED: 6,
};

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function sortDocumentAiAttachments<T extends { id: string; createdAt: string }>(
  attachments: ReadonlyArray<T>,
  sort: DocumentAiStatusSort,
  statuses: Readonly<Record<string, DocumentAiAttachmentStatus>>,
): T[] {
  const effectiveTimestamp = (attachment: T) =>
    timestamp(statuses[attachment.id]?.updatedAt ?? attachment.createdAt);
  const priority = (attachment: T) => {
    const status = statuses[attachment.id]?.status;
    return status ? DOCUMENT_AI_REVIEW_PRIORITY[status] : 4;
  };

  return [...attachments].sort((left, right) => {
    let comparison = 0;
    if (sort === 'REVIEW_PRIORITY') {
      comparison = priority(left) - priority(right)
        || effectiveTimestamp(left) - effectiveTimestamp(right);
    } else if (sort === 'EXTRACTION_UPDATED_ASC') {
      comparison = effectiveTimestamp(left) - effectiveTimestamp(right);
    } else if (sort === 'EXTRACTION_UPDATED_DESC') {
      comparison = effectiveTimestamp(right) - effectiveTimestamp(left);
    } else {
      comparison = timestamp(right.createdAt) - timestamp(left.createdAt);
    }
    return comparison || left.id.localeCompare(right.id);
  });
}
