import { VehicleStatus } from '../enums';

export interface Vehicle {
  id: string; // UUID
  companyId: string;
  plate: string; // Unique
  brand: string;
  model: string;
  version?: string;
  yearFabrication: number;
  yearModel: number;
  year?: number;
  color: string;
  renavam: string;
  chassis: string;
  currentKm: number;
  nextMaintenanceKm?: number;
  fuelType: string;
  category: string;
  acquisitionValue: number;
  currentValue: number;
  rentalValueBase: number;
  ownerType?: string; // VehicleOwnerType
  ownerName?: string;
  ownerDocument?: string;
  possessionType?: string; // VehiclePossessionType
  financialRestriction?: string; // VehicleFinancialRestriction
  financialInstitution?: string;
  crlvExerciseYear?: number;
  registrationCity?: string;
  registrationState?: string;
  claSecurityCode?: string;
  sneCoverageStatus?: string; // VehicleSneCoverageStatus
  status: VehicleStatus;
  currentDriverId?: string;
  currentContractId?: string;
  photoUrls?: string[];
  notes?: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleOwnershipHistory {
  id: string; // UUID
  companyId: string;
  vehicleId: string;
  ownerType: string;
  ownerName: string;
  ownerDocument?: string;
  possessionType: string;
  financialRestriction: string;
  financialInstitution?: string;
  effectiveFrom: string;
  effectiveTo?: string;
  reason?: string;
  documentAttachmentId?: string;
  createdBy: string;
  createdAt: string;
}

export interface KmRecord {
  id: string; // UUID
  companyId: string;
  vehicleId: string;
  driverId?: string;
  contractId?: string;
  kmValue: number;
  recordDate: string;
  readingType: 'CHECK_IN' | 'CHECK_OUT' | 'PERIODIC' | 'MAINTENANCE';
  photoUrl?: string;
  notes?: string;
  createdAt: string;
}
