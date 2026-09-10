import type { FileAttachment } from '../types/entities';

export class AttachmentApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'AttachmentApiError';
  }
}

type JsonRecord = Record<string, unknown>;
function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid attachment payload');
  return value as JsonRecord;
}

const STORAGE_PROVIDERS = new Set(['LEGACY_BROWSER', 'SERVER_FS', 'R2']);
const CONTENT_STATES = new Set(['LEGACY_BROWSER', 'AVAILABLE', 'MISSING']);

function validateAttachment(value: unknown): FileAttachment {
  const item = asRecord(value);
  if (
    typeof item.id !== 'string' ||
    typeof item.companyId !== 'string' ||
    typeof item.entityName !== 'string' ||
    typeof item.entityType !== 'string' ||
    typeof item.entityId !== 'string' ||
    typeof item.fileName !== 'string' ||
    typeof item.fileSize !== 'number' || !Number.isFinite(item.fileSize) || item.fileSize < 0 ||
    typeof item.mimeType !== 'string' ||
    typeof item.uploadedBy !== 'string' ||
    typeof item.storageProvider !== 'string' || !STORAGE_PROVIDERS.has(item.storageProvider) ||
    typeof item.contentState !== 'string' || !CONTENT_STATES.has(item.contentState) ||
    typeof item.isArchived !== 'boolean' ||
    typeof item.createdAt !== 'string'
  ) throw new Error('Invalid attachment payload');

  for (const key of ['documentType','storageKey','checksum','createdBy','description','issueDate','expirationDate'] as const) {
    if (item[key] !== undefined && typeof item[key] !== 'string') throw new Error('Invalid attachment payload');
  }
  return item as unknown as FileAttachment;
}

async function apiError(response: Response, operation: string): Promise<AttachmentApiError> {
  let detail = `requisição falhou (${response.status})`;
  try {
    const payload = asRecord(await response.json());
    if (typeof payload.error === 'string') detail = payload.error;
  } catch {
    // Fail closed with status if body is not JSON.
  }
  return new AttachmentApiError(response.status, `${operation}: ${detail}`);
}

export interface AttachmentUploadInput {
  entityType:
    | 'Vehicle'
    | 'Driver'
    | 'DriverDocumentIntake'
    | 'VehicleDocumentIntake'
    | 'VehicleInspection'
    | 'Contract'
    | 'ContractTemplate'
    | 'HealthAndEmergency'
    | 'TrafficTicket'
    | 'MaintenanceWorkOrder'
    | 'Insurance'
    | 'Tracker';
  entityId: string;
  documentType?: string;
  fileName: string;
  mimeType: string;
  content: Blob;
  description?: string;
  issueDate?: string;
  expirationDate?: string;
}

function encodedHeader(value: string): string {
  return encodeURIComponent(value);
}

export class AttachmentClient {
  static async list(filters?: { entityType?: string; entityId?: string }): Promise<FileAttachment[]> {
    const params = new URLSearchParams();
    if (filters?.entityType) params.set('entityType', filters.entityType);
    if (filters?.entityId) params.set('entityId', filters.entityId);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const response = await fetch(`/api/attachments${suffix}`, { credentials: 'include' });
    if (!response.ok) throw await apiError(response, 'Falha ao listar anexos');
    const payload = asRecord(await response.json());
    if (!Array.isArray(payload.items)) throw new Error('Invalid attachment list payload');
    return payload.items.map(validateAttachment);
  }

  static async listEntityGallery(entityType:'Vehicle'|'Driver',entityId:string):Promise<FileAttachment[]> {
    const params=new URLSearchParams({entityType,entityId});
    const response=await fetch(`/api/attachments/gallery?${params.toString()}`,{credentials:'include'});
    if(!response.ok)throw await apiError(response,'Falha ao carregar arquivos relacionados');
    const payload=asRecord(await response.json());
    if(!Array.isArray(payload.items))throw new Error('Invalid attachment gallery payload');
    return payload.items.map(validateAttachment);
  }

  static async get(id: string): Promise<FileAttachment> {
    const response = await fetch(`/api/attachments/${encodeURIComponent(id)}`, { credentials: 'include' });
    if (!response.ok) throw await apiError(response, 'Falha ao consultar anexo');
    return validateAttachment(asRecord(await response.json()).item);
  }

  static async upload(input: AttachmentUploadInput): Promise<FileAttachment> {
    const headers = new Headers();
    headers.set('content-type', input.mimeType);
    headers.set('x-autoerp-entity-type', encodedHeader(input.entityType));
    headers.set('x-autoerp-entity-id', encodedHeader(input.entityId));
    headers.set('x-autoerp-file-name', encodedHeader(input.fileName));
    if (input.documentType) headers.set('x-autoerp-document-type', encodedHeader(input.documentType));
    if (input.description) headers.set('x-autoerp-description', encodedHeader(input.description));
    if (input.issueDate) headers.set('x-autoerp-issue-date', encodedHeader(input.issueDate));
    if (input.expirationDate) headers.set('x-autoerp-expiration-date', encodedHeader(input.expirationDate));

    const response = await fetch('/api/attachments', {
      method: 'POST',
      credentials: 'include',
      headers,
      body: input.content,
    });
    if (!response.ok) throw await apiError(response, 'Falha ao enviar anexo');
    return validateAttachment(asRecord(await response.json()).item);
  }

  static async content(id: string): Promise<Blob> {
    const response = await fetch(`/api/attachments/${encodeURIComponent(id)}/content`, { credentials: 'include' });
    if (!response.ok) throw await apiError(response, 'Falha ao visualizar/baixar anexo');
    const blob = await response.blob();
    if (!blob.type) throw new Error('Invalid attachment content response');
    return blob;
  }

  private static async lifecycle(id: string, action: 'archive' | 'restore'): Promise<FileAttachment> {
    const response = await fetch(`/api/attachments/${encodeURIComponent(id)}/${action}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    if (!response.ok) {
      const operation = action === 'archive' ? 'Falha ao arquivar anexo' : 'Falha ao restaurar anexo';
      throw await apiError(response, operation);
    }
    return validateAttachment(asRecord(await response.json()).item);
  }

  static async archive(id: string): Promise<FileAttachment> {
    return await this.lifecycle(id, 'archive');
  }

  static async restore(id: string): Promise<FileAttachment> {
    return await this.lifecycle(id, 'restore');
  }

  static async deletePermanently(id: string): Promise<{ deleted: true; storageRemoved: boolean }> {
    const response = await fetch(`/api/attachments/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!response.ok) throw await apiError(response, 'Falha ao excluir anexo definitivamente');
    const payload = asRecord(await response.json());
    if (payload.deleted !== true || typeof payload.storageRemoved !== 'boolean') {
      throw new Error('Invalid attachment delete payload');
    }
    return { deleted: true, storageRemoved: payload.storageRemoved };
  }
}
