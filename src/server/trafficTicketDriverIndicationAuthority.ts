import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { AuditAction, TicketResponsibility, TicketStatus, TrafficTicketDriverIndicationStatus } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';
import {
  syncOperationalAlert,
  TrafficTicketConflictError,
  TrafficTicketForbiddenError,
  TrafficTicketNotFoundError,
  TrafficTicketValidationError,
} from './trafficTicketAuthority';

export interface TrafficTicketDriverIndication {
  id: string;
  companyId: string;
  trafficTicketId: string;
  driverId?: string;
  status: TrafficTicketDriverIndicationStatus;
  indicationDeadline?: string;
  notes?: string;
  statusChangedAt: string;
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateTrafficTicketDriverIndicationInput {
  status: TrafficTicketDriverIndicationStatus;
  indicationDeadline?: string;
  notes?: string;
}

const WRITE_ROLES = new Set(['ADMIN','MANAGER','OPERATIONAL_MANAGER','FINANCIAL','FINANCIAL_MANAGER','OPERATIONAL']);
const TRANSITIONS:Record<TrafficTicketDriverIndicationStatus,ReadonlySet<TrafficTicketDriverIndicationStatus>>={
  [TrafficTicketDriverIndicationStatus.PENDING]:new Set([TrafficTicketDriverIndicationStatus.COMMUNICATED,TrafficTicketDriverIndicationStatus.APPEAL,TrafficTicketDriverIndicationStatus.CANCELLED]),
  [TrafficTicketDriverIndicationStatus.COMMUNICATED]:new Set([TrafficTicketDriverIndicationStatus.DOCUMENTS_SENT,TrafficTicketDriverIndicationStatus.APPEAL,TrafficTicketDriverIndicationStatus.CANCELLED]),
  [TrafficTicketDriverIndicationStatus.DOCUMENTS_SENT]:new Set([TrafficTicketDriverIndicationStatus.SIGNED,TrafficTicketDriverIndicationStatus.APPEAL,TrafficTicketDriverIndicationStatus.CANCELLED]),
  [TrafficTicketDriverIndicationStatus.SIGNED]:new Set([TrafficTicketDriverIndicationStatus.INDICATED,TrafficTicketDriverIndicationStatus.APPEAL,TrafficTicketDriverIndicationStatus.CANCELLED]),
  [TrafficTicketDriverIndicationStatus.INDICATED]:new Set([TrafficTicketDriverIndicationStatus.COMPLETED,TrafficTicketDriverIndicationStatus.APPEAL,TrafficTicketDriverIndicationStatus.CANCELLED]),
  [TrafficTicketDriverIndicationStatus.COMPLETED]:new Set(),
  [TrafficTicketDriverIndicationStatus.APPEAL]:new Set([TrafficTicketDriverIndicationStatus.CANCELLED]),
  [TrafficTicketDriverIndicationStatus.CANCELLED]:new Set(),
};

function rows(result:any):any[]{return Array.isArray(result?.rows)?result.rows:[];}
function optional(value:unknown):string|undefined{return value===null||value===undefined||value===''?undefined:String(value);}
function iso(value:unknown):string{return value instanceof Date?value.toISOString():new Date(String(value)).toISOString();}
function dateOnly(value:unknown):string|undefined{return value===null||value===undefined||value===''?undefined:String(value).slice(0,10);}
function assertWrite(principal:AuthenticatedPrincipal):void{
  const role=String(principal.role||'').toUpperCase(),permissions=Array.isArray(principal.permissions)?principal.permissions:[];
  if(!WRITE_ROLES.has(role)&&!permissions.includes('*')&&!permissions.includes('TRAFFIC_TICKET_WRITE'))throw new TrafficTicketForbiddenError('Acesso negado: Multas sem permissão de escrita');
}
function validateDate(value?:string):void{
  if(!value)return;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new TrafficTicketValidationError('Prazo de indicação inválido');
  const parsed=new Date(`${value}T00:00:00Z`);
  if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)throw new TrafficTicketValidationError('Prazo de indicação inválido');
}
function map(row:any):TrafficTicketDriverIndication{
  return {
    id:String(row.id),companyId:String(row.company_id),trafficTicketId:String(row.traffic_ticket_id),driverId:optional(row.driver_id),
    status:String(row.status) as TrafficTicketDriverIndicationStatus,indicationDeadline:dateOnly(row.indication_deadline),notes:optional(row.notes),
    statusChangedAt:iso(row.status_changed_at),createdBy:optional(row.created_by),updatedBy:optional(row.updated_by),createdAt:iso(row.created_at),updatedAt:iso(row.updated_at),
  };
}
function virtualPending(companyId:string,ticketId:string,driverId?:string,current?:TrafficTicketDriverIndication):TrafficTicketDriverIndication{
  const now=new Date().toISOString();
  return {id:current?.id||ticketId,companyId,trafficTicketId:ticketId,driverId,status:TrafficTicketDriverIndicationStatus.PENDING,statusChangedAt:now,createdAt:current?.createdAt||now,updatedAt:now};
}

export function canTransitionTrafficTicketDriverIndication(from:TrafficTicketDriverIndicationStatus,to:TrafficTicketDriverIndicationStatus):boolean{
  return from===to||TRANSITIONS[from].has(to);
}

async function ticketForUpdate(rawTx:any,companyId:string,id:string):Promise<any>{
  const result=await rawTx.execute(sql`SELECT id,driver_id,responsibility,status FROM traffic_tickets WHERE company_id=${companyId} AND id=${id} AND canonical_ready=true FOR UPDATE`);
  const ticket=rows(result)[0];if(!ticket)throw new TrafficTicketNotFoundError('Multa não encontrada');return ticket;
}

async function currentRow(rawTx:any,companyId:string,ticketId:string,lock=false):Promise<any>{
  const result=lock
    ?await rawTx.execute(sql`SELECT * FROM traffic_ticket_driver_indications WHERE company_id=${companyId} AND traffic_ticket_id=${ticketId} FOR UPDATE`)
    :await rawTx.execute(sql`SELECT * FROM traffic_ticket_driver_indications WHERE company_id=${companyId} AND traffic_ticket_id=${ticketId} LIMIT 1`);
  return rows(result)[0];
}

export class TrafficTicketDriverIndicationAuthorityService {
  static async get(companyId:string,ticketId:string):Promise<TrafficTicketDriverIndication>{
    return await UnitOfWork.run(companyId,async tx=>{
      const rawTx=tx.getRawTransaction?.();if(!rawTx)throw new Error('Traffic ticket indication persistence unavailable');
      const ticketResult=await rawTx.execute(sql`SELECT id,driver_id FROM traffic_tickets WHERE company_id=${companyId} AND id=${ticketId} AND canonical_ready=true LIMIT 1`);
      const ticket=rows(ticketResult)[0];if(!ticket)throw new TrafficTicketNotFoundError('Multa não encontrada');
      const driverId=optional(ticket.driver_id),currentRaw=await currentRow(rawTx,companyId,ticketId),current=currentRaw?map(currentRaw):undefined;
      if(current&&current.driverId===driverId)return current;
      return virtualPending(companyId,ticketId,driverId,current);
    });
  }

  static async update(principal:AuthenticatedPrincipal,ticketId:string,input:UpdateTrafficTicketDriverIndicationInput):Promise<TrafficTicketDriverIndication>{
    assertWrite(principal);validateDate(input.indicationDeadline);
    if(!Object.values(TrafficTicketDriverIndicationStatus).includes(input.status))throw new TrafficTicketValidationError('Status de indicação inválido');
    if(input.notes!==undefined&&input.notes.length>4000)throw new TrafficTicketValidationError('Observação de indicação inválida');
    return await UnitOfWork.run(principal.companyId,async tx=>{
      const rawTx=tx.getRawTransaction?.();if(!rawTx)throw new Error('Traffic ticket indication persistence unavailable');
      const ticket=await ticketForUpdate(rawTx,principal.companyId,ticketId);
      if(String(ticket.status)===TicketStatus.CANCELLED)throw new TrafficTicketConflictError('Multa cancelada');
      if(input.status===TrafficTicketDriverIndicationStatus.APPEAL&&String(ticket.status)!==TicketStatus.APPEALED)throw new TrafficTicketConflictError('Registre o recurso da multa antes de mover a indicação para recurso');
      const driverId=optional(ticket.driver_id),responsibility=String(ticket.responsibility) as TicketResponsibility;
      const requiresDriver=!([TrafficTicketDriverIndicationStatus.PENDING,TrafficTicketDriverIndicationStatus.APPEAL,TrafficTicketDriverIndicationStatus.CANCELLED] as TrafficTicketDriverIndicationStatus[]).includes(input.status);
      if(requiresDriver&&(responsibility!==TicketResponsibility.DRIVER||!driverId))throw new TrafficTicketConflictError('Indicação exige motorista identificado como responsável');

      const existing=await currentRow(rawTx,principal.companyId,ticketId,true);
      const existingMapped=existing?map(existing):undefined;
      const sameDriver=existingMapped?.driverId===driverId;
      const from=sameDriver&&existingMapped?existingMapped.status:TrafficTicketDriverIndicationStatus.PENDING;
      if(!canTransitionTrafficTicketDriverIndication(from,input.status))throw new TrafficTicketConflictError(`Transição de indicação inválida: ${from} -> ${input.status}`);

      const now=new Date().toISOString(),id=existingMapped?.id||randomUUID(),notes=input.notes?.trim()||undefined;
      const result=await rawTx.execute(sql`
        INSERT INTO traffic_ticket_driver_indications(
          id,company_id,traffic_ticket_id,driver_id,status,indication_deadline,notes,status_changed_at,created_by,updated_by,created_at,updated_at
        ) VALUES (
          ${id},${principal.companyId},${ticketId},${driverId||null},${input.status},${input.indicationDeadline||null},${notes||null},${now},${principal.userId},${principal.userId},${now},${now}
        )
        ON CONFLICT(company_id,traffic_ticket_id) DO UPDATE SET
          driver_id=excluded.driver_id,status=excluded.status,indication_deadline=excluded.indication_deadline,notes=excluded.notes,
          status_changed_at=CASE WHEN traffic_ticket_driver_indications.status IS DISTINCT FROM excluded.status OR traffic_ticket_driver_indications.driver_id IS DISTINCT FROM excluded.driver_id THEN excluded.status_changed_at ELSE traffic_ticket_driver_indications.status_changed_at END,
          updated_by=excluded.updated_by,updated_at=excluded.updated_at
        RETURNING *
      `);
      const saved=map(rows(result)[0]);
      await tx.getAuditLogRepo().create({
        id:randomUUID(),companyId:principal.companyId,entityName:'TrafficTicketDriverIndication',entityId:ticketId,
        action:existingMapped?AuditAction.UPDATE:AuditAction.CREATE,previousState:existingMapped?JSON.stringify(existingMapped):undefined,newState:JSON.stringify(saved),
        userId:principal.userId,userName:principal.name,timestamp:now,
      });
      const canonical=await tx.getTrafficTicketRepo().findByIdForCompany(principal.companyId,ticketId);
      if(canonical)await syncOperationalAlert(tx,principal,canonical);
      return saved;
    });
  }
}
