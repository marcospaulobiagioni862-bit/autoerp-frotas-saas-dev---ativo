import type { Express, Request, Response } from 'express';
import type { AuthenticatedPrincipal } from './auth';
import {
  TrackerAuthorityService, TrackerConflictError, TrackerNotFoundError, TrackerValidationError,
  type CreateTrackerInput, type UpdateTrackerInput,
} from './trackerAuthority';

type TrackerAction='VIEW_TRACKER'|'MUTATE_TRACKER';
const READ_ROLES=new Set(['ADMIN','MANAGER','OPERATIONAL_MANAGER','FINANCIAL','FINANCIAL_MANAGER','OPERATIONAL','READONLY']);
const WRITE_ROLES=new Set(['ADMIN','MANAGER','OPERATIONAL']);
const FORBIDDEN=new Set(['companyId','userId','userName','role','status','recurringRuleId','createdBy','lastGeneratedReference','nextGenerationDate','active','createdAt','updatedAt','lastPing']);
function principal(req:Request):AuthenticatedPrincipal|undefined{return (req as Request&{principal?:AuthenticatedPrincipal}).principal;}
function requirePrincipal(req:Request,res:Response,action:TrackerAction):AuthenticatedPrincipal|null{
  const actor=principal(req); if(!actor){res.status(401).json({error:'Unauthorized: Authentication required'});return null;}
  const role=String(actor.role||'').toUpperCase(),permissions=Array.isArray(actor.permissions)?actor.permissions:[];
  const explicit=permissions.includes('*')||permissions.includes(action),allowed=action==='VIEW_TRACKER'?READ_ROLES.has(role):WRITE_ROLES.has(role);
  if(!explicit&&!allowed){res.status(403).json({error:'Forbidden'});return null;} return actor;
}
function rejectProtected(body:unknown):void{
  if(!body||typeof body!=='object'||Array.isArray(body))throw new TrackerValidationError('Invalid payload');
  for(const key of Object.keys(body as Record<string,unknown>))if(FORBIDDEN.has(key))throw new TrackerValidationError(`Protected field: ${key}`);
}
function requiredText(value:unknown,max=500):string{const s=typeof value==='string'?value.trim():'';if(!s||s.length>max)throw new TrackerValidationError('Invalid text');return s;}
function optionalText(value:unknown,max=1000):string|undefined{if(value===undefined||value===null||value==='')return undefined;const s=String(value).trim();if(!s||s.length>max)throw new TrackerValidationError('Invalid text');return s;}
function optionalNullable(value:unknown,max=1000):string|null|undefined{if(value===undefined)return undefined;if(value===null||value==='')return null;return optionalText(value,max)!;}
function nonNegative(value:unknown):number{const n=Number(value);if(!Number.isFinite(n)||n<0)throw new TrackerValidationError('Invalid number');return n;}
function uniqueViolation(error:unknown):boolean{let current:unknown=error;for(let i=0;i<6&&current&&typeof current==='object';i++){if('code'in current&&(current as any).code==='23505')return true;current='cause'in current?(current as any).cause:undefined;}return false;}
function sendError(res:Response,error:unknown):void{
  const message=error instanceof Error?error.message:'';
  if(error instanceof TrackerValidationError){res.status(400).json({error:'Invalid tracker request'});return;}
  if(error instanceof TrackerNotFoundError||message.includes('não encontrado')||message.includes('não encontrada')){res.status(404).json({error:'Not found'});return;}
  if(error instanceof TrackerConflictError||uniqueViolation(error)||message.includes('período financeiro')||message.includes('Permissão insuficiente')){res.status(409).json({error:'Tracker command conflict'});return;}
  if(message.startsWith('Acesso negado:')){res.status(403).json({error:'Forbidden'});return;}
  console.error('AUTOERP_TRACKER_AUTHORITY_FAILURE',error);res.status(500).json({error:'Tracker operation failed'});
}

export function registerTrackerRoutes(app:Express):void{
  app.get('/api/trackers/expense-categories',async(req,res)=>{const actor=requirePrincipal(req,res,'VIEW_TRACKER');if(!actor)return;try{res.json({items:await TrackerAuthorityService.listExpenseCategories(actor.companyId)});}catch(error){sendError(res,error);}});
  app.get('/api/trackers',async(req,res)=>{const actor=requirePrincipal(req,res,'VIEW_TRACKER');if(!actor)return;try{const vehicleId=typeof req.query.vehicleId==='string'&&req.query.vehicleId.trim()?req.query.vehicleId.trim():undefined;res.json({items:await TrackerAuthorityService.list(actor.companyId,vehicleId)});}catch(error){sendError(res,error);}});
  app.get('/api/vehicles/:vehicleId/trackers',async(req,res)=>{const actor=requirePrincipal(req,res,'VIEW_TRACKER');if(!actor)return;try{res.json({items:await TrackerAuthorityService.list(actor.companyId,requiredText(req.params.vehicleId,160))});}catch(error){sendError(res,error);}});
  app.get('/api/trackers/:id',async(req,res)=>{const actor=requirePrincipal(req,res,'VIEW_TRACKER');if(!actor)return;try{const item=await TrackerAuthorityService.get(actor.companyId,req.params.id);if(!item)throw new TrackerNotFoundError('Rastreador não encontrado');res.json({item});}catch(error){sendError(res,error);}});
  app.post('/api/trackers',async(req,res)=>{const actor=requirePrincipal(req,res,'MUTATE_TRACKER');if(!actor)return;try{
    rejectProtected(req.body);const input:CreateTrackerInput={vehicleId:requiredText(req.body?.vehicleId,160),equipmentModel:requiredText(req.body?.equipmentModel,200),imei:requiredText(req.body?.imei,40),serialNumber:optionalText(req.body?.serialNumber,120),chipCarrier:optionalText(req.body?.chipCarrier,120),chipNumber:optionalText(req.body?.chipNumber,120),monthlyCost:nonNegative(req.body?.monthlyCost??0),installationDate:requiredText(req.body?.installationDate,10),supplierId:optionalText(req.body?.supplierId,160),notes:optionalText(req.body?.notes,1000),categoryId:optionalText(req.body?.categoryId,160)};
    res.status(201).json({item:await TrackerAuthorityService.create(actor,input)});
  }catch(error){sendError(res,error);}});
  app.patch('/api/trackers/:id',async(req,res)=>{const actor=requirePrincipal(req,res,'MUTATE_TRACKER');if(!actor)return;try{
    rejectProtected(req.body);if(Object.prototype.hasOwnProperty.call(req.body||{},'vehicleId'))throw new TrackerValidationError('vehicleId is immutable');
    const input:UpdateTrackerInput={equipmentModel:req.body?.equipmentModel===undefined?undefined:requiredText(req.body.equipmentModel,200),imei:req.body?.imei===undefined?undefined:requiredText(req.body.imei,40),serialNumber:optionalNullable(req.body?.serialNumber,120),chipCarrier:optionalNullable(req.body?.chipCarrier,120),chipNumber:optionalNullable(req.body?.chipNumber,120),monthlyCost:req.body?.monthlyCost===undefined?undefined:nonNegative(req.body.monthlyCost),installationDate:req.body?.installationDate===undefined?undefined:requiredText(req.body.installationDate,10),supplierId:optionalNullable(req.body?.supplierId,160),notes:optionalNullable(req.body?.notes,1000),categoryId:optionalText(req.body?.categoryId,160)};
    if(Object.values(input).every(v=>v===undefined))throw new TrackerValidationError('No changes');res.json({item:await TrackerAuthorityService.update(actor,req.params.id,input)});
  }catch(error){sendError(res,error);}});
  app.post('/api/trackers/:id/remove',async(req,res)=>{const actor=requirePrincipal(req,res,'MUTATE_TRACKER');if(!actor)return;try{rejectProtected(req.body);res.json({item:await TrackerAuthorityService.remove(actor,req.params.id,requiredText(req.body?.reason,500))});}catch(error){sendError(res,error);}});
}
