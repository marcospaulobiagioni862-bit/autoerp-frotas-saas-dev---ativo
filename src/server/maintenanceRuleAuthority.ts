import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { AuditAction } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';

export interface MaintenanceAlertRule {
  id?:string;
  companyId:string;
  scopeType:'GLOBAL'|'CATEGORY'|'MODEL'|'MAINTENANCE_TYPE'|'VEHICLE';
  scopeKey?:string;
  warningKm:number;
  urgentKm:number;
  warningDays:number;
  urgentDays:number;
  toleranceKm:number;
  toleranceDays:number;
  active:boolean;
  effectiveFrom:string;
  effectiveTo?:string;
  configured:boolean;
  updatedAt?:string;
}

export interface MaintenanceRuleContext {
  vehicleId:string;
  maintenanceType:string;
  model?:string;
  category?:string;
}

export interface UpdateGlobalMaintenanceRuleInput {
  warningKm:number;
  urgentKm:number;
  warningDays:number;
  urgentDays:number;
  toleranceKm:number;
  toleranceDays:number;
  active?:boolean;
}

export class MaintenanceRuleValidationError extends Error {}

const DEFAULT_GLOBAL_RULE = {
  warningKm:1000,
  urgentKm:500,
  warningDays:15,
  urgentDays:7,
  toleranceKm:0,
  toleranceDays:0,
} as const;

const rows=(r:any):any[]=>Array.isArray(r?.rows)?r.rows:[];
const dateOnly=(v:unknown):string=>v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);
const iso=(v:unknown):string=>v instanceof Date?v.toISOString():new Date(String(v)).toISOString();
const key=(v:unknown):string=>String(v??'').trim().toUpperCase();
const previousDate=(date:string):string=>{const d=new Date(`${date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);};

function mapRow(row:any):MaintenanceAlertRule{
  return {
    id:String(row.id),companyId:String(row.company_id),scopeType:String(row.scope_type) as MaintenanceAlertRule['scopeType'],
    scopeKey:row.scope_key==null?undefined:String(row.scope_key),warningKm:Number(row.warning_km),urgentKm:Number(row.urgent_km),
    warningDays:Number(row.warning_days),urgentDays:Number(row.urgent_days),toleranceKm:Number(row.tolerance_km),
    toleranceDays:Number(row.tolerance_days),active:Boolean(row.active),effectiveFrom:dateOnly(row.effective_from),
    effectiveTo:row.effective_to?dateOnly(row.effective_to):undefined,configured:true,updatedAt:iso(row.updated_at),
  };
}

function validate(input:UpdateGlobalMaintenanceRuleInput):UpdateGlobalMaintenanceRuleInput{
  for(const [key,value] of Object.entries(input)){
    if(key==='active')continue;
    if(!Number.isInteger(value)||Number(value)<0)throw new MaintenanceRuleValidationError('Invalid maintenance rule');
  }
  if(input.warningKm<input.urgentKm||input.warningDays<input.urgentDays)throw new MaintenanceRuleValidationError('Warning threshold must be greater than or equal to urgent threshold');
  return input;
}

export async function listActiveMaintenanceRules(raw:any,companyId:string,today:string):Promise<MaintenanceAlertRule[]>{
  return rows(await raw.execute(sql`SELECT * FROM maintenance_rule_configs
    WHERE company_id=${companyId} AND active=true
      AND effective_from<=${today} AND (effective_to IS NULL OR effective_to>=${today})
    ORDER BY effective_from DESC, updated_at DESC`)).map(mapRow);
}

export function resolveMaintenanceRule(rules:MaintenanceAlertRule[],context:MaintenanceRuleContext):MaintenanceAlertRule|undefined{
  const candidates:[MaintenanceAlertRule['scopeType'],string][]=[
    ['VEHICLE',key(context.vehicleId)],
    ['MAINTENANCE_TYPE',key(context.maintenanceType)],
    ['MODEL',key(context.model)],
    ['CATEGORY',key(context.category)],
  ];
  for(const [scopeType,scopeKey] of candidates){
    if(!scopeKey)continue;
    const match=rules.find(rule=>rule.scopeType===scopeType&&key(rule.scopeKey)===scopeKey);
    if(match)return match;
  }
  return rules.find(rule=>rule.scopeType==='GLOBAL'&&rule.scopeKey===undefined);
}

export async function findEffectiveMaintenanceRule(raw:any,companyId:string,today:string,context:MaintenanceRuleContext):Promise<MaintenanceAlertRule|undefined>{
  return resolveMaintenanceRule(await listActiveMaintenanceRules(raw,companyId,today),context);
}

export async function findActiveGlobalMaintenanceRule(raw:any,companyId:string,today:string):Promise<MaintenanceAlertRule|undefined>{
  return (await listActiveMaintenanceRules(raw,companyId,today)).find(rule=>rule.scopeType==='GLOBAL'&&rule.scopeKey===undefined);
}

export class MaintenanceRuleAuthority {
  static async getGlobal(companyId:string):Promise<MaintenanceAlertRule>{
    return UnitOfWork.run(companyId,async tx=>{
      const raw=tx.getRawTransaction?.();if(!raw)throw new Error('Maintenance rule persistence unavailable');
      const today=new Date().toISOString().slice(0,10);
      const configured=await findActiveGlobalMaintenanceRule(raw,companyId,today);
      return configured||{companyId,scopeType:'GLOBAL',...DEFAULT_GLOBAL_RULE,active:false,effectiveFrom:today,configured:false};
    });
  }

  static async updateGlobal(p:AuthenticatedPrincipal,input:UpdateGlobalMaintenanceRuleInput):Promise<MaintenanceAlertRule>{
    const clean=validate(input);
    return UnitOfWork.run(p.companyId,async tx=>{
      const raw=tx.getRawTransaction?.();if(!raw)throw new Error('Maintenance rule persistence unavailable');
      const now=new Date().toISOString(),today=now.slice(0,10);
      const beforeRow=rows(await raw.execute(sql`SELECT * FROM maintenance_rule_configs
        WHERE company_id=${p.companyId} AND scope_type='GLOBAL' AND scope_key IS NULL AND effective_to IS NULL
        ORDER BY effective_from DESC, updated_at DESC LIMIT 1 FOR UPDATE`))[0];
      const before=beforeRow?mapRow(beforeRow):undefined;
      let savedRow:any;
      if(before&&before.effectiveFrom===today){
        savedRow=rows(await raw.execute(sql`UPDATE maintenance_rule_configs SET
          warning_km=${clean.warningKm},urgent_km=${clean.urgentKm},warning_days=${clean.warningDays},urgent_days=${clean.urgentDays},
          tolerance_km=${clean.toleranceKm},tolerance_days=${clean.toleranceDays},active=${clean.active===undefined?true:Boolean(clean.active)},
          updated_by=${p.userId},updated_at=${now}
          WHERE company_id=${p.companyId} AND id=${before.id} RETURNING *`))[0];
      }else{
        if(before){
          await raw.execute(sql`UPDATE maintenance_rule_configs SET effective_to=${previousDate(today)},updated_by=${p.userId},updated_at=${now}
            WHERE company_id=${p.companyId} AND id=${before.id}`);
        }
        savedRow=rows(await raw.execute(sql`INSERT INTO maintenance_rule_configs(
          id,company_id,scope_type,scope_key,warning_km,urgent_km,warning_days,urgent_days,tolerance_km,tolerance_days,
          active,effective_from,effective_to,created_by,updated_by,created_at,updated_at
        ) VALUES(
          ${randomUUID()},${p.companyId},'GLOBAL',NULL,${clean.warningKm},${clean.urgentKm},${clean.warningDays},${clean.urgentDays},
          ${clean.toleranceKm},${clean.toleranceDays},${clean.active===undefined?true:Boolean(clean.active)},${today},NULL,
          ${p.userId},${p.userId},${now},${now}
        ) RETURNING *`))[0];
      }
      if(!savedRow)throw new Error('Maintenance rule save failed');
      const saved=mapRow(savedRow);
      await tx.getAuditLogRepo().create({
        id:randomUUID(),companyId:p.companyId,entityName:'MaintenanceRule',entityId:String(saved.id),
        action:before?AuditAction.UPDATE:AuditAction.CREATE,
        previousState:before?JSON.stringify(before):undefined,newState:JSON.stringify(saved),
        userId:p.userId,userName:p.name,timestamp:now,
      });
      return saved;
    });
  }
}
