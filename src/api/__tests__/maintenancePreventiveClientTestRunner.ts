import { MaintenancePreventiveClient } from '../maintenancePreventiveClient';
import { runTrafficTicketClientRegression } from './trafficTicketClientTestRunner';

const basePlan={id:'p1',companyId:'c1',vehicleId:'v1',name:'Óleo',maintenanceType:'OIL',intervalKm:10000,intervalDays:180,lastExecutionKm:1000,lastExecutionDate:'2026-08-01',nextDueKm:11000,nextDueDate:'2027-01-28',priority:'MEDIUM',status:'ACTIVE',cycleSequence:0,createdBy:'u1',createdAt:'2026-08-01T00:00:00.000Z',updatedAt:'2026-08-01T00:00:00.000Z',projectedStatus:'OK',projectedStage:'NONE',dueReference:'11000:2027-01-28',remainingKm:10000,remainingDays:153};
const baseOil={id:'o1',companyId:'c1',vehicleId:'v1',km:1000,date:'2026-08-28',oilType:'5W30',oilBrand:'Marca',quantity:4,filterChanged:false,nextKm:11000,createdAt:'2026-08-28T00:00:00.000Z',updatedAt:'2026-08-28T00:00:00.000Z'};

const originalFetch=globalThis.fetch;
function mock(body:unknown){globalThis.fetch=(async()=>new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}})) as typeof fetch;}
async function mustReject(mutator:(x:any)=>void,label:string){const candidate=structuredClone(basePlan);mutator(candidate);mock({items:[candidate]});let failed=false;try{await MaintenancePreventiveClient.listPlans();}catch{failed=true;}if(!failed)throw new Error(`Expected fail-closed rejection: ${label}`);}

try{
  mock({items:[basePlan]});
  const [valid]=await MaintenancePreventiveClient.listPlans();
  if(valid.priority!=='MEDIUM'||valid.status!=='ACTIVE'||valid.projectedStatus!=='OK'||valid.projectedStage!=='NONE')throw new Error('Canonical plan was not preserved');
  await mustReject(x=>x.priority='URGENT','unknown priority');
  await mustReject(x=>x.status='DELETED','unknown plan status');
  await mustReject(x=>x.projectedStatus='LATE','unknown projected status');
  await mustReject(x=>x.projectedStage='D3','unknown due stage');

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
