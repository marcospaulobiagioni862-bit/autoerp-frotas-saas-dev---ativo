import { DocumentStatus } from '../enums';

// Legacy compatibility shape. SECURITY-2I4B moves operational authority to DocumentRecord.
export interface VehicleDocument {
  id: string; // UUID
  companyId: string;
  vehicleId: string;
  documentType: string; // CRLV, IPVA, Licenciamento, Vistoria, etc.
  documentNumber?: string;
  issueDate?: string;
  expirationDate: string;
  status: DocumentStatus;
  cost?: number;
  accountPayableId?: string;
  fileUrl?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type DocumentSubjectType = 'VEHICLE' | 'DRIVER';
export type DocumentAlertStage = 'POST_DUE' | 'DUE_TODAY' | 'D7' | 'D15' | 'D30' | 'D60' | 'D90' | 'NONE';

export interface DocumentRecord {
  id: string;
  companyId: string;
  subjectType: DocumentSubjectType;
  subjectId: string;
  documentType: string;
  documentNumber?: string;
  referenceYear?: number;
  issueDate?: string;
  expirationDate?: string;
  attachmentId?: string;
  versionNumber: number;
  supersedesDocumentId?: string;
  isCurrent: boolean;
  isArchived: boolean;
  cost: number;
  payableId?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  complianceStatus: DocumentStatus;
  daysToExpiration?: number;
  alertStage: DocumentAlertStage;
}
