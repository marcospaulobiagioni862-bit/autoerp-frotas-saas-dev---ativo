import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { AuditAction } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';

export type TollPassageStatus='PENDING'|'PAID'|'OVERDUE'|'CONTESTED';
export type TollPassageSource='MANUAL'|'CSV';
export interface CreateTollPassageInput{
  vehicleId?:string;plate?:string;concessionaire:string;road:string;tollPoint:string;occurredAt:string;amount:number;
  dueDate?:string;status:TollPassageStatus;source:TollPassageSource;sourceReference?:string;notes?:string;
}
export interface TollPassage{
  id:string;companyId:string;vehicleId:string;contractId?:string;driverId?:string;concessionaire:string;road:string;tollPoint:string;
  occurredAt:string;amount:number;dueDate?:string;status:TollPassageStatus;source:TollPassageSource;sourceReference?:string;notes?:string;
  createdAt:string;updatedAt:string;
}
export interface TollPassageCreateResult{item:TollPassage;created:boolean;}

export class TollPassageValidationError extends Error{}
export class TollPassageNotFoundError extends Error{}
export class TollPassageForbiddenError extends Error{}

const WRITE_ROLES=new Set(['ADMIN','MANAGER','OPERATIONAL_MANAGER','FINANCIAL','FINANCIAL_MANAGER','OPERATIONAL']);
const STATUSES=new Set<TollPassageStatus>(['PENDING','PAID','OVERDUE','CONTESTED']);
const SOURCES=new Set<TollPassageSource>(['MANUAL','CSV']);
function rows(result:any):any[]{return Array.isArray(result?.rows)?result.rows:[];}
function optional(value:unknown):string|undefined{return value===null||value===undefined||value===''?undefined:String(value);}
function requiredText(value:unknown,label:string,max:number):string{const item=typeof value==='string'?value.trim():'';if(!item||item.length>max)throw new TollPassageValidationError(`${label} inválido`);return item;}
function optionalText(value:unknown,max:number):string|undefined{if(value===undefined||value===null||value==='')return undefined;const item=String(value).trim();if(!item||item.length>max)throw new TollPassageValidationError('Texto inválido');return item;}
function isoDate(value:unknown):string|undefined{if(value===undefined||value===null||value==='')return undefined;const item=String(value).trim();if(!/^\d{4}-\d{2}-\d{2}$/.test(item))throw new TollPassageValidationError('Data inválida');const parsed=new Date(`${item}T00:00:00Z`);if(parsed.toISOString().slice(0,10)!==item)throw new TollPassageValidationError('Data inválida');return item;}
function isoTimestamp(value:unknown):string{const item=typeof value==='string'?value.trim():'';if(!item||!/(?:Z|[+-]\d{2}:\d{2})$/.test(item))throw new TollPassageValidationError('Data/hora da passagem inválida');const ms=Date.parse(item);if(!Number.isFinite(ms))throw new TollPassageValidationError('Data/hora da passagem inválida');return new Date(ms).toISOString();}
function money(value:unknown):number{const amount=Number(value);if(!Number.isFinite(amount)||amount<=0||amount>999999999.99)throw new TollPassageValidationError('Valor inválido');return Math.round(amount*100)/100;}
function status(value:unknown):TollPassageStatus{const item=String(value||'') as TollPassageStatus;if(!STATUSES.has(item))throw new TollPassageValidationError('Status inválido');return item;}
function source(value:unknown):TollPassageSource{const item=String(value||'') as TollPassageSource;if(!SOURCES.has(item))throw new TollPassageValidationError('Origem inválida');return item;}
function normalizePlate(value:unknown):string|undefined{if(value===undefined||value===null||value==='')return undefined;const item=String(value).trim().toUpperCase().replace(/[^A-Z0-9]/g,'');if(!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(item))throw new TollPassageValidationError('Placa inválida');return item;}
function assertWrite(principal:AuthenticatedPrincipal):void{const role=String(principal.role||'').toUpperCase(),permissions=Array.isArray(principal.permissions)?principal.permissions:[];if(!WRITE_ROLES.has(role)&&!permissions.includes('*')&&!permissions.includes('TOLL_PASSAGE_WRITE'))throw new TollPassageForbiddenError('Acesso negado: pedágios sem permissão de escrita');}
function fromRow(row:any):TollPassage{return {id:String(row.id),companyId:String(row.company_id),vehicleId:String(row.vehicle_id),contractId:optional(row.contract_id),driverId:optional(row.driver_id),concessionaire:String(row.concessionaire),road:String(row.road),tollPoint:String(row.toll_point),occurredAt:new Date(row.occurred_at).toISOString(),amount:Number(row.amount),dueDate:row.due_date?String(row.due_date).slice(0,10):undefined,status:String(row.status) as TollPassageStatus,source:String(row.source) as TollPassageSource,sourceReference:optional(row.source_reference),notes:optional(row.notes),createdAt:new Date(row.created_at).toISOString(),updatedAt:new Date(row.updated_at).toISOString()};}
function key(input:{vehicleId:string;concessionaire:string;road:string;tollPoint:string;occurredAt:string;amount:number;source:TollPassageSource;sourceReference?:string}):string{const identity=input.sourceReference?`${input.source}|${input.sourceReference}`:`${input.vehicleId}|${input.concessionaire}|${input.road}|${input.tollPoint}|${input.occurredAt}|${input.amount.toFixed(2)}|${input.source}`;return `toll:${createHash('sha256').update(identity).digest('hex')}`;}

async function resolveVehicle(rawTx:any,companyId:string,vehicleId?:string,plate?:string):Promise<{id:string;plate:string}>{
  if(Boolean(vehicleId)===Boolean(plate))throw new TollPassageValidationError('Informe vehicleId ou placa, mas não ambos');
  const result=vehicleId
    ?await rawTx.execute(sql`SELECT id,plate FROM vehicles WHERE company_id=${companyId} AND id=${vehicleId} LIMIT 2`)
    :await rawTx.execute(sql`SELECT id,plate FROM vehicles WHERE company_id=${companyId} AND plate=${plate} LIMIT 2`);
  const matches=rows(result);if(matches.length!==1)throw new TollPassageNotFoundError('Veículo não encontrado');return {id:String(matches[0].id),plate:String(matches[0].plate)};
}
async function resolveContract(rawTx:any,companyId:string,vehicleId:string,occurredAt:string):Promise<{contractId?:string;driverId?:string}>{
  const occurredDate=occurredAt.slice(0,10);
  const result=await rawTx.execute(sql`
    SELECT id,driver_id FROM contracts
    WHERE company_id=${companyId} AND vehicle_id=${vehicleId} AND is_archived=false
      AND status NOT IN ('DRAFT','AWAITING_SIGNATURE','CANCELLED','ARCHIVED')
      AND start_date<=${occurredDate} AND (end_date IS NULL OR end_date>=${occurredDate})
    ORDER BY start_date DESC,id
  `);
  const matches=rows(result);if(matches.length!==1)return {};return {contractId:String(matches[0].id),driverId:String(matches[0].driver_id)};
}

export class TollPassageAuthorityService{
  static async list(companyId:string,filters:{vehicleId?:string;driverId?:string;contractId?:string;status?:TollPassageStatus}={}):Promise<TollPassage[]>{
    return await UnitOfWork.run(companyId,async context=>{const rawTx=context.getRawTransaction?.();if(!rawTx)throw new Error('Toll persistence unavailable');const result=await rawTx.execute(sql`
      SELECT * FROM toll_passages
      WHERE company_id=${companyId}
        AND (${filters.vehicleId||null}::text IS NULL OR vehicle_id=${filters.vehicleId||null})
        AND (${filters.driverId||null}::text IS NULL OR driver_id=${filters.driverId||null})
        AND (${filters.contractId||null}::text IS NULL OR contract_id=${filters.contractId||null})
        AND (${filters.status||null}::text IS NULL OR status=${filters.status||null})
      ORDER BY occurred_at DESC,id DESC
      LIMIT 500
    `);return rows(result).map(fromRow);});
  }
  static async create(principal:AuthenticatedPrincipal,rawInput:CreateTollPassageInput):Promise<TollPassageCreateResult>{
    assertWrite(principal);
    const vehicleId=optionalText(rawInput.vehicleId,200),plate=normalizePlate(rawInput.plate),concessionaire=requiredText(rawInput.concessionaire,'Concessionária',200),road=requiredText(rawInput.road,'Rodovia',200),tollPoint=requiredText(rawInput.tollPoint,'Pórtico/praça',300),occurredAt=isoTimestamp(rawInput.occurredAt),amount=money(rawInput.amount),dueDate=isoDate(rawInput.dueDate),selectedStatus=status(rawInput.status),selectedSource=source(rawInput.source),sourceReference=optionalText(rawInput.sourceReference,300),notes=optionalText(rawInput.notes,4000);
    return await UnitOfWork.run(principal.companyId,async context=>{const rawTx=context.getRawTransaction?.();if(!rawTx)throw new Error('Toll persistence unavailable');const vehicle=await resolveVehicle(rawTx,principal.companyId,vehicleId,plate);const contract=await resolveContract(rawTx,principal.companyId,vehicle.id,occurredAt);const idempotencyKey=key({vehicleId:vehicle.id,concessionaire,road,tollPoint,occurredAt,amount,source:selectedSource,sourceReference});
      const existing=rows(await rawTx.execute(sql`SELECT * FROM toll_passages WHERE company_id=${principal.companyId} AND idempotency_key=${idempotencyKey} LIMIT 1 FOR SHARE`))[0];if(existing)return {item:fromRow(existing),created:false};
      const id=randomUUID(),now=new Date().toISOString();const inserted=rows(await rawTx.execute(sql`
        INSERT INTO toll_passages(id,company_id,vehicle_id,contract_id,driver_id,concessionaire,road,toll_point,occurred_at,amount,due_date,status,source,source_reference,notes,idempotency_key,created_by_user_id,created_by_name,created_at,updated_at)
        VALUES(${id},${principal.companyId},${vehicle.id},${contract.contractId||null},${contract.driverId||null},${concessionaire},${road},${tollPoint},${occurredAt},${amount},${dueDate||null},${selectedStatus},${selectedSource},${sourceReference||null},${notes||null},${idempotencyKey},${principal.userId},${principal.name},${now},${now})
        ON CONFLICT(company_id,idempotency_key) DO NOTHING RETURNING *
      `));
      let row=inserted[0];if(!row){row=rows(await rawTx.execute(sql`SELECT * FROM toll_passages WHERE company_id=${principal.companyId} AND idempotency_key=${idempotencyKey} LIMIT 1`))[0];if(!row)throw new Error('Toll passage idempotency failure');return {item:fromRow(row),created:false};}
      const item=fromRow(row);await context.getAuditLogRepo().create({id:randomUUID(),companyId:principal.companyId,entityName:'TollPassage',entityId:id,action:AuditAction.CREATE,newState:JSON.stringify({...item,idempotencyKey,vehiclePlate:vehicle.plate}),userId:principal.userId,userName:principal.name,timestamp:now});return {item,created:true};
    });
  }
}

export const tollPassageValidation={status,source,normalizePlate,isoTimestamp};
