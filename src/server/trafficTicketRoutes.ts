import type { Express,Request,Response } from 'express';
import type { AuthenticatedPrincipal } from './auth';
import { TicketResponsibility,TicketStatus } from '../types/enums';
import {
  TrafficTicketAuthorityService,TrafficTicketConflictError,TrafficTicketForbiddenError,
  TrafficTicketNotFoundError,TrafficTicketValidationError,type ChangeTicketResponsibilityInput,
  type CreateTrafficTicketAuthorityInput,type UpdateTrafficTicketAuthorityInput,
} from './trafficTicketAuthority';

const PROTECTED_KEYS=new Set([
  'companyId','userId','createdBy','status','payableId','basePayableId','receivableId','nicPayableId',
  'createdAt','updatedAt','cancelledAt','cancelReason','responsibilityVersion',
]);
function principal(req:Request):AuthenticatedPrincipal|undefined{return (req as Request&{principal?:AuthenticatedPrincipal}).principal;}
function requirePrincipal(req:Request,res:Response):AuthenticatedPrincipal|null{const item=principal(req);if(!item){res.status(401).json({error:'Unauthorized: Authentication required'});return null;}return item;}
function hasProtected(body:any):boolean{return Boolean(body&&typeof body==='object'&&Object.keys(body).some(key=>PROTECTED_KEYS.has(key)));}
function text(value:unknown,max=1000):string{const item=typeof value==='string'?value.trim():'';if(!item||item.length>max)throw new TrafficTicketValidationError();return item;}
function optionalText(value:unknown,max=1000):string|undefined{if(value===undefined||value===null||value==='')return undefined;const item=String(value).trim();if(!item||item.length>max)throw new TrafficTicketValidationError();return item;}
function amount(value:unknown,required=true):number|undefined{if(value===undefined||value===null||value===''){if(required)throw new TrafficTicketValidationError();return undefined;}const item=Number(value);if(!Number.isFinite(item)||item<=0||item>999999999.99)throw new TrafficTicketValidationError();return Math.round(item*100)/100;}
function integer(value:unknown):number{const item=Number(value??0);if(!Number.isInteger(item)||item<0||item>99)throw new TrafficTicketValidationError();return item;}
function date(value:unknown,required=true):string|undefined{if(value===undefined||value===null||value===''){if(required)throw new TrafficTicketValidationError();return undefined;}const item=String(value).trim();if(!/^\d{4}-\d{2}-\d{2}$/.test(item))throw new TrafficTicketValidationError();const parsed=new Date(`${item}T00:00:00Z`);if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==item)throw new TrafficTicketValidationError();return item;}
function responsibility(value:unknown):TicketResponsibility{const item=String(value||'') as TicketResponsibility;if(!Object.values(TicketResponsibility).includes(item))throw new TrafficTicketValidationError();return item;}
function status(value:unknown):TicketStatus|undefined{if(value===undefined||value===null||value==='')return undefined;const item=String(value) as TicketStatus;if(!Object.values(TicketStatus).includes(item))throw new TrafficTicketValidationError();return item;}
function isUnique(error:unknown):boolean{let current:any=error;for(let i=0;i<6&&current;i++,current=current.cause)if(current.code==='23505')return true;return false;}
function sendError(res:Response,error:unknown):void{
  const message=error instanceof Error?error.message:'';
  if(error instanceof TrafficTicketValidationError){res.status(400).json({error:'Invalid traffic ticket request'});return;}
  if(error instanceof TrafficTicketForbiddenError||message.startsWith('Acesso negado:')){res.status(403).json({error:'Forbidden'});return;}
  if(error instanceof TrafficTicketNotFoundError||message.includes('não encontrado')||message.includes('não encontrada')){res.status(404).json({error:'Not found'});return;}
  if(error instanceof TrafficTicketConflictError||isUnique(error)||message.includes('Não é possível cancelar')||message.includes('já se encontra')||message.includes('período financeiro')){res.status(409).json({error:'Traffic ticket conflict'});return;}
  console.error('AUTOERP_TRAFFIC_TICKET_API_FAILURE',error);res.status(500).json({error:'Traffic ticket operation failed'});
}

export function registerTrafficTicketRoutes(app:Express):void{
  app.get('/api/traffic-tickets/financial-categories',async(req,res)=>{const actor=requirePrincipal(req,res);if(!actor)return;try{res.json({items:await TrafficTicketAuthorityService.listFinancialCategories(actor.companyId)});}catch(error){sendError(res,error);}});
  app.get('/api/traffic-tickets',async(req,res)=>{const actor=requirePrincipal(req,res);if(!actor)return;try{
    const filters={vehicleId:optionalText(req.query.vehicleId,200),driverId:optionalText(req.query.driverId,200),status:status(req.query.status),responsibility:req.query.responsibility?responsibility(req.query.responsibility):undefined};
    res.json({items:await TrafficTicketAuthorityService.list(actor.companyId,filters)});
  }catch(error){sendError(res,error);}});
  app.get('/api/traffic-tickets/:id',async(req,res)=>{const actor=requirePrincipal(req,res);if(!actor)return;try{const details=await TrafficTicketAuthorityService.getDetails(actor.companyId,req.params.id);if(!details)throw new TrafficTicketNotFoundError();res.json(details);}catch(error){sendError(res,error);}});
  app.post('/api/traffic-tickets',async(req,res)=>{const actor=requirePrincipal(req,res);if(!actor)return;try{
    if(hasProtected(req.body))throw new TrafficTicketValidationError();
    const input:CreateTrafficTicketAuthorityInput={
      vehicleId:text(req.body?.vehicleId,200),driverId:optionalText(req.body?.driverId,200),contractId:optionalText(req.body?.contractId,200),
      autoNumber:text(req.body?.autoNumber,160),organName:text(req.body?.organName,200),infractionCode:text(req.body?.infractionCode,120),
      description:text(req.body?.description,2000),infractionDate:date(req.body?.infractionDate,true)!,dueDate:date(req.body?.dueDate,true)!,
      discountDueDate:date(req.body?.discountDueDate,false),originalAmount:amount(req.body?.originalAmount,true)!,
      discountedAmount:amount(req.body?.discountedAmount,false),nicAmount:amount(req.body?.nicAmount,false),points:integer(req.body?.points),
      responsibility:responsibility(req.body?.responsibility),notes:optionalText(req.body?.notes,4000),
      baseExpenseCategoryId:text(req.body?.baseExpenseCategoryId,200),driverIncomeCategoryId:optionalText(req.body?.driverIncomeCategoryId,200),
      nicExpenseCategoryId:optionalText(req.body?.nicExpenseCategoryId,200),
    };
    res.status(201).json(await TrafficTicketAuthorityService.create(actor,input));
  }catch(error){sendError(res,error);}});
  app.patch('/api/traffic-tickets/:id',async(req,res)=>{const actor=requirePrincipal(req,res);if(!actor)return;try{
    if(hasProtected(req.body))throw new TrafficTicketValidationError();const allowed=new Set(['organName','infractionCode','description','notes']);if(Object.keys(req.body||{}).some(key=>!allowed.has(key)))throw new TrafficTicketValidationError();
    const input:UpdateTrafficTicketAuthorityInput={};
    if(req.body?.organName!==undefined)input.organName=text(req.body.organName,200);if(req.body?.infractionCode!==undefined)input.infractionCode=text(req.body.infractionCode,120);
    if(req.body?.description!==undefined)input.description=text(req.body.description,2000);if(req.body?.notes!==undefined)input.notes=String(req.body.notes||'').slice(0,4000);
    res.json(await TrafficTicketAuthorityService.patch(actor,req.params.id,input));
  }catch(error){sendError(res,error);}});
  app.post('/api/traffic-tickets/:id/responsibility',async(req,res)=>{const actor=requirePrincipal(req,res);if(!actor)return;try{
    if(hasProtected(req.body))throw new TrafficTicketValidationError();const input:ChangeTicketResponsibilityInput={responsibility:responsibility(req.body?.responsibility),driverId:optionalText(req.body?.driverId,200),contractId:optionalText(req.body?.contractId,200),driverIncomeCategoryId:optionalText(req.body?.driverIncomeCategoryId,200),nicExpenseCategoryId:optionalText(req.body?.nicExpenseCategoryId,200),nicAmount:amount(req.body?.nicAmount,false)};
    res.json(await TrafficTicketAuthorityService.changeResponsibility(actor,req.params.id,input));
  }catch(error){sendError(res,error);}});
  app.post('/api/traffic-tickets/:id/nic',async(req,res)=>{const actor=requirePrincipal(req,res);if(!actor)return;try{if(hasProtected(req.body))throw new TrafficTicketValidationError();res.json(await TrafficTicketAuthorityService.createNic(actor,req.params.id,text(req.body?.categoryId,200),amount(req.body?.nicAmount,false)));}catch(error){sendError(res,error);}});
  app.post('/api/traffic-tickets/:id/appeal',async(req,res)=>{const actor=requirePrincipal(req,res);if(!actor)return;try{if(hasProtected(req.body))throw new TrafficTicketValidationError();res.json(await TrafficTicketAuthorityService.appeal(actor,req.params.id,text(req.body?.notes,2000)));}catch(error){sendError(res,error);}});
  app.post('/api/traffic-tickets/:id/cancel',async(req,res)=>{const actor=requirePrincipal(req,res);if(!actor)return;try{if(hasProtected(req.body))throw new TrafficTicketValidationError();res.json(await TrafficTicketAuthorityService.cancel(actor,req.params.id,text(req.body?.reason,1000)));}catch(error){sendError(res,error);}});
}
