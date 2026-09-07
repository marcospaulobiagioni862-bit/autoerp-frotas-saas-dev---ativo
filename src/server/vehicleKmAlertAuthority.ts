import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { AuditAction } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';

const TEMPLATE_KEY='KM_READING_REQUEST';
const REFERENCE_TYPE='VEHICLE_KM_READING';
const ALERT_LEAD_DAYS=2;
const TRACKER_FRESH_MS=24*60*60*1000;
const WRITE_ROLES=new Set(['ADMIN','MANAGER','OPERATIONAL_MANAGER','OPERATIONAL']);
const EXPECTED_PARAMETERS=['driverName','dueDate','plate','vehicleDescription'];
const TEMPLATE_BODY='Olá {{driverName}}, precisamos atualizar a quilometragem do veículo {{plate}} — {{vehicleDescription}}. Por favor, envie a quilometragem atual exibida no painel e, se possível, uma foto do odômetro. Data prevista da leitura: {{dueDate}}.';

export type KmReadingAlertStage='DUE_SOON'|'DUE_TODAY'|'OVERDUE';

export interface KmReadingAlert {
  companyId:string;
  vehicleId:string;
  plate:string;
  vehicleDescription:string;
  currentKm:number;
  driverId?:string;
  driverName?:string;
  dueDate:string;
  daysUntilDue:number;
  overdueDays:number;
  stage:KmReadingAlertStage;
  trackerFresh:boolean;
  trackerKm?:number;
  trackerObservedAt?:string;
  whatsappEligible:boolean;
  whatsappBlockedReason?:string;
  lastRequestAt?:string;
  lastRequestStatus?:string;
}

export interface KmWhatsappPreparationResult {
  vehicleId:string;
  plate:string;
  driverId?:string;
  created:boolean;
  outboxId?:string;
  status:'HELD_PROVIDER_DISABLED'|'SKIPPED';
  reason?:string;
  providerCallApplied:false;
}

export class VehicleKmAlertValidationError extends Error{}
export class VehicleKmAlertForbiddenError extends Error{}

function rows(result:any):any[]{return Array.isArray(result?.rows)?result.rows:[];}
function dateOnlyToday():string{return new Date().toISOString().slice(0,10);}
function dateOnlyTime(value:string):number{
  const time=Date.parse(`${value}T00:00:00.000Z`);
  if(!Number.isFinite(time))throw new VehicleKmAlertValidationError('Data da leitura de KM inválida');
  return time;
}
function normalizeBrazilPhone(value:unknown):string|undefined{
  const digits=typeof value==='string'?value.replace(/\D/g,''):'';
  const national=digits.startsWith('55')&&(digits.length===12||digits.length===13)?digits:(digits.length===10||digits.length===11?`55${digits}`:'');
  if(!/^55\d{10,11}$/.test(national)||/^(\d)\1+$/.test(national))return undefined;
  return `+${national}`;
}
function parseParameters(value:unknown):string[]{
  const parsed=typeof value==='string'?JSON.parse(value):value;
  if(!Array.isArray(parsed)||!parsed.every(item=>typeof item==='string'))throw new Error('Invalid KM WhatsApp template schema');
  return [...parsed].sort();
}
function assertWrite(principal:AuthenticatedPrincipal):void{
  const role=String(principal.role||'').toUpperCase(),permissions=Array.isArray(principal.permissions)?principal.permissions:[];
  if(!WRITE_ROLES.has(role)&&!permissions.includes('*')&&!permissions.includes('MANAGE_WHATSAPP')&&!permissions.includes('RECORD_VEHICLE_KM')){
    throw new VehicleKmAlertForbiddenError('Acesso negado');
  }
}
function cleanVehicleIds(value:string[]):string[]{
  if(!Array.isArray(value)||value.length<1||value.length>100)throw new VehicleKmAlertValidationError('Seleção de veículos inválida');
  const items=value.map(item=>String(item||'').trim());
  if(items.some(item=>!item||item.length>200)||new Set(items).size!==items.length)throw new VehicleKmAlertValidationError('Seleção de veículos inválida');
  return items;
}
function trackerFresh(row:any):boolean{
  if(!row.tracker_observed_at||row.tracker_km===null||row.tracker_km===undefined)return false;
  const observed=Date.parse(String(row.tracker_observed_at));
  const km=Number(row.tracker_km);
  return Number.isFinite(observed)&&Date.now()-observed>=0&&Date.now()-observed<=TRACKER_FRESH_MS&&Number.isFinite(km)&&km>=Number(row.current_km);
}
function blockedReason(row:any,fresh:boolean):string|undefined{
  if(fresh)return 'Rastreador possui leitura recente e confiável; use a telemetria antes de solicitar KM ao motorista.';
  if(!row.current_driver_id||!row.driver_id)return 'Veículo sem motorista atual vinculado.';
  const phone=normalizeBrazilPhone(row.driver_whatsapp||row.driver_phone);
  if(!phone)return 'Motorista sem telefone/WhatsApp válido.';
  if(String(row.consent_status||'')!=='GRANTED'||String(row.consent_phone_e164||'')!==phone)return 'Motorista sem consentimento vigente para WhatsApp neste número.';
  return undefined;
}
function mapAlert(row:any):KmReadingAlert{
  const today=dateOnlyTime(dateOnlyToday()),due=dateOnlyTime(String(row.next_due_date).slice(0,10));
  const daysUntilDue=Math.round((due-today)/86400000);
  const stage:KmReadingAlertStage=daysUntilDue<0?'OVERDUE':daysUntilDue===0?'DUE_TODAY':'DUE_SOON';
  const fresh=trackerFresh(row),reason=blockedReason(row,fresh);
  return{
    companyId:String(row.company_id),
    vehicleId:String(row.vehicle_id),
    plate:String(row.plate),
    vehicleDescription:`${String(row.brand||'')} ${String(row.model||'')}`.trim(),
    currentKm:Number(row.current_km),
    driverId:row.driver_id?String(row.driver_id):undefined,
    driverName:row.driver_name?String(row.driver_name):undefined,
    dueDate:String(row.next_due_date).slice(0,10),
    daysUntilDue,
    overdueDays:daysUntilDue<0?Math.abs(daysUntilDue):0,
    stage,
    trackerFresh:fresh,
    trackerKm:row.tracker_km===null||row.tracker_km===undefined?undefined:Math.round(Number(row.tracker_km)),
    trackerObservedAt:row.tracker_observed_at?new Date(row.tracker_observed_at).toISOString():undefined,
    whatsappEligible:!reason,
    whatsappBlockedReason:reason,
    lastRequestAt:row.last_request_at?new Date(row.last_request_at).toISOString():undefined,
    lastRequestStatus:row.last_request_status?String(row.last_request_status):undefined,
  };
}
async function queryScheduleRows(tx:any,companyId:string,vehicleId?:string):Promise<any[]>{
  const filter=vehicleId?sql` AND s.vehicle_id=${vehicleId}`:sql``;
  return rows(await tx.execute(sql`
    SELECT
      s.company_id,s.vehicle_id,s.next_due_date,
      v.plate,v.brand,v.model,v.current_km,v.current_driver_id,
      d.id AS driver_id,d.name AS driver_name,d.phone AS driver_phone,d.whatsapp AS driver_whatsapp,
      wc.status AS consent_status,wc.phone_e164 AS consent_phone_e164,wc.granted_at AS consent_granted_at,
      telemetry.odometer_km AS tracker_km,telemetry.occurred_at AS tracker_observed_at,
      request.created_at AS last_request_at,request.status AS last_request_status
    FROM vehicle_km_reading_schedules s
    JOIN vehicles v ON v.company_id=s.company_id AND v.id=s.vehicle_id
    LEFT JOIN drivers d ON d.company_id=s.company_id AND d.id=v.current_driver_id
    LEFT JOIN whatsapp_consents wc ON wc.company_id=s.company_id AND wc.driver_id=v.current_driver_id
    LEFT JOIN LATERAL (
      SELECT (e.raw_payload->>'odometerKm')::numeric AS odometer_km,e.occurred_at
      FROM trackers t
      JOIN tracker_telemetry_events e ON e.company_id=t.company_id AND e.tracker_id=t.id
      WHERE t.company_id=s.company_id AND t.vehicle_id=s.vehicle_id AND t.status='ACTIVE'
        AND e.event_type='ODOMETER' AND e.status='ACCEPTED'
        AND (e.raw_payload->>'odometerKm') ~ '^[0-9]+([.][0-9]+)?$'
      ORDER BY e.occurred_at DESC,e.id DESC
      LIMIT 1
    ) telemetry ON true
    LEFT JOIN LATERAL (
      SELECT created_at,status
      FROM whatsapp_outbox
      WHERE company_id=s.company_id
        AND reference_type=${REFERENCE_TYPE}
        AND reference_id=(s.vehicle_id || ':' || s.next_due_date)
      ORDER BY created_at DESC,id DESC
      LIMIT 1
    ) request ON true
    WHERE s.company_id=${companyId}
      AND v.is_archived=false
      AND v.status NOT IN ('SOLD','ARCHIVED')
      ${filter}
    ORDER BY s.next_due_date,v.plate
  `));
}

export class VehicleKmAlertAuthority {
  static async listAlerts(companyId:string):Promise<KmReadingAlert[]>{
    return await UnitOfWork.run(companyId,async context=>{
      const tx=context.getRawTransaction?.();if(!tx)throw new Error('KM alert persistence unavailable');
      const today=dateOnlyTime(dateOnlyToday());
      return (await queryScheduleRows(tx,companyId))
        .map(mapAlert)
        .filter(item=>dateOnlyTime(item.dueDate)-today<=ALERT_LEAD_DAYS*86400000)
        .sort((a,b)=>a.daysUntilDue-b.daysUntilDue||a.plate.localeCompare(b.plate,'pt-BR'));
    });
  }

  static async prepareWhatsappBatch(principal:AuthenticatedPrincipal,vehicleIds:string[]):Promise<KmWhatsappPreparationResult[]>{
    assertWrite(principal);
    const ids=cleanVehicleIds(vehicleIds).sort();
    return await UnitOfWork.run(principal.companyId,async context=>{
      const tx=context.getRawTransaction?.();if(!tx)throw new Error('KM WhatsApp persistence unavailable');
      await tx.execute(sql`
        INSERT INTO whatsapp_template_catalog(company_id,template_key,version,status,body_text,parameter_keys)
        SELECT ${principal.companyId},${TEMPLATE_KEY},1,'ACTIVE',${TEMPLATE_BODY},${JSON.stringify(['driverName','plate','vehicleDescription','dueDate'])}::jsonb
        WHERE NOT EXISTS (
          SELECT 1 FROM whatsapp_template_catalog
          WHERE company_id=${principal.companyId} AND template_key=${TEMPLATE_KEY}
        )
        ON CONFLICT(company_id,template_key,version) DO NOTHING
      `);
      const template=rows(await tx.execute(sql`
        SELECT version,parameter_keys
        FROM whatsapp_template_catalog
        WHERE company_id=${principal.companyId} AND template_key=${TEMPLATE_KEY} AND status='ACTIVE'
        ORDER BY version DESC LIMIT 1 FOR SHARE
      `))[0];
      if(!template)throw new Error('Template de solicitação de KM indisponível');
      const version=Number(template.version),keys=parseParameters(template.parameter_keys);
      if(!Number.isInteger(version)||version<1||JSON.stringify(keys)!==JSON.stringify([...EXPECTED_PARAMETERS].sort())){
        throw new Error('Esquema do template de solicitação de KM inválido');
      }

      const results:KmWhatsappPreparationResult[]=[];
      for(const vehicleId of ids){
        const row=(await queryScheduleRows(tx,principal.companyId,vehicleId))[0];
        if(!row){
          results.push({vehicleId,plate:vehicleId,created:false,status:'SKIPPED',reason:'Veículo sem programação de leitura de KM.',providerCallApplied:false});
          continue;
        }
        const alert=mapAlert(row);
        if(!alert.whatsappEligible||!alert.driverId){
          results.push({vehicleId,plate:alert.plate,driverId:alert.driverId,created:false,status:'SKIPPED',reason:alert.whatsappBlockedReason||'Solicitação não elegível.',providerCallApplied:false});
          continue;
        }
        const phone=normalizeBrazilPhone(row.driver_whatsapp||row.driver_phone)!;
        const parameters={
          driverName:String(row.driver_name||'Motorista'),
          plate:alert.plate,
          vehicleDescription:alert.vehicleDescription||'Veículo',
          dueDate:alert.dueDate,
        };
        const referenceId=`${vehicleId}:${alert.dueDate}`;
        const material=JSON.stringify({
          companyId:principal.companyId,vehicleId,driverId:alert.driverId,referenceId,phone,
          templateKey:TEMPLATE_KEY,templateVersion:version,parameters,consentGrantedAt:String(row.consent_granted_at||''),
        });
        const idempotencyKey=createHash('sha256').update(material).digest('hex');
        const outboxId=`wao_${idempotencyKey.slice(0,32)}`,now=new Date().toISOString();
        const inserted=rows(await tx.execute(sql`
          INSERT INTO whatsapp_outbox(
            id,company_id,driver_id,phone_e164,template_key,template_version,template_parameters,
            reference_type,reference_id,idempotency_key,status,requested_by,created_at,updated_at
          ) VALUES(
            ${outboxId},${principal.companyId},${alert.driverId},${phone},${TEMPLATE_KEY},${version},${JSON.stringify(parameters)}::jsonb,
            ${REFERENCE_TYPE},${referenceId},${idempotencyKey},'HELD_PROVIDER_DISABLED',${principal.userId},${now},${now}
          )
          ON CONFLICT(company_id,idempotency_key) DO NOTHING
          RETURNING id
        `));
        const created=Boolean(inserted[0]);
        if(created){
          await context.getAuditLogRepo().create({
            id:randomUUID(),companyId:principal.companyId,entityName:'WhatsappOutbox',entityId:outboxId,action:AuditAction.CREATE,
            newState:JSON.stringify({
              event:'KM_READING_REQUEST_PREPARED',vehicleId,driverId:alert.driverId,referenceId,
              templateKey:TEMPLATE_KEY,templateVersion:version,status:'HELD_PROVIDER_DISABLED',providerCallApplied:false,
            }),
            userId:principal.userId,userName:principal.name,timestamp:now,
          });
        }
        results.push({vehicleId,plate:alert.plate,driverId:alert.driverId,created,outboxId,status:'HELD_PROVIDER_DISABLED',providerCallApplied:false});
      }
      return results;
    });
  }
}
