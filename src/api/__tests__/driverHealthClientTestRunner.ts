import { DriverHealthApiError, DriverHealthClient } from '../driverHealthClient';

export class DriverHealthClientTestRunner {
  static async runAllTests() {
    const originalFetch=globalThis.fetch; let passed=0; const tests:Array<()=>Promise<void>>=[];
    tests.push(async()=>{let url='',cred:RequestCredentials|undefined;globalThis.fetch=(async(i:RequestInfo|URL,x?:RequestInit)=>{url=String(i);cred=x?.credentials;return new Response(JSON.stringify({health:{bloodType:'O+'}}),{status:200})}) as typeof fetch;const h=await DriverHealthClient.get('drv 1');if(!url.includes('/api/drivers/drv%201/health')||cred!=='include'||h.bloodType!=='O+')throw Error('GET transport')});
    tests.push(async()=>{let body:any,cred:RequestCredentials|undefined;globalThis.fetch=(async(_i:RequestInfo|URL,x?:RequestInit)=>{body=JSON.parse(String(x?.body));cred=x?.credentials;return new Response(JSON.stringify({health:{allergies:'latex'}}),{status:200})}) as typeof fetch;await DriverHealthClient.update('drv-1',{allergies:'latex'});if(cred!=='include'||body.health.allergies!=='latex')throw Error('PUT transport');for(const k of ['companyId','userId','userName','role'])if(k in body)throw Error(`browser authority leaked ${k}`)});
    tests.push(async()=>{globalThis.fetch=(async()=>new Response(JSON.stringify({health:{}}),{status:200})) as typeof fetch;const h=await DriverHealthClient.get('d');if(Object.keys(h).length!==0)throw Error('empty profile')});
    tests.push(async()=>{globalThis.fetch=(async()=>new Response(JSON.stringify({error:'Forbidden'}),{status:403})) as typeof fetch;let e:unknown;try{await DriverHealthClient.get('d')}catch(x){e=x}if(!(e instanceof DriverHealthApiError)||e.status!==403)throw Error('403 fail closed')});
    tests.push(async()=>{globalThis.fetch=(async()=>new Response(JSON.stringify({error:'Unauthorized'}),{status:401})) as typeof fetch;let e:unknown;try{await DriverHealthClient.update('d',{})}catch(x){e=x}if(!(e instanceof DriverHealthApiError)||e.status!==401)throw Error('401 fail closed')});
    tests.push(async()=>{globalThis.fetch=(async()=>new Response(JSON.stringify({health:{bloodType:123}}),{status:200})) as typeof fetch;let failed=false;try{await DriverHealthClient.get('d')}catch{failed=true}if(!failed)throw Error('malformed payload must fail')});
    try{for(const t of tests){await t();passed++}}finally{globalThis.fetch=originalFetch}
    const result={passed,failed:tests.length-passed,total:tests.length}; console.log(`DriverHealthClient ${passed}/${tests.length} PASS`); return result;
  }
}
if(process.argv[1]?.includes('driverHealthClientTestRunner')) DriverHealthClientTestRunner.runAllTests().then(r=>{if(r.failed)process.exit(1)}).catch(e=>{console.error(e);process.exit(1)});
