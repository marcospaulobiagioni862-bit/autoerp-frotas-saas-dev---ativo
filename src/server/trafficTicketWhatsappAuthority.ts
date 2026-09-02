import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { AuditAction, TicketResponsibility, TicketStatus } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';
import {
  TrafficTicketConflictError,
  TrafficTicketForbiddenError,
  TrafficTicketNotFoundError,
} from './trafficTicketAuthority';

const TEMPLATE_KEY='TRAFFIC_TICKET_NOTICE';
const WRITE_ROLES=new Set(['ADMIN','MANAGER','OPERATIONAL_MANAGER','OPERATIONAL']);
const EXPECTED_PARAMETERS=['amount','autoNumber','description','driverName','dueDate','indicationDeadline','infractionCode','infractionDate','infractionLocation','organName','plate','points'];

export interface TrafficTicketWhatsappPreparation {
  outboxId:string;
  created:boolean;
  status:'HELD_PROVIDER_DISABLED';
  providerCallApplied:false;
}

export class TrafficTicketWhatsappConsentRequiredError extends Error{}

function rows(result:any):any[]{return Array.isArray(result?.rows)?result.rows:[];}
function assertWrite(principal:AuthenticatedPrincipal):void{
  const role=String(principal.role||'').toUpperCase(),permissions=Array.isArray(principal.permissions)?principal.permissions:[];
  if(!WRITE_ROLES.has(role)&&!permissions.includes('*')&&!permissions.includes('MANAGE_WHATSAPP')&&!permissions.includes('TRAFFIC_TICKET_WRITE'))throw new TrafficTicketForbiddenError('Acesso negado');
}
function normalizeBrazilPhone(value:unknown):string{
  const digits=typeof value==='string'?value.replace(/\D/g,''):'';
  const national=digits.startsWith('55')&&(digits.length===12||digits.length===13)?digits:(digits.length===10||digits.length===11?`55${digits}`:'');
  if(!/^55\d{10,11}$/.test(national)||/^(\d)\1+$/.test(national))throw new TrafficTicketConflictError('Motorista sem WhatsApp válido');
  return `+${national}`;
}
function stringArray(value:unknown):string[]{
  const parsed=typeof value==='string'?JSON.parse(value):value;
  if(!Array.isArray(parsed)||!parsed.every(item=>typeof item==='string'))throw new Error('Invalid WhatsApp template schema');
  return [...parsed].sort();
}

export class TrafficTicketWhatsappAuthorityService {
  static async prepare(principal:AuthenticatedPrincipal,ticketId:string):Promise<TrafficTicketWhatsappPreparation>{
    assertWrite(principal);
    return await UnitOfWork.run(principal.companyId,async context=>{
      const tx=context.getRawTransaction?.();if(!tx)throw new Error('WhatsApp traffic-ticket persistence unavailable');
      const ticket=rows(await tx.execute(sql`
        SELECT id,vehicle_id,driver_id,auto_number,organ_name,infraction_code,description,infraction_date,infraction_location,due_date,
               original_amount,points,responsibility,status
        FROM traffic_tickets
        WHERE company_id=${principal.companyId} AND id=${ticketId} AND canonical_ready=true
        FOR UPDATE
      `))[0];
      if(!ticket)throw new TrafficTicketNotFoundError('Multa não encontrada');
      if(String(ticket.status)===TicketStatus.CANCELLED)throw new TrafficTicketConflictError('Multa cancelada');
      if(String(ticket.responsibility)!==TicketResponsibility.DRIVER||!ticket.driver_id)throw new TrafficTicketConflictError('Comunicação exige motorista responsável identificado');

      const driver=rows(await tx.execute(sql`
        SELECT id,name,phone,whatsapp,status,is_archived
        FROM drivers
        WHERE company_id=${principal.companyId} AND id=${String(ticket.driver_id)}
        LIMIT 1
        FOR SHARE
      `))[0];
      if(!driver||driver.is_archived===true||String(driver.status)==='ARCHIVED')throw new TrafficTicketNotFoundError('Motorista não encontrado');
      const phone=normalizeBrazilPhone(driver.whatsapp||driver.phone);
      const consent=rows(await tx.execute(sql`
        SELECT status,phone_e164,granted_at
        FROM whatsapp_consents
        WHERE company_id=${principal.companyId} AND driver_id=${String(ticket.driver_id)}
        LIMIT 1
        FOR SHARE
      `))[0];
      if(!consent||String(consent.status)!=='GRANTED'||String(consent.phone_e164)!==phone)throw new TrafficTicketWhatsappConsentRequiredError('Current WhatsApp consent required');

      const template=rows(await tx.execute(sql`
        SELECT version,parameter_keys
        FROM whatsapp_template_catalog
        WHERE company_id=${principal.companyId} AND template_key=${TEMPLATE_KEY} AND status='ACTIVE'
        ORDER BY version DESC LIMIT 1 FOR SHARE
      `))[0];
      if(!template)throw new Error('Traffic ticket WhatsApp template unavailable');
      const version=Number(template.version),keys=stringArray(template.parameter_keys);
      if(!Number.isInteger(version)||version<1||JSON.stringify(keys)!==JSON.stringify(EXPECTED_PARAMETERS))throw new Error('Traffic ticket WhatsApp template schema mismatch');

      const vehicle=rows(await tx.execute(sql`SELECT plate FROM vehicles WHERE company_id=${principal.companyId} AND id=${String(ticket.vehicle_id)} LIMIT 1`))[0];
      const indication=rows(await tx.execute(sql`
        SELECT indication_deadline FROM traffic_ticket_driver_indications
        WHERE company_id=${principal.companyId} AND traffic_ticket_id=${ticketId}
        LIMIT 1
      `))[0];
      const amount=Number(ticket.original_amount||0).toFixed(2).replace('.',',');
      const parameters={
        driverName:String(driver.name||'Motorista'),autoNumber:String(ticket.auto_number),plate:String(vehicle?.plate||ticket.vehicle_id),
        infractionDate:String(ticket.infraction_date).slice(0,10),infractionLocation:String(ticket.infraction_location||'não informado'),
        organName:String(ticket.organ_name||''),infractionCode:String(ticket.infraction_code||''),description:String(ticket.description||''),
        points:String(ticket.points??0),amount,dueDate:String(ticket.due_date).slice(0,10),
        indicationDeadline:indication?.indication_deadline?String(indication.indication_deadline).slice(0,10):'não informado',
      };
      const material=JSON.stringify({companyId:principal.companyId,ticketId,driverId:String(ticket.driver_id),phone,templateKey:TEMPLATE_KEY,templateVersion:version,parameters,consentGrantedAt:String(consent.granted_at||'')});
      const idempotencyKey=createHash('sha256').update(material).digest('hex'),outboxId=`wao_${idempotencyKey.slice(0,32)}`,now=new Date().toISOString();
      const inserted=rows(await tx.execute(sql`
        INSERT INTO whatsapp_outbox(
          id,company_id,driver_id,phone_e164,template_key,template_version,template_parameters,
          reference_type,reference_id,idempotency_key,status,requested_by,created_at,updated_at
        ) VALUES(
          ${outboxId},${principal.companyId},${String(ticket.driver_id)},${phone},${TEMPLATE_KEY},${version},${JSON.stringify(parameters)}::jsonb,
          'TRAFFIC_TICKET',${ticketId},${idempotencyKey},'HELD_PROVIDER_DISABLED',${principal.userId},${now},${now}
        ) ON CONFLICT(company_id,idempotency_key) DO NOTHING RETURNING id
      `));
      const created=Boolean(inserted[0]);
      if(created){
        await context.getAuditLogRepo().create({
          id:randomUUID(),companyId:principal.companyId,entityName:'WhatsappOutbox',entityId:outboxId,action:AuditAction.CREATE,
          newState:JSON.stringify({id:outboxId,driverId:String(ticket.driver_id),templateKey:TEMPLATE_KEY,referenceType:'TRAFFIC_TICKET',referenceId:ticketId,status:'HELD_PROVIDER_DISABLED',providerCallApplied:false}),
          userId:principal.userId,userName:principal.name,timestamp:now,
        });
      }
      return {outboxId,created,status:'HELD_PROVIDER_DISABLED',providerCallApplied:false};
    });
  }
}
