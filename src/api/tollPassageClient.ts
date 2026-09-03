export type TollPassageStatus='PENDING'|'PAID'|'OVERDUE'|'CONTESTED';
export type TollPassageSource='MANUAL'|'CSV';
export interface TollPassage{
  id:string;companyId:string;vehicleId:string;contractId?:string;driverId?:string;concessionaire:string;road:string;tollPoint:string;
  occurredAt:string;amount:number;dueDate?:string;status:TollPassageStatus;source:TollPassageSource;sourceReference?:string;notes?:string;
  createdAt:string;updatedAt:string;
}
export interface CreateTollPassageInput{
  plate:string;concessionaire:string;road:string;tollPoint:string;occurredAt:string;amount:number;dueDate?:string;
  status:TollPassageStatus;source:'MANUAL';sourceReference?:string;notes?:string;
}
export interface TollPassageListFilters{vehicleId?:string;driverId?:string;contractId?:string;status?:TollPassageStatus;concessionaire?:string;occurredFrom?:string;occurredTo?:string;}
type JsonRecord=Record<string,unknown>;
function record(value:unknown):JsonRecord{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid toll passage payload');return value as JsonRecord;}
const STATUSES=new Set<TollPassageStatus>(['PENDING','PAID','OVERDUE','CONTESTED']),SOURCES=new Set<TollPassageSource>(['MANUAL','CSV']);
function item(value:unknown):TollPassage{const row=record(value);if(typeof row.id!=='string'||typeof row.companyId!=='string'||typeof row.vehicleId!=='string'||typeof row.concessionaire!=='string'||typeof row.road!=='string'||typeof row.tollPoint!=='string'||typeof row.occurredAt!=='string'||typeof row.amount!=='number'||!Number.isFinite(row.amount)||typeof row.status!=='string'||!STATUSES.has(row.status as TollPassageStatus)||typeof row.source!=='string'||!SOURCES.has(row.source as TollPassageSource)||typeof row.createdAt!=='string'||typeof row.updatedAt!=='string')throw new Error('Invalid toll passage payload');if(row.contractId!==undefined&&typeof row.contractId!=='string')throw new Error('Invalid toll passage contract');if(row.driverId!==undefined&&typeof row.driverId!=='string')throw new Error('Invalid toll passage driver');return row as unknown as TollPassage;}
async function failure(response:Response):Promise<Error>{let message=`Toll passage request failed (${response.status})`;try{const body=record(await response.json());if(typeof body.error==='string')message=body.error;}catch{}return new Error(message);}
export class TollPassageClient{
  static async list(filters:TollPassageListFilters={}):Promise<TollPassage[]>{const params=new URLSearchParams();Object.entries(filters).forEach(([key,value])=>{if(value)params.set(key,String(value));});const suffix=params.toString();const response=await fetch(`/api/toll-passages${suffix?`?${suffix}`:''}`,{credentials:'include'});if(!response.ok)throw await failure(response);const payload=record(await response.json());if(!Array.isArray(payload.items))throw new Error('Invalid toll passage list');return payload.items.map(item);}
  static async create(input:CreateTollPassageInput):Promise<{item:TollPassage;created:boolean}>{const response=await fetch('/api/toll-passages',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify(input)});if(!response.ok)throw await failure(response);const payload=record(await response.json());if(typeof payload.created!=='boolean')throw new Error('Invalid toll passage create result');return {item:item(payload.item),created:payload.created};}
}
