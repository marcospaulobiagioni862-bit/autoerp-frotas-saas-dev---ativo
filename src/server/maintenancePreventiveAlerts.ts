import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import type { MaintenancePlan } from '../types/entities';
import { projectMaintenancePlan } from '../domain/maintenance/maintenancePreventivePolicy';
import { findActiveGlobalMaintenanceRule } from './maintenanceRuleAuthority';

const rows=(r:any):any[]=>Array.isArray(r?.rows)?r.rows:[];
function severity(stage:string):'INFO'|'WARNING'|'DANGER'{if(stage==='POST_DUE'||stage==='OVERDUE_KM')return'DANGER';if(stage==='DUE_TODAY'||stage==='DUE_KM'||stage==='D7'||stage==='KM500')return'WARNING';return'INFO';}
function message(name:string,stage:string,remainingKm?:number,remainingDays?:number):string{
  if(stage==='OVERDUE_KM')return`${name} excedeu o KM preventivo em ${Math.abs(remainingKm||0)} km.`;
  if(stage==='DUE_KM')return`${name} atingiu o KM preventivo.`;
  if(stage==='KM500'||stage==='KM1000')return`${name} vence em ${Math.max(0,remainingKm||0)} km.`;
  if(stage==='POST_DUE')return`${name} está vencida há ${Math.abs(remainingDays||0)} dia(s).`;
  if(stage==='DUE_TODAY')return`${name} vence hoje.`;
  return `${name} vence em ${Math.max(0,remainingDays||0)} dia(s).`;
}

export async function materializeMaintenanceAlerts(companyId:string,today:string):Promise<number>{
  return UnitOfWork.run(companyId,async tx=>{
    const raw=tx.getRawTransaction?.();if(!raw)throw new Error('Maintenance notification persistence unavailable');
    const plans=rows(await raw.execute(sql`SELECT p.*,v.current_km FROM maintenance_plans p JOIN vehicles v ON v.company_id=p.company_id AND v.id=p.vehicle_id WHERE p.company_id=${companyId} AND p.status='ACTIVE' ORDER BY p.id`));
    const rule=await findActiveGlobalMaintenanceRule(raw,companyId,today);
    const users=rows(await raw.execute(sql`SELECT id FROM users WHERE company_id=${companyId} AND active=true AND role IN ('ADMIN','MANAGER','OPERATIONAL_MANAGER','FINANCIAL','FINANCIAL_MANAGER','OPERATIONAL','READONLY')`));
    let inserted=0;
    for(const row of plans){
      const plan:MaintenancePlan={id:String(row.id),companyId:String(row.company_id),vehicleId:String(row.vehicle_id),name:String(row.name),maintenanceType:String(row.maintenance_type),intervalKm:row.interval_km==null?undefined:Number(row.interval_km),intervalDays:row.interval_days==null?undefined:Number(row.interval_days),lastExecutionKm:row.last_execution_km==null?undefined:Number(row.last_execution_km),lastExecutionDate:row.last_execution_date?String(row.last_execution_date).slice(0,10):undefined,nextDueKm:row.next_due_km==null?undefined:Number(row.next_due_km),nextDueDate:row.next_due_date?String(row.next_due_date).slice(0,10):undefined,priority:String(row.priority) as any,estimatedCost:row.estimated_cost==null?undefined:Number(row.estimated_cost),status:'ACTIVE',notes:row.notes?String(row.notes):undefined,lastWorkOrderId:row.last_work_order_id?String(row.last_work_order_id):undefined,cycleSequence:Number(row.cycle_sequence||0),createdBy:String(row.created_by),createdAt:String(row.created_at),updatedAt:String(row.updated_at)};
      const projection=projectMaintenancePlan(plan,Number(row.current_km||0),today,rule);if(projection.projectedStage==='NONE')continue;
      for(const user of users){const dedupKey=`MAINT_PLAN_ALERT:${plan.id}:${projection.dueReference}:${projection.projectedStage}`;const r=await raw.execute(sql`INSERT INTO notifications(id,company_id,user_id,event_type,dedup_key,title,message,severity,entity_type,entity_id,alert_stage,created_at,created_by) VALUES(${randomUUID()},${companyId},${String(user.id)},'MAINTENANCE_DUE',${dedupKey},${`Preventiva: ${plan.name}`},${message(plan.name,projection.projectedStage,projection.remainingKm,projection.remainingDays)},${severity(projection.projectedStage)},'MaintenancePlan',${plan.id},${projection.projectedStage},now(),'SYSTEM') ON CONFLICT(company_id,user_id,dedup_key) DO NOTHING RETURNING id`);inserted+=rows(r).length;}
    }
    return inserted;
  },{trustedSystemActor:'RECURRING'});
}
