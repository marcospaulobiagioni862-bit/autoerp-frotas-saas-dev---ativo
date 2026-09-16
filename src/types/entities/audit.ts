import { AuditAction } from '../enums';

export interface AuditLog {
  id: string; // UUID
  companyId: string;
  entityName: string; // Vehicle, FinancialTransaction, Contract, etc.
  entityId: string;
  action: AuditAction;
  previousState?: string; // JSON string
  newState?: string; // JSON string
  userId: string;
  userName: string;
  ipAddress?: string;
  timestamp: string; // ISO Date
}

export interface FileAttachment {
  id: string; // UUID
  companyId: string;
  entityName: string;
  entityId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: string;
  createdAt: string;
  // Extended production ready fields
  entityType?: string;
  documentType?: string;
  storageProvider?: 'LOCAL' | 'CLOUD';
  storageKey?: string;
  checksum?: string;
  createdBy?: string;
  isArchived?: boolean;
  description?: string;
  issueDate?: string;
  expirationDate?: string;
}

export interface ArchivedRecord {
  id: string; // UUID
  companyId: string;
  originalEntityName: string;
  originalEntityId: string;
  recordDataJson: string;
  archivedBy: string;
  archivedAt: string;
  reason?: string;
}

export interface Notification {
  id: string; // UUID
  companyId: string;
  title: string;
  message: string;
  type: 'INFO' | 'WARNING' | 'DANGER' | 'SUCCESS';
  entityName?: string;
  entityId?: string;
  read: boolean;
  createdAt: string;
}
