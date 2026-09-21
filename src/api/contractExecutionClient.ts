import type { Contract, ContractArtifact, ContractSignatureMethod, FileAttachment } from '../types/entities';
import { runIdempotentMutation } from './idempotentMutation';
import { asApiRecord, normalizeNumericFields } from './apiPayloadNormalization';

export class ContractExecutionApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly code?: string) {
    super(message);
    this.name = 'ContractExecutionApiError';
  }
}


function validateArtifact(value: unknown): ContractArtifact {
  const item = normalizeNumericFields(asApiRecord(value, 'contract execution contract'), ['rentalAmount', 'securityDepositAmount', 'franchiseKm', 'excessKmRate']);
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
  if (item.signatureMethod !== undefined && item.signatureMethod !== 'MANUAL_CONFIRMATION' && item.signatureMethod !== 'SIGNED_PDF_UPLOAD' && item.signatureMethod !== 'GOV_BR' && item.signatureMethod !== 'NOTARY') {
    throw new Error('Invalid contract artifact payload');
  }
  return item as unknown as ContractArtifact;
}

function validateAttachment(value: unknown): FileAttachment {
  const item = normalizeNumericFields(asApiRecord(value, 'contract execution contract'), ['rentalAmount', 'securityDepositAmount', 'franchiseKm', 'excessKmRate']);
  if (
    typeof item.id !== 'string' || typeof item.companyId !== 'string' || typeof item.entityType !== 'string' ||
    typeof item.entityId !== 'string' || typeof item.fileName !== 'string' || typeof item.fileSize !== 'number' ||
    typeof item.mimeType !== 'string' || typeof item.storageProvider !== 'string' || typeof item.contentState !== 'string' ||
    typeof item.isArchived !== 'boolean' || typeof item.createdAt !== 'string'
  ) throw new Error('Invalid contract execution attachment payload');
  return item as unknown as FileAttachment;
}

function validateContract(value: unknown): Contract {
  const item = asApiRecord(value, 'contract execution');
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
  let code: string | undefined;
  try {
    const payload = asApiRecord(await response.json(), 'contract execution');
    if (typeof payload.error === 'string') message = payload.error;
    if (typeof payload.code === 'string') code = payload.code;
  } catch {
    // Preserve status and fail closed.
  }
  return new ContractExecutionApiError(response.status, message, code);
}

async function generatedRequest(contractId: string, action: 'generate-pdf' | 'generate-docx' | 'generate-pdf-from-docx') {
  return runIdempotentMutation(`contract:${contractId}:${action}`, async (token) => {
    const response = await fetch(`/api/contracts/${encodeURIComponent(contractId)}/${action}`, {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', 'x-idempotency-key': token },
      body: '{}',
    });
    if (!response.ok) throw await apiError(response);
    const payload = asApiRecord(await response.json(), 'contract execution');
    return {
      artifact: validateArtifact(payload.artifact),
      attachment: validateAttachment(payload.attachment),
      contract: validateContract(payload.contract),
    };
  });
}

export class ContractExecutionClient {
  static async listArtifacts(contractId: string): Promise<ContractArtifact[]> {
    const response = await fetch(`/api/contracts/${encodeURIComponent(contractId)}/artifacts`, { credentials: 'include' });
    if (!response.ok) throw await apiError(response);
    const payload = asApiRecord(await response.json(), 'contract execution');
    if (!Array.isArray(payload.items)) throw new Error('Invalid contract artifact list payload');
    return payload.items.map(validateArtifact);
  }

  static async generatePdf(contractId: string, _legacyTemplateId?: string): Promise<{ artifact: ContractArtifact; attachment: FileAttachment; contract: Contract }> {
    return generatedRequest(contractId, 'generate-pdf');
  }

  static async generatePdfFromDocx(contractId: string): Promise<{ artifact: ContractArtifact; attachment: FileAttachment; contract: Contract }> {
    return generatedRequest(contractId, 'generate-pdf-from-docx');
  }

  static async generateDocx(contractId: string, _legacyTemplateId?: string): Promise<{ artifact: ContractArtifact; attachment: FileAttachment; contract: Contract }> {
    return generatedRequest(contractId, 'generate-docx');
  }

  static async registerReviewedFinalPdf(contractId: string, attachmentId: string): Promise<ContractArtifact> {
    const response = await fetch(`/api/contracts/${encodeURIComponent(contractId)}/reviewed-final-pdf`, {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ attachmentId }),
    });
    if (!response.ok) throw await apiError(response);
    return validateArtifact(asApiRecord(await response.json(), 'contract execution').artifact);
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
    return validateArtifact(asApiRecord(await response.json(), 'contract execution').artifact);
  }

  static async setManualSignStatus(contractId: string, signed: boolean): Promise<{ contract: Contract; artifact: ContractArtifact | null; signed: boolean }> {
    const response = await fetch(`/api/contracts/${encodeURIComponent(contractId)}/sign-status`, {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ signed }),
    });
    if (!response.ok) throw await apiError(response);
    const payload = asApiRecord(await response.json(), 'contract execution');
    if (typeof payload.signed !== 'boolean') throw new Error('Invalid contract sign status payload');
    return {
      contract: validateContract(payload.contract),
      artifact: payload.artifact === null ? null : validateArtifact(payload.artifact),
      signed: payload.signed,
    };
  }
}
