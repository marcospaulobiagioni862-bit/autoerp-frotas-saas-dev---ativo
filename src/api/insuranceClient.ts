import type { Insurance } from '../types/entities';

export interface InsuranceExpenseCategory{id:string;name:string;type:string;}
export interface CreateInsuranceRequest{
  vehicleId:string;insuranceCompany:string;policyNumber:string;coverageDetails:string;
  deductibleAmount:number;totalPremiumAmount:number;installmentsCount:number;startDate:string;endDate:string;
  brokerName?:string;brokerPhone?:string;categoryId?:string;sourceAttachmentId?:string;
}

async function request(path:string,init?:RequestInit):Promise<any>{
  const response=await fetch(path,{credentials:'include',...init,headers:{'content-type':'application/json',...(init?.headers||{})}});
  let body:any={};try{body=await response.json();}catch{body={};}
  if(!response.ok)throw new Error(typeof body?.error==='string'?body.error:`Insurance request failed (${response.status})`);
  return body;
}
function assertInsurance(value:any):Insurance{
  if(!value||typeof value!=='object'||typeof value.id!=='string'||typeof value.companyId!=='string'||typeof value.vehicleId!=='string'||typeof value.insuranceCompany!=='string'||typeof value.policyNumber!=='string'||!['ACTIVE','EXPIRED','CANCELLED'].includes(value.status))throw new Error('Invalid insurance response');
  return value as Insurance;
}
function assertItems(body:any):Insurance[]{if(!Array.isArray(body?.items))throw new Error('Invalid insurance list response');return body.items.map(assertInsurance);}

export class InsuranceClient{
  static async list(filters:{vehicleId?:string;status?:'ACTIVE'|'EXPIRED'|'CANCELLED'}={}):Promise<Insurance[]>{const query=new URLSearchParams();if(filters.vehicleId)query.set('vehicleId',filters.vehicleId);if(filters.status)query.set('status',filters.status);const body=await request(`/api/insurances${query.size?`?${query}`:''}`);return assertItems(body);}
  static async listByVehicle(vehicleId:string):Promise<Insurance[]>{return await this.list({vehicleId});}
  static async get(id:string):Promise<Insurance>{return assertInsurance((await request(`/api/insurances/${encodeURIComponent(id)}`)).item);}
  static async create(input:CreateInsuranceRequest):Promise<Insurance>{return assertInsurance((await request('/api/insurances',{method:'POST',body:JSON.stringify(input)})).item);}
  static async cancel(id:string,reason:string):Promise<Insurance>{return assertInsurance((await request(`/api/insurances/${encodeURIComponent(id)}/cancel`,{method:'POST',body:JSON.stringify({reason})})).item);}
  static async listExpenseCategories():Promise<InsuranceExpenseCategory[]>{const body=await request('/api/insurances/expense-categories');if(!Array.isArray(body?.items))throw new Error('Invalid insurance category response');return body.items.map((item:any)=>{if(!item||typeof item.id!=='string'||typeof item.name!=='string')throw new Error('Invalid insurance category');return item as InsuranceExpenseCategory;});}
}
