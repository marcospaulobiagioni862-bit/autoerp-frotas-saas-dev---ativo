import type { ProductionIncident, IncidentSeverity, IncidentStatus } from '../domain/incident-management/types';
import type { ExecutiveOperationsSnapshot } from '../domain/operations/types';
import type { Task, TaskPriority, TaskStatus } from '../domain/workflow/types';
import type { CreateOperationalIncidentInput, CreateOperationalTaskInput, IncidentTransitionInput, TaskEventInput, TaskTransitionInput } from '../server/operationalAuthority';

type JsonRecord=Record<string,unknown>;
function record(value:unknown):JsonRecord{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid operational payload');return value as JsonRecord;}
function task(value:unknown):Task{const item=record(value);if(typeof item.id!=='string'||typeof item.companyId!=='string'||typeof item.title!=='string'||typeof item.status!=='string'||typeof item.priority!=='string'||typeof item.dueAt!=='string')throw new Error('Invalid task payload');return item as unknown as Task;}
function incident(value:unknown):ProductionIncident{const item=record(value);if(typeof item.id!=='string'||typeof item.companyId!=='string'||typeof item.title!=='string'||typeof item.status!=='string'||typeof item.severity!=='string'||typeof item.detectedAt!=='string')throw new Error('Invalid incident payload');return item as unknown as ProductionIncident;}
function snapshot(value:unknown):ExecutiveOperationsSnapshot{const item=record(value);if(typeof item.id!=='string'||typeof item.companyId!=='string'||typeof item.generatedAt!=='string'||typeof item.healthScore!=='number'||!item.kpis||!Array.isArray(item.topPriorityActions))throw new Error('Invalid executive snapshot payload');return item as unknown as ExecutiveOperationsSnapshot;}
async function apiError(response:Response):Promise<Error>{let message=`Operational request failed (${response.status})`;try{const payload=record(await response.json());if(typeof payload.error==='string')message=payload.error;}catch{}return new Error(message);}
function key(value?:string):string{return value||crypto.randomUUID();}
async function request(url:string,init?:RequestInit):Promise<JsonRecord>{const response=await fetch(url,{credentials:'include',...init});if(!response.ok)throw await apiError(response);return record(await response.json());}
function write(method:'POST'|'PATCH',body:unknown,idempotencyKey?:string):RequestInit{return {method,headers:{'content-type':'application/json','x-idempotency-key':key(idempotencyKey)},body:JSON.stringify(body)};}

export class OperationalAuthorityClient{
  static async listTasks(filters:{status?:TaskStatus;priority?:TaskPriority;search?:string}={}):Promise<Task[]>{const params=new URLSearchParams();Object.entries(filters).forEach(([name,value])=>{if(value)params.set(name,String(value));});const payload=await request(`/api/operations/tasks${params.size?`?${params.toString()}`:''}`);if(!Array.isArray(payload.items))throw new Error('Invalid task list');return payload.items.map(task);}
  static async createTask(input:CreateOperationalTaskInput,idempotencyKey?:string):Promise<Task>{return task((await request('/api/operations/tasks',write('POST',input,idempotencyKey))).item);}
  static async transitionTask(id:string,input:TaskTransitionInput,idempotencyKey?:string):Promise<Task>{return task((await request(`/api/operations/tasks/${encodeURIComponent(id)}/transition`,write('POST',input,idempotencyKey))).item);}
  static async addTaskEvent(id:string,input:TaskEventInput,idempotencyKey?:string):Promise<Task>{return task((await request(`/api/operations/tasks/${encodeURIComponent(id)}/events`,write('POST',input,idempotencyKey))).item);}

  static async listIncidents(filters:{status?:IncidentStatus;severity?:IncidentSeverity;search?:string}={}):Promise<ProductionIncident[]>{const params=new URLSearchParams();Object.entries(filters).forEach(([name,value])=>{if(value)params.set(name,String(value));});const payload=await request(`/api/operations/incidents${params.size?`?${params.toString()}`:''}`);if(!Array.isArray(payload.items))throw new Error('Invalid incident list');return payload.items.map(incident);}
  static async createIncident(input:CreateOperationalIncidentInput,idempotencyKey?:string):Promise<ProductionIncident>{return incident((await request('/api/operations/incidents',write('POST',input,idempotencyKey))).item);}
  static async transitionIncident(id:string,input:IncidentTransitionInput,idempotencyKey?:string):Promise<ProductionIncident>{return incident((await request(`/api/operations/incidents/${encodeURIComponent(id)}/transition`,write('POST',input,idempotencyKey))).item);}
  static async addIncidentAction(id:string,action:string,comment?:string,idempotencyKey?:string):Promise<ProductionIncident>{return incident((await request(`/api/operations/incidents/${encodeURIComponent(id)}/actions`,write('POST',{action,comment},idempotencyKey))).item);}

  static async executiveSnapshot():Promise<ExecutiveOperationsSnapshot>{return snapshot((await request('/api/operations/executive/snapshot')).snapshot);}
  static async executeQuickAction(actionType:string,entityId:string,reason?:string,idempotencyKey?:string):Promise<{success:boolean;message:string}>{const payload=await request('/api/operations/executive/quick-actions',write('POST',{actionType,entityId,reason},idempotencyKey));return {success:payload.success===true,message:typeof payload.message==='string'?payload.message:'Ação executada'};}
}
