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
  status: VehicleStatus;
  currentDriverId?: string;
  currentContractId?: string;
  photoUrls?: string[];
  notes?: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
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
  sourceType?: 'MANUAL' | 'DRIVER_PHOTO' | 'TRACKER';
  sourceAttachmentId?: string;
  sourceTrackerId?: string;
  sourceObservedAt?: string;
  photoUrl?: string;
  notes?: string;
  createdAt: string;
}
