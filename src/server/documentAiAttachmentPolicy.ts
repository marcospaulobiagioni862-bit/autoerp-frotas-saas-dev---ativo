export interface DocumentAiAttachmentCandidate {
  isArchived: boolean;
  storageProvider: string;
  contentState: string;
  storageKey?: string | null;
  checksum?: string | null;
}

const PRIVATE_DURABLE_PROVIDERS = new Set(['SERVER_FS', 'R2']);

export function isDocumentAiAttachmentEligible(
  attachment: DocumentAiAttachmentCandidate | null | undefined,
  configuredStorageProvider: string,
  expectedChecksum?: string,
): boolean {
  const configured = configuredStorageProvider.trim().toUpperCase();
  if (!PRIVATE_DURABLE_PROVIDERS.has(configured)) return false;
  if (!attachment || attachment.isArchived) return false;
  if (attachment.storageProvider.trim().toUpperCase() !== configured) return false;
  if (attachment.contentState !== 'AVAILABLE' || !attachment.storageKey) return false;
  if (!attachment.checksum || !/^[a-f0-9]{64}$/.test(attachment.checksum)) return false;
  if (expectedChecksum !== undefined && attachment.checksum !== expectedChecksum) return false;
  return true;
}
