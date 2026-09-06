import { ContractStatus, RecurringFrequency } from '../enums';

export interface Contract {
  id: string; // UUID
  companyId: string;
  contractNumber: string;
  driverId: string;
  vehicleId: string;
  startDate: string;
  endDate?: string;
  status: ContractStatus;
  rentalAmount: number; // Regular periodicity fee
  billingPeriodicity: RecurringFrequency; // WEEKLY / MONTHLY
  billingDueDayOfWeek?: number; // 1-7 for weekly
  billingDueDayOfMonth?: number; // 1-31 for monthly
  securityDepositAmount: number;
  securityDepositId?: string;
  franchiseKm: number; // e.g. 1500 km/week
  excessKmRate: number; // R$ per excess km
  paymentMethodId?: string;
  templateId?: string;
  generatedPdfUrl?: string;
  signedContractUrl?: string;
  signatureRequired?: boolean;
  notes?: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ContractTemplate {
  id: string;
  companyId: string;
  templateKey: string;
  title: string;
  contentMarkdown: string;
  versionNumber: number;
  supersedesTemplateId?: string;
  isCurrent: boolean;
  isActive: boolean;
  isArchived: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type ContractArtifactType = 'GENERATED_PDF' | 'GENERATED_DOCX' | 'REVIEWED_FINAL_PDF' | 'SIGNED_EVIDENCE';
export type ContractSignatureMethod = 'SIGNED_PDF_UPLOAD' | 'GOV_BR' | 'NOTARY';

export interface ContractArtifact {
  id: string;
  companyId: string;
  contractId: string;
  artifactType: ContractArtifactType;
  attachmentId: string;
  templateId?: string;
  sourceArtifactId?: string;
  snapshotJson?: string;
  snapshotHash: string;
  isCurrent: boolean;
  isArchived: boolean;
  signatureMethod?: ContractSignatureMethod;
  signedByName?: string;
  signedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
