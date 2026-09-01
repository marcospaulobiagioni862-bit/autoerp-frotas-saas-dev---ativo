import { ContractClient } from '../contractClient';

const base={id:'contract-1',companyId:'company-a',contractNumber:'CNT-1',driverId:'driver-1',vehicleId:'vehicle-1',startDate:'2026-08-28',status:'DRAFT',rentalAmount:700,billingPeriodicity:'WEEKLY',billingDueDayOfWeek:1,securityDepositAmount:0,franchiseKm:1500,excessKmRate:0.5,signatureRequired:false,isArchived:false,createdAt:'2026-08-28T00:00:00.000Z',updatedAt:'2026-08-28T00:00:00.000Z'};
const originalFetch=globalThis.fetch;
function mock(item:unknown){globalThis.fetch=(async()=>new Response(JSON.stringify({items:[item]}),{status:200,headers:{'content-type':'application/json'}})) as typeof fetch;}
async function mustReject(item:unknown,label:string){mock(item);let rejected=false;try{await ContractClient.list();}catch{rejected=true;}if(!rejected)throw new Error(`Expected fail-closed rejection: ${label}`);}

try{
  mock(base);
  const [weekly]=await ContractClient.list();
  if(weekly.billingDueDayOfWeek!==1)throw new Error('Canonical weekly billing day was not preserved');
  mock({...base,billingDueDayOfWeek:7});
  const [weeklyLastDay]=await ContractClient.list();
  if(weeklyLastDay.billingDueDayOfWeek!==7)throw new Error('Weekly billing day 7 was not preserved');
  mock({...base,billingPeriodicity:'MONTHLY',billingDueDayOfWeek:undefined,billingDueDayOfMonth:31});
  const [monthly]=await ContractClient.list();
  if(monthly.billingDueDayOfMonth!==31)throw new Error('Canonical monthly billing day was not preserved');
  await mustReject({...base,billingDueDayOfWeek:0},'weekly below range');
  await mustReject({...base,billingDueDayOfWeek:8},'weekly above range');
  await mustReject({...base,billingDueDayOfWeek:1.5},'weekly fractional');
  await mustReject({...base,billingPeriodicity:'MONTHLY',billingDueDayOfWeek:undefined,billingDueDayOfMonth:0},'monthly below range');
  await mustReject({...base,billingPeriodicity:'MONTHLY',billingDueDayOfWeek:undefined,billingDueDayOfMonth:32},'monthly above range');
  await mustReject({...base,billingPeriodicity:'MONTHLY',billingDueDayOfWeek:undefined,billingDueDayOfMonth:15.5},'monthly fractional');
  console.log('contractClient billing-day fail-closed regression: PASS');
}finally{globalThis.fetch=originalFetch;}
