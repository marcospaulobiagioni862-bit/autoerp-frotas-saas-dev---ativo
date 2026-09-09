import type { ContractTemplate } from '../types/entities';

export class ContractTemplateApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ContractTemplateApiError';
  }
}

type JsonRecord = Record<string, unknown>;
function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid contract template payload');
  return value as JsonRecord;
}

function validateTemplate(value: unknown): ContractTemplate {
  const item = asRecord(value);
  if (
    typeof item.id !== 'string' ||
    typeof item.companyId !== 'string' ||
    typeof item.templateKey !== 'string' ||
    typeof item.title !== 'string' ||
    typeof item.contentMarkdown !== 'string' ||
    typeof item.versionNumber !== 'number' || !Number.isInteger(item.versionNumber) || item.versionNumber < 1 ||
    typeof item.isCurrent !== 'boolean' ||
    typeof item.isActive !== 'boolean' ||
    typeof item.isArchived !== 'boolean' ||
    typeof item.createdBy !== 'string' ||
    typeof item.createdAt !== 'string' ||
    typeof item.updatedAt !== 'string'
  ) throw new Error('Invalid contract template payload');
  if (item.supersedesTemplateId !== undefined && typeof item.supersedesTemplateId !== 'string') {
    throw new Error('Invalid contract template payload');
  }
  return item as unknown as ContractTemplate;
}

async function apiError(response: Response): Promise<ContractTemplateApiError> {
  let message = `Contract template request failed (${response.status})`;
  try {
    const payload = asRecord(await response.json());
    if (typeof payload.error === 'string') message = payload.error;
  } catch {
    // Preserve status and fail closed.
  }
  return new ContractTemplateApiError(response.status, message);
}

async function itemRequest(url: string, init?: RequestInit): Promise<ContractTemplate> {
  const response = await fetch(url, { credentials: 'include', ...init });
  if (!response.ok) throw await apiError(response);
  return validateTemplate(asRecord(await response.json()).item);
}

export type ContractTemplateSourceMode = 'MARKDOWN' | 'FILE';

export interface ContractTemplateCreateInput {
  templateKey?: string;
  title: string;
  contentMarkdown?: string;
  sourceMode?: ContractTemplateSourceMode;
  isActive?: boolean;
}

export class ContractTemplateClient {
  static async ensureMoveFlexDefault(): Promise<ContractTemplate> {
    return itemRequest('/api/contract-templates/ensure-moveflex-default', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
  }

  static async list(filters?: { currentOnly?: boolean; activeOnly?: boolean; includeArchived?: boolean }): Promise<ContractTemplate[]> {
    const params = new URLSearchParams();
    if (filters?.currentOnly === false) params.set('currentOnly', 'false');
    if (filters?.activeOnly === false) params.set('activeOnly', 'false');
    if (filters?.includeArchived) params.set('includeArchived', 'true');
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const response = await fetch(`/api/contract-templates${suffix}`, { credentials: 'include' });
    if (!response.ok) throw await apiError(response);
    const payload = asRecord(await response.json());
    if (!Array.isArray(payload.items)) throw new Error('Invalid contract template list payload');
    return payload.items.map(validateTemplate);
  }

  static async get(id: string): Promise<ContractTemplate> {
    return itemRequest(`/api/contract-templates/${encodeURIComponent(id)}`);
  }

  static async versions(id: string): Promise<ContractTemplate[]> {
    const response = await fetch(`/api/contract-templates/${encodeURIComponent(id)}/versions`, { credentials: 'include' });
    if (!response.ok) throw await apiError(response);
    const payload = asRecord(await response.json());
    if (!Array.isArray(payload.items)) throw new Error('Invalid contract template versions payload');
    return payload.items.map(validateTemplate);
  }

  static async create(input: ContractTemplateCreateInput): Promise<ContractTemplate> {
    return itemRequest('/api/contract-templates', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    });
  }

  static async createVersion(id: string, input: { title?: string; contentMarkdown?: string; sourceMode?: ContractTemplateSourceMode; isActive?: boolean }): Promise<ContractTemplate> {
    return itemRequest(`/api/contract-templates/${encodeURIComponent(id)}/versions`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    });
  }

  static async promoteFileSource(id: string): Promise<ContractTemplate> {
    return itemRequest(`/api/contract-templates/${encodeURIComponent(id)}/promote-file-source`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    });
  }

  static async archive(id: string): Promise<ContractTemplate> {
    return itemRequest(`/api/contract-templates/${encodeURIComponent(id)}/archive`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    });
  }

  static async restore(id: string): Promise<ContractTemplate> {
    return itemRequest(`/api/contract-templates/${encodeURIComponent(id)}/restore`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    });
  }
}
