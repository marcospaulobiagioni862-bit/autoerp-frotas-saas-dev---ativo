import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { AuditAction, VehicleStatus } from '../types/enums';
import type { KmRecord } from '../types/entities';
import type { AuthenticatedPrincipal } from './auth';
import {
  calculateNextKmReadingDate,
  validateKmReadingScheduleRule,
  type KmReadingScheduleFrequency,
  type KmReadingScheduleRule,
} from '../shared/utils/kmReadingSchedule';

export type KmReadingSourceType = 'MANUAL' | 'DRIVER_PHOTO' | 'TRACKER';

export interface KmReadingSchedule {
  companyId:string;
  vehicleId:string;
  frequency:KmReadingScheduleFrequency;
  weekday:number|null;
  dayOfMonth:number|null;
  nextDueDate:string;
  createdAt:string;
  updatedAt:string;
}

export interface UpsertKmReadingScheduleInput {
  frequency:KmReadingScheduleFrequency;
  weekday?:number|null;
  dayOfMonth?:number|null;
}

export interface BatchKmReadingEntryInput {
  vehicleId:string;
  sourceType:KmReadingSourceType;
  kmValue?:number;
  sourceAttachmentId?:string;
}

export interface TrackerKmCandidate {
  vehicleId:string;
  trackerId:string;
  kmValue:number;
  observedAt:string;
}

export interface BatchKmReadingResultItem {
  vehicleId:string;
  previousKm:number;
  currentKm:number;
  distanceKm:number;
  sourceType:KmReadingSourceType;
  record:KmRecord;
  created:boolean;
  nextDueDate?:string;
}

export class VehicleKmReadingValidationError extends Error {}
export class VehicleKmReadingNotFoundError extends Error {}
export class VehicleKmReadingConflictError extends Error {}

function rows(result:any):any[]{return Array.isArray(result?.rows)?result.rows:[];}
function text(value:unknown,field:string,max=160):string{
  const result=typeof value==='string'?value.trim():'';
  if(!result||result.length>max)throw new VehicleKmReadingValidationError(`Invalid ${field}`);
  return result;
}
function source(value:unknown):KmReadingSourceType{
  if(value==='MANUAL'||value==='DRIVER_PHOTO'||value==='TRACKER')return value;
  throw new VehicleKmReadingValidationError('Invalid KM source');
}
function integerKm(value:unknown):number{
  const result=Number(value);
  if(!Number.isInteger(result)||result<0||result>9_999_999)throw new VehicleKmReadingValidationError('KM deve ser inteiro e não negativo');
  return result;
}
function today():string{return new Date().toISOString().slice(0,10);}
function mapSchedule(row:any):KmReadingSchedule{return{
  companyId:String(row.company_id),
  vehicleId:String(row.vehicle_id),
  frequency:String(row.frequency) as KmReadingScheduleFrequency,
  weekday:row.weekday===null?null:Number(row.weekday),
  dayOfMonth:row.day_of_month===null?null:Number(row.day_of_month),
  nextDueDate:String(row.next_due_date),
  createdAt:new Date(row.created_at).toISOString(),
  updatedAt:new Date(row.updated_at).toISOString(),
};}

async function trackerCandidateInside(tx:any,companyId:string,vehicleId:string):Promise<TrackerKmCandidate>{
  const tracker=await tx.getTrackerRepo().findActiveByVehicle(companyId,vehicleId);
  if(!tracker)throw new VehicleKmReadingNotFoundError('Veículo não possui rastreador ativo');
  const raw=tx.getRawTransaction?.();
  if(!raw)throw new Error('Telemetry authority unavailable');
  const row=rows(await raw.execute(sql`
    SELECT raw_payload->>'odometerKm' AS odometer_km, occurred_at
    FROM tracker_telemetry_events
    WHERE company_id=${companyId}
      AND tracker_id=${tracker.id}
      AND event_type='ODOMETER'
      AND status='ACCEPTED'
    ORDER BY occurred_at DESC,id DESC
    LIMIT 1
  `))[0];
  if(!row)throw new VehicleKmReadingNotFoundError('Rastreador não possui leitura de odômetro aceita');
  const parsed=Number(row.odometer_km);
  if(!Number.isFinite(parsed)||parsed<0)throw new VehicleKmReadingConflictError('Leitura de rastreador inválida');
  return{vehicleId,trackerId:tracker.id,kmValue:Math.round(parsed),observedAt:new Date(row.occurred_at).toISOString()};
}

async function scheduleForVehicle(raw:any,companyId:string,vehicleId:string,lock=false):Promise<KmReadingSchedule|null>{
  const suffix=lock?sql` FOR UPDATE`:sql``;
  const result=await raw.execute(sql`
    SELECT company_id,vehicle_id,frequency,weekday,day_of_month,next_due_date,created_at,updated_at
    FROM vehicle_km_reading_schedules
    WHERE company_id=${companyId} AND vehicle_id=${vehicleId}${suffix}
  `);
  const row=rows(result)[0];
  return row?mapSchedule(row):null;
}

async function advanceSchedule(raw:any,p:AuthenticatedPrincipal,vehicleId:string,recordDate:string):Promise<string|undefined>{
  const schedule=await scheduleForVehicle(raw,p.companyId,vehicleId,true);
  if(!schedule)return undefined;
  const rule:KmReadingScheduleRule={
    frequency:schedule.frequency,
    weekday:schedule.weekday,
    dayOfMonth:schedule.dayOfMonth,
  };
  const nextDueDate=calculateNextKmReadingDate(recordDate,rule,false);
  const now=new Date().toISOString();
  await raw.execute(sql`
    UPDATE vehicle_km_reading_schedules
    SET next_due_date=${nextDueDate},updated_by=${p.userId},updated_at=${now}
    WHERE company_id=${p.companyId} AND vehicle_id=${vehicleId}
  `);
  return nextDueDate;
}

export class VehicleKmReadingAuthority {
  static listSchedules(companyId:string):Promise<KmReadingSchedule[]>{
    return UnitOfWork.run(companyId,async tx=>{
      const raw=tx.getRawTransaction?.();if(!raw)throw new Error('KM schedule persistence unavailable');
      return rows(await raw.execute(sql`
        SELECT company_id,vehicle_id,frequency,weekday,day_of_month,next_due_date,created_at,updated_at
        FROM vehicle_km_reading_schedules
        WHERE company_id=${companyId}
        ORDER BY next_due_date,vehicle_id
      `)).map(mapSchedule);
    });
  }

  static upsertSchedule(p:AuthenticatedPrincipal,vehicleId:string,input:UpsertKmReadingScheduleInput):Promise<KmReadingSchedule>{
    return UnitOfWork.run(p.companyId,async tx=>{
      const id=text(vehicleId,'vehicleId');
      const vehicle=await tx.getVehicleRepo().findByIdForCompanyWithLock(p.companyId,id);
      if(!vehicle)throw new VehicleKmReadingNotFoundError('Veículo não encontrado');
      if(vehicle.isArchived||vehicle.status===VehicleStatus.SOLD||vehicle.status===VehicleStatus.ARCHIVED){
        throw new VehicleKmReadingConflictError('Veículo não aceita nova programação de KM');
      }
      const rule:KmReadingScheduleRule={frequency:input.frequency,weekday:input.weekday,dayOfMonth:input.dayOfMonth};
      try{validateKmReadingScheduleRule(rule);}catch{throw new VehicleKmReadingValidationError('Programação de KM inválida');}
      const reference=today(),nextDueDate=calculateNextKmReadingDate(reference,rule,true),now=new Date().toISOString();
      const raw=tx.getRawTransaction?.();if(!raw)throw new Error('KM schedule persistence unavailable');
      const previous=await scheduleForVehicle(raw,p.companyId,id,true);
      const row=rows(await raw.execute(sql`
        INSERT INTO vehicle_km_reading_schedules(
          company_id,vehicle_id,frequency,weekday,day_of_month,next_due_date,created_by,updated_by,created_at,updated_at
        ) VALUES(
          ${p.companyId},${id},${rule.frequency},${rule.frequency==='WEEKLY'?rule.weekday:null},
          ${rule.frequency==='MONTHLY'?rule.dayOfMonth:null},${nextDueDate},${p.userId},${p.userId},${now},${now}
        )
        ON CONFLICT(company_id,vehicle_id) DO UPDATE SET
          frequency=EXCLUDED.frequency,weekday=EXCLUDED.weekday,day_of_month=EXCLUDED.day_of_month,
          next_due_date=EXCLUDED.next_due_date,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at
        RETURNING company_id,vehicle_id,frequency,weekday,day_of_month,next_due_date,created_at,updated_at
      `))[0];
      await tx.getAuditLogRepo().create({
        id:randomUUID(),companyId:p.companyId,entityName:'VehicleKmReadingSchedule',entityId:id,
        action:previous?AuditAction.UPDATE:AuditAction.CREATE,userId:p.userId,userName:p.name,timestamp:now,
        previousState:previous?JSON.stringify(previous):undefined,newState:JSON.stringify(mapSchedule(row)),
      });
      return mapSchedule(row);
    });
  }

  static trackerCandidate(companyId:string,vehicleId:string):Promise<TrackerKmCandidate>{
    return UnitOfWork.run(companyId,async tx=>{
      const id=text(vehicleId,'vehicleId');
      const vehicle=await tx.getVehicleRepo().findByIdForCompany(companyId,id);
      if(!vehicle||vehicle.isArchived)throw new VehicleKmReadingNotFoundError('Veículo não encontrado');
      const candidate=await trackerCandidateInside(tx,companyId,id);
      if(candidate.kmValue<vehicle.currentKm)throw new VehicleKmReadingConflictError('KM do rastreador está abaixo do KM atual do veículo');
      return candidate;
    });
  }

  static recordBatch(p:AuthenticatedPrincipal,entries:BatchKmReadingEntryInput[]):Promise<BatchKmReadingResultItem[]>{
    if(!Array.isArray(entries)||entries.length<1||entries.length>500)throw new VehicleKmReadingValidationError('Lote de KM inválido');
    const normalizedEntries=entries.map(item=>({...item,vehicleId:text(item?.vehicleId,'vehicleId')}));
    const ids=normalizedEntries.map(item=>item.vehicleId);
    if(new Set(ids).size!==ids.length)throw new VehicleKmReadingValidationError('Veículo duplicado no lote de KM');

    return UnitOfWork.run(p.companyId,async tx=>{
      const raw=tx.getRawTransaction?.();if(!raw)throw new Error('KM batch persistence unavailable');
      const byId=new Map(normalizedEntries.map(item=>[item.vehicleId,item]));
      const result:BatchKmReadingResultItem[]=[];
      const recordDate=today();

      for(const vehicleId of [...ids].sort()){
        const input=byId.get(vehicleId)!;
        const sourceType=source(input.sourceType);
        const vehicle=await tx.getVehicleRepo().findByIdForCompanyWithLock(p.companyId,vehicleId);
        if(!vehicle)throw new VehicleKmReadingNotFoundError(`Veículo ${vehicleId} não encontrado`);
        if(vehicle.isArchived||vehicle.status===VehicleStatus.SOLD||vehicle.status===VehicleStatus.ARCHIVED){
          throw new VehicleKmReadingConflictError(`Veículo ${vehicle.plate} não aceita nova leitura`);
        }

        let kmValue:number;
        let sourceAttachmentId:string|undefined;
        let sourceTrackerId:string|undefined;
        let sourceObservedAt:string|undefined;

        if(sourceType==='TRACKER'){
          if(input.kmValue!==undefined||input.sourceAttachmentId!==undefined)throw new VehicleKmReadingValidationError('KM do rastreador deve ser derivado pelo servidor');
          const candidate=await trackerCandidateInside(tx,p.companyId,vehicleId);
          kmValue=candidate.kmValue;sourceTrackerId=candidate.trackerId;sourceObservedAt=candidate.observedAt;
        }else{
          kmValue=integerKm(input.kmValue);
          if(sourceType==='DRIVER_PHOTO'){
            sourceAttachmentId=text(input.sourceAttachmentId,'sourceAttachmentId');
            const attachment=await tx.getAttachmentRepo().findByIdForCompany(p.companyId,sourceAttachmentId);
            if(
              !attachment||attachment.isArchived||attachment.contentState!=='AVAILABLE'||
              attachment.entityType!=='Vehicle'||attachment.entityId!==vehicleId||
              String(attachment.documentType||'').toUpperCase()!=='KM_ODOMETER_PHOTO'||
              !String(attachment.mimeType||'').startsWith('image/')
            )throw new VehicleKmReadingConflictError(`Foto de odômetro inválida para ${vehicle.plate}`);
          }else if(input.sourceAttachmentId!==undefined){
            throw new VehicleKmReadingValidationError('Leitura manual não aceita anexo de origem');
          }
        }

        if(kmValue<vehicle.currentKm)throw new VehicleKmReadingValidationError(`KM de ${vehicle.plate} não pode ser menor que ${vehicle.currentKm}`);
        const existing=rows(await raw.execute(sql`
          SELECT id,source_type,source_attachment_id,source_tracker_id
          FROM vehicle_km_records
          WHERE company_id=${p.companyId} AND vehicle_id=${vehicleId}
            AND km_value=${kmValue} AND reading_type='PERIODIC' AND record_date=${recordDate}
          LIMIT 1
        `))[0];
        if(existing){
          const sameSource=String(existing.source_type||'MANUAL')===sourceType
            &&String(existing.source_attachment_id||'')===String(sourceAttachmentId||'')
            &&String(existing.source_tracker_id||'')===String(sourceTrackerId||'');
          if(!sameSource)throw new VehicleKmReadingConflictError(`Já existe uma leitura de ${vehicle.plate} com este KM hoje`);
          const records=await tx.getKmRecordRepo().findByVehicleIdForCompany(p.companyId,vehicleId);
          const record=records.find((item:KmRecord)=>item.id===String(existing.id));
          if(!record)throw new Error('Persisted KM retry record unavailable');
          result.push({vehicleId,previousKm:vehicle.currentKm,currentKm:vehicle.currentKm,distanceKm:0,sourceType,record,created:false});
          continue;
        }

        const now=new Date().toISOString();
        const record=await tx.getKmRecordRepo().create({
          id:randomUUID(),companyId:p.companyId,vehicleId,driverId:vehicle.currentDriverId,contractId:vehicle.currentContractId,
          kmValue,recordDate,readingType:'PERIODIC',sourceType,sourceAttachmentId,sourceTrackerId,sourceObservedAt,
          notes:sourceType==='TRACKER'?'Leitura de KM derivada do rastreador':sourceType==='DRIVER_PHOTO'?'Leitura de KM informada pelo motorista com foto':'Lançamento de KM em lote',
          createdAt:now,
        });
        const updated=await tx.getVehicleRepo().updateForCompany(p.companyId,vehicleId,{currentKm:kmValue,updatedAt:now});
        if(!updated)throw new VehicleKmReadingNotFoundError('Veículo não encontrado');
        const nextDueDate=await advanceSchedule(raw,p,vehicleId,recordDate);
        await tx.getAuditLogRepo().create({
          id:randomUUID(),companyId:p.companyId,entityName:'KmRecord',entityId:record.id,action:AuditAction.CREATE,
          userId:p.userId,userName:p.name,timestamp:now,
          previousState:JSON.stringify({vehicleId,currentKm:vehicle.currentKm}),
          newState:JSON.stringify({vehicleId,currentKm:kmValue,distanceKm:kmValue-vehicle.currentKm,sourceType,sourceAttachmentId,sourceTrackerId,sourceObservedAt,nextDueDate}),
        });
        result.push({vehicleId,previousKm:vehicle.currentKm,currentKm:kmValue,distanceKm:kmValue-vehicle.currentKm,sourceType,record,created:true,nextDueDate});
      }
      return result;
    });
  }
}
