import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { AuditAction, TicketStatus } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';
import { TrafficTicketConflictError, TrafficTicketForbiddenError, TrafficTicketNotFoundError, TrafficTicketValidationError } from './trafficTicketAuthority';

export type TrafficTicketVehicleOperationalCause='DOCUMENTATION'|'TECHNICAL_CONDITION'|'OTHER_OPERATIONAL';
export interface TrafficTicketVehicleOperationalResult{taskId:string;created:boolean;cause:TrafficTicketVehicleOperationalCause;category:'DOCUMENT'|'MAINTENANCE'|'OPERATIONAL_GENERAL';}

const WRITE_ROLES=new Set(['ADMIN','MANAGER','OPERATIONAL_MANAGER','OPERATIONAL']);
const CAUSES=new Set<TrafficTicketVehicleOperationalCause>(['DOCUMENTATION','TECHNICAL_CONDITION','OTHER_OPERATIONAL']);
const CONFIG:Record<TrafficTicketVehicleOperationalCause,{category:TrafficTicketVehicleOperationalResult['category'];title:string;priority:'P1'|'P2';severity:'HIGH'|'MEDIUM'}>={
  DOCUMENTATION:{category:'DOCUMENT',title:'Regularizar documentação do veículo',priority:'P1',severity:'HIGH'},
  TECHNICAL_CONDITION:{category:'MAINTENANCE',title:'Avaliar condição técnica do veículo',priority:'P1',severity:'HIGH'},
  OTHER_OPERATIONAL:{category:'OPERATIONAL_GENERAL',title:'Tratar causa operacional do veículo',priority:'P2',severity:'MEDIUM'},
};
function rows(result:any):any[]{return Array.isArray(result?.rows)?result.rows:[];}
function assertWrite(principal:AuthenticatedPrincipal):void{
  const role=String(principal.role||'').toUpperCase();
  if(role==='ADMIN') return;
  const permissions=Array.isArray(principal.permissions)?principal.permissions:[];
  if(!permissions.includes('*')&&!permissions.includes('TRAFFIC_TICKET_WRITE')&&!permissions.includes('OPERATIONS_WRITE'))throw new TrafficTicketForbiddenError('Acesso negado: pendência operacional sem permissão de escrita');
}
function cause(value:unknown):TrafficTicketVehicleOperationalCause{
  const item=String(value||'') as TrafficTicketVehicleOperationalCause;
  if(!CAUSES.has(item))throw new TrafficTicketValidationError('Causa operacional inválida');
  return item;
}

export class TrafficTicketVehicleOperationalAuthorityService{
  static parseCause(value:unknown):TrafficTicketVehicleOperationalCause{return cause(value);}
  static async create(principal:AuthenticatedPrincipal,ticketId:string,rawCause:unknown):Promise<TrafficTicketVehicleOperationalResult>{
    assertWrite(principal);const selected=cause(rawCause),config=CONFIG[selected];
    return await UnitOfWork.run(principal.companyId,async context=>{
      const rawTx=context.getRawTransaction?.();if(!rawTx)throw new Error('Operational task persistence unavailable');
      const ticket=rows(await rawTx.execute(sql`
        SELECT id,vehicle_id,auto_number,description,due_date,status
        FROM traffic_tickets
        WHERE company_id=${principal.companyId} AND id=${ticketId} AND canonical_ready=true
        FOR UPDATE
      `))[0];
      if(!ticket)throw new TrafficTicketNotFoundError('Multa não encontrada');
      if(String(ticket.status)===TicketStatus.CANCELLED)throw new TrafficTicketConflictError('Multa cancelada');
      const vehicle=rows(await rawTx.execute(sql`SELECT plate,brand,model FROM vehicles WHERE company_id=${principal.companyId} AND id=${String(ticket.vehicle_id)} LIMIT 1`))[0];
      if(!vehicle)throw new TrafficTicketNotFoundError('Veículo não encontrado');
      const idempotencyKey=`traffic-ticket-vehicle-action:${ticketId}:${selected}`;
      const sourceType='TRAFFIC_TICKET_VEHICLE_ACTION',sourceId=`${ticketId}:${selected}`;
      const existing=rows(await rawTx.execute(sql`
        SELECT id FROM operational_tasks
        WHERE company_id=${principal.companyId} AND idempotency_key=${idempotencyKey}
        LIMIT 1
        FOR SHARE
      `))[0];
      if(existing)return {taskId:String(existing.id),created:false,cause:selected,category:config.category};
      const now=new Date().toISOString(),candidate=new Date(`${String(ticket.due_date).slice(0,10)}T23:59:59.000Z`).toISOString();
      const dueAt=candidate>=now?candidate:new Date(Date.now()+24*60*60*1000).toISOString();
      const taskId=randomUUID(),correlationId=randomUUID(),plate=String(vehicle.plate||ticket.vehicle_id);
      const title=`${config.title} — multa ${String(ticket.auto_number)}`;
      const description=`Multa ${String(ticket.auto_number)} vinculada ao veículo ${plate}${vehicle.brand||vehicle.model?` — ${String(vehicle.brand||'')} ${String(vehicle.model||'')}`:''}. Motivo classificado manualmente como ${selected}. Infração: ${String(ticket.description||'')}. Verificar e registrar a providência operacional apropriada sem alterar automaticamente o financeiro ou a responsabilidade da multa.`;
      const inserted=rows(await rawTx.execute(sql`
        INSERT INTO operational_tasks(
          id,company_id,title,description,category,priority,severity,status,source_type,source_id,entity_type,entity_id,
          assigned_team,created_by_user_id,created_by_name,due_at,correlation_id,idempotency_key,created_at,updated_at
        ) VALUES(
          ${taskId},${principal.companyId},${title},${description},${config.category},${config.priority},${config.severity},'OPEN',${sourceType},${sourceId},'VEHICLE',${String(ticket.vehicle_id)},
          'OPERATIONS',${principal.userId},${principal.name},${dueAt},${correlationId},${idempotencyKey},${now},${now}
        ) ON CONFLICT(company_id,idempotency_key) DO NOTHING RETURNING id
      `));
      if(!inserted[0]){
        const replay=rows(await rawTx.execute(sql`SELECT id FROM operational_tasks WHERE company_id=${principal.companyId} AND idempotency_key=${idempotencyKey} LIMIT 1`))[0];
        if(!replay)throw new Error('Operational task idempotency failure');
        return {taskId:String(replay.id),created:false,cause:selected,category:config.category};
      }
      await context.getAuditLogRepo().create({
        id:randomUUID(),companyId:principal.companyId,entityName:'OperationalTask',entityId:taskId,action:AuditAction.CREATE,
        newState:JSON.stringify({id:taskId,title,category:config.category,priority:config.priority,severity:config.severity,status:'OPEN',sourceType,sourceId,trafficTicketId:ticketId,entityType:'VEHICLE',entityId:String(ticket.vehicle_id),cause:selected,idempotencyKey}),
        userId:principal.userId,userName:principal.name,timestamp:now,
      });
      return {taskId,created:true,cause:selected,category:config.category};
    });
  }
}
