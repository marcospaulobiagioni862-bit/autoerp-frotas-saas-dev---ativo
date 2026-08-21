import { alertStageForDays, daysUntilExpiration } from '../documents/documentPolicy';
import type { MaintenanceDueStage, MaintenancePlan, MaintenanceProjectedStatus } from '../../types/entities';

export interface MaintenancePlanProjection {
  projectedStatus: MaintenanceProjectedStatus;
  projectedStage: MaintenanceDueStage;
  dueReference: string;
  remainingKm?: number;
  remainingDays?: number;
}

export function addDaysIso(base:string,days:number):string{
  const d=new Date(`${base}T00:00:00Z`);if(!Number.isFinite(d.getTime())||!Number.isInteger(days)||days<0)throw new Error('Invalid maintenance date interval');
  d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);
}
export function maintenanceNextDue(baseKm:number,baseDate:string,intervalKm?:number,intervalDays?:number):{nextDueKm?:number;nextDueDate?:string}{
  return {nextDueKm:intervalKm===undefined?undefined:baseKm+intervalKm,nextDueDate:intervalDays===undefined?undefined:addDaysIso(baseDate,intervalDays)};
}
function kmStage(remaining?:number):MaintenanceDueStage{
  if(remaining===undefined)return 'NONE';if(remaining<0)return 'OVERDUE_KM';if(remaining===0)return 'DUE_KM';if(remaining<=500)return 'KM500';if(remaining<=1000)return 'KM1000';return 'NONE';
}
function rank(stage:MaintenanceDueStage):number{
  if(stage==='POST_DUE'||stage==='OVERDUE_KM')return 5;
  if(stage==='DUE_TODAY'||stage==='DUE_KM')return 4;
  if(stage==='D7'||stage==='KM500')return 3;
  if(stage==='D15'||stage==='KM1000')return 2;
  if(stage==='D30'||stage==='D60'||stage==='D90')return 1;
  return 0;
}
export function projectMaintenancePlan(plan:MaintenancePlan,currentKm:number,today:string):MaintenancePlanProjection{
  const dueReference=`${plan.nextDueKm??'-'}:${plan.nextDueDate??'-'}`;
  if(plan.status==='PAUSED')return{projectedStatus:'PAUSED',projectedStage:'NONE',dueReference};
  if(plan.status==='COMPLETED')return{projectedStatus:'COMPLETED',projectedStage:'NONE',dueReference};
  const remainingKm=plan.nextDueKm===undefined?undefined:plan.nextDueKm-currentKm;
  const remainingDays=plan.nextDueDate?daysUntilExpiration(plan.nextDueDate,new Date(`${today}T00:00:00Z`)):undefined;
  const k=kmStage(remainingKm),d=(plan.nextDueDate?alertStageForDays(remainingDays):'NONE') as MaintenanceDueStage;
  const projectedStage=rank(k)>rank(d)?k:d;
  const projectedStatus:MaintenanceProjectedStatus=(projectedStage==='POST_DUE'||projectedStage==='OVERDUE_KM')?'OVERDUE':(projectedStage==='DUE_TODAY'||projectedStage==='DUE_KM')?'DUE':projectedStage==='NONE'?'OK':'UPCOMING';
  return{projectedStatus,projectedStage,dueReference,remainingKm,remainingDays};
}
