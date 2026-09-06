import { createHash } from 'node:crypto';
import { AwsClient } from 'aws4fetch';
import {
  AttachmentStorageNotFoundError,
  AttachmentStorageUnavailableError,
  AttachmentStorageValidationError,
  MAX_ATTACHMENT_BYTES,
  ServerAttachmentStorage,
  type AttachmentByteStorage,
  type AttachmentStorageConfiguration,
  type StoredAttachmentBytes,
} from './attachmentStorage';

interface R2Environment {
  ATTACHMENT_STORAGE_PROVIDER?: string;
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET?: string;
}

interface SignedFetch {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface R2RuntimeConfiguration {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint: string;
}

function value(environment: R2Environment, key: keyof R2Environment): string {
  return String(environment[key] || '').trim();
}

function normalizedAccountId(environment: R2Environment): string {
  const raw = value(environment, 'R2_ACCOUNT_ID').replace(/^['"]|['"]$/g, '').trim();
  if (/^[A-Za-z0-9_-]{8,64}$/.test(raw)) return raw;
  const endpointMatch = raw.match(/^(?:https?:\/\/)?([A-Za-z0-9_-]{8,64})\.r2\.cloudflarestorage\.com(?:\/.*)?$/i);
  return endpointMatch?.[1] || raw;
}

function publicConfiguration(environment: R2Environment): AttachmentStorageConfiguration {
  const accountId = normalizedAccountId(environment);
  const accessKeyId = value(environment, 'R2_ACCESS_KEY_ID');
  const secretAccessKey = value(environment, 'R2_SECRET_ACCESS_KEY');
  const bucket = value(environment, 'R2_BUCKET');
  const validAccount = /^[A-Za-z0-9_-]{8,64}$/.test(accountId);
  const validBucket = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket);
  const configured = validAccount && validBucket && Boolean(accessKeyId) && Boolean(secretAccessKey);
  return {
    provider: 'R2',
    configured,
    durableRequested: true,
    durable: configured,
    ephemeralPath: false,
    maxBytes: MAX_ATTACHMENT_BYTES,
  };
}

function requiredConfiguration(environment: R2Environment): R2RuntimeConfiguration {
  const status = publicConfiguration(environment);
  if (!status.configured) {
    const rawAccountId = value(environment, 'R2_ACCOUNT_ID');
    const accountId = normalizedAccountId(environment);
    const accessKeyId = value(environment, 'R2_ACCESS_KEY_ID');
    const secretAccessKey = value(environment, 'R2_SECRET_ACCESS_KEY');
    const bucket = value(environment, 'R2_BUCKET');
    const diagnostics = {
      accountIdPresent: Boolean(rawAccountId),
      accountIdValid: /^[A-Za-z0-9_-]{8,64}$/.test(accountId),
      accessKeyIdPresent: Boolean(accessKeyId),
      secretAccessKeyPresent: Boolean(secretAccessKey),
      bucketPresent: Boolean(bucket),
      bucketValid: /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket),
    };
    throw new AttachmentStorageUnavailableError(
      `R2 attachment storage is not completely configured: ${JSON.stringify(diagnostics)}`,
    );
  }
  const accountId = normalizedAccountId(environment);
  return {
    accountId,
    accessKeyId: value(environment, 'R2_ACCESS_KEY_ID'),
    secretAccessKey: value(environment, 'R2_SECRET_ACCESS_KEY'),
    bucket: value(environment, 'R2_BUCKET'),
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  };
}

function safeSegment(valueToCheck: string, field: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(valueToCheck)) {
    throw new AttachmentStorageValidationError(`Invalid ${field}`);
  }
  return valueToCheck;
}

function ownedStorageKey(companyId: string, storageKey: string): { company: string; id: string } {
  const company = safeSegment(companyId, 'companyId');
  const parts = storageKey.split('/');
  if (parts.length !== 2 || parts[0] !== company) {
    throw new AttachmentStorageValidationError('Invalid storage ownership');
  }
  return { company, id: safeSegment(parts[1], 'attachmentId') };
}

function responseFailure(operation: string, response: Response): AttachmentStorageUnavailableError {
  return new AttachmentStorageUnavailableError(`R2 ${operation} failed with status ${response.status}`);
}

export class R2AttachmentStorage implements AttachmentByteStorage {
  readonly provider = 'R2' as const;
  private signedFetch?: SignedFetch;

  constructor(
    private readonly environment: R2Environment = process.env,
    signedFetch?: SignedFetch,
  ) {
    this.signedFetch = signedFetch;
  }

  getConfiguration(): AttachmentStorageConfiguration {
    return publicConfiguration(this.environment);
  }

  private runtime(): { configuration: R2RuntimeConfiguration; client: SignedFetch } {
    const configuration = requiredConfiguration(this.environment);
    if (!this.signedFetch) {
      this.signedFetch = new AwsClient({
        service: 's3',
        region: 'auto',
        accessKeyId: configuration.accessKeyId,
        secretAccessKey: configuration.secretAccessKey,
      });
    }
    return { configuration, client: this.signedFetch };
  }

  private objectUrl(configuration: R2RuntimeConfiguration, company: string, id: string): string {
    const bucket = encodeURIComponent(configuration.bucket);
    return `${configuration.endpoint}/${bucket}/${encodeURIComponent(company)}/${encodeURIComponent(id)}.bin`;
  }

  async write(companyId: string, attachmentId: string, bytes: Buffer): Promise<StoredAttachmentBytes> {
    if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
      throw new AttachmentStorageValidationError('Attachment content is empty');
    }
    if (bytes.length > MAX_ATTACHMENT_BYTES) {
      throw new AttachmentStorageValidationError('Attachment exceeds maximum size');
    }
    const company = safeSegment(companyId, 'companyId');
    const id = safeSegment(attachmentId, 'attachmentId');
    const storageKey = `${company}/${id}`;
    const checksum = createHash('sha256').update(bytes).digest('hex');
    const { configuration, client } = this.runtime();
    const response = await client.fetch(this.objectUrl(configuration, company, id), {
      method: 'PUT',
      headers: {
        'content-type': 'application/octet-stream',
        'x-amz-meta-autoerp-sha256': checksum,
      },
      body: bytes,
    });
    if (!response.ok) throw responseFailure('write', response);
    return { storageKey, checksum, fileSize: bytes.length };
  }

  async read(companyId: string, storageKey: string): Promise<Buffer> {
    const { company, id } = ownedStorageKey(companyId, storageKey);
    const { configuration, client } = this.runtime();
    const response = await client.fetch(this.objectUrl(configuration, company, id), { method: 'GET' });
    if (response.status === 404) throw new AttachmentStorageNotFoundError('Attachment content not found');
    if (!response.ok) throw responseFailure('read', response);
    const declaredLength = Number(response.headers.get('content-length') || '0');
    if (declaredLength > MAX_ATTACHMENT_BYTES) {
      throw new AttachmentStorageValidationError('Stored attachment exceeds maximum size');
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_ATTACHMENT_BYTES) {
      throw new AttachmentStorageValidationError('Stored attachment exceeds maximum size');
    }
    return bytes;
  }

  async remove(companyId: string, storageKey: string): Promise<void> {
    const { company, id } = ownedStorageKey(companyId, storageKey);
    const { configuration, client } = this.runtime();
    const response = await client.fetch(this.objectUrl(configuration, company, id), { method: 'DELETE' });
    if (!response.ok && response.status !== 404) throw responseFailure('delete', response);
  }

  async exists(companyId: string, storageKey: string): Promise<boolean> {
    let owned: { company: string; id: string };
    try {
      owned = ownedStorageKey(companyId, storageKey);
    } catch {
      return false;
    }
    const { configuration, client } = this.runtime();
    const response = await client.fetch(this.objectUrl(configuration, owned.company, owned.id), { method: 'HEAD' });
    if (response.status === 404) return false;
    if (!response.ok) throw responseFailure('head', response);
    return true;
  }
}

export function createAttachmentStorageFromEnvironment(
  environment: R2Environment = process.env,
): AttachmentByteStorage {
  const provider = value(environment, 'ATTACHMENT_STORAGE_PROVIDER').toUpperCase();
  if (!provider || provider === 'SERVER_FS') return new ServerAttachmentStorage();
  if (provider === 'R2') return new R2AttachmentStorage(environment);
  throw new AttachmentStorageUnavailableError('Unsupported attachment storage provider');
}
