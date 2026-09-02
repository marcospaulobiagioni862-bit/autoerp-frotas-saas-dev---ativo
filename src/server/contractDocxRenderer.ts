import { createHash } from 'node:crypto';
import type { FileAttachment } from '../types/entities';
import { renderContractDocx } from '../domain/contracts/contractDocxTemplate';
import type { ContractTemplateValues } from '../domain/contracts/contractTemplatePolicy';
import { ContractDocxSourceError, selectContractDocxSource } from '../domain/contracts/contractDocxSource';
import { ServerAttachmentStorage, type AttachmentByteStorage } from './attachmentStorage';
import { R2AttachmentStorage } from './r2AttachmentStorage';

function storageForProvider(provider: 'SERVER_FS' | 'R2'): AttachmentByteStorage {
  return provider === 'R2' ? new R2AttachmentStorage() : new ServerAttachmentStorage();
}

export async function renderContractDocxFromAttachments(
  companyId: string,
  attachments: FileAttachment[],
  values: ContractTemplateValues,
): Promise<Buffer> {
  const source = selectContractDocxSource(attachments);
  const storage = storageForProvider(source.storageProvider);
  const bytes = await storage.read(companyId, source.storageKey);

  if (source.checksum) {
    const actualChecksum = createHash('sha256').update(bytes).digest('hex');
    if (actualChecksum !== source.checksum) {
      throw new ContractDocxSourceError('Contract template source checksum mismatch');
    }
  }

  return renderContractDocx(bytes, values);
}
