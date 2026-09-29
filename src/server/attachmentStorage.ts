import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export class AttachmentStorageUnavailableError extends Error {}
export class AttachmentStorageValidationError extends Error {}
export class AttachmentStorageNotFoundError extends Error {}

export type AttachmentStorageProvider = 'SERVER_FS' | 'R2';

export interface AttachmentStorageConfiguration {
  provider: AttachmentStorageProvider;
  configured: boolean;
  durableRequested: boolean;
  durable: boolean;
  ephemeralPath: boolean;
  maxBytes: number;
}

function pathIsInside(candidate: string, root: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

export function getAttachmentStorageConfiguration(): AttachmentStorageConfiguration {
  const configuredValue = String(process.env.ATTACHMENT_STORAGE_DIR || '').trim();
  const resolved = configuredValue ? path.resolve(configuredValue) : '';
  const ephemeralPath = Boolean(resolved) && ['/tmp', '/var/tmp', '/dev/shm']
    .map((root) => path.resolve(root))
    .some((root) => pathIsInside(resolved, root));
  const durableRequested = String(process.env.ATTACHMENT_STORAGE_DURABLE || '').trim().toLowerCase() === 'true';
  return {
    provider: 'SERVER_FS',
    configured: Boolean(resolved),
    durableRequested,
    durable: Boolean(resolved) && durableRequested && !ephemeralPath,
    ephemeralPath,
    maxBytes: MAX_ATTACHMENT_BYTES,
  };
}

function safeSegment(value: string, field: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new AttachmentStorageValidationError(`Invalid ${field}`);
  }
  return value;
}

function configuredRoot(): string {
  const configured = String(process.env.ATTACHMENT_STORAGE_DIR || '').trim();
  const status = getAttachmentStorageConfiguration();
  if (!status.configured) {
    throw new AttachmentStorageUnavailableError('Attachment storage is not configured');
  }
  if (status.durableRequested && status.ephemeralPath) {
    throw new AttachmentStorageUnavailableError('Durable attachment storage cannot use an ephemeral path');
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

function readableRoots(): string[] {
  const root = configuredRoot();
  const compatibilityRoot = path.basename(root).toLowerCase() === 'attachments'
    ? path.dirname(root)
    : path.join(root, 'attachments');
  return Array.from(new Set([root, path.resolve(compatibilityRoot)]));
}

export interface StoredAttachmentBytes {
  storageKey: string;
  checksum: string;
  fileSize: number;
}

export interface AttachmentByteStorage {
  readonly provider: AttachmentStorageProvider;
  getConfiguration(): AttachmentStorageConfiguration;
  write(companyId: string, attachmentId: string, bytes: Buffer): Promise<StoredAttachmentBytes>;
  read(companyId: string, storageKey: string): Promise<Buffer>;
  remove(companyId: string, storageKey: string): Promise<void>;
  exists(companyId: string, storageKey: string): Promise<boolean>;
}

export class ServerAttachmentStorage implements AttachmentByteStorage {
  readonly provider = 'SERVER_FS' as const;

  getConfiguration(): AttachmentStorageConfiguration {
    return getAttachmentStorageConfiguration();
  }

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
    for (const root of readableRoots()) {
      try {
        return await readFile(resolvedFile(root, storageKey));
      } catch (error: any) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
    throw new AttachmentStorageNotFoundError('Attachment content not found');
  }

  async remove(companyId: string, storageKey: string): Promise<void> {
    const company = safeSegment(companyId, 'companyId');
    if (!storageKey.startsWith(`${company}/`)) throw new AttachmentStorageValidationError('Invalid storage ownership');
    await Promise.all(readableRoots().map((root) => rm(resolvedFile(root, storageKey), { force: true })));
  }

  async exists(companyId: string, storageKey: string): Promise<boolean> {
    const company = safeSegment(companyId, 'companyId');
    if (!storageKey.startsWith(`${company}/`)) return false;
    for (const root of readableRoots()) {
      try {
        const info = await stat(resolvedFile(root, storageKey));
        if (info.isFile()) return true;
      } catch (error: any) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
    return false;
  }
}
