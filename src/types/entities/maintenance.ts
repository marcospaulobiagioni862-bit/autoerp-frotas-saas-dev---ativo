import { MaintenanceType, MaintenanceStatus } from '../enums';

export interface Supplier {
  id: string; companyId: string; name: string; tradeName?: string; document: string; phone: string; email?: string; address?: string; category: string;
  bankInfo?: { bank: string; agency: string; account: string; pixKey?: string };
  status: 'ACTIVE' | 'INACTIVE'; notes?: string; createdAt: string; updatedAt: string;
}

export interface Maintenance {
  id: string; companyId: string; vehicleId: string; supplierId?: string; type: MaintenanceType; description: string; kmAtMaintenance: number;
  nextMaintenanceKm?: number; partsCost: number; laborCost: number; totalCost: number; status: MaintenanceStatus; startDate: string; completionDate?: string;
  accountPayableId?: string; receiptUrls?: string[]; notes?: string; createdAt: string; updatedAt: string;
}

export type WorkOrderStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_PARTS' | 'WAITING_APPROVAL' | 'COMPLETED' | 'CANCELLED';
export interface WorkOrderPartItem { id:string; partId?:string; description:string; quantity:number; unitCost:number; totalCost:number; }
export interface WorkOrderServiceItem { id:string; serviceId?:string; description:string; quantity:number; unitCost:number; totalCost:number; }
export interface WorkOrderLaborItem { id:string; description:string; hours:number; hourlyRate:number; totalCost:number; }
export interface WorkOrder {
  id:string; companyId:string; number:string; vehicleId:string; supplierId?:string; status:WorkOrderStatus; openedAt:string; startedAt?:string; completedAt?:string;
  cancelledAt?:string; entryKm:number; exitKm?:number; description:string; diagnosis?:string; notes?:string; parts:WorkOrderPartItem[]; services:WorkOrderServiceItem[];
  laborItems:WorkOrderLaborItem[]; subtotalParts:number; subtotalServices:number; subtotalLabor:number; discount:number; total:number; accountPayableId?:string;
  receiptUrls?:string[]; createdBy?:string; createdAt:string; updatedAt:string;
}

export interface Part {
  id:string; companyId:string; code:string; name:string; description?:string; manufacturer?:string; category:string; unit:string; currentCost:number;
  minimumStock:number; currentStock:number; status:'ACTIVE'|'INACTIVE'; createdAt:string; updatedAt:string;
}
export interface ServiceItem { id:string; companyId:string; name:string; description?:string; category:string; defaultCost:number; status:'ACTIVE'|'INACTIVE'; createdAt:string; updatedAt:string; }

export type MaintenancePlanPriority = 'LOW'|'MEDIUM'|'HIGH'|'CRITICAL';
export type MaintenancePlanStatus = 'ACTIVE'|'PAUSED'|'COMPLETED';
export type MaintenanceDueStage = 'NONE'|'D90'|'D60'|'D30'|'D15'|'D7'|'DUE_TODAY'|'POST_DUE'|'KM1000'|'KM500'|'DUE_KM'|'OVERDUE_KM';
export type MaintenanceProjectedStatus = 'OK'|'UPCOMING'|'DUE'|'OVERDUE'|'PAUSED'|'COMPLETED';
export interface MaintenancePlan {
  id:string; companyId:string; vehicleId:string; name:string; maintenanceType:string; intervalKm?:number; intervalDays?:number;
  lastExecutionKm?:number; lastExecutionDate?:string; nextDueKm?:number; nextDueDate?:string; priority:MaintenancePlanPriority; estimatedCost?:number;
  status:MaintenancePlanStatus; notes?:string; lastWorkOrderId?:string; cycleSequence:number; createdBy:string; createdAt:string; updatedAt:string;
  projectedStatus?:MaintenanceProjectedStatus; projectedStage?:MaintenanceDueStage; dueReference?:string; remainingKm?:number; remainingDays?:number;
}

export interface OilChangeRecord {
  id:string; companyId:string; vehicleId:string; workOrderId?:string; km:number; date:string; oilType:string; oilBrand:string; quantity:number;
  filterChanged:boolean; nextKm:number; nextDate?:string; supplierId?:string; attachmentId?:string; notes?:string; createdBy?:string; createdAt:string; updatedAt:string;
}

export type TireStatus = 'ACTIVE'|'REMOVED'|'REPLACED'|'DAMAGED';
export interface TireRecord {
  id:string; companyId:string; vehicleId:string; position:string; brand:string; model:string; measure?:string; serialNumber?:string; installationDate:string;
  installationKm:number; treadDepth?:number; status:TireStatus; lastRotationDate?:string; lastRotationKm?:number; nextRotationDate?:string; nextRotationKm?:number;
  removalDate?:string; removalKm?:number; removalReason?:string; cost:number; supplierId?:string; attachmentId?:string; notes?:string; createdBy?:string;
  createdAt:string; updatedAt:string;
}
