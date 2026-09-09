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

export async function findActiveGlobalMaintenanceRule(raw:any,companyId:string,today:string):Promise<MaintenanceAlertRule|undefined>{
  const row=rows(await raw.execute(sql`SELECT * FROM maintenance_rule_configs
    WHERE company_id=${companyId} AND scope_type='GLOBAL' AND scope_key IS NULL AND active=true
      AND effective_from<=${today} AND (effective_to IS NULL OR effective_to>=${today})
    ORDER BY effective_from DESC, updated_at DESC LIMIT 1`))[0];
  return row?mapRow(row):undefined;
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
        WHERE company_id=${p.companyId} AND scope_type='GLOBAL' AND scope_key IS NULL FOR UPDATE`))[0];
      const before=beforeRow?mapRow(beforeRow):undefined;
      const id=before?.id||randomUUID();
      const savedRow=rows(await raw.execute(sql`INSERT INTO maintenance_rule_configs(
        id,company_id,scope_type,scope_key,warning_km,urgent_km,warning_days,urgent_days,tolerance_km,tolerance_days,
        active,effective_from,created_by,updated_by,created_at,updated_at
      ) VALUES(
        ${id},${p.companyId},'GLOBAL',NULL,${clean.warningKm},${clean.urgentKm},${clean.warningDays},${clean.urgentDays},
        ${clean.toleranceKm},${clean.toleranceDays},${clean.active===undefined?true:Boolean(clean.active)},${today},
        ${p.userId},${p.userId},${now},${now}
      ) ON CONFLICT(company_id,scope_type,(COALESCE(scope_key,''))) DO UPDATE SET
        warning_km=excluded.warning_km,urgent_km=excluded.urgent_km,warning_days=excluded.warning_days,urgent_days=excluded.urgent_days,
        tolerance_km=excluded.tolerance_km,tolerance_days=excluded.tolerance_days,active=excluded.active,effective_from=excluded.effective_from,
        effective_to=NULL,updated_by=excluded.updated_by,updated_at=excluded.updated_at
      RETURNING *`))[0];
      if(!savedRow)throw new Error('Maintenance rule save failed');
      const saved=mapRow(savedRow);
      await tx.getAuditLogRepo().create({
        id:randomUUID(),companyId:p.companyId,entityName:'MaintenanceRule',entityId:id,
        action:before?AuditAction.UPDATE:AuditAction.CREATE,
        previousState:before?JSON.stringify(before):undefined,newState:JSON.stringify(saved),
        userId:p.userId,userName:p.name,timestamp:now,
      });
      return saved;
    });
  }
}
