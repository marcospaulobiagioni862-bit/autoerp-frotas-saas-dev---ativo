export type InsuranceStatus = 'ACTIVE' | 'EXPIRED' | 'CANCELLED';

export interface Insurance {
  id: string;
  companyId: string;
  vehicleId: string;
  insuranceCompany: string;
  policyNumber: string;
  coverageDetails: string;
  deductibleAmount: number;
  totalPremiumAmount: number;
  installmentsCount: number;
  startDate: string;
  endDate: string;
  status: InsuranceStatus;
  brokerName?: string;
  brokerPhone?: string;
  cancellationReason?: string;
  cancelledAt?: string;
  accountPayableIds?: string[];
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  /** Legacy-only field retained for compile compatibility. New uploads use FileAttachment. */
  fileUrl?: string;
}
