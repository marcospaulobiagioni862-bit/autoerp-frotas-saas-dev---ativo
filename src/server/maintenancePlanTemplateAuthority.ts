import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { AuditAction } from '../types/enums';
import type { MaintenancePlanPriority, Vehicle } from '../types/entities';
import type { AuthenticatedPrincipal } from './auth';

export class MaintenanceTemplateValidationError extends Error{}
export class MaintenanceTemplateNotFoundError extends Error{}
export class MaintenanceTemplateConflictError extends Error{}

export interface MaintenancePlanTemplate {
  id:string;companyId:string;code:string;name:string;maintenanceType:string;intervalKm?:number;intervalDays?:number;
  priority:MaintenancePlanPriority;estimatedCost?:number;active:boolean;notes?:string;createdBy:string;createdAt:string;updatedAt:string;
}
export interface UpdateMaintenancePlanTemplateInput {
  name?:string;intervalKm?:number|null;intervalDays?:number|null;priority?:MaintenancePlanPriority;estimatedCost?:number|null;active?:boolean;notes?:string|null;
}

const DEFAULT_CATALOG=[
  ['OIL_CHANGE','Troca de óleo','OIL_CHANGE'],
  ['TIMING_BELT','Correia dentada','TIMING_BELT'],
  ['COOLING_SYSTEM','Sistema de arrefecimento','COOLING_SYSTEM'],
  ['TIRE_ROTATION','Rodízio de pneus','TIRE_ROTATION'],
  ['ALIGNMENT_BALANCING','Alinhamento e balanceamento','ALIGNMENT_BALANCING'],
  ['TIRE_REPLACEMENT','Troca de pneus','TIRE_REPLACEMENT'],
  ['FILTER_REPLACEMENT','Troca de filtros','FILTER_REPLACEMENT'],
] as const;

const rows=(r:any):any[]=>Array.isArray(r?.rows)?r.rows:[];
const opt=(v:unknown):string|undefined=>v===null||v===undefined||v===''?undefined:String(v);
const num=(v:unknown):number|undefined=>v===null||v===undefined||v===''?undefined:Number(v);
const iso=(v:unknown):string=>v instanceof Date?v.toISOString():typeof v==='string'?v:new Date(String(v)).toISOString();
const dateOnly=(v:unknown):string=>v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);
function mapTemplate(r:any):MaintenancePlanTemplate{return{id:String(r.id),companyId:String(r.company_id),code:String(r.code),name:String(r.name),maintenanceType:String(r.maintenance_type),intervalKm:num(r.interval_km),intervalDays:num(r.interval_days),priority:String(r.priority) as MaintenancePlanPriority,estimatedCost:num(r.estimated_cost),active:Boolean(r.active),notes:opt(r.notes),createdBy:String(r.created_by),createdAt:iso(r.created_at),updatedAt:iso(r.updated_at)};}
function cleanText(v:string|undefined,current:string,max=300):string{if(v===undefined)return current;const s=v.trim();if(!s||s.length>max)throw new MaintenanceTemplateValidationError('Texto inválido');return s;}
function interval(v:number|null|undefined,current:number|undefined):number|undefined{if(v===undefined)return current;if(v===null)return undefined;if(!Number.isInteger(v)||v<=0)throw new MaintenanceTemplateValidationError('Intervalo inválido');return v;}
function cost(v:number|null|undefined,current:number|undefined):number|undefined{if(v===undefined)return current;if(v===null)return undefined;if(!Number.isFinite(v)||v<0)throw new MaintenanceTemplateValidationError('Custo estimado inválido');return Math.round((v+Number.EPSILON)*100)/100;}
function priority(v:MaintenancePlanPriority|undefined,current:MaintenancePlanPriority):MaintenancePlanPriority{if(v===undefined)return current;if(!['LOW','MEDIUM','HIGH','CRITICAL'].includes(v))throw new MaintenanceTemplateValidationError('Prioridade inválida');return v;}

async function ensureCatalog(context:any,p:AuthenticatedPrincipal):Promise<void>{
  const tx=context.getRawTransaction?.();if(!tx)throw new Error('Maintenance template persistence unavailable');
  const now=new Date().toISOString();
  for(const [code,name,type] of DEFAULT_CATALOG){
    await tx.execute(sql`INSERT INTO maintenance_plan_templates(id,company_id,code,name,maintenance_type,active,created_by,created_at,updated_at)
      VALUES(${randomUUID()},${p.companyId},${code},${name},${type},false,${p.userId},${now},${now})
      ON CONFLICT(company_id,code) DO NOTHING`);
  }
}
async function listInContext(context:any,p:AuthenticatedPrincipal):Promise<MaintenancePlanTemplate[]>{
  await ensureCatalog(context,p);const tx=context.getRawTransaction?.();
  const r=await tx.execute(sql`SELECT * FROM maintenance_plan_templates WHERE company_id=${p.companyId} ORDER BY code`);
  return rows(r).map(mapTemplate);
}
async function applyToVehicleInContext(context:any,p:AuthenticatedPrincipal,vehicle:Pick<Vehicle,'id'|'currentKm'>):Promise<number>{
  await ensureCatalog(context,p);const tx=context.getRawTransaction?.();if(!tx)throw new Error('Maintenance template persistence unavailable');
  const templates=rows(await tx.execute(sql`SELECT * FROM maintenance_plan_templates WHERE company_id=${p.companyId} AND active=true ORDER BY code`)).map(mapTemplate);
  const now=new Date().toISOString(),baseDate=now.slice(0,10);let created=0;
  for(const t of templates){
    const nextKm=t.intervalKm===undefined?undefined:vehicle.currentKm+t.intervalKm;
    const nextDate=t.intervalDays===undefined?undefined:new Date(Date.parse(baseDate+'T00:00:00Z')+t.intervalDays*86400000).toISOString().slice(0,10);
    const id=randomUUID();
    const r=await tx.execute(sql`INSERT INTO maintenance_plans(id,company_id,vehicle_id,template_id,name,maintenance_type,interval_km,interval_days,last_execution_km,last_execution_date,next_due_km,next_due_date,priority,estimated_cost,status,notes,cycle_sequence,created_by,created_at,updated_at)
      VALUES(${id},${p.companyId},${vehicle.id},${t.id},${t.name},${t.maintenanceType},${t.intervalKm??null},${t.intervalDays??null},${vehicle.currentKm},${baseDate},${nextKm??null},${nextDate??null},${t.priority},${t.estimatedCost??null},'ACTIVE',${t.notes??null},0,${p.userId},${now},${now})
      ON CONFLICT(company_id,vehicle_id,template_id) WHERE template_id IS NOT NULL DO NOTHING RETURNING id`);
    if(rows(r)[0]){
      created++;
      await context.getAuditLogRepo().create({id:randomUUID(),companyId:p.companyId,entityName:'MaintenancePlan',entityId:id,action:AuditAction.CREATE,newState:JSON.stringify({event:'APPLIED_FROM_GLOBAL_TEMPLATE',templateId:t.id,vehicleId:vehicle.id,currentKm:vehicle.currentKm,nextDueKm:nextKm,nextDueDate:nextDate}),userId:p.userId,userName:p.name,timestamp:now});
    }
  }
  return created;
}

export class MaintenancePlanTemplateAuthority {
  static async list(p:AuthenticatedPrincipal):Promise<MaintenancePlanTemplate[]>{return UnitOfWork.run(p.companyId,context=>listInContext(context,p));}
  static async update(p:AuthenticatedPrincipal,id:string,input:UpdateMaintenancePlanTemplateInput):Promise<MaintenancePlanTemplate>{return UnitOfWork.run(p.companyId,async context=>{
    await ensureCatalog(context,p);const tx=context.getRawTransaction?.();if(!tx)throw new Error('Maintenance template persistence unavailable');
    const beforeRow=rows(await tx.execute(sql`SELECT * FROM maintenance_plan_templates WHERE company_id=${p.companyId} AND id=${id} FOR UPDATE`))[0];if(!beforeRow)throw new MaintenanceTemplateNotFoundError('Plano padrão não encontrado');
    const before=mapTemplate(beforeRow),intervalKm=interval(input.intervalKm,before.intervalKm),intervalDays=interval(input.intervalDays,before.intervalDays),active=input.active===undefined?before.active:Boolean(input.active);
    if(active&&intervalKm===undefined&&intervalDays===undefined)throw new MaintenanceTemplateValidationError('Plano ativo exige intervalo por KM ou tempo');
    const next={...before,name:cleanText(input.name,before.name),intervalKm,intervalDays,priority:priority(input.priority,before.priority),estimatedCost:cost(input.estimatedCost,before.estimatedCost),active,notes:input.notes===undefined?before.notes:input.notes===null?undefined:input.notes.trim()||undefined,updatedAt:new Date().toISOString()};
    const savedRow=rows(await tx.execute(sql`UPDATE maintenance_plan_templates SET name=${next.name},interval_km=${next.intervalKm??null},interval_days=${next.intervalDays??null},priority=${next.priority},estimated_cost=${next.estimatedCost??null},active=${next.active},notes=${next.notes??null},updated_at=${next.updatedAt} WHERE company_id=${p.companyId} AND id=${id} RETURNING *`))[0];
    if(!savedRow)throw new MaintenanceTemplateNotFoundError('Plano padrão não encontrado');
    if(next.active){
      const plans=rows(await tx.execute(sql`SELECT p.id,p.last_execution_km,p.last_execution_date,v.current_km FROM maintenance_plans p JOIN vehicles v ON v.company_id=p.company_id AND v.id=p.vehicle_id WHERE p.company_id=${p.companyId} AND p.template_id=${id} AND p.status<>'COMPLETED'`));
      for(const plan of plans){
        const baseKm=plan.last_execution_km===null||plan.last_execution_km===undefined?Number(plan.current_km):Number(plan.last_execution_km);
        const baseDate=plan.last_execution_date?dateOnly(plan.last_execution_date):next.updatedAt.slice(0,10);
        const nextKm=next.intervalKm===undefined?null:baseKm+next.intervalKm;
        const nextDate=next.intervalDays===undefined?null:new Date(Date.parse(baseDate+'T00:00:00Z')+next.intervalDays*86400000).toISOString().slice(0,10);
        await tx.execute(sql`UPDATE maintenance_plans SET name=${next.name},maintenance_type=${next.maintenanceType},interval_km=${next.intervalKm??null},interval_days=${next.intervalDays??null},next_due_km=${nextKm},next_due_date=${nextDate},priority=${next.priority},estimated_cost=${next.estimatedCost??null},status='ACTIVE',notes=${next.notes??null},updated_at=${next.updatedAt} WHERE company_id=${p.companyId} AND id=${String(plan.id)}`);
      }
    }else{
      await tx.execute(sql`UPDATE maintenance_plans SET status='PAUSED',updated_at=${next.updatedAt} WHERE company_id=${p.companyId} AND template_id=${id} AND status='ACTIVE'`);
    }
    const saved=mapTemplate(savedRow);await context.getAuditLogRepo().create({id:randomUUID(),companyId:p.companyId,entityName:'MaintenancePlanTemplate',entityId:id,action:AuditAction.UPDATE,previousState:JSON.stringify(before),newState:JSON.stringify(saved),userId:p.userId,userName:p.name,timestamp:next.updatedAt});return saved;
  });}
  static async applyToFleet(p:AuthenticatedPrincipal):Promise<{vehicles:number;plansCreated:number}>{return UnitOfWork.run(p.companyId,async context=>{
    await ensureCatalog(context,p);const tx=context.getRawTransaction?.();if(!tx)throw new Error('Maintenance template persistence unavailable');
    const vehicles=rows(await tx.execute(sql`SELECT id,current_km FROM vehicles WHERE company_id=${p.companyId} AND is_archived=false AND status NOT IN ('SOLD','ARCHIVED') ORDER BY id`));
    let plansCreated=0;for(const v of vehicles)plansCreated+=await applyToVehicleInContext(context,p,{id:String(v.id),currentKm:Number(v.current_km)});
    return{vehicles:vehicles.length,plansCreated};
  });}
  static async applyToVehicleContext(context:any,p:AuthenticatedPrincipal,vehicle:Pick<Vehicle,'id'|'currentKm'>):Promise<number>{return applyToVehicleInContext(context,p,vehicle);}
}
