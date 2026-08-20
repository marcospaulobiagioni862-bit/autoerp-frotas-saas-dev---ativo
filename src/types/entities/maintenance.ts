import { MaintenanceType, MaintenanceStatus } from '../enums';

export interface Supplier {
  id: string; // UUID
  companyId: string;
  name: string;
  tradeName?: string;
  document: string; // CPF or CNPJ
  phone: string;
  email?: string;
  address?: string;
  category: string; // Mechanics, Parts, Insurance, Tracker, Legal, etc.
  bankInfo?: {
    bank: string;
    agency: string;
    account: string;
    pixKey?: string;
  };
  status: 'ACTIVE' | 'INACTIVE';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Maintenance {
  id: string; // UUID
  companyId: string;
  vehicleId: string;
  supplierId?: string;
  type: MaintenanceType;
  description: string;
  kmAtMaintenance: number;
  nextMaintenanceKm?: number;
  partsCost: number;
  laborCost: number;
  totalCost: number; // partsCost + laborCost
  status: MaintenanceStatus;
  startDate: string;
  completionDate?: string;
  accountPayableId?: string;
  receiptUrls?: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type WorkOrderStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_PARTS' | 'WAITING_APPROVAL' | 'COMPLETED' | 'CANCELLED';

export interface WorkOrderPartItem {
  id: string;
  partId?: string;
  description: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

export interface WorkOrderServiceItem {
  id: string;
  serviceId?: string;
  description: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

export interface WorkOrderLaborItem {
  id: string;
  description: string;
  hours: number;
  hourlyRate: number;
  totalCost: number;
}

export interface WorkOrder {
  id: string;
  companyId: string;
  number: string;
  vehicleId: string;
  supplierId?: string;
  status: WorkOrderStatus;
  openedAt: string;
  startedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  entryKm: number;
  exitKm?: number;
  description: string;
  diagnosis?: string;
  notes?: string;
  parts: WorkOrderPartItem[];
  services: WorkOrderServiceItem[];
  laborItems: WorkOrderLaborItem[];
  subtotalParts: number;
  subtotalServices: number;
  subtotalLabor: number;
  discount: number;
  total: number;
  accountPayableId?: string;
  receiptUrls?: string[];
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Part {
  id: string;
  companyId: string;
  code: string;
  name: string;
  description?: string;
  manufacturer?: string;
  category: string;
  unit: string;
  currentCost: number;
  minimumStock: number;
  currentStock: number;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export interface ServiceItem {
  id: string;
  companyId: string;
  name: string;
  description?: string;
  category: string;
  defaultCost: number;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export interface OilChangeRecord {
  id: string;
  companyId: string;
  vehicleId: string;
  km: number;
  date: string;
  oilType: string;
  oilBrand: string;
  quantity: number;
  filterChanged: boolean;
  nextKm: number;
  nextDate?: string;
  supplierId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TireRecord {
  id: string;
  companyId: string;
  vehicleId: string;
  position: string;
  brand: string;
  model: string;
  serialNumber?: string;
  installationDate: string;
  installationKm: number;
  removalDate?: string;
  removalKm?: number;
  cost: number;
  supplierId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
