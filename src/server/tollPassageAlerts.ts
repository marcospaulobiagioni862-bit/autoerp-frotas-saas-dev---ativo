import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { alertStageForDays, daysUntilExpiration } from '../domain/documents/documentPolicy';

const ALLOWED_STAGES = new Set(['D90','D60','D30','D15','D7','D1','DUE_TODAY','POST_DUE']);
const ALERTABLE_STATUSES = new Set(['PENDING','OVERDUE']);

function rows(result:any):any[]{return Array.isArray(result?.rows)?result.rows:[];}
function dateOnly(value:unknown):string{return value instanceof Date?value.toISOString().slice(0,10):String(value||'').slice(0,10);}
function severity(stage:string):'INFO'|'WARNING'|'DANGER'{if(stage==='POST_DUE')return'DANGER';if(stage==='DUE_TODAY'||stage==='D1'||stage==='D7')return'WARNING';return'INFO';}
function message(plate:string,concessionaire:string,days:number):string{
  if(days<0)return `Pedágio ${plate} — ${concessionaire} está vencido há ${Math.abs(days)} dia(s).`;
  if(days===0)return `Pedágio ${plate} — ${concessionaire} vence hoje.`;
  return `Pedágio ${plate} — ${concessionaire} vence em ${days} dia(s).`;
}

export async function materializeTollPassageAlerts(companyId:string,today:string):Promise<number>{
  const now=new Date(`${today}T00:00:00Z`);if(!Number.isFinite(now.getTime()))throw new Error('Invalid toll alert date');
  return UnitOfWork.run(companyId,async tx=>{
    const raw=tx.getRawTransaction?.();if(!raw)throw new Error('Toll notification persistence unavailable');
    const passages=rows(await raw.execute(sql`
      SELECT p.id,p.concessionaire,p.due_date,p.status,v.plate
      FROM toll_passages p
      JOIN vehicles v ON v.company_id=p.company_id AND v.id=p.vehicle_id
      WHERE p.company_id=${companyId} AND p.due_date IS NOT NULL AND p.status IN ('PENDING','OVERDUE')
      ORDER BY p.due_date,p.id
    `));
    const users=rows(await raw.execute(sql`SELECT id FROM users WHERE company_id=${companyId} AND active=true AND role IN ('ADMIN','MANAGER','OPERATIONAL_MANAGER','FINANCIAL','FINANCIAL_MANAGER','OPERATIONAL','READONLY')`));
    let inserted=0;
    for(const passage of passages){
      if(!ALERTABLE_STATUSES.has(String(passage.status)))continue;
      const dueDate=dateOnly(passage.due_date);const days=daysUntilExpiration(dueDate,now);const stage=alertStageForDays(days);
      if(days===undefined||!stage||!ALLOWED_STAGES.has(stage))continue;
      for(const user of users){
        const dedupKey=`TOLL_PASSAGE_ALERT:${passage.id}:${stage}`;
        const result=await raw.execute(sql`
          INSERT INTO notifications(id,company_id,user_id,event_type,dedup_key,title,message,severity,entity_type,entity_id,alert_stage,created_at,created_by)
          VALUES(${randomUUID()},${companyId},${String(user.id)},'TOLL_PASSAGE_DUE',${dedupKey},${`Pedágio / Free Flow: ${String(passage.plate)}`},${message(String(passage.plate),String(passage.concessionaire),days)},${severity(stage)},'TollPassage',${String(passage.id)},${stage},now(),'SYSTEM')
          ON CONFLICT(company_id,user_id,dedup_key) DO NOTHING RETURNING id
        `);
        inserted+=rows(result).length;
      }
    }
    return inserted;
  },{trustedSystemActor:'RECURRING'});
}
