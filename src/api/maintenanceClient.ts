import type { Part, Supplier, WorkOrder, WorkOrderFinancialComponent, WorkOrderStatus } from '../types/entities';

export class MaintenanceApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'MaintenanceApiError';
  }
}

export type PartStockManualMovementType='ENTRY'|'ADJUSTMENT_IN'|'ADJUSTMENT_OUT'|'RETURN'|'LOSS';
export interface PartStockMovement {
  id:string; companyId:string; partId:string; movementType:PartStockManualMovementType|'USE_WORK_ORDER'|'REVERSAL'; quantityDelta:number; balanceAfter:number;
  workOrderId?:string; vehicleId?:string; reason?:string; reversedMovementId?:string; idempotencyKey:string; userId:string; userName:string; createdAt:string;
}

type JsonRecord = Record<string, unknown>;
const WORK_ORDER_STATUSES = new Set<WorkOrderStatus>(['OPEN','IN_PROGRESS','WAITING_PARTS','WAITING_APPROVAL','COMPLETED','CANCELLED','ARCHIVED']);
function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid maintenance API response');
  return value as JsonRecord;
}
function finite(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`Invalid maintenance numeric field: ${field}`);
  return n;
}
function text(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`Invalid maintenance text field: ${field}`);
  return value;
}
function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new Error('Invalid optional maintenance field');
  return value;
}
function validatePartItem(value: unknown): any {
  const item = asRecord(value);
  return { id:text(item.id,'id'), partId:optionalString(item.partId), description:text(item.description,'description'), quantity:finite(item.quantity,'quantity'), unitCost:finite(item.unitCost,'unitCost'), totalCost:finite(item.totalCost,'totalCost') };
}
function validateServiceItem(value: unknown): any {
  const item = asRecord(value);
  return { id:text(item.id,'id'), serviceId:optionalString(item.serviceId), description:text(item.description,'description'), quantity:finite(item.quantity,'quantity'), unitCost:finite(item.unitCost,'unitCost'), totalCost:finite(item.totalCost,'totalCost') };
}
function validateLaborItem(value: unknown): any {
  const item = asRecord(value);
  return { id:text(item.id,'id'), description:text(item.description,'description'), hours:finite(item.hours,'hours'), hourlyRate:finite(item.hourlyRate,'hourlyRate'), totalCost:finite(item.totalCost,'totalCost') };
}
function validateFinancialComponent(value:unknown):WorkOrderFinancialComponent{const item=asRecord(value),kind=text(item.kind,'kind'),paymentCondition=text(item.paymentCondition,'paymentCondition');if(!['PARTS','SERVICES','LABOR'].includes(kind)||!['CASH','INSTALLMENTS'].includes(paymentCondition)||typeof item.hasInvoice!=='boolean')throw new Error('Invalid work order financial component');return{id:text(item.id,'id'),kind:kind as WorkOrderFinancialComponent['kind'],supplierId:optionalString(item.supplierId),categoryId:text(item.categoryId,'categoryId'),paymentMethodId:text(item.paymentMethodId,'paymentMethodId'),paymentCondition:paymentCondition as WorkOrderFinancialComponent['paymentCondition'],installmentsCount:finite(item.installmentsCount,'installmentsCount'),firstDueDate:text(item.firstDueDate,'firstDueDate').slice(0,10),grossAmount:finite(item.grossAmount,'grossAmount'),discountAmount:finite(item.discountAmount,'discountAmount'),netAmount:finite(item.netAmount,'netAmount'),hasInvoice:item.hasInvoice,invoiceNumber:optionalString(item.invoiceNumber),createdAt:text(item.createdAt,'createdAt'),updatedAt:text(item.updatedAt,'updatedAt')};}
function validateWorkOrder(value: unknown): WorkOrder {
  const item = asRecord(value);
  const status = text(item.status,'status') as WorkOrderStatus;
  if (!WORK_ORDER_STATUSES.has(status) || !Array.isArray(item.parts) || !Array.isArray(item.services) || !Array.isArray(item.laborItems) || !Array.isArray(item.financialComponents)) throw new Error('Invalid work order payload');
  return {
    id:text(item.id,'id'), companyId:text(item.companyId,'companyId'), number:text(item.number,'number'), vehicleId:text(item.vehicleId,'vehicleId'), supplierId:optionalString(item.supplierId),
    status, openedAt:text(item.openedAt,'openedAt'), serviceDate:optionalString(item.serviceDate), startedAt:optionalString(item.startedAt), completedAt:optionalString(item.completedAt), cancelledAt:optionalString(item.cancelledAt),
    entryKm:finite(item.entryKm,'entryKm'), exitKm:item.exitKm === undefined || item.exitKm === null ? undefined : finite(item.exitKm,'exitKm'),
    description:text(item.description,'description'), diagnosis:optionalString(item.diagnosis), notes:optionalString(item.notes),
    parts:item.parts.map(validatePartItem), services:item.services.map(validateServiceItem), laborItems:item.laborItems.map(validateLaborItem), financialComponents:item.financialComponents.map(validateFinancialComponent),
    subtotalParts:finite(item.subtotalParts,'subtotalParts'), subtotalServices:finite(item.subtotalServices,'subtotalServices'), subtotalLabor:finite(item.subtotalLabor,'subtotalLabor'),
    discount:finite(item.discount,'discount'), total:finite(item.total,'total'), accountPayableId:optionalString(item.accountPayableId),
    createdBy:optionalString(item.createdBy), createdAt:text(item.createdAt,'createdAt'), updatedAt:text(item.updatedAt,'updatedAt'),
  };
}
function validateSupplier(value: unknown): Supplier {
  const item = asRecord(value);
  const status = text(item.status,'status'); if (status !== 'ACTIVE' && status !== 'INACTIVE') throw new Error('Invalid supplier status');
  return { id:text(item.id,'id'), companyId:text(item.companyId,'companyId'), name:text(item.name,'name'), tradeName:optionalString(item.tradeName), document:text(item.document,'document'), phone:text(item.phone,'phone'), email:optionalString(item.email), address:optionalString(item.address), category:text(item.category,'category'), status, notes:optionalString(item.notes), createdAt:text(item.createdAt,'createdAt'), updatedAt:text(item.updatedAt,'updatedAt') };
}
function validatePart(value: unknown): Part {
  const item = asRecord(value); const status=text(item.status,'status'); if(status!=='ACTIVE'&&status!=='INACTIVE') throw new Error('Invalid part status');
  return { id:text(item.id,'id'), companyId:text(item.companyId,'companyId'), code:text(item.code,'code'), name:text(item.name,'name'), description:optionalString(item.description), manufacturer:optionalString(item.manufacturer), category:text(item.category,'category'), unit:text(item.unit,'unit'), currentCost:finite(item.currentCost,'currentCost'), minimumStock:finite(item.minimumStock,'minimumStock'), currentStock:finite(item.currentStock,'currentStock'), status, createdAt:text(item.createdAt,'createdAt'), updatedAt:text(item.updatedAt,'updatedAt') };
}
function validatePartStockMovement(value:unknown):PartStockMovement{
  const item=asRecord(value),movementType=text(item.movementType,'movementType') as PartStockMovement['movementType'];
  if(!['ENTRY','USE_WORK_ORDER','ADJUSTMENT_IN','ADJUSTMENT_OUT','RETURN','LOSS','REVERSAL'].includes(movementType))throw new Error('Invalid part stock movement');
  return{id:text(item.id,'id'),companyId:text(item.companyId,'companyId'),partId:text(item.partId,'partId'),movementType,quantityDelta:finite(item.quantityDelta,'quantityDelta'),balanceAfter:finite(item.balanceAfter,'balanceAfter'),workOrderId:optionalString(item.workOrderId),vehicleId:optionalString(item.vehicleId),reason:optionalString(item.reason),reversedMovementId:optionalString(item.reversedMovementId),idempotencyKey:text(item.idempotencyKey,'idempotencyKey'),userId:text(item.userId,'userId'),userName:text(item.userName,'userName'),createdAt:text(item.createdAt,'createdAt')};
}
async function request(path: string, init?: RequestInit): Promise<JsonRecord> {
  const response = await fetch(path, { ...init, credentials:'include' });
  if (!response.ok) {
    let message=`Maintenance request failed (${response.status})`;
    try { const payload=asRecord(await response.json()); if(typeof payload.error==='string'&&payload.error) message=payload.error; } catch {}
    throw new MaintenanceApiError(response.status,message);
  }
  return asRecord(await response.json());
}
function json(method: string, body: unknown): RequestInit { return { method, headers:{'content-type':'application/json'}, body:JSON.stringify(body) }; }
function list<T>(payload: JsonRecord, validator:(value:unknown)=>T):T[]{ if(!Array.isArray(payload.items)) throw new Error('Invalid maintenance list'); return payload.items.map(validator); }

export interface WorkOrderCreateRequest {
  number:string; vehicleId:string; supplierId?:string; serviceDate?:string; entryKm:number; description:string; diagnosis?:string; notes?:string; sourceAttachmentId?:string;
  parts?:Array<{partId?:string;description?:string;quantity:number;unitCost?:number}>;
  services?:Array<{serviceId?:string;description:string;quantity:number;unitCost:number}>;
  laborItems?:Array<{description:string;hours:number;hourlyRate:number}>; discount?:number;
  financialComponents?:Array<{kind:'PARTS'|'SERVICES'|'LABOR';supplierId?:string;categoryId:string;paymentMethodId:string;paymentCondition:'CASH'|'INSTALLMENTS';installmentsCount:number;firstDueDate:string;discountAmount?:number;hasInvoice:boolean;invoiceNumber?:string}>;
}
export interface WorkOrderCompleteRequest { exitKm:number; categoryId?:string; dueDate?:string; installmentsCount?:number; preventivePlanIds?:string[]; }
export type SupplierCreateRequest = Omit<Supplier,'id'|'companyId'|'status'|'createdAt'|'updatedAt'|'bankInfo'>;
export type PartCreateRequest = Omit<Part,'id'|'companyId'|'status'|'createdAt'|'updatedAt'>;
export type PartUpdateRequest = Partial<Omit<PartCreateRequest,'currentStock'>> & {status?:'ACTIVE'|'INACTIVE'};

export class MaintenanceClient {
  static async listWorkOrders(filters?:{vehicleId?:string}):Promise<WorkOrder[]> {
    const query=filters?.vehicleId?`?vehicleId=${encodeURIComponent(filters.vehicleId)}`:''; return list(await request(`/api/maintenance/work-orders${query}`),validateWorkOrder);
  }
  static async getWorkOrder(id:string):Promise<WorkOrder>{ return validateWorkOrder((await request(`/api/maintenance/work-orders/${encodeURIComponent(id)}`)).item); }
  static async createWorkOrder(input:WorkOrderCreateRequest):Promise<WorkOrder>{ return validateWorkOrder((await request('/api/maintenance/work-orders',json('POST',input))).item); }
  static async startWorkOrder(id:string):Promise<WorkOrder>{ return validateWorkOrder((await request(`/api/maintenance/work-orders/${encodeURIComponent(id)}/start`,json('POST',{}))).item); }
  static async completeWorkOrder(id:string,input:WorkOrderCompleteRequest):Promise<WorkOrder>{ return validateWorkOrder((await request(`/api/maintenance/work-orders/${encodeURIComponent(id)}/complete`,json('POST',input))).item); }
  static async cancelWorkOrder(id:string,reason:string):Promise<WorkOrder>{ return validateWorkOrder((await request(`/api/maintenance/work-orders/${encodeURIComponent(id)}/cancel`,json('POST',{reason}))).item); }
  static async archiveWorkOrder(id:string,reason:string):Promise<WorkOrder>{ return validateWorkOrder((await request(`/api/maintenance/work-orders/${encodeURIComponent(id)}/archive`,json('POST',{reason}))).item); }
  static async listSuppliers():Promise<Supplier[]>{ return list(await request('/api/maintenance/suppliers'),validateSupplier); }
  static async createSupplier(input:SupplierCreateRequest):Promise<Supplier>{ return validateSupplier((await request('/api/maintenance/suppliers',json('POST',input))).item); }
  static async updateSupplier(id:string,input:Partial<SupplierCreateRequest>&{status?:'ACTIVE'|'INACTIVE'}):Promise<Supplier>{ return validateSupplier((await request(`/api/maintenance/suppliers/${encodeURIComponent(id)}`,json('PATCH',input))).item); }
  static async listParts():Promise<Part[]>{ return list(await request('/api/maintenance/parts'),validatePart); }
  static async createPart(input:PartCreateRequest):Promise<Part>{ return validatePart((await request('/api/maintenance/parts',json('POST',input))).item); }
  static async updatePart(id:string,input:PartUpdateRequest):Promise<Part>{ return validatePart((await request(`/api/maintenance/parts/${encodeURIComponent(id)}`,json('PATCH',input))).item); }
  static async listPartMovements(id:string):Promise<PartStockMovement[]>{return list(await request(`/api/maintenance/parts/${encodeURIComponent(id)}/movements`),validatePartStockMovement);}
  static async movePartStock(id:string,input:{movementType:PartStockManualMovementType;quantity:number;reason?:string;idempotencyKey:string}):Promise<{part:Part;movement:PartStockMovement}>{const payload=await request(`/api/maintenance/parts/${encodeURIComponent(id)}/movements`,json('POST',input));return{part:validatePart(payload.part),movement:validatePartStockMovement(payload.movement)};}
  static async reversePartStock(id:string,movementId:string,reason:string):Promise<{part:Part;movement:PartStockMovement}>{const payload=await request(`/api/maintenance/parts/${encodeURIComponent(id)}/movements/${encodeURIComponent(movementId)}/reverse`,json('POST',{reason}));return{part:validatePart(payload.part),movement:validatePartStockMovement(payload.movement)};}
}
