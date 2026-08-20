export interface Tracker {
  id: string;
  companyId: string;
  vehicleId: string;
  /** Preserved legacy serial number when present. */
  serialNumber?: string;
  /** DB columns may be NULL on legacy rows; API normalizes them to empty values for safe display. */
  equipmentModel: string;
  imei: string;
  chipCarrier: string;
  chipNumber: string;
  monthlyCost: number;
  installationDate: string;
  status: 'ACTIVE' | 'INACTIVE' | 'REMOVED';
  supplierId?: string;
  notes?: string;
  lastPing?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}
