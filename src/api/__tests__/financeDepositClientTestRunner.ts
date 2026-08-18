import { FinanceDepositApiError, FinanceDepositClient } from '../financeDepositClient';

const deposit = { id:'dep-1', companyId:'company-a', contractId:'contract-a', driverId:'driver-a', vehicleId:'veh-a', originalAmount:1000, receivedAmount:400, usedAmount:0, returnedAmount:0, status:'PENDING', createdAt:'2026-08-18T00:00:00Z', updatedAt:'2026-08-18T00:00:00Z' };
const movement = { id:'mov-1', securityDepositId:'dep-1', companyId:'company-a', type:'RECEIPT', amount:400, date:'2026-08-18T00:00:00Z', description:'receipt', createdById:'user-a', createdAt:'2026-08-18T00:00:00Z' };

export class FinanceDepositClientTestRunner {
  static async runAllTests() {
    const originalFetch = globalThis.fetch;
    let passed = 0;
    const tests: Array<() => Promise<void>> = [];

    tests.push(async () => {
      let url=''; let credentials: RequestCredentials|undefined;
      globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{url=String(input);credentials=init?.credentials;return new Response(JSON.stringify({deposit}),{status:200})}) as typeof fetch;
      const result=await FinanceDepositClient.getByContract('contract-a');
      if(!url.includes('/api/finance/security-deposits/by-contract/contract-a')||credentials!=='include'||result?.id!=='dep-1')throw Error('deposit read transport');
    });

    tests.push(async () => {
      globalThis.fetch=(async()=>new Response(JSON.stringify({deposit:null}),{status:200})) as typeof fetch;
      if(await FinanceDepositClient.getByContract('contract-a')!==null)throw Error('null deposit must be preserved');
    });

    tests.push(async () => {
      let url='';let credentials:RequestCredentials|undefined;let body:any;
      globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{url=String(input);credentials=init?.credentials;body=JSON.parse(String(init?.body));return new Response(JSON.stringify({deposit,movement}),{status:201})}) as typeof fetch;
      const result=await FinanceDepositClient.receive({contractId:'contract-a',amount:400,financialAccountId:'acc-a',paymentMethodId:'pm-pix'});
      if(url!=='/api/finance/security-deposits/receive'||credentials!=='include'||result.deposit.id!=='dep-1'||result.movement.id!=='mov-1')throw Error('deposit receive transport');
      for(const key of ['companyId','userId','userName','driverId','vehicleId'])if(key in body)throw Error(`browser authority leaked: ${key}`);
    });

    tests.push(async () => {
      globalThis.fetch=(async()=>new Response(JSON.stringify({error:'Unauthorized'}),{status:401})) as typeof fetch;
      let thrown:unknown;try{await FinanceDepositClient.receive({contractId:'c',amount:1,financialAccountId:'a',paymentMethodId:'p'})}catch(e){thrown=e}
      if(!(thrown instanceof FinanceDepositApiError)||thrown.status!==401)throw Error('receive must fail closed on 401');
    });

    tests.push(async () => {
      globalThis.fetch=(async()=>new Response(JSON.stringify({deposit:{id:'bad'},movement:{}}),{status:201})) as typeof fetch;
      let failed=false;try{await FinanceDepositClient.receive({contractId:'c',amount:1,financialAccountId:'a',paymentMethodId:'p'})}catch{failed=true}
      if(!failed)throw Error('malformed receive must fail closed');
    });

    tests.push(async () => {
      globalThis.fetch=(async()=>new Response('not-json',{status:500})) as typeof fetch;
      let thrown:unknown;try{await FinanceDepositClient.getByContract('c')}catch(e){thrown=e}
      if(!(thrown instanceof FinanceDepositApiError)||thrown.status!==500)throw Error('read must fail closed');
    });

    try{for(const test of tests){await test();passed+=1}}finally{globalThis.fetch=originalFetch}
    const result={passed,failed:tests.length-passed,total:tests.length};
    console.log(`FinanceDepositClient ${result.passed}/${result.total} PASS`);
    return result;
  }
}

if(process.argv[1]?.includes('financeDepositClientTestRunner')){FinanceDepositClientTestRunner.runAllTests().then(r=>{if(r.failed)process.exit(1)}).catch(e=>{console.error(e);process.exit(1)})}
