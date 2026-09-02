import type { FileAttachment } from '../../types/entities';

export const CONTRACT_DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export class ContractDocxSourceError extends Error {}

export interface ContractDocxSource {
  attachmentId: string;
  storageProvider: 'SERVER_FS' | 'R2';
  storageKey: string;
  fileName: string;
  checksum?: string;
}

export function selectContractDocxSource(attachments: FileAttachment[]): ContractDocxSource {
  const candidates = attachments.filter((attachment) =>
    !attachment.isArchived &&
    attachment.documentType === 'CONTRACT_TEMPLATE_SOURCE' &&
    attachment.contentState === 'AVAILABLE'
  );

  if (candidates.length !== 1) {
    throw new ContractDocxSourceError('Contract template must have exactly one available source attachment');
  }

  const source = candidates[0];
  if (source.mimeType !== CONTRACT_DOCX_MIME) {
    throw new ContractDocxSourceError('Contract template source must be a DOCX file');
  }
  if (source.storageProvider !== 'SERVER_FS' && source.storageProvider !== 'R2') {
    throw new ContractDocxSourceError('Contract template source storage provider is unsupported');
  }
  if (!source.storageKey) {
    throw new ContractDocxSourceError('Contract template source storage key is missing');
  }

  return {
    attachmentId: source.id,
    storageProvider: source.storageProvider,
    storageKey: source.storageKey,
    fileName: source.fileName,
    checksum: source.checksum,
  };
}
