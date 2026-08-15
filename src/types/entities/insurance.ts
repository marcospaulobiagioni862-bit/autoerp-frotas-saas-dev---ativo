import { DocumentStatus } from '../enums';

export interface Insurance {
  id: string; // UUID
  companyId: string;
  vehicleId: string;
  insuranceCompany: string;
  policyNumber: string;
  coverageDetails: string;
  deductibleAmount: number; // Franquia
  totalPremiumAmount: number; // Valor total da apólice
  installmentsCount: number;
  startDate: string;
  endDate: string;
  status: DocumentStatus;
  brokerName?: string;
  brokerPhone?: string;
  fileUrl?: string;
  createdAt: string;
  updatedAt: string;
}
