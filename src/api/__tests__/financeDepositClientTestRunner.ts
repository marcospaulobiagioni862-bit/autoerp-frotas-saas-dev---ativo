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
      const calls:Array<{url:string;credentials:RequestCredentials|undefined;body:any}> = [];
      globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
        const url=String(input);
        calls.push({url,credentials:init?.credentials,body:init?.body?JSON.parse(String(init.body)):undefined});
        if(url==='/api/finance/security-deposits/receive')return new Response(JSON.stringify({deposit,movement}),{status:201});
        if(url==='/api/contracts/contract-a/reconcile-deposit-receivable')return new Response(JSON.stringify({receivables:[]}),{status:200});
        return new Response(JSON.stringify({error:'Unexpected request'}),{status:500});
      }) as typeof fetch;
      const result=await FinanceDepositClient.receive({contractId:'contract-a',amount:400,financialAccountId:'acc-a',paymentMethodId:'pm-pix',idempotencyKey:'deposit-key-1'});
      if(calls.length!==2)throw Error(`deposit receive expected 2 transports, got ${calls.length}`);
      const receiveCall=calls[0];
      const reconcileCall=calls[1];
      if(receiveCall.url!=='/api/finance/security-deposits/receive'||receiveCall.credentials!=='include'||result.deposit.id!=='dep-1'||result.movement.id!=='mov-1')throw Error('deposit receive transport');
      if(receiveCall.body.idempotencyKey!=='deposit-key-1')throw Error('deposit idempotency key missing from transport');
      for(const key of ['companyId','userId','userName','driverId','vehicleId'])if(key in receiveCall.body)throw Error(`browser authority leaked: ${key}`);
      if(reconcileCall.url!=='/api/contracts/contract-a/reconcile-deposit-receivable'||reconcileCall.credentials!=='include')throw Error('deposit receivable reconciliation transport');
    });

    tests.push(async () => {
      globalThis.fetch=(async()=>new Response(JSON.stringify({error:'Unauthorized'}),{status:401})) as typeof fetch;
      let thrown:unknown;try{await FinanceDepositClient.receive({contractId:'c',amount:1,financialAccountId:'a',paymentMethodId:'p',idempotencyKey:'deposit-key-401'})}catch(e){thrown=e}
      if(!(thrown instanceof FinanceDepositApiError)||thrown.status!==401)throw Error('receive must fail closed on 401');
    });

    tests.push(async () => {
      globalThis.fetch=(async()=>new Response(JSON.stringify({deposit:{id:'bad'},movement:{}}),{status:201})) as typeof fetch;
      let failed=false;try{await FinanceDepositClient.receive({contractId:'c',amount:1,financialAccountId:'a',paymentMethodId:'p',idempotencyKey:'deposit-key-malformed'})}catch{failed=true}
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