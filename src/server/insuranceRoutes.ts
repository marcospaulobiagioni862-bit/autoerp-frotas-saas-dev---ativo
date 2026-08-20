import type { Express,Request,Response } from 'express';
import type { AuthenticatedPrincipal } from './auth';
import {
  InsuranceAuthorityService,InsuranceConflictError,InsuranceForbiddenError,
  InsuranceNotFoundError,InsuranceValidationError,type CreateInsuranceAuthorityInput,
} from './insuranceAuthority';

const PROTECTED_KEYS=new Set(['companyId','userId','createdBy','status','accountPayableIds','createdAt','updatedAt','cancelledAt']);
function principal(req:Request):AuthenticatedPrincipal|undefined{return (req as Request&{principal?:AuthenticatedPrincipal}).principal;}
function requirePrincipal(req:Request,res:Response):AuthenticatedPrincipal|null{const item=principal(req);if(!item){res.status(401).json({error:'Unauthorized: Authentication required'});return null;}return item;}
function hasProtected(body:any):boolean{return Boolean(body&&typeof body==='object'&&Object.keys(body).some(key=>PROTECTED_KEYS.has(key)));}
function text(value:unknown,max=300):string{const item=typeof value==='string'?value.trim():'';if(!item||item.length>max)throw new InsuranceValidationError();return item;}
function optionalText(value:unknown,max=300):string|undefined{if(value===undefined||value===null||value==='')return undefined;const item=String(value).trim();if(!item||item.length>max)throw new InsuranceValidationError();return item;}
function amount(value:unknown):number{const item=Number(value??0);if(!Number.isFinite(item)||item<0||item>999999999.99)throw new InsuranceValidationError();return Math.round(item*100)/100;}
function installments(value:unknown):number{const item=Number(value??1);if(!Number.isInteger(item)||item<1||item>60)throw new InsuranceValidationError();return item;}
function date(value:unknown):string{const item=String(value||'').trim();if(!/^\d{4}-\d{2}-\d{2}$/.test(item))throw new InsuranceValidationError();const parsed=new Date(`${item}T00:00:00Z`);if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==item)throw new InsuranceValidationError();return item;}
function isUnique(error:unknown):boolean{let current:any=error;for(let i=0;i<6&&current;i++,current=current.cause)if(current.code==='23505')return true;return false;}
function sendError(res:Response,error:unknown):void{
  const message=error instanceof Error?error.message:'';
  if(error instanceof InsuranceValidationError){res.status(400).json({error:'Invalid insurance request'});return;}
  if(error instanceof InsuranceForbiddenError||message.startsWith('Acesso negado:')){res.status(403).json({error:'Forbidden'});return;}
  if(error instanceof InsuranceNotFoundError||message.includes('não encontrado')||message.includes('não encontrada')){res.status(404).json({error:'Not found'});return;}
  if(error instanceof InsuranceConflictError||isUnique(error)){res.status(409).json({error:'Insurance conflict'});return;}
  console.error('AUTOERP_INSURANCE_API_FAILURE',error);res.status(500).json({error:'Insurance operation failed'});
}

export function registerInsuranceRoutes(app:Express):void{
  app.get('/api/insurances/expense-categories',async(req,res)=>{const actor=requirePrincipal(req,res);if(!actor)return;try{res.json({items:await InsuranceAuthorityService.listExpenseCategories(actor.companyId)});}catch(error){sendError(res,error);}});
  app.get('/api/insurances',async(req,res)=>{const actor=requirePrincipal(req,res);if(!actor)return;try{const vehicleId=optionalText(req.query.vehicleId,200);const status=optionalText(req.query.status,30) as 'ACTIVE'|'EXPIRED'|'CANCELLED'|undefined;if(status&&!['ACTIVE','EXPIRED','CANCELLED'].includes(status))throw new InsuranceValidationError();res.json({items:await InsuranceAuthorityService.list(actor.companyId,{vehicleId,status})});}catch(error){sendError(res,error);}});
  app.get('/api/insurances/:id',async(req,res)=>{const actor=requirePrincipal(req,res);if(!actor)return;try{const item=await InsuranceAuthorityService.get(actor.companyId,req.params.id);if(!item)throw new InsuranceNotFoundError();res.json({item});}catch(error){sendError(res,error);}});
  app.post('/api/insurances',async(req,res)=>{const actor=requirePrincipal(req,res);if(!actor)return;try{
    if(hasProtected(req.body))throw new InsuranceValidationError();
    const input:CreateInsuranceAuthorityInput={
      vehicleId:text(req.body?.vehicleId,200),insuranceCompany:text(req.body?.insuranceCompany,200),policyNumber:text(req.body?.policyNumber,120),
      coverageDetails:text(req.body?.coverageDetails,2000),deductibleAmount:amount(req.body?.deductibleAmount),totalPremiumAmount:amount(req.body?.totalPremiumAmount),
      installmentsCount:installments(req.body?.installmentsCount),startDate:date(req.body?.startDate),endDate:date(req.body?.endDate),
      brokerName:optionalText(req.body?.brokerName,200),brokerPhone:optionalText(req.body?.brokerPhone,80),categoryId:optionalText(req.body?.categoryId,200),
    };
    res.status(201).json({item:await InsuranceAuthorityService.create(actor,input)});
  }catch(error){sendError(res,error);}});
  app.post('/api/insurances/:id/cancel',async(req,res)=>{const actor=requirePrincipal(req,res);if(!actor)return;try{if(hasProtected(req.body))throw new InsuranceValidationError();res.json({item:await InsuranceAuthorityService.cancel(actor,req.params.id,text(req.body?.reason,500))});}catch(error){sendError(res,error);}});
}
