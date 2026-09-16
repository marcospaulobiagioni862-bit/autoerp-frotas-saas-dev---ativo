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
  notes?: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ContractTemplate {
  id: string; // UUID
  companyId: string;
  title: string;
  contentMarkdown: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
