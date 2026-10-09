import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { alertStageForDays, daysUntilExpiration } from '../domain/documents/documentPolicy';
import { materializeMaintenanceAlerts } from './maintenancePreventiveAlerts';
import { materializeTollPassageAlerts } from './tollPassageAlerts';

const ALLOWED_STAGES = new Set(['D90','D60','D30','D15','D7','D1','DUE_TODAY','POST_DUE']);
function rows(result:any):any[]{return Array.isArray(result?.rows)?result.rows:[];}
function dateOnly(value:unknown):string{return value instanceof Date?value.toISOString().slice(0,10):String(value||'').slice(0,10);}
function severity(stage:string):'INFO'|'WARNING'|'DANGER'{if(stage==='POST_DUE')return 'DANGER';if(stage==='DUE_TODAY'||stage==='D1'||stage==='D7')return 'WARNING';return 'INFO';}
function message(company:string,policy:string,days:number):string{if(days<0)return `Seguro ${company} — apólice ${policy} está vencido e requer renovação.`;if(days===0)return `Seguro ${company} — apólice ${policy} vence hoje.`;return `Seguro ${company} — apólice ${policy} vence em ${days} dia(s).`;}

export async function materializeInsuranceAlerts(companyId:string,today:string):Promise<number>{
  const now=new Date(`${today}T12:00:00Z`);if(!Number.isFinite(now.getTime()))throw new Error('Invalid insurance alert date');
  const insuranceInserted=await UnitOfWork.run(companyId,async txContext=>{
    const rawTx=txContext.getRawTransaction?.();if(!rawTx)throw new Error('Notification persistence unavailable');
    const insuranceResult=await rawTx.execute(sql`SELECT id,insurance_company,policy_number,end_date,status FROM insurances WHERE company_id=${companyId} AND status <> 'CANCELLED' ORDER BY end_date,id`);
    const userResult=await rawTx.execute(sql`SELECT id FROM users WHERE company_id=${companyId} AND active=true AND role IN ('ADMIN','MANAGER','OPERATIONAL_MANAGER','FINANCIAL','OPERATIONAL','READONLY','FINANCIAL_MANAGER')`);
    const userIds=rows(userResult).map(row=>String(row.id));let inserted=0;
    for(const insurance of rows(insuranceResult)){
      const endDate=dateOnly(insurance.end_date);const days=daysUntilExpiration(endDate,now);const stage=alertStageForDays(days);
      if(days!==undefined&&days<0&&insurance.status==='ACTIVE')await rawTx.execute(sql`UPDATE insurances SET status='EXPIRED',updated_at=now() WHERE company_id=${companyId} AND id=${String(insurance.id)} AND status='ACTIVE'`);
      if(days===undefined||!stage||!ALLOWED_STAGES.has(stage))continue;
      for(const userId of userIds){
        const dedupKey=`INSURANCE_ALERT:${insurance.id}:${stage}`;
        const result=await rawTx.execute(sql`INSERT INTO notifications(id,company_id,user_id,event_type,dedup_key,title,message,severity,entity_type,entity_id,alert_stage,created_at,created_by) VALUES(${randomUUID()},${companyId},${userId},'INSURANCE_EXPIRATION',${dedupKey},${`Seguro: ${insurance.insurance_company}`},${message(String(insurance.insurance_company),String(insurance.policy_number),days)},${severity(stage)},'Insurance',${String(insurance.id)},${stage},now(),'SYSTEM') ON CONFLICT(company_id,user_id,dedup_key) DO NOTHING RETURNING id`);
        inserted+=rows(result).length;
      }
    }
    return inserted;
  },{trustedSystemActor:'RECURRING'});
  // Extend the existing compliance sweep; preserve one scheduler/timer for recurring alerts.
  await materializeMaintenanceAlerts(companyId,today);
  await materializeTollPassageAlerts(companyId,today);
  return insuranceInserted;
}
