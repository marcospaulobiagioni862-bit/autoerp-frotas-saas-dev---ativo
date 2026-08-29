export interface DriverDocumentIntakeAiCandidate {
  companyId: string;
  createdBy: string;
  status: string;
  attachmentId?: string;
  expiresAt: string;
  archivedAt?: string;
  consumedAt?: string;
}

export interface DriverDocumentIntakeAttachmentCandidate {
  id: string;
  companyId: string;
  entityType: string;
  entityId: string;
  documentType?: string;
  isArchived: boolean;
  contentState: string;
  storageProvider: string;
  storageKey?: string;
  checksum?: string;
}

const PRIVATE_STORAGE_PROVIDERS = new Set(['SERVER_FS', 'R2']);

export function canQueueDriverDocumentIntakeCnh(
  intake: DriverDocumentIntakeAiCandidate | null | undefined,
  attachment: DriverDocumentIntakeAttachmentCandidate | null | undefined,
  authority: { companyId: string; userId: string; nowIso: string },
): boolean {
  if (!intake || !attachment) return false;
  if (!authority.companyId || !authority.userId) return false;
  if (intake.companyId !== authority.companyId || attachment.companyId !== authority.companyId) return false;
  if (intake.createdBy !== authority.userId) return false;
  if (intake.status !== 'DOCUMENT_UPLOADED') return false;
  if (intake.archivedAt || intake.consumedAt) return false;

  const now = Date.parse(authority.nowIso);
  const expiresAt = Date.parse(intake.expiresAt);
  if (!Number.isFinite(now) || !Number.isFinite(expiresAt) || expiresAt <= now) return false;

  if (!intake.attachmentId || intake.attachmentId !== attachment.id) return false;
  if (attachment.entityType !== 'DriverDocumentIntake' || attachment.entityId === '') return false;
  if (attachment.entityId !== (attachment.entityId.trim())) return false;
  if (attachment.documentType?.trim().toUpperCase() !== 'CNH') return false;
  if (attachment.isArchived || attachment.contentState !== 'AVAILABLE') return false;
  if (!PRIVATE_STORAGE_PROVIDERS.has(attachment.storageProvider.trim().toUpperCase())) return false;
  if (!attachment.storageKey) return false;
  if (!attachment.checksum || !/^[a-f0-9]{64}$/.test(attachment.checksum)) return false;
  return true;
}
