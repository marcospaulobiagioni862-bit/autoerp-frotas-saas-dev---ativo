import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { PayableService } from '../domain/finance/PayableService';
import { ReceivableService } from '../domain/finance/ReceivableService';
import { AuditAction, ObligationStatus, OriginType, TicketResponsibility, TicketStatus } from '../types/enums';
import type { AccountPayable, AccountReceivable, TrafficTicket } from '../types/entities';
import type { AuthenticatedPrincipal } from './auth';

export interface TicketFinancialCategory { id:string; name:string; type:string; }
export interface CreateTrafficTicketAuthorityInput {
  vehicleId?:string;vehiclePlate?:string;driverId?:string;contractId?:string;autoNumber:string;organName:string;infractionCode:string;
  description:string;infractionDate:string;infractionTime?:string;infractionLocation?:string;dueDate:string;discountDueDate?:string;originalAmount:number;
  discountedAmount?:number;nicAmount?:number;points:number;responsibility:TicketResponsibility;notes?:string;
  baseExpenseCategoryId:string;driverIncomeCategoryId?:string;nicExpenseCategoryId?:string;
}
export interface UpdateTrafficTicketAuthorityInput { organName?:string;infractionCode?:string;description?:string;infractionTime?:string;infractionLocation?:string;notes?:string; }
export interface ChangeTicketResponsibilityInput {
  responsibility:TicketResponsibility;driverId?:string;contractId?:string;driverIncomeCategoryId?:string;
  nicExpenseCategoryId?:string;nicAmount?:number;
}
export interface TrafficTicketFinancialState {
  basePayable?:AccountPayable;receivable?:AccountReceivable;nicPayable?:AccountPayable;
  discountAvailable:boolean;
}
export interface TrafficTicketDetails { item:TrafficTicket; financial:TrafficTicketFinancialState; }

type TrafficTicketHooks={afterBasePayableCreated?:()=>void|Promise<void>;afterSecondaryObligationCreated?:()=>void|Promise<void>};
let testHooks:TrafficTicketHooks={};
export function setTrafficTicketTestHooksForTests(hooks:TrafficTicketHooks):void{testHooks=hooks;}

export class TrafficTicketValidationError extends Error{}
export class TrafficTicketNotFoundError extends Error{}
export class TrafficTicketForbiddenError extends Error{}
export class TrafficTicketConflictError extends Error{}

const WRITE_ROLES=new Set(['ADMIN','MANAGER','OPERATIONAL_MANAGER','FINANCIAL','FINANCIAL_MANAGER','OPERATIONAL']);
function rows(result:any):any[]{return Array.isArray(result?.rows)?result.rows:[];}
function round(value:number):number{return Math.round((value+Number.EPSILON)*100)/100;}
function normalizeAuto(value:string):string{return value.trim().toUpperCase().replace(/\s+/g,' ');}
function normalizePlate(value?:string):string|undefined{
  const plate=value?.trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
  return plate&&/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate)?plate:undefined;
}
function assertWrite(principal:AuthenticatedPrincipal):void{
  const role=String(principal.role||'').toUpperCase(),permissions=Array.isArray(principal.permissions)?principal.permissions:[];
  if(!WRITE_ROLES.has(role)&&!permissions.includes('*')&&!permissions.includes('TRAFFIC_TICKET_WRITE'))throw new TrafficTicketForbiddenError('Acesso negado: Multas sem permissão de escrita');
}
function validateDate(value:string,label:string):void{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new TrafficTicketValidationError(`${label} inválida`);
  const parsed=new Date(`${value}T00:00:00Z`);if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)throw new TrafficTicketValidationError(`${label} inválida`);
}
function normalizeTime(value?:string):string|undefined{
  const item=value?.trim();if(!item)return undefined;
  if(!/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(item))throw new TrafficTicketValidationError('Horário da infração inválido');
  return item;
}
function originForVersion(ticketId:string,version:number):string{return version===0?ticketId:`${ticketId}:v${version}`;}
export function isTrafficTicketDiscountAvailable(ticket:Pick<TrafficTicket,'discountDueDate'|'discountedAmount'>,date:string):boolean{
  return Boolean(ticket.discountDueDate&&ticket.discountedAmount&&ticket.discountedAmount>0&&date<=ticket.discountDueDate);
}
async function validateCategory(rawTx:any,companyId:string,categoryId:string,kind:'EXPENSE'|'INCOME'):Promise<void>{
  const result=await rawTx.execute(sql`SELECT id,type FROM financial_categories WHERE company_id=${companyId} AND id=${categoryId} AND active=true LIMIT 1`);
  const category=rows(result)[0];if(!category)throw new TrafficTicketNotFoundError('Categoria financeira não encontrada');
  const allowed=kind==='EXPENSE'?['EXPENSE','BOTH']:['INCOME','BOTH'];
  if(!allowed.includes(String(category.type)))throw new TrafficTicketConflictError('Categoria financeira incompatível');
}
async function resolveContract(rawTx:any,companyId:string,vehicleId:string,infractionDate:string,contractId?:string,driverId?:string):Promise<{contractId?:string;driverId?:string}>{
  if(contractId){
    const result=await rawTx.execute(sql`
      SELECT id,driver_id,vehicle_id,start_date,end_date,status,is_archived FROM contracts
      WHERE company_id=${companyId} AND id=${contractId} LIMIT 1
    `);
    const contract=rows(result)[0];if(!contract)throw new TrafficTicketNotFoundError('Contrato não encontrado');
    if(String(contract.vehicle_id)!==vehicleId||contract.is_archived||['DRAFT','AWAITING_SIGNATURE','CANCELLED','ARCHIVED'].includes(String(contract.status)))throw new TrafficTicketConflictError('Contrato incompatível com a multa');
    const start=String(contract.start_date).slice(0,10),end=contract.end_date?String(contract.end_date).slice(0,10):'9999-12-31';
    if(infractionDate<start||infractionDate>end)throw new TrafficTicketConflictError('Contrato não cobre a data da infração');
    if(driverId&&String(contract.driver_id)!==driverId)throw new TrafficTicketConflictError('Motorista divergente do contrato');
    return {contractId:String(contract.id),driverId:driverId||String(contract.driver_id)};
  }
  const result=await rawTx.execute(sql`
    SELECT id,driver_id FROM contracts
    WHERE company_id=${companyId} AND vehicle_id=${vehicleId} AND is_archived=false
      AND status NOT IN ('DRAFT','AWAITING_SIGNATURE','CANCELLED','ARCHIVED')
      AND start_date<=${infractionDate} AND (end_date IS NULL OR end_date>=${infractionDate})
    ORDER BY start_date DESC,id
  `);
  const matches=rows(result);if(matches.length!==1)return {};
  const match=matches[0];if(driverId&&String(match.driver_id)!==driverId)return {};
  return {contractId:String(match.id),driverId:driverId||String(match.driver_id)};
}
async function currentFinancial(tx:any,ticket:TrafficTicket):Promise<TrafficTicketFinancialState>{
  const basePayable=ticket.payableId?await tx.getPayableRepo().findById(ticket.payableId):null;
  const receivable=ticket.receivableId?await tx.getReceivableRepo().findById(ticket.receivableId):null;
  const nicPayable=ticket.nicPayableId?await tx.getPayableRepo().findById(ticket.nicPayableId):null;
  return {
    basePayable:basePayable||undefined,receivable:receivable||undefined,nicPayable:nicPayable||undefined,
    discountAvailable:isTrafficTicketDiscountAvailable(ticket,new Date().toISOString().slice(0,10)),
  };
}
function projected(ticket:TrafficTicket,financial:TrafficTicketFinancialState):TrafficTicket{
  if(ticket.status===TicketStatus.COMPANY_PAYABLE_CREATED&&financial.basePayable?.status===ObligationStatus.PAID)return {...ticket,status:TicketStatus.PAID_BY_COMPANY};
  return ticket;
}
async function cancelReceivableIfOpen(tx:any,principal:AuthenticatedPrincipal,id?:string):Promise<void>{
  if(!id)return;const item=await tx.getReceivableRepo().findById(id);if(!item||item.status===ObligationStatus.CANCELLED)return;
  await ReceivableService.cancelReceivable(principal.companyId,id,'Alteração/cancelamento da multa',principal.userId,principal.name,tx);
}
async function cancelPayableIfOpen(tx:any,principal:AuthenticatedPrincipal,id?:string):Promise<void>{
  if(!id)return;const item=await tx.getPayableRepo().findById(id);if(!item||item.status===ObligationStatus.CANCELLED)return;
  await PayableService.cancelPayable(principal.companyId,id,'Alteração/cancelamento da multa',principal.userId,principal.name,tx);
}
async function audit(tx:any,principal:AuthenticatedPrincipal,action:AuditAction,before:TrafficTicket|null,after:TrafficTicket):Promise<void>{
  await tx.getAuditLogRepo().create({
    id:randomUUID(),companyId:principal.companyId,entityName:'TrafficTicket',entityId:after.id,action,
    previousState:before?JSON.stringify(before):undefined,newState:JSON.stringify(after),
    userId:principal.userId,userName:principal.name,timestamp:new Date().toISOString(),
  });
}

async function operationalAlertDescription(rawTx:any,companyId:string,ticket:TrafficTicket):Promise<string>{
  const result=await rawTx.execute(sql`SELECT
    (SELECT plate FROM vehicles WHERE company_id=${companyId} AND id=${ticket.vehicleId} LIMIT 1) AS plate,
    (SELECT name FROM drivers WHERE company_id=${companyId} AND id=${ticket.driverId||null} LIMIT 1) AS driver_name,
    (SELECT contract_number FROM contracts WHERE company_id=${companyId} AND id=${ticket.contractId||null} LIMIT 1) AS contract_number,
    (SELECT indication_deadline FROM traffic_ticket_driver_indications WHERE company_id=${companyId} AND traffic_ticket_id=${ticket.id} LIMIT 1) AS indication_deadline`);
  const context=rows(result)[0]||{},plate=String(context.plate||ticket.vehiclePlate||ticket.vehicleId||'não cadastrado');
  const driver=String(context.driver_name||ticket.driverId||'não identificado'),contract=String(context.contract_number||ticket.contractId||'não localizado');
  const amount=Number(ticket.originalAmount).toFixed(2).replace('.',','),indicationDeadline=context.indication_deadline?String(context.indication_deadline).slice(0,10):'não informado';
  return `Auto: ${ticket.autoNumber}. Veículo: ${plate}. Motorista: ${driver}. Contrato: ${contract}. Infração: ${ticket.infractionDate}${ticket.infractionTime?` às ${ticket.infractionTime}`:''}. Local: ${ticket.infractionLocation||'não informado'}. Órgão: ${ticket.organName}. Código: ${ticket.infractionCode}. Descrição: ${ticket.description}. Pontos: ${ticket.points}. Valor: R$ ${amount}. Vencimento: ${ticket.dueDate}. Prazo de indicação: ${indicationDeadline}. Responsabilidade: ${ticket.responsibility}.`;
}

async function createOperationalAlert(tx:any,principal:AuthenticatedPrincipal,ticket:TrafficTicket):Promise<void>{
  const rawTx=tx.getRawTransaction?.();if(!rawTx)throw new Error('Operational task persistence unavailable');
  const now=new Date().toISOString(),candidate=new Date(`${ticket.dueDate}T23:59:59.000Z`).toISOString();
  const dueAt=candidate>=now?candidate:new Date(Date.now()+24*60*60*1000).toISOString();
  const unidentified=ticket.responsibility===TicketResponsibility.UNIDENTIFIED;
  const id=randomUUID(),correlationId=randomUUID(),idempotencyKey=`traffic-ticket-alert:${ticket.id}`;
  const title=unidentified?`Identificar condutor da multa ${ticket.autoNumber}`:`Tratar multa ${ticket.autoNumber}`;
  const description=await operationalAlertDescription(rawTx,principal.companyId,ticket);
  const task={id,companyId:principal.companyId,title,description,category:'FINE',priority:unidentified?'P1':'P2',severity:unidentified?'HIGH':'MEDIUM',status:'OPEN',sourceType:'TRAFFIC_TICKET',sourceId:ticket.id,entityType:'TRAFFIC_TICKET',entityId:ticket.id,assignedTeam:'OPERATIONS',createdByUserId:principal.userId,createdByName:principal.name,dueAt,correlationId,idempotencyKey,createdAt:now,updatedAt:now};
  await rawTx.execute(sql`INSERT INTO operational_tasks(
    id,company_id,title,description,category,priority,severity,status,source_type,source_id,entity_type,entity_id,assigned_team,created_by_user_id,created_by_name,due_at,correlation_id,idempotency_key,created_at,updated_at)
    VALUES(${id},${principal.companyId},${title},${description},'FINE',${task.priority},${task.severity},'OPEN','TRAFFIC_TICKET',${ticket.id},'TRAFFIC_TICKET',${ticket.id},'OPERATIONS',${principal.userId},${principal.name},${dueAt},${correlationId},${idempotencyKey},${now},${now})`);
  await tx.getAuditLogRepo().create({
    id:randomUUID(),companyId:principal.companyId,entityName:'OperationalTask',entityId:id,action:AuditAction.CREATE,
    newState:JSON.stringify(task),userId:principal.userId,userName:principal.name,timestamp:now,
  });
}

export async function syncOperationalAlert(tx:any,principal:AuthenticatedPrincipal,ticket:TrafficTicket,cancelled=false):Promise<void>{
  const rawTx=tx.getRawTransaction?.();if(!rawTx)throw new Error('Operational task persistence unavailable');
  const result=await rawTx.execute(sql`SELECT * FROM operational_tasks WHERE company_id=${principal.companyId} AND source_type='TRAFFIC_TICKET' AND source_id=${ticket.id} FOR UPDATE`);
  const before=rows(result)[0];if(!before||['COMPLETED','CLOSED','CANCELLED'].includes(String(before.status)))return;
  const unidentified=ticket.responsibility===TicketResponsibility.UNIDENTIFIED;
  const title=unidentified?`Identificar condutor da multa ${ticket.autoNumber}`:`Tratar multa ${ticket.autoNumber}`;
  const description=await operationalAlertDescription(rawTx,principal.companyId,ticket);
  const priority=unidentified?'P1':'P2',severity=unidentified?'HIGH':'MEDIUM',status=cancelled?'CANCELLED':String(before.status),now=new Date().toISOString();
  const updated=await rawTx.execute(sql`UPDATE operational_tasks SET title=${title},description=${description},priority=${priority},severity=${severity},status=${status},version=version+1,updated_at=${now} WHERE company_id=${principal.companyId} AND id=${String(before.id)} RETURNING *`);
  await tx.getAuditLogRepo().create({
    id:randomUUID(),companyId:principal.companyId,entityName:'OperationalTask',entityId:String(before.id),action:cancelled?AuditAction.CANCEL:AuditAction.UPDATE,
    previousState:JSON.stringify(before),newState:JSON.stringify(rows(updated)[0]),userId:principal.userId,userName:principal.name,timestamp:now,
  });
}

export class TrafficTicketAuthorityService {
  static async list(companyId:string,filters:{vehicleId?:string;driverId?:string;status?:TicketStatus;responsibility?:TicketResponsibility}={}):Promise<TrafficTicket[]>{
    return await UnitOfWork.run(companyId,async tx=>{
      const items=await tx.getTrafficTicketRepo().findAllByCompany(companyId,filters);
      const projectedItems:TrafficTicket[]=[];
      for(const item of items)projectedItems.push(projected(item,await currentFinancial(tx,item)));
      return projectedItems;
    });
  }
  static async getDetails(companyId:string,id:string):Promise<TrafficTicketDetails|null>{
    return await UnitOfWork.run(companyId,async tx=>{const item=await tx.getTrafficTicketRepo().findByIdForCompany(companyId,id);if(!item)return null;const financial=await currentFinancial(tx,item);return {item:projected(item,financial),financial};});
  }
  static async listFinancialCategories(companyId:string):Promise<TicketFinancialCategory[]>{
    return await UnitOfWork.run(companyId,async tx=>{const rawTx=tx.getRawTransaction?.();if(!rawTx)throw new Error('Traffic ticket persistence unavailable');const result=await rawTx.execute(sql`SELECT id,name,type FROM financial_categories WHERE company_id=${companyId} AND active=true AND type IN ('EXPENSE','INCOME','BOTH') ORDER BY name,id`);return rows(result).map(row=>({id:String(row.id),name:String(row.name),type:String(row.type)}));});
  }
  static async create(principal:AuthenticatedPrincipal,input:CreateTrafficTicketAuthorityInput):Promise<TrafficTicketDetails>{
    assertWrite(principal);
    const autoNumber=normalizeAuto(input.autoNumber),organName=input.organName.trim(),infractionCode=input.infractionCode.trim(),description=input.description.trim(),infractionTime=normalizeTime(input.infractionTime),infractionLocation=input.infractionLocation?.trim()||undefined;
    if(!autoNumber||!organName||!infractionCode||!description||!input.baseExpenseCategoryId)throw new TrafficTicketValidationError('Campos obrigatórios ausentes');
    validateDate(input.infractionDate,'Data da infração');validateDate(input.dueDate,'Vencimento');if(input.dueDate<input.infractionDate)throw new TrafficTicketValidationError('Vencimento anterior à infração');
    if(input.discountDueDate){validateDate(input.discountDueDate,'Data de desconto');if(input.discountDueDate>input.dueDate)throw new TrafficTicketValidationError('Data de desconto posterior ao vencimento');}
    const original=round(Number(input.originalAmount));if(!Number.isFinite(original)||original<=0)throw new TrafficTicketValidationError('Valor original inválido');
    const discounted=input.discountedAmount==null?undefined:round(Number(input.discountedAmount));if(discounted!==undefined&&(!input.discountDueDate||discounted<=0||discounted>=original))throw new TrafficTicketValidationError('Desconto inválido');
    const nic=input.nicAmount==null?undefined:round(Number(input.nicAmount));if(nic!==undefined&&nic<=0)throw new TrafficTicketValidationError('NIC inválida');
    if(!Number.isInteger(input.points)||input.points<0||input.points>99)throw new TrafficTicketValidationError('Pontuação inválida');
    if(!Object.values(TicketResponsibility).includes(input.responsibility))throw new TrafficTicketValidationError('Responsabilidade inválida');
    if(input.responsibility!==TicketResponsibility.DRIVER&&input.driverId)throw new TrafficTicketValidationError('Responsabilidade da empresa ou não identificada não aceita motorista');
    if(input.responsibility===TicketResponsibility.DRIVER&&!input.driverIncomeCategoryId)throw new TrafficTicketValidationError('Categoria de receita obrigatória');
    return await UnitOfWork.run(principal.companyId,async tx=>{
      const rawTx=tx.getRawTransaction?.();if(!rawTx)throw new Error('Traffic ticket persistence unavailable');
      const repo=tx.getTrafficTicketRepo();
      let vehicleId=input.vehicleId?.trim()||undefined;
      let vehiclePlate=normalizePlate(input.vehiclePlate);
      if(vehicleId){
        const vehicle=await tx.getVehicleRepo().findByIdForCompanyWithLock(principal.companyId,vehicleId);
        if(!vehicle||vehicle.isArchived)throw new TrafficTicketNotFoundError('Veículo não encontrado');
        const registeredPlate=normalizePlate(vehicle.plate);
        if(!registeredPlate)throw new TrafficTicketConflictError('Placa do veículo cadastrado inválida');
        if(vehiclePlate&&vehiclePlate!==registeredPlate)throw new TrafficTicketConflictError('Placa divergente do veículo cadastrado');
        vehiclePlate=registeredPlate;
      }
      if(!vehiclePlate)throw new TrafficTicketValidationError('Placa obrigatória');
      if(await repo.findByAutoNumber(principal.companyId,autoNumber))throw new TrafficTicketConflictError('Auto de infração já cadastrado');
      if(input.driverId){const driver=await tx.getDriverRepo().findByIdForCompany(principal.companyId,input.driverId);if(!driver||driver.isArchived)throw new TrafficTicketNotFoundError('Motorista não encontrado');}
      let driverId: string|undefined;
      let contractId: string|undefined;
      if(input.responsibility===TicketResponsibility.DRIVER){
        const resolved=vehicleId?await resolveContract(rawTx,principal.companyId,vehicleId,input.infractionDate,input.contractId,input.driverId):{};
        driverId=input.driverId||resolved.driverId;
        contractId=vehicleId?(input.contractId||resolved.contractId):undefined;
        if(!driverId)throw new TrafficTicketConflictError('Motorista deve ser identificado sem ambiguidade');
      }
      await validateCategory(rawTx,principal.companyId,input.baseExpenseCategoryId,'EXPENSE');
      if(input.responsibility===TicketResponsibility.DRIVER)await validateCategory(rawTx,principal.companyId,input.driverIncomeCategoryId!,'INCOME');
      const nicCategory=input.nicExpenseCategoryId||input.baseExpenseCategoryId;
      if(input.responsibility===TicketResponsibility.UNIDENTIFIED)await validateCategory(rawTx,principal.companyId,nicCategory,'EXPENSE');
      const now=new Date().toISOString(),id=randomUUID();
      let ticket:TrafficTicket=await repo.create({
        id,companyId:principal.companyId,vehicleId:vehicleId||'',vehiclePlate,driverId:input.responsibility===TicketResponsibility.DRIVER?driverId:undefined,
        contractId,autoNumber,organName,infractionCode,description,infractionDate:input.infractionDate,infractionTime,infractionLocation,dueDate:input.dueDate,
        discountDueDate:input.discountDueDate,originalAmount:original,discountedAmount:discounted,nicAmount:nic,points:input.points,
        responsibility:input.responsibility,status:input.responsibility===TicketResponsibility.UNIDENTIFIED?TicketStatus.PENDING_IDENTIFICATION:TicketStatus.IDENTIFIED,
        notes:input.notes?.trim()||undefined,createdBy:principal.userId,responsibilityVersion:0,createdAt:now,updatedAt:now,
      });
      const base=(await PayableService.create({
        companyId:principal.companyId,originType:OriginType.TRAFFIC_TICKET_COMPANY,originId:id,vehicleId:ticket.vehicleId||undefined,contractId:ticket.contractId,
        categoryId:input.baseExpenseCategoryId,description:`Multa ${ticket.autoNumber} — ${ticket.description}`,totalAmount:ticket.originalAmount,
        dueDate:ticket.dueDate,competenceDate:ticket.infractionDate,userId:principal.userId,userName:principal.name,
      },tx))[0];ticket.payableId=base.id;await testHooks.afterBasePayableCreated?.();
      if(ticket.responsibility===TicketResponsibility.DRIVER){
        const rec=(await ReceivableService.create({
          companyId:principal.companyId,originType:OriginType.TRAFFIC_TICKET_DRIVER,originId:id,vehicleId:ticket.vehicleId||undefined,driverId:ticket.driverId,
          contractId:ticket.contractId,categoryId:input.driverIncomeCategoryId!,description:`Reembolso multa ${ticket.autoNumber}`,
          totalAmount:ticket.originalAmount,dueDate:ticket.dueDate,competenceDate:ticket.infractionDate,userId:principal.userId,userName:principal.name,
        },tx))[0];ticket.receivableId=rec.id;ticket.status=TicketStatus.CHARGED_DRIVER;await testHooks.afterSecondaryObligationCreated?.();
      }else if(ticket.responsibility===TicketResponsibility.COMPANY){
        ticket.status=TicketStatus.COMPANY_PAYABLE_CREATED;
      }else{
        const nicAmount=ticket.nicAmount??ticket.originalAmount;
        const nicPay=(await PayableService.create({
          companyId:principal.companyId,originType:OriginType.TRAFFIC_TICKET_NIC,originId:id,vehicleId:ticket.vehicleId||undefined,contractId:ticket.contractId,
          categoryId:nicCategory,description:`NIC multa ${ticket.autoNumber}`,totalAmount:nicAmount,dueDate:ticket.dueDate,
          competenceDate:ticket.infractionDate,userId:principal.userId,userName:principal.name,
        },tx))[0];ticket.nicAmount=nicAmount;ticket.nicPayableId=nicPay.id;await testHooks.afterSecondaryObligationCreated?.();
      }
      ticket.updatedAt=new Date().toISOString();ticket=await repo.save(ticket);await audit(tx,principal,AuditAction.CREATE,null,ticket);
      await createOperationalAlert(tx,principal,ticket);
      const financial=await currentFinancial(tx,ticket);return {item:projected(ticket,financial),financial};
    },{financialPeriodLock:'SHARED'});
  }

  static async patch(principal:AuthenticatedPrincipal,id:string,input:UpdateTrafficTicketAuthorityInput):Promise<TrafficTicketDetails>{
    assertWrite(principal);if(!Object.keys(input).length)throw new TrafficTicketValidationError();
    return await UnitOfWork.run(principal.companyId,async tx=>{const repo=tx.getTrafficTicketRepo();const current=await repo.findByIdForCompanyWithLock(principal.companyId,id);if(!current)throw new TrafficTicketNotFoundError();if(current.status===TicketStatus.CANCELLED)throw new TrafficTicketConflictError('Multa cancelada não pode ser editada');const next={...current};if(input.organName!==undefined){const v=input.organName.trim();if(!v)throw new TrafficTicketValidationError();next.organName=v;}if(input.infractionCode!==undefined){const v=input.infractionCode.trim();if(!v)throw new TrafficTicketValidationError();next.infractionCode=v;}if(input.description!==undefined){const v=input.description.trim();if(!v)throw new TrafficTicketValidationError();next.description=v;}if(input.infractionTime!==undefined)next.infractionTime=normalizeTime(input.infractionTime);if(input.infractionLocation!==undefined)next.infractionLocation=input.infractionLocation.trim()||undefined;if(input.notes!==undefined)next.notes=input.notes.trim()||undefined;next.updatedAt=new Date().toISOString();const saved=await repo.save(next);await audit(tx,principal,AuditAction.UPDATE,current,saved);await syncOperationalAlert(tx,principal,saved);const financial=await currentFinancial(tx,saved);return {item:projected(saved,financial),financial};});
  }

  static async changeResponsibility(principal:AuthenticatedPrincipal,id:string,input:ChangeTicketResponsibilityInput):Promise<TrafficTicketDetails>{
    assertWrite(principal);if(!Object.values(TicketResponsibility).includes(input.responsibility))throw new TrafficTicketValidationError();
    if(input.responsibility===TicketResponsibility.DRIVER&&!input.driverIncomeCategoryId)throw new TrafficTicketValidationError('Categoria de receita obrigatória');
    if(input.responsibility!==TicketResponsibility.DRIVER&&input.driverId)throw new TrafficTicketValidationError('Responsabilidade da empresa ou não identificada não aceita motorista');
    return await UnitOfWork.run(principal.companyId,async tx=>{
      const rawTx=tx.getRawTransaction?.();if(!rawTx)throw new Error('Traffic ticket persistence unavailable');const repo=tx.getTrafficTicketRepo();const current=await repo.findByIdForCompanyWithLock(principal.companyId,id);if(!current)throw new TrafficTicketNotFoundError();if(current.status===TicketStatus.CANCELLED)throw new TrafficTicketConflictError('Multa cancelada');
      if(input.driverId){const driver=await tx.getDriverRepo().findByIdForCompany(principal.companyId,input.driverId);if(!driver||driver.isArchived)throw new TrafficTicketNotFoundError('Motorista não encontrado');}
      const resolved=input.responsibility===TicketResponsibility.DRIVER&&current.vehicleId
        ?await resolveContract(rawTx,principal.companyId,current.vehicleId,current.infractionDate,input.contractId,input.driverId)
        :{};
      let driverId=input.responsibility===TicketResponsibility.DRIVER?input.driverId:undefined;
      let contractId=input.responsibility===TicketResponsibility.DRIVER&&current.vehicleId?(input.contractId||resolved.contractId):undefined;
      if(input.responsibility===TicketResponsibility.DRIVER&&!driverId&&resolved.driverId)driverId=resolved.driverId;
      if(input.responsibility===TicketResponsibility.DRIVER&&!driverId)throw new TrafficTicketConflictError('Motorista deve ser identificado sem ambiguidade');
      if(current.responsibility===input.responsibility&&current.driverId===driverId)return (await TrafficTicketAuthorityService.getDetails(principal.companyId,id))!;
      const version=(current.responsibilityVersion||0)+1,originId=originForVersion(id,version);
      let next:TrafficTicket={...current,responsibility:input.responsibility,responsibilityVersion:version,driverId:input.responsibility===TicketResponsibility.DRIVER?driverId:undefined,contractId,updatedAt:new Date().toISOString()};
      if(current.receivableId){await cancelReceivableIfOpen(tx,principal,current.receivableId);next.receivableId=undefined;}
      if(current.nicPayableId){await cancelPayableIfOpen(tx,principal,current.nicPayableId);next.nicPayableId=undefined;}
      if(input.responsibility===TicketResponsibility.DRIVER){
        await validateCategory(rawTx,principal.companyId,input.driverIncomeCategoryId!,'INCOME');
        const rec=(await ReceivableService.create({companyId:principal.companyId,originType:OriginType.TRAFFIC_TICKET_DRIVER,originId,vehicleId:next.vehicleId||undefined,driverId:next.driverId,contractId:next.contractId,categoryId:input.driverIncomeCategoryId!,description:`Reembolso multa ${next.autoNumber}`,totalAmount:next.originalAmount,dueDate:next.dueDate,competenceDate:next.infractionDate,userId:principal.userId,userName:principal.name},tx))[0];
        next.receivableId=rec.id;next.status=TicketStatus.CHARGED_DRIVER;
      }else if(input.responsibility===TicketResponsibility.COMPANY){
        next.status=TicketStatus.COMPANY_PAYABLE_CREATED;
      }else{
        const category=input.nicExpenseCategoryId;if(!category)throw new TrafficTicketValidationError('Categoria NIC obrigatória');
        await validateCategory(rawTx,principal.companyId,category,'EXPENSE');const nicAmount=input.nicAmount==null?next.originalAmount:round(Number(input.nicAmount));if(!Number.isFinite(nicAmount)||nicAmount<=0)throw new TrafficTicketValidationError('NIC inválida');
        const nicPay=(await PayableService.create({companyId:principal.companyId,originType:OriginType.TRAFFIC_TICKET_NIC,originId,vehicleId:next.vehicleId||undefined,contractId:next.contractId,categoryId:category,description:`NIC multa ${next.autoNumber}`,totalAmount:nicAmount,dueDate:next.dueDate,competenceDate:next.infractionDate,userId:principal.userId,userName:principal.name},tx))[0];
        next.nicAmount=nicAmount;next.nicPayableId=nicPay.id;next.status=TicketStatus.PENDING_IDENTIFICATION;
      }
      const saved=await repo.save(next);await audit(tx,principal,AuditAction.UPDATE,current,saved);await syncOperationalAlert(tx,principal,saved);const financial=await currentFinancial(tx,saved);return {item:projected(saved,financial),financial};
    },{financialPeriodLock:'SHARED'});
  }

  static async createNic(principal:AuthenticatedPrincipal,id:string,categoryId:string,nicAmount?:number):Promise<TrafficTicketDetails>{
    assertWrite(principal);if(!categoryId)throw new TrafficTicketValidationError('Categoria NIC obrigatória');
    return await UnitOfWork.run(principal.companyId,async tx=>{
      const rawTx=tx.getRawTransaction?.();if(!rawTx)throw new Error('Traffic ticket persistence unavailable');const repo=tx.getTrafficTicketRepo();
      const current=await repo.findByIdForCompanyWithLock(principal.companyId,id);if(!current)throw new TrafficTicketNotFoundError();
      if(current.responsibility!==TicketResponsibility.UNIDENTIFIED)throw new TrafficTicketConflictError('NIC somente para não identificado');
      const existing=current.nicPayableId?await tx.getPayableRepo().findById(current.nicPayableId):null;
      if(existing&&existing.status!==ObligationStatus.CANCELLED){const financial=await currentFinancial(tx,current);return {item:projected(current,financial),financial};}
      await validateCategory(rawTx,principal.companyId,categoryId,'EXPENSE');
      const amount=nicAmount==null?current.originalAmount:round(Number(nicAmount));if(!Number.isFinite(amount)||amount<=0)throw new TrafficTicketValidationError('NIC inválida');
      const version=(current.responsibilityVersion||0)+1,originId=originForVersion(id,version);
      const nicPay=(await PayableService.create({companyId:principal.companyId,originType:OriginType.TRAFFIC_TICKET_NIC,originId,vehicleId:current.vehicleId||undefined,contractId:current.contractId,categoryId,description:`NIC multa ${current.autoNumber}`,totalAmount:amount,dueDate:current.dueDate,competenceDate:current.infractionDate,userId:principal.userId,userName:principal.name},tx))[0];
      const saved=await repo.save({...current,nicAmount:amount,nicPayableId:nicPay.id,responsibilityVersion:version,updatedAt:new Date().toISOString()});await audit(tx,principal,AuditAction.UPDATE,current,saved);const financial=await currentFinancial(tx,saved);return {item:projected(saved,financial),financial};
    },{financialPeriodLock:'SHARED'});
  }

  static async appeal(principal:AuthenticatedPrincipal,id:string,notes:string):Promise<TrafficTicketDetails>{
    assertWrite(principal);const reason=notes.trim();if(!reason)throw new TrafficTicketValidationError();
    return await UnitOfWork.run(principal.companyId,async tx=>{const repo=tx.getTrafficTicketRepo();const current=await repo.findByIdForCompanyWithLock(principal.companyId,id);if(!current)throw new TrafficTicketNotFoundError();if(current.status===TicketStatus.CANCELLED)throw new TrafficTicketConflictError('Multa cancelada');const saved=await repo.save({...current,status:TicketStatus.APPEALED,notes:[current.notes,`RECURSO: ${reason}`].filter(Boolean).join('\n'),updatedAt:new Date().toISOString()});await audit(tx,principal,AuditAction.UPDATE,current,saved);const financial=await currentFinancial(tx,saved);return {item:saved,financial};});
  }

  static async cancel(principal:AuthenticatedPrincipal,id:string,reason:string):Promise<TrafficTicketDetails>{
    assertWrite(principal);const clean=reason.trim();if(!clean)throw new TrafficTicketValidationError('Motivo obrigatório');
    return await UnitOfWork.run(principal.companyId,async tx=>{const repo=tx.getTrafficTicketRepo();const current=await repo.findByIdForCompanyWithLock(principal.companyId,id);if(!current)throw new TrafficTicketNotFoundError();if(current.status===TicketStatus.CANCELLED){const financial=await currentFinancial(tx,current);return {item:current,financial};}await cancelReceivableIfOpen(tx,principal,current.receivableId);await cancelPayableIfOpen(tx,principal,current.nicPayableId);await cancelPayableIfOpen(tx,principal,current.payableId);const now=new Date().toISOString();const saved=await repo.save({...current,status:TicketStatus.CANCELLED,cancelReason:clean,cancelledAt:now,updatedAt:now});await audit(tx,principal,AuditAction.CANCEL,current,saved);await syncOperationalAlert(tx,principal,saved,true);const financial=await currentFinancial(tx,saved);return {item:saved,financial};},{financialPeriodLock:'SHARED'});
  }
}