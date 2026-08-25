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
