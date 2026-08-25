import type { Tracker } from '../types/entities';

export class TrackerApiError extends Error { constructor(public readonly status:number,message:string){super(message);this.name='TrackerApiError';} }
type JsonRecord=Record<string,unknown>;
export interface TrackerExpenseCategory { id:string; name:string; type:string; }
export type TelemetryEventType='POSITION'|'ODOMETER'|'HEARTBEAT';
export type TelemetryEventStatus='ACCEPTED'|'QUARANTINED';
export type TelemetryQuarantineReason='IMEI_MISMATCH'|'ODOMETER_REGRESSION'|'ODOMETER_ANOMALOUS_JUMP';
export interface TelemetryEventSummary { id:string;trackerId:string;sourceEventId:string;eventType:TelemetryEventType;occurredAt:string;receivedAt:string;status:TelemetryEventStatus;quarantineReason:TelemetryQuarantineReason|null; }
export interface TrackerCreateRequest { vehicleId:string;equipmentModel:string;imei:string;serialNumber?:string;chipCarrier?:string;chipNumber?:string;monthlyCost:number;installationDate:string;supplierId?:string;notes?:string;categoryId?:string; }
export type TrackerUpdateRequest=Partial<Omit<TrackerCreateRequest,'vehicleId'>>;
function asRecord(value:unknown):JsonRecord{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid tracker API response');return value as JsonRecord;}
function text(value:unknown,field:string):string{if(typeof value!=='string')throw new Error(`Invalid tracker field: ${field}`);return value;}
function safeText(value:unknown):string{return value===undefined||value===null?'':typeof value==='string'?value:String(value);}
function opt(value:unknown):string|undefined{if(value===undefined||value===null||value==='')return undefined;if(typeof value!=='string')throw new Error('Invalid optional tracker field');return value;}
function validateTracker(value:unknown):Tracker{
  const item=asRecord(value),status=text(item.status,'status');if(!['ACTIVE','INACTIVE','REMOVED'].includes(status))throw new Error('Invalid tracker status');const cost=Number(item.monthlyCost??0);if(!Number.isFinite(cost))throw new Error('Invalid tracker monthlyCost');
  return{id:text(item.id,'id'),companyId:text(item.companyId,'companyId'),vehicleId:text(item.vehicleId,'vehicleId'),serialNumber:opt(item.serialNumber),equipmentModel:safeText(item.equipmentModel),imei:safeText(item.imei),chipCarrier:safeText(item.chipCarrier),chipNumber:safeText(item.chipNumber),monthlyCost:cost,installationDate:safeText(item.installationDate),status:status as Tracker['status'],supplierId:opt(item.supplierId),notes:opt(item.notes),lastPing:opt(item.lastPing),createdBy:opt(item.createdBy),createdAt:text(item.createdAt,'createdAt'),updatedAt:text(item.updatedAt,'updatedAt')};
}
function validateCategory(value:unknown):TrackerExpenseCategory{const item=asRecord(value),type=text(item.type,'type');if(!['EXPENSE','BOTH'].includes(type))throw new Error('Invalid tracker expense category');return{id:text(item.id,'id'),name:text(item.name,'name'),type};}
function iso(value:unknown,field:string):string{const result=text(value,field);if(!Number.isFinite(Date.parse(result)))throw new Error(`Invalid telemetry field: ${field}`);return result;}
function exactTelemetry(value:unknown):TelemetryEventSummary{const item=asRecord(value),allowed=new Set(['id','trackerId','sourceEventId','eventType','occurredAt','receivedAt','status','quarantineReason']);if(Object.keys(item).some(key=>!allowed.has(key)))throw new Error('Unsafe telemetry response');const eventType=text(item.eventType,'eventType'),status=text(item.status,'status');if(!['POSITION','ODOMETER','HEARTBEAT'].includes(eventType))throw new Error('Invalid telemetry event type');if(!['ACCEPTED','QUARANTINED'].includes(status))throw new Error('Invalid telemetry status');const reason=item.quarantineReason;if(reason!==null&&!['IMEI_MISMATCH','ODOMETER_REGRESSION','ODOMETER_ANOMALOUS_JUMP'].includes(String(reason)))throw new Error('Invalid telemetry quarantine reason');if((status==='ACCEPTED'&&reason!==null)||(status==='QUARANTINED'&&reason===null))throw new Error('Inconsistent telemetry quarantine state');return{id:text(item.id,'id'),trackerId:text(item.trackerId,'trackerId'),sourceEventId:text(item.sourceEventId,'sourceEventId'),eventType:eventType as TelemetryEventType,occurredAt:iso(item.occurredAt,'occurredAt'),receivedAt:iso(item.receivedAt,'receivedAt'),status:status as TelemetryEventStatus,quarantineReason:reason as TelemetryQuarantineReason|null};}
export function parseTelemetryEventSummary(value:unknown):TelemetryEventSummary{return exactTelemetry(value);}
async function request(path:string,init?:RequestInit):Promise<JsonRecord>{const response=await fetch(path,{...init,credentials:'include'});if(!response.ok){let message=`Tracker request failed (${response.status})`;try{const payload=asRecord(await response.json());if(typeof payload.error==='string'&&payload.error)message=payload.error;}catch{}throw new TrackerApiError(response.status,message);}return asRecord(await response.json());}
function json(method:string,body:unknown):RequestInit{return{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)};}
function list<T>(payload:JsonRecord,validator:(value:unknown)=>T):T[]{if(!Array.isArray(payload.items))throw new Error('Invalid tracker list');return payload.items.map(validator);}
export class TrackerClient {
  static async list(filters?:{vehicleId?:string}):Promise<Tracker[]>{const query=filters?.vehicleId?`?vehicleId=${encodeURIComponent(filters.vehicleId)}`:'';return list(await request(`/api/trackers${query}`),validateTracker);}
  static async listByVehicle(vehicleId:string):Promise<Tracker[]>{return list(await request(`/api/vehicles/${encodeURIComponent(vehicleId)}/trackers`),validateTracker);}
  static async get(id:string):Promise<Tracker>{return validateTracker((await request(`/api/trackers/${encodeURIComponent(id)}`)).item);}
  static async listExpenseCategories():Promise<TrackerExpenseCategory[]>{return list(await request('/api/trackers/expense-categories'),validateCategory);}
  static async listTelemetry(trackerId:string,limit=50):Promise<TelemetryEventSummary[]>{const safeLimit=Number.isInteger(limit)&&limit>0&&limit<=100?limit:50;return list(await request(`/api/trackers/${encodeURIComponent(trackerId)}/telemetry?limit=${safeLimit}`,{headers:{Accept:'application/json'}}),exactTelemetry);}
  static async create(input:TrackerCreateRequest):Promise<Tracker>{return validateTracker((await request('/api/trackers',json('POST',input))).item);}
  static async update(id:string,input:TrackerUpdateRequest):Promise<Tracker>{return validateTracker((await request(`/api/trackers/${encodeURIComponent(id)}`,json('PATCH',input))).item);}
  static async remove(id:string,reason:string):Promise<Tracker>{return validateTracker((await request(`/api/trackers/${encodeURIComponent(id)}/remove`,json('POST',{reason}))).item);}
}
