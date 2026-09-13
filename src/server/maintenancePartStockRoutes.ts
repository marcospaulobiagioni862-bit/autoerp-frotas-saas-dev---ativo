import type { Express, Request, Response } from 'express';
import type { AuthenticatedPrincipal } from './auth';
import { MaintenancePartStockAuthority, type PartStockManualMovementType } from './maintenancePartStockAuthority';
import { MaintenanceConflictError, MaintenanceNotFoundError, MaintenanceValidationError } from './maintenanceAuthority';

type MutableRequest=Request&{principal?:AuthenticatedPrincipal};
const READ=new Set(['ADMIN','MANAGER','OPERATIONAL_MANAGER','FINANCIAL','FINANCIAL_MANAGER','OPERATIONAL','READONLY']);
const WRITE=new Set(['ADMIN','MANAGER','OPERATIONAL']);
function actor(req:Request,res:Response,write:boolean):AuthenticatedPrincipal|null{
  const p=(req as MutableRequest).principal;if(!p){res.status(401).json({error:'Unauthorized: Authentication required'});return null;}
  const role=String(p.role||'').toUpperCase(),permissions=Array.isArray(p.permissions)?p.permissions:[];
  const ok=permissions.includes('*')||permissions.includes(write?'MUTATE_MAINTENANCE':'VIEW_MAINTENANCE')||(write?WRITE:READ).has(role);
  if(!ok){res.status(403).json({error:'Forbidden'});return null;}return p;
}
function send(res:Response,error:unknown):void{
  if(error instanceof MaintenanceValidationError){res.status(400).json({error:'Invalid maintenance request'});return;}
  if(error instanceof MaintenanceNotFoundError){res.status(404).json({error:'Not found'});return;}
  if(error instanceof MaintenanceConflictError){res.status(409).json({error:'Maintenance command conflict'});return;}
  console.error('AUTOERP_MAINTENANCE_PART_STOCK_FAILURE',error);res.status(500).json({error:'Maintenance operation failed'});
}
function body(req:Request):Record<string,unknown>{if(!req.body||typeof req.body!=='object'||Array.isArray(req.body))throw new MaintenanceValidationError('Invalid payload');return req.body as Record<string,unknown>;}
export function registerMaintenancePartStockRoutes(app:Express):void{
  app.get('/api/maintenance/parts/:id/movements',async(req,res)=>{const p=actor(req,res,false);if(!p)return;try{res.json({items:await MaintenancePartStockAuthority.list(p.companyId,req.params.id)});}catch(error){send(res,error);}});
  app.post('/api/maintenance/parts/:id/movements',async(req,res)=>{const p=actor(req,res,true);if(!p)return;try{
    const x=body(req),allowed=new Set(['movementType','quantity','reason','idempotencyKey']);if(Object.keys(x).some(key=>!allowed.has(key)))throw new MaintenanceValidationError('Invalid payload');
    const movementType=String(x.movementType||'') as PartStockManualMovementType;
    const result=await MaintenancePartStockAuthority.move(p,req.params.id,{movementType,quantity:Number(x.quantity),reason:x.reason===undefined?undefined:String(x.reason),idempotencyKey:String(x.idempotencyKey||'')});
    res.status(201).json(result);
  }catch(error){send(res,error);}});
}
