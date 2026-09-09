import { MaintenancePreventiveClient } from '../maintenancePreventiveClient';
import { runTrafficTicketClientRegression } from './trafficTicketClientTestRunner';
import { projectMaintenancePlan } from '../../domain/maintenance/maintenancePreventivePolicy';

const baseTemplate={id:'t1',companyId:'c1',code:'BRAKE_PADS',name:'Pastilhas de freio',maintenanceType:'BRAKE_PADS',category:'BRAKES',actionType:'INSPECT',priority:'MEDIUM',active:false,createdBy:'u1',createdAt:'2026-09-09T00:00:00.000Z',updatedAt:'2026-09-09T00:00:00.000Z'};
const basePlan={id:'p1',companyId:'c1',vehicleId:'v1',name:'Óleo',maintenanceType:'OIL',intervalKm:10000,intervalDays:180,lastExecutionKm:1000,lastExecutionDate:'2026-08-01',nextDueKm:11000,nextDueDate:'2027-01-28',priority:'MEDIUM',status:'ACTIVE',cycleSequence:0,createdBy:'u1',createdAt:'2026-08-01T00:00:00.000Z',updatedAt:'2026-08-01T00:00:00.000Z',projectedStatus:'OK',projectedStage:'NONE',dueReference:'11000:2027-01-28',remainingKm:10000,remainingDays:153};
const baseRule={companyId:'c1',scopeType:'GLOBAL',warningKm:2000,urgentKm:800,warningDays:20,urgentDays:7,toleranceKm:300,toleranceDays:1,active:true,effectiveFrom:'2026-09-09',configured:true};
const baseOil={id:'o1',companyId:'c1',vehicleId:'v1',km:1000,date:'2026-08-28',oilType:'5W30',oilBrand:'Marca',quantity:4,filterChanged:false,nextKm:11000,createdAt:'2026-08-28T00:00:00.000Z',updatedAt:'2026-08-28T00:00:00.000Z'};

const originalFetch=globalThis.fetch;
function mock(body:unknown){globalThis.fetch=(async()=>new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}})) as typeof fetch;}
async function mustReject(mutator:(x:any)=>void,label:string){const candidate=structuredClone(basePlan);mutator(candidate);mock({items:[candidate]});let failed=false;try{await MaintenancePreventiveClient.listPlans();}catch{failed=true;}if(!failed)throw new Error(`Expected fail-closed rejection: ${label}`);}

try{
  mock({items:[baseTemplate]});
  const [template]=await MaintenancePreventiveClient.listTemplates();
  if(template.category!=='BRAKES'||template.actionType!=='INSPECT')throw new Error('Maintenance library metadata was not preserved');
  mock({items:[{...baseTemplate,category:'UNKNOWN'}]});
  let invalidCategoryAccepted=false;
  try{await MaintenancePreventiveClient.listTemplates();invalidCategoryAccepted=true;}catch{}
  if(invalidCategoryAccepted)throw new Error('Unknown maintenance category must fail closed');
  mock({items:[{...baseTemplate,actionType:'CHANGE'}]});
  let invalidActionAccepted=false;
  try{await MaintenancePreventiveClient.listTemplates();invalidActionAccepted=true;}catch{}
  if(invalidActionAccepted)throw new Error('Unknown maintenance action must fail closed');

  mock({items:[basePlan]});
  const [valid]=await MaintenancePreventiveClient.listPlans();
  if(valid.priority!=='MEDIUM'||valid.status!=='ACTIVE'||valid.projectedStatus!=='OK'||valid.projectedStage!=='NONE')throw new Error('Canonical plan was not preserved');
  await mustReject(x=>x.priority='URGENT','unknown priority');
  await mustReject(x=>x.status='DELETED','unknown plan status');
  await mustReject(x=>x.projectedStatus='LATE','unknown projected status');
  await mustReject(x=>x.projectedStage='D3','unknown due stage');

  const policyRule={warningKm:2500,urgentKm:800,warningDays:20,urgentDays:7,toleranceKm:300,toleranceDays:1};
  const warningProjection=projectMaintenancePlan(basePlan as any,9000,'2026-08-01',policyRule);
  if(warningProjection.projectedStage!=='KM1000'||warningProjection.remainingKm!==2000)throw new Error('Configured KM warning threshold was ignored');
  const urgentProjection=projectMaintenancePlan(basePlan as any,10300,'2026-08-01',policyRule);
  if(urgentProjection.projectedStage!=='KM500')throw new Error('Configured KM urgent threshold was ignored');
  const toleratedProjection=projectMaintenancePlan(basePlan as any,11150,'2026-08-01',policyRule);
  if(toleratedProjection.projectedStage!=='DUE_KM')throw new Error('Configured KM tolerance was ignored');
  const overdueProjection=projectMaintenancePlan(basePlan as any,11301,'2026-08-01',policyRule);
  if(overdueProjection.projectedStage!=='OVERDUE_KM')throw new Error('Configured KM overdue tolerance boundary was ignored');

  mock({item:baseRule});
  const rule=await MaintenancePreventiveClient.getGlobalRule();
  if(rule.warningKm!==2000||rule.urgentKm!==800||rule.warningDays!==20||rule.toleranceKm!==300||rule.configured!==true)throw new Error('Configurable maintenance rule was not preserved');
  mock({item:{...baseRule,warningKm:'2000'}});
  let invalidRuleAccepted=false;
  try{await MaintenancePreventiveClient.getGlobalRule();invalidRuleAccepted=true;}catch{}
  if(invalidRuleAccepted)throw new Error('Non-numeric maintenance rule must fail closed');

  mock({items:[baseOil]});
  const [oil]=await MaintenancePreventiveClient.listOilChanges();
  if(oil.filterChanged!==false)throw new Error('Canonical false filterChanged was not preserved');
  mock({items:[{...baseOil,filterChanged:'false'}]});
  let invalidBooleanAccepted=false;
  try{await MaintenancePreventiveClient.listOilChanges();invalidBooleanAccepted=true;}catch{}
  if(invalidBooleanAccepted)throw new Error('Non-boolean filterChanged must fail closed');

  console.log('maintenancePreventiveClient fail-closed regression: PASS');
}finally{
  globalThis.fetch=originalFetch;
}

await runTrafficTicketClientRegression();
