import { DocumentStatus } from '../enums';

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
