import type { Express,Request,Response } from 'express';
import type { AuthenticatedPrincipal } from './auth';
import {
  TollPassageAuthorityService,TollPassageConflictError,TollPassageForbiddenError,TollPassageNotFoundError,TollPassageValidationError,
  type CreateTollPassageInput,type TollPassageStatus,type TollPassageSource,
} from './tollPassageAuthority';

function principal(req:Request):AuthenticatedPrincipal|undefined{return (req as Request&{principal?:AuthenticatedPrincipal}).principal;}
function requirePrincipal(req:Request,res:Response):AuthenticatedPrincipal|null{const item=principal(req);if(!item){res.status(401).json({error:'Unauthorized: Authentication required'});return null;}return item;}
function optionalText(value:unknown,max=300):string|undefined{if(value===undefined||value===null||value==='')return undefined;const item=String(value).trim();if(!item||item.length>max)throw new TollPassageValidationError();return item;}
function requiredText(value:unknown,max=300):string{const item=typeof value==='string'?value.trim():'';if(!item||item.length>max)throw new TollPassageValidationError();return item;}
function amount(value:unknown):number{const item=Number(value);if(!Number.isFinite(item)||item<=0||item>999999999.99)throw new TollPassageValidationError();return Math.round(item*100)/100;}
function passageStatus(value:unknown):TollPassageStatus{const item=String(value||'') as TollPassageStatus;if(!['PENDING','PAID','OVERDUE','CONTESTED'].includes(item))throw new TollPassageValidationError();return item;}
function passageSource(value:unknown):TollPassageSource{const item=String(value||'') as TollPassageSource;if(!['MANUAL','CSV'].includes(item))throw new TollPassageValidationError();return item;}
function sendError(res:Response,error:unknown):void{if(error instanceof TollPassageValidationError){res.status(400).json({error:'Invalid toll passage request'});return;}if(error instanceof TollPassageForbiddenError){res.status(403).json({error:'Forbidden'});return;}if(error instanceof TollPassageNotFoundError){res.status(404).json({error:'Not found'});return;}if(error instanceof TollPassageConflictError){res.status(409).json({error:'Toll passage source reference conflict'});return;}console.error('AUTOERP_TOLL_PASSAGE_API_FAILURE',error);res.status(500).json({error:'Toll passage operation failed'});}

export function registerTollPassageRoutes(app:Express):void{
  app.get('/api/toll-passages',async(req,res)=>{const actor=requirePrincipal(req,res);if(!actor)return;try{const filters={vehicleId:optionalText(req.query.vehicleId,200),driverId:optionalText(req.query.driverId,200),contractId:optionalText(req.query.contractId,200),status:req.query.status?passageStatus(req.query.status):undefined};res.json({items:await TollPassageAuthorityService.list(actor.companyId,filters)});}catch(error){sendError(res,error);}});
  app.post('/api/toll-passages',async(req,res)=>{const actor=requirePrincipal(req,res);if(!actor)return;try{
    const allowed=new Set(['vehicleId','plate','concessionaire','road','tollPoint','occurredAt','amount','dueDate','status','source','sourceReference','notes']);if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||Object.keys(req.body).some(key=>!allowed.has(key)))throw new TollPassageValidationError();
    const input:CreateTollPassageInput={vehicleId:optionalText(req.body.vehicleId,200),plate:optionalText(req.body.plate,20),concessionaire:requiredText(req.body.concessionaire,200),road:requiredText(req.body.road,200),tollPoint:requiredText(req.body.tollPoint,300),occurredAt:requiredText(req.body.occurredAt,80),amount:amount(req.body.amount),dueDate:optionalText(req.body.dueDate,10),status:passageStatus(req.body.status),source:passageSource(req.body.source),sourceReference:optionalText(req.body.sourceReference,300),notes:optionalText(req.body.notes,4000)};
    const result=await TollPassageAuthorityService.create(actor,input);res.status(result.created?201:200).json(result);
  }catch(error){sendError(res,error);}});
}
