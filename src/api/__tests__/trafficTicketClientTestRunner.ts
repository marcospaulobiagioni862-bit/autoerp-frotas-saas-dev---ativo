import { TrafficTicketClient } from '../trafficTicketClient';

const baseTicket={
  id:'t1',companyId:'c1',vehicleId:'v1',autoNumber:'A1',organName:'DETRAN',infractionCode:'1234',description:'Teste',
  infractionDate:'2026-08-01',dueDate:'2026-09-01',originalAmount:100,points:4,responsibility:'COMPANY',status:'COMPANY_PAYABLE_CREATED',
  createdAt:'2026-08-01T00:00:00.000Z',updatedAt:'2026-08-01T00:00:00.000Z'
};

const originalFetch=globalThis.fetch;
function mock(discountAvailable:unknown){
  globalThis.fetch=(async()=>new Response(JSON.stringify({item:baseTicket,financial:{discountAvailable}}),{status:200,headers:{'content-type':'application/json'}})) as typeof fetch;
}

export async function runTrafficTicketClientRegression():Promise<void>{
  try{
    mock(false);
    const valid=await TrafficTicketClient.get('t1');
    if(valid.financial.discountAvailable!==false)throw new Error('Canonical false discountAvailable was not preserved');

    mock('false');
    let invalidBooleanAccepted=false;
    try{await TrafficTicketClient.get('t1');invalidBooleanAccepted=true;}catch{}
    if(invalidBooleanAccepted)throw new Error('Non-boolean discountAvailable must fail closed');

    console.log('trafficTicketClient fail-closed regression: PASS');
  }finally{
    globalThis.fetch=originalFetch;
  }
}
