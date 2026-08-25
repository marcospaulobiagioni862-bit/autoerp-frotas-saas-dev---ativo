import type { DocumentAiAttachmentStatus } from '../../api/documentAiClient';

export const DOCUMENT_AI_STATUS_FILTERS = [
  'ALL',
  'NONE',
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
    if (!status) counts.NONE = (counts.NONE ?? 0) + 1;
    else counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}
