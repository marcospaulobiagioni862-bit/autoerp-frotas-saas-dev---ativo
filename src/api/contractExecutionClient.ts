import type { Contract, ContractArtifact, ContractSignatureMethod, FileAttachment } from '../types/entities';

export class ContractExecutionApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ContractExecutionApiError';
  }
}

type JsonRecord = Record<string, unknown>;
function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid contract execution payload');
  return value as JsonRecord;
}

function validateArtifact(value: unknown): ContractArtifact {
  const item = asRecord(value);
  if (
    typeof item.id !== 'string' || typeof item.companyId !== 'string' || typeof item.contractId !== 'string' ||
    (item.artifactType !== 'GENERATED_PDF' && item.artifactType !== 'GENERATED_DOCX' && item.artifactType !== 'REVIEWED_FINAL_PDF' && item.artifactType !== 'SIGNED_EVIDENCE') ||
    typeof item.attachmentId !== 'string' || typeof item.snapshotHash !== 'string' || !/^[0-9a-f]{64}$/.test(item.snapshotHash) ||
    typeof item.isCurrent !== 'boolean' || typeof item.isArchived !== 'boolean' ||
    typeof item.createdBy !== 'string' || typeof item.createdAt !== 'string' || typeof item.updatedAt !== 'string'
  ) throw new Error('Invalid contract artifact payload');
  for (const key of ['templateId','sourceArtifactId','snapshotJson','signedByName','signedAt'] as const) {
    if (item[key] !== undefined && typeof item[key] !== 'string') throw new Error('Invalid contract artifact payload');
  }
  if (item.signatureMethod !== undefined && item.signatureMethod !== 'SIGNED_PDF_UPLOAD' && item.signatureMethod !== 'GOV_BR') {
    throw new Error('Invalid contract artifact payload');
  }
  return item as unknown as ContractArtifact;
}

function validateAttachment(value: unknown): FileAttachment {
  const item = asRecord(value);
  if (
    typeof item.id !== 'string' || typeof item.companyId !== 'string' || typeof item.entityType !== 'string' ||
    typeof item.entityId !== 'string' || typeof item.fileName !== 'string' || typeof item.fileSize !== 'number' ||
    typeof item.mimeType !== 'string' || typeof item.storageProvider !== 'string' || typeof item.contentState !== 'string' ||
    typeof item.isArchived !== 'boolean' || typeof item.createdAt !== 'string'
  ) throw new Error('Invalid contract execution attachment payload');
  return item as unknown as FileAttachment;
}

function validateContract(value: unknown): Contract {
  const item = asRecord(value);
  if (
    typeof item.id !== 'string' || typeof item.companyId !== 'string' || typeof item.contractNumber !== 'string' ||
    typeof item.driverId !== 'string' || typeof item.vehicleId !== 'string' || typeof item.status !== 'string' ||
    typeof item.rentalAmount !== 'number' || typeof item.isArchived !== 'boolean' ||
    typeof item.createdAt !== 'string' || typeof item.updatedAt !== 'string'
  ) throw new Error('Invalid contract execution contract payload');
  return item as unknown as Contract;
}

async function apiError(response: Response): Promise<ContractExecutionApiError> {
  let message = `Contract execution request failed (${response.status})`;
  try {
    const payload = asRecord(await response.json());
    if (typeof payload.error === 'string') message = payload.error;
  } catch {
    // Preserve status and fail closed.
  }
  return new ContractExecutionApiError(response.status, message);
}

export class ContractExecutionClient {
  static async listArtifacts(contractId: string): Promise<ContractArtifact[]> {
    const response = await fetch(`/api/contracts/${encodeURIComponent(contractId)}/artifacts`, { credentials: 'include' });
    if (!response.ok) throw await apiError(response);
    const payload = asRecord(await response.json());
    if (!Array.isArray(payload.items)) throw new Error('Invalid contract artifact list payload');
    return payload.items.map(validateArtifact);
  }

  static async generatePdf(contractId: string, templateId: string): Promise<{ artifact: ContractArtifact; attachment: FileAttachment; contract: Contract }> {
    const response = await fetch(`/api/contracts/${encodeURIComponent(contractId)}/generate-pdf`, {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ templateId }),
    });
    if (!response.ok) throw await apiError(response);
    const payload = asRecord(await response.json());
    return {
      artifact: validateArtifact(payload.artifact),
      attachment: validateAttachment(payload.attachment),
      contract: validateContract(payload.contract),
    };
  }

  static async generatePdfFromDocx(contractId: string): Promise<{ artifact: ContractArtifact; attachment: FileAttachment; contract: Contract }> {
    const response = await fetch(`/api/contracts/${encodeURIComponent(contractId)}/generate-pdf-from-docx`, {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    if (!response.ok) throw await apiError(response);
    const payload = asRecord(await response.json());
    return {
      artifact: validateArtifact(payload.artifact),
      attachment: validateAttachment(payload.attachment),
      contract: validateContract(payload.contract),
    };
  }

  static async generateDocx(contractId: string, templateId: string): Promise<{ artifact: ContractArtifact; attachment: FileAttachment; contract: Contract }> {
    const response = await fetch(`/api/contracts/${encodeURIComponent(contractId)}/generate-docx`, {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ templateId }),
    });
    if (!response.ok) throw await apiError(response);
    const payload = asRecord(await response.json());
    return {
      artifact: validateArtifact(payload.artifact),
      attachment: validateAttachment(payload.attachment),
      contract: validateContract(payload.contract),
    };
  }

  static async registerReviewedFinalPdf(
    contractId: string,
    attachmentId: string
  ): Promise<ContractArtifact> {
    const response = await fetch(`/api/contracts/${encodeURIComponent(contractId)}/reviewed-final-pdf`, {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ attachmentId }),
    });
    if (!response.ok) throw await apiError(response);
    return validateArtifact(asRecord(await response.json()).artifact);
  }

  static async registerSignatureEvidence(
    contractId: string,
    input: { attachmentId: string; signedByName: string; signedAt?: string; signatureMethod?: ContractSignatureMethod }
  ): Promise<ContractArtifact> {
    const response = await fetch(`/api/contracts/${encodeURIComponent(contractId)}/signature-evidence`, {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw await apiError(response);
    return validateArtifact(asRecord(await response.json()).artifact);
  }
}
