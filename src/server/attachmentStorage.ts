import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export class AttachmentStorageUnavailableError extends Error {}
export class AttachmentStorageValidationError extends Error {}
export class AttachmentStorageNotFoundError extends Error {}

function safeSegment(value: string, field: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new AttachmentStorageValidationError(`Invalid ${field}`);
  }
  return value;
}

function configuredRoot(): string {
  const configured = String(process.env.ATTACHMENT_STORAGE_DIR || '').trim();
  if (!configured) {
    throw new AttachmentStorageUnavailableError('Attachment storage is not configured');
  }
  return path.resolve(configured);
}

function resolvedFile(root: string, storageKey: string): string {
  const parts = storageKey.split('/');
  if (parts.length !== 2) throw new AttachmentStorageValidationError('Invalid storage key');
  const companyId = safeSegment(parts[0], 'companyId');
  const attachmentId = safeSegment(parts[1], 'attachmentId');
  const companyRoot = path.resolve(root, companyId);
  const filePath = path.resolve(companyRoot, `${attachmentId}.bin`);
  if (!filePath.startsWith(`${companyRoot}${path.sep}`)) {
    throw new AttachmentStorageValidationError('Invalid attachment path');
  }
  return filePath;
}

export interface StoredAttachmentBytes {
  storageKey: string;
  checksum: string;
  fileSize: number;
}

export class ServerAttachmentStorage {
  async write(companyId: string, attachmentId: string, bytes: Buffer): Promise<StoredAttachmentBytes> {
    if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
      throw new AttachmentStorageValidationError('Attachment content is empty');
    }
    if (bytes.length > MAX_ATTACHMENT_BYTES) {
      throw new AttachmentStorageValidationError('Attachment exceeds maximum size');
    }

    const root = configuredRoot();
    const company = safeSegment(companyId, 'companyId');
    const id = safeSegment(attachmentId, 'attachmentId');
    const storageKey = `${company}/${id}`;
    const finalPath = resolvedFile(root, storageKey);
    const directory = path.dirname(finalPath);
    await mkdir(directory, { recursive: true });

    const tempPath = path.join(directory, `.${id}.${randomUUID()}.tmp`);
    let tempExists = false;
    try {
      const handle = await open(tempPath, 'wx', 0o600);
      tempExists = true;
      try {
        await handle.writeFile(bytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(tempPath, finalPath);
      tempExists = false;
    } finally {
      if (tempExists) await rm(tempPath, { force: true }).catch(() => undefined);
    }

    return {
      storageKey,
      checksum: createHash('sha256').update(bytes).digest('hex'),
      fileSize: bytes.length,
    };
  }

  async read(companyId: string, storageKey: string): Promise<Buffer> {
    const company = safeSegment(companyId, 'companyId');
    if (!storageKey.startsWith(`${company}/`)) throw new AttachmentStorageNotFoundError('Attachment not found');
    const filePath = resolvedFile(configuredRoot(), storageKey);
    try {
      return await readFile(filePath);
    } catch (error: any) {
      if (error?.code === 'ENOENT') throw new AttachmentStorageNotFoundError('Attachment content not found');
      throw error;
    }
  }

  async remove(companyId: string, storageKey: string): Promise<void> {
    const company = safeSegment(companyId, 'companyId');
    if (!storageKey.startsWith(`${company}/`)) throw new AttachmentStorageValidationError('Invalid storage ownership');
    const filePath = resolvedFile(configuredRoot(), storageKey);
    await rm(filePath, { force: true });
  }

  async exists(companyId: string, storageKey: string): Promise<boolean> {
    const company = safeSegment(companyId, 'companyId');
    if (!storageKey.startsWith(`${company}/`)) return false;
    try {
      const info = await stat(resolvedFile(configuredRoot(), storageKey));
      return info.isFile();
    } catch (error: any) {
      if (error?.code === 'ENOENT') return false;
      throw error;
    }
  }
}
