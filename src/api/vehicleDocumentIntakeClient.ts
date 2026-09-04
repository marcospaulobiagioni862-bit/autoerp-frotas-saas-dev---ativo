export type VehicleDocumentIntakeStatus =
  | 'DRAFT' | 'DOCUMENT_UPLOADED' | 'EXTRACTING' | 'REVIEW_REQUIRED' | 'APPROVED' | 'CONSUMED' | 'FAILED' | 'ARCHIVED';
export type VehicleIntakeDocumentType = 'CRLV' | 'CRV' | 'ATPV_E';

export interface VehicleDocumentAiExtraction {
  id:string;
  attachmentId:string;
  attachmentChecksum:string;
  status:string;
  createdAt:string;
  updatedAt:string;
}

export interface VehicleDocumentIntake {
  id: string;
  companyId: string;
  createdBy: string;
  status: VehicleDocumentIntakeStatus;
  idempotencyKey: string;
  documentType: VehicleIntakeDocumentType;
  attachmentId?: string;
  approvedExtractionId?: string;
  vehicleId?: string;
  expiresAt: string;
  consumedAt?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid vehicle document intake payload');
  return value as Record<string, unknown>;
}
function validate(value: unknown): VehicleDocumentIntake {
  const item = record(value);
  const statuses = new Set(['DRAFT','DOCUMENT_UPLOADED','EXTRACTING','REVIEW_REQUIRED','APPROVED','CONSUMED','FAILED','ARCHIVED']);
  const types = new Set(['CRLV','CRV','ATPV_E']);
  for (const key of ['id','companyId','createdBy','status','idempotencyKey','documentType','expiresAt','createdAt','updatedAt']) {
    if (typeof item[key] !== 'string') throw new Error('Invalid vehicle document intake payload');
  }
  if (!statuses.has(String(item.status)) || !types.has(String(item.documentType))) throw new Error('Invalid vehicle document intake payload');
  return item as unknown as VehicleDocumentIntake;
}
async function errorMessage(response: Response): Promise<string> {
  try { const payload = record(await response.json()); if (typeof payload.error === 'string') return payload.error; } catch {}
  return `Vehicle document intake request failed (${response.status})`;
}
export class VehicleDocumentIntakeClient {
  static async create(idempotencyKey: string, documentType: VehicleIntakeDocumentType): Promise<VehicleDocumentIntake> {
    const response = await fetch('/api/vehicle-document-intakes', {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idempotencyKey, documentType }),
    });
    if (!response.ok) throw new Error(await errorMessage(response));
    return validate(record(await response.json()).item);
  }
  static async get(id: string): Promise<VehicleDocumentIntake> {
    const response = await fetch(`/api/vehicle-document-intakes/${encodeURIComponent(id)}`, { credentials: 'include' });
    if (!response.ok) throw new Error(await errorMessage(response));
    return validate(record(await response.json()).item);
  }
  static async analyze(id: string): Promise<VehicleDocumentAiExtraction> {
    const response = await fetch(`/api/vehicle-document-intakes/${encodeURIComponent(id)}/document-ai`, {
      method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:'{}',
    });
    if(!response.ok) throw new Error(await errorMessage(response));
    const item=record(record(await response.json()).item);
    for(const key of ['id','attachmentId','attachmentChecksum','status','createdAt','updatedAt']){
      if(typeof item[key]!=='string') throw new Error('Invalid vehicle document AI payload');
    }
    return item as unknown as VehicleDocumentAiExtraction;
  }
}
