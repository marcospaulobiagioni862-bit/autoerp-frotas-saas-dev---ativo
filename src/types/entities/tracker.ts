export interface Tracker {
  id: string; // UUID
  companyId: string;
  vehicleId: string;
  equipmentModel: string;
  imei: string;
  chipCarrier: string;
  chipNumber: string;
  monthlyCost: number;
  installationDate: string;
  status: 'ACTIVE' | 'INACTIVE' | 'REMOVED';
  supplierId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
