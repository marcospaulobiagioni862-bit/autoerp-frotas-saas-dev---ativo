import type { KmRecord } from '../types/entities';
import type { KmReadingScheduleFrequency } from '../shared/utils/kmReadingSchedule';

export type KmReadingSourceType='MANUAL'|'DRIVER_PHOTO'|'TRACKER';

export interface KmReadingSchedule {
  companyId:string;vehicleId:string;frequency:KmReadingScheduleFrequency;weekday:number|null;dayOfMonth:number|null;
  nextDueDate:string;createdAt:string;updatedAt:string;
}
export interface TrackerKmCandidate {vehicleId:string;trackerId:string;kmValue:number;observedAt:string;}
export interface BatchKmReadingInput {vehicleId:string;sourceType:KmReadingSourceType;kmValue?:number;sourceAttachmentId?:string;}
export interface BatchKmReadingResult {
  vehicleId:string;previousKm:number;currentKm:number;distanceKm:number;sourceType:KmReadingSourceType;
  record:KmRecord;created:boolean;nextDueDate?:string;
}

type JsonRecord=Record<string,unknown>;
function record(value:unknown):JsonRecord{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Resposta de KM inválida');return value as JsonRecord;}
async function request(path:string,init?:RequestInit):Promise<JsonRecord>{
  const response=await fetch(path,{credentials:'include',...init});
  if(!response.ok){let message=`Falha na operação de KM (${response.status})`;try{const body=record(await response.json());if(typeof body.error==='string')message=body.error;}catch{}throw new Error(message);}
  return record(await response.json());
}
function schedule(value:unknown):KmReadingSchedule{
  const item=record(value);const frequency=String(item.frequency);
  if(typeof item.companyId!=='string'||typeof item.vehicleId!=='string'||!['WEEKLY','MONTHLY'].includes(frequency)||typeof item.nextDueDate!=='string')throw new Error('Agenda de KM inválida');
  return item as unknown as KmReadingSchedule;
}
function candidate(value:unknown):TrackerKmCandidate{
  const item=record(value);
  if(typeof item.vehicleId!=='string'||typeof item.trackerId!=='string'||!Number.isInteger(item.kmValue)||typeof item.observedAt!=='string')throw new Error('Leitura de rastreador inválida');
  return item as unknown as TrackerKmCandidate;
}
function result(value:unknown):BatchKmReadingResult{
  const item=record(value);
  if(typeof item.vehicleId!=='string'||!Number.isInteger(item.previousKm)||!Number.isInteger(item.currentKm)||!Number.isInteger(item.distanceKm)||!['MANUAL','DRIVER_PHOTO','TRACKER'].includes(String(item.sourceType))||typeof item.created!=='boolean')throw new Error('Resultado de KM inválido');
  return item as unknown as BatchKmReadingResult;
}
function json(method:string,body:unknown):RequestInit{return{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)};}

export class VehicleKmReadingClient {
  static async listSchedules():Promise<KmReadingSchedule[]>{
    const payload=await request('/api/fleet/km-reading-schedules');
    if(!Array.isArray(payload.items))throw new Error('Lista de agendas de KM inválida');
    return payload.items.map(schedule);
  }
  static async upsertSchedule(vehicleId:string,input:{frequency:KmReadingScheduleFrequency;weekday?:number|null;dayOfMonth?:number|null}):Promise<KmReadingSchedule>{
    const payload=await request(`/api/fleet/vehicles/${encodeURIComponent(vehicleId)}/km-reading-schedule`,json('PUT',input));
    return schedule(payload.item);
  }
  static async trackerCandidate(vehicleId:string):Promise<TrackerKmCandidate>{
    const payload=await request(`/api/fleet/vehicles/${encodeURIComponent(vehicleId)}/km-tracker-candidate`);
    return candidate(payload.item);
  }
  static async recordBatch(entries:BatchKmReadingInput[]):Promise<BatchKmReadingResult[]>{
    const payload=await request('/api/fleet/km-records/batch',json('POST',{entries}));
    if(!Array.isArray(payload.items))throw new Error('Resultado do lote de KM inválido');
    return payload.items.map(result);
  }
}
