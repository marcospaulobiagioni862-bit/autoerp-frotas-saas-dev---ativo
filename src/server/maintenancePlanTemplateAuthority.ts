import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { AuditAction } from '../types/enums';
import type { MaintenancePlanPriority, Vehicle } from '../types/entities';
import type { AuthenticatedPrincipal } from './auth';

export class MaintenanceTemplateValidationError extends Error{}
export class MaintenanceTemplateNotFoundError extends Error{}
export class MaintenanceTemplateConflictError extends Error{}

export type MaintenanceTemplateCategory='ENGINE'|'COOLING'|'BRAKES'|'TIRES_WHEELS'|'SUSPENSION_STEERING'|'TRANSMISSION'|'ELECTRICAL'|'AIR_CONDITIONING'|'SAFETY'|'GENERAL';
export type MaintenanceTemplateAction='REPLACE'|'INSPECT'|'TEST'|'MEASURE'|'LUBRICATE'|'SERVICE';

export interface MaintenancePlanTemplate {
  id:string;companyId:string;code:string;name:string;maintenanceType:string;category:MaintenanceTemplateCategory;actionType:MaintenanceTemplateAction;intervalKm?:number;intervalDays?:number;
  priority:MaintenancePlanPriority;estimatedCost?:number;active:boolean;notes?:string;createdBy:string;createdAt:string;updatedAt:string;
}
export interface CreateMaintenancePlanTemplateInput {
  name:string;category?:MaintenanceTemplateCategory;actionType?:MaintenanceTemplateAction;intervalKm?:number;intervalDays?:number;priority?:MaintenancePlanPriority;estimatedCost?:number;active?:boolean;notes?:string;
}
export interface UpdateMaintenancePlanTemplateInput {
  name?:string;category?:MaintenanceTemplateCategory;actionType?:MaintenanceTemplateAction;intervalKm?:number|null;intervalDays?:number|null;priority?:MaintenancePlanPriority;estimatedCost?:number|null;active?:boolean;notes?:string|null;
}

const DEFAULT_CATALOG=[
  ['OIL_CHANGE','Óleo do motor','OIL_CHANGE','ENGINE','REPLACE'],
  ['OIL_FILTER','Filtro de óleo','OIL_FILTER','ENGINE','REPLACE'],
  ['ENGINE_AIR_FILTER','Filtro de ar do motor','ENGINE_AIR_FILTER','ENGINE','REPLACE'],
  ['FUEL_FILTER','Filtro de combustível','FUEL_FILTER','ENGINE','REPLACE'],
  ['SPARK_PLUGS','Velas de ignição','SPARK_PLUGS','ENGINE','REPLACE'],
  ['TIMING_BELT','Correia dentada','TIMING_BELT','ENGINE','REPLACE'],
  ['TIMING_CHAIN','Corrente de comando','TIMING_CHAIN','ENGINE','INSPECT'],
  ['TIMING_TENSIONER','Tensor do comando','TIMING_TENSIONER','ENGINE','INSPECT'],
  ['ACCESSORY_BELT','Correia de acessórios','ACCESSORY_BELT','ENGINE','INSPECT'],
  ['ACCESSORY_TENSIONER','Tensor e polias de acessórios','ACCESSORY_TENSIONER','ENGINE','INSPECT'],
  ['ENGINE_MOUNTS','Coxins de motor e câmbio','ENGINE_MOUNTS','ENGINE','INSPECT'],
  ['FUEL_INJECTION','Injeção eletrônica','FUEL_INJECTION','ENGINE','TEST'],
  ['THROTTLE_BODY','Corpo de borboleta','THROTTLE_BODY','ENGINE','INSPECT'],
  ['FUEL_LINES','Mangueiras e tubulações de combustível','FUEL_LINES','ENGINE','INSPECT'],
  ['COOLANT','Líquido de arrefecimento','COOLANT','COOLING','REPLACE'],
  ['COOLING_HOSES','Mangueiras do arrefecimento','COOLING_HOSES','COOLING','INSPECT'],
  ['RADIATOR','Radiador','RADIATOR','COOLING','INSPECT'],
  ['THERMOSTAT','Válvula termostática','THERMOSTAT','COOLING','INSPECT'],
  ['WATER_PUMP','Bomba d’água','WATER_PUMP','COOLING','INSPECT'],
  ['BRAKE_PADS','Pastilhas de freio','BRAKE_PADS','BRAKES','INSPECT'],
  ['BRAKE_DISCS','Discos de freio','BRAKE_DISCS','BRAKES','MEASURE'],
  ['BRAKE_SHOES','Lonas de freio','BRAKE_SHOES','BRAKES','INSPECT'],
  ['BRAKE_DRUMS','Tambores de freio','BRAKE_DRUMS','BRAKES','MEASURE'],
  ['BRAKE_FLUID','Fluido de freio','BRAKE_FLUID','BRAKES','REPLACE'],
  ['BRAKE_LINES','Mangueiras e tubulações de freio','BRAKE_LINES','BRAKES','INSPECT'],
  ['TIRE_CONDITION','Pneus — condição e desgaste','TIRE_CONDITION','TIRES_WHEELS','INSPECT'],
  ['TIRE_ROTATION','Rodízio de pneus','TIRE_ROTATION','TIRES_WHEELS','SERVICE'],
  ['ALIGNMENT_BALANCING','Alinhamento e balanceamento','ALIGNMENT_BALANCING','TIRES_WHEELS','SERVICE'],
  ['WHEEL_BEARINGS','Rolamentos das rodas','WHEEL_BEARINGS','TIRES_WHEELS','INSPECT'],
  ['SHOCK_ABSORBERS','Amortecedores','SHOCK_ABSORBERS','SUSPENSION_STEERING','INSPECT'],
  ['SPRINGS','Molas','SPRINGS','SUSPENSION_STEERING','INSPECT'],
  ['SUSPENSION_BUSHINGS','Buchas de suspensão','SUSPENSION_BUSHINGS','SUSPENSION_STEERING','INSPECT'],
  ['BALL_JOINTS','Pivôs','BALL_JOINTS','SUSPENSION_STEERING','INSPECT'],
  ['STABILIZER_LINKS','Bieletas','STABILIZER_LINKS','SUSPENSION_STEERING','INSPECT'],
  ['TIE_ROD_ENDS','Terminais de direção','TIE_ROD_ENDS','SUSPENSION_STEERING','INSPECT'],
  ['STEERING_SYSTEM','Sistema e caixa de direção','STEERING_SYSTEM','SUSPENSION_STEERING','INSPECT'],
  ['CV_BOOTS','Coifas homocinéticas','CV_BOOTS','SUSPENSION_STEERING','INSPECT'],
  ['CV_JOINTS','Juntas homocinéticas','CV_JOINTS','SUSPENSION_STEERING','INSPECT'],
  ['MANUAL_TRANSMISSION_FLUID','Óleo do câmbio manual','MANUAL_TRANSMISSION_FLUID','TRANSMISSION','INSPECT'],
  ['AUTOMATIC_TRANSMISSION_FLUID','Fluido do câmbio automático','AUTOMATIC_TRANSMISSION_FLUID','TRANSMISSION','INSPECT'],
  ['CVT_FLUID','Fluido do câmbio CVT','CVT_FLUID','TRANSMISSION','INSPECT'],
  ['CLUTCH','Embreagem','CLUTCH','TRANSMISSION','INSPECT'],
  ['BATTERY','Bateria','BATTERY','ELECTRICAL','TEST'],
  ['ALTERNATOR','Alternador','ALTERNATOR','ELECTRICAL','TEST'],
  ['STARTER','Motor de partida','STARTER','ELECTRICAL','INSPECT'],
  ['LIGHTING','Iluminação completa','LIGHTING','ELECTRICAL','TEST'],
  ['CABIN_FILTER','Filtro de cabine / ar-condicionado','CABIN_FILTER','AIR_CONDITIONING','REPLACE'],
  ['AIR_CONDITIONING_SYSTEM','Sistema de ar-condicionado','AIR_CONDITIONING_SYSTEM','AIR_CONDITIONING','TEST'],
  ['AIR_CONDITIONING_COMPRESSOR','Compressor do ar-condicionado','AIR_CONDITIONING_COMPRESSOR','AIR_CONDITIONING','INSPECT'],
  ['WIPER_BLADES','Palhetas do limpador','WIPER_BLADES','SAFETY','INSPECT'],
  ['WASHER_SYSTEM','Limpador e lavador','WASHER_SYSTEM','SAFETY','TEST'],
  ['HORN','Buzina','HORN','SAFETY','TEST'],
  ['SEAT_BELTS','Cintos de segurança','SEAT_BELTS','SAFETY','INSPECT'],
  ['LEAK_INSPECTION','Vazamentos de motor e câmbio','LEAK_INSPECTION','GENERAL','INSPECT'],
  ['DIAGNOSTIC_SCANNER','Scanner e diagnóstico eletrônico','DIAGNOSTIC_SCANNER','GENERAL','TEST'],
  ['EXHAUST_SYSTEM','Sistema de escapamento','EXHAUST_SYSTEM','GENERAL','INSPECT'],
  ['CATALYST_SENSORS','Catalisador e sondas','CATALYST_SENSORS','GENERAL','TEST'],
  ['HINGES_LOCKS','Fechaduras e dobradiças','HINGES_LOCKS','GENERAL','LUBRICATE'],
] as const satisfies readonly (readonly [string,string,string,MaintenanceTemplateCategory,MaintenanceTemplateAction])[];

const rows=(r:any):any[]=>Array.isArray(r?.rows)?r.rows:[];
const opt=(v:unknown):string|undefined=>v===null||v===undefined||v===''?undefined:String(v);
const num=(v:unknown):number|undefined=>v===null||v===undefined||v===''?undefined:Number(v);
const iso=(v:unknown):string=>v instanceof Date?v.toISOString():typeof v==='string'?v:new Date(String(v)).toISOString();
const dateOnly=(v:unknown):string=>v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);
function mapTemplate(r:any):MaintenancePlanTemplate{return{id:String(r.id),companyId:String(r.company_id),code:String(r.code),name:String(r.name),maintenanceType:String(r.maintenance_type),category:String(r.category) as MaintenanceTemplateCategory,actionType:String(r.action_type) as MaintenanceTemplateAction,intervalKm:num(r.interval_km),intervalDays:num(r.interval_days),priority:String(r.priority) as MaintenancePlanPriority,estimatedCost:num(r.estimated_cost),active:Boolean(r.active),notes:opt(r.notes),createdBy:String(r.created_by),createdAt:iso(r.created_at),updatedAt:iso(r.updated_at)};}
function cleanText(v:string|undefined,current:string,max=300):string{if(v===undefined)return current;const s=v.trim();if(!s||s.length>max)throw new MaintenanceTemplateValidationError('Texto inválido');return s;}
function interval(v:number|null|undefined,current:number|undefined):number|undefined{if(v===undefined)return current;if(v===null)return undefined;if(!Number.isInteger(v)||v<=0)throw new MaintenanceTemplateValidationError('Intervalo inválido');return v;}
function cost(v:number|null|undefined,current:number|undefined):number|undefined{if(v===undefined)return current;if(v===null)return undefined;if(!Number.isFinite(v)||v<0)throw new MaintenanceTemplateValidationError('Custo estimado inválido');return Math.round((v+Number.EPSILON)*100)/100;}
function priority(v:MaintenancePlanPriority|undefined,current:MaintenancePlanPriority):MaintenancePlanPriority{if(v===undefined)return current;if(!['LOW','MEDIUM','HIGH','CRITICAL'].includes(v))throw new MaintenanceTemplateValidationError('Prioridade inválida');return v;}
function category(v:MaintenanceTemplateCategory|undefined,current:MaintenanceTemplateCategory):MaintenanceTemplateCategory{if(v===undefined)return current;if(!['ENGINE','COOLING','BRAKES','TIRES_WHEELS','SUSPENSION_STEERING','TRANSMISSION','ELECTRICAL','AIR_CONDITIONING','SAFETY','GENERAL'].includes(v))throw new MaintenanceTemplateValidationError('Categoria inválida');return v;}
function actionType(v:MaintenanceTemplateAction|undefined,current:MaintenanceTemplateAction):MaintenanceTemplateAction{if(v===undefined)return current;if(!['REPLACE','INSPECT','TEST','MEASURE','LUBRICATE','SERVICE'].includes(v))throw new MaintenanceTemplateValidationError('Ação inválida');return v;}
function codeFromName(name:string):string{const normalized=name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,80);if(!normalized)throw new MaintenanceTemplateValidationError('Nome inválido');return normalized;}

async function ensureCatalog(context:any,p:AuthenticatedPrincipal):Promise<void>{
  const tx=context.getRawTransaction?.();if(!tx)throw new Error('Maintenance template persistence unavailable');
  const now=new Date().toISOString();
  for(const [code,name,type,categoryValue,actionValue] of DEFAULT_CATALOG){
    await tx.execute(sql`INSERT INTO maintenance_plan_templates(id,company_id,code,name,maintenance_type,category,action_type,active,created_by,created_at,updated_at)
      VALUES(${randomUUID()},${p.companyId},${code},${name},${type},${categoryValue},${actionValue},false,${p.userId},${now},${now})
      ON CONFLICT(company_id,code) DO NOTHING`);
  }
}
async function listInContext(context:any,p:AuthenticatedPrincipal):Promise<MaintenancePlanTemplate[]>{
  await ensureCatalog(context,p);const tx=context.getRawTransaction?.();
  const r=await tx.execute(sql`SELECT * FROM maintenance_plan_templates WHERE company_id=${p.companyId} ORDER BY code`);
  return rows(r).map(mapTemplate);
}
async function applyToVehicleInContext(context:any,p:AuthenticatedPrincipal,vehicle:Pick<Vehicle,'id'|'currentKm'>,templateId?:string):Promise<number>{
  await ensureCatalog(context,p);const tx=context.getRawTransaction?.();if(!tx)throw new Error('Maintenance template persistence unavailable');
  const templateRows=templateId
    ? rows(await tx.execute(sql`SELECT * FROM maintenance_plan_templates WHERE company_id=${p.companyId} AND id=${templateId} AND active=true LIMIT 1`))
    : rows(await tx.execute(sql`SELECT * FROM maintenance_plan_templates WHERE company_id=${p.companyId} AND active=true ORDER BY code`));
  if(templateId&&templateRows.length===0)throw new MaintenanceTemplateNotFoundError('Plano padrão não encontrado ou inativo');
  const templates=templateRows.map(mapTemplate);
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
      await context.getAuditLogRepo().create({id:randomUUID(),companyId:p.companyId,entityName:'MaintenancePlan',entityId:id,action:AuditAction.CREATE,newState:JSON.stringify({event:templateId?'APPLIED_FROM_SELECTED_TEMPLATE':'APPLIED_FROM_GLOBAL_TEMPLATE',templateId:t.id,vehicleId:vehicle.id,currentKm:vehicle.currentKm,nextDueKm:nextKm,nextDueDate:nextDate}),userId:p.userId,userName:p.name,timestamp:now});
    }
  }
  return created;
}

export class MaintenancePlanTemplateAuthority {
  static async create(p:AuthenticatedPrincipal,input:CreateMaintenancePlanTemplateInput):Promise<MaintenancePlanTemplate>{return UnitOfWork.run(p.companyId,async context=>{
    await ensureCatalog(context,p);const tx=context.getRawTransaction?.();if(!tx)throw new Error('Maintenance template persistence unavailable');
    const name=cleanText(input.name,'',200),code=codeFromName(name),intervalKm=interval(input.intervalKm,undefined),intervalDays=interval(input.intervalDays,undefined),active=Boolean(input.active);
    if(active&&intervalKm===undefined&&intervalDays===undefined)throw new MaintenanceTemplateValidationError('Plano ativo exige intervalo por KM ou tempo');
    const now=new Date().toISOString(),id=randomUUID(),priorityValue=priority(input.priority,'MEDIUM'),categoryValue=category(input.category,'GENERAL'),actionValue=actionType(input.actionType,'INSPECT'),estimatedCost=cost(input.estimatedCost,undefined),notes=input.notes?.trim()||undefined;
    const exists=rows(await tx.execute(sql`SELECT id FROM maintenance_plan_templates WHERE company_id=${p.companyId} AND code=${code} LIMIT 1`))[0];
    if(exists)throw new MaintenanceTemplateConflictError('Já existe item com este nome');
    const row=rows(await tx.execute(sql`INSERT INTO maintenance_plan_templates(id,company_id,code,name,maintenance_type,category,action_type,interval_km,interval_days,priority,estimated_cost,active,notes,created_by,created_at,updated_at)
      VALUES(${id},${p.companyId},${code},${name},${code},${categoryValue},${actionValue},${intervalKm??null},${intervalDays??null},${priorityValue},${estimatedCost??null},${active},${notes??null},${p.userId},${now},${now}) RETURNING *`))[0];
    const saved=mapTemplate(row);await context.getAuditLogRepo().create({id:randomUUID(),companyId:p.companyId,entityName:'MaintenancePlanTemplate',entityId:id,action:AuditAction.CREATE,newState:JSON.stringify(saved),userId:p.userId,userName:p.name,timestamp:now});
    return saved;
  });}
  static async list(p:AuthenticatedPrincipal):Promise<MaintenancePlanTemplate[]>{return UnitOfWork.run(p.companyId,context=>listInContext(context,p));}
  static async update(p:AuthenticatedPrincipal,id:string,input:UpdateMaintenancePlanTemplateInput):Promise<MaintenancePlanTemplate>{return UnitOfWork.run(p.companyId,async context=>{
    await ensureCatalog(context,p);const tx=context.getRawTransaction?.();if(!tx)throw new Error('Maintenance template persistence unavailable');
    const beforeRow=rows(await tx.execute(sql`SELECT * FROM maintenance_plan_templates WHERE company_id=${p.companyId} AND id=${id} FOR UPDATE`))[0];if(!beforeRow)throw new MaintenanceTemplateNotFoundError('Plano padrão não encontrado');
    const before=mapTemplate(beforeRow),intervalKm=interval(input.intervalKm,before.intervalKm),intervalDays=interval(input.intervalDays,before.intervalDays),active=input.active===undefined?before.active:Boolean(input.active);
    if(active&&intervalKm===undefined&&intervalDays===undefined)throw new MaintenanceTemplateValidationError('Plano ativo exige intervalo por KM ou tempo');
    const next={...before,name:cleanText(input.name,before.name),category:category(input.category,before.category),actionType:actionType(input.actionType,before.actionType),intervalKm,intervalDays,priority:priority(input.priority,before.priority),estimatedCost:cost(input.estimatedCost,before.estimatedCost),active,notes:input.notes===undefined?before.notes:input.notes===null?undefined:input.notes.trim()||undefined,updatedAt:new Date().toISOString()};
    const savedRow=rows(await tx.execute(sql`UPDATE maintenance_plan_templates SET name=${next.name},category=${next.category},action_type=${next.actionType},interval_km=${next.intervalKm??null},interval_days=${next.intervalDays??null},priority=${next.priority},estimated_cost=${next.estimatedCost??null},active=${next.active},notes=${next.notes??null},updated_at=${next.updatedAt} WHERE company_id=${p.companyId} AND id=${id} RETURNING *`))[0];
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
  static async applyToVehicleContext(context:any,p:AuthenticatedPrincipal,vehicle:Pick<Vehicle,'id'|'currentKm'>,templateId?:string):Promise<number>{return applyToVehicleInContext(context,p,vehicle,templateId);}
}
