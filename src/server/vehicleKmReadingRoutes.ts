import type { Express, Request, Response } from 'express';
import type { AuthenticatedPrincipal } from './auth';
import {
  VehicleKmReadingAuthority,
  VehicleKmReadingConflictError,
  VehicleKmReadingNotFoundError,
  VehicleKmReadingValidationError,
  type BatchKmReadingEntryInput,
  type UpsertKmReadingScheduleInput,
} from './vehicleKmReadingAuthority';
import {
  VehicleKmAlertAuthority,
  VehicleKmAlertForbiddenError,
  VehicleKmAlertValidationError,
} from './vehicleKmAlertAuthority';

const READ_ROLES=new Set(['ADMIN','MANAGER','OPERATIONAL_MANAGER','FINANCIAL','FINANCIAL_MANAGER','OPERATIONAL','READONLY']);
const WRITE_ROLES=new Set(['ADMIN','MANAGER','OPERATIONAL_MANAGER','OPERATIONAL']);

function actor(req:Request):AuthenticatedPrincipal|undefined{return (req as Request&{principal?:AuthenticatedPrincipal}).principal;}
function requireActor(req:Request,res:Response,write:boolean):AuthenticatedPrincipal|null{
  const p=actor(req);if(!p){res.status(401).json({error:'Unauthorized: Authentication required'});return null;}
  const role=String(p.role||'').toUpperCase(),permissions=Array.isArray(p.permissions)?p.permissions:[];
  if(!permissions.includes('*')&&!(write?WRITE_ROLES:READ_ROLES).has(role)){res.status(403).json({error:'Forbidden'});return null;}
  return p;
}
function object(value:unknown):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new VehicleKmReadingValidationError('Payload de KM inválido');
  return value as Record<string,unknown>;
}
function exact(value:unknown,allowed:Set<string>):Record<string,unknown>{
  const item=object(value);
  if(Object.keys(item).some(key=>!allowed.has(key)))throw new VehicleKmReadingValidationError('Campo não permitido no payload de KM');
  return item;
}
function send(res:Response,error:unknown):void{
  if(error instanceof VehicleKmReadingValidationError||error instanceof VehicleKmAlertValidationError){res.status(400).json({error:error.message});return;}
  if(error instanceof VehicleKmReadingNotFoundError){res.status(404).json({error:error.message});return;}
  if(error instanceof VehicleKmReadingConflictError){res.status(409).json({error:error.message});return;}
  if(error instanceof VehicleKmAlertForbiddenError){res.status(403).json({error:'Forbidden'});return;}
  console.error('AUTOERP_VEHICLE_KM_BATCH_FAILURE',error);res.status(500).json({error:'Falha na operação de quilometragem'});
}

export function registerVehicleKmReadingRoutes(app:Express):void{
  app.get('/api/fleet/km-reading-schedules',async(req,res)=>{
    const p=requireActor(req,res,false);if(!p)return;
    try{res.json({items:await VehicleKmReadingAuthority.listSchedules(p.companyId)});}catch(error){send(res,error);}
  });

  app.put('/api/fleet/vehicles/:id/km-reading-schedule',async(req,res)=>{
    const p=requireActor(req,res,true);if(!p)return;
    try{
      const body=exact(req.body,new Set(['frequency','weekday','dayOfMonth']));
      const input:UpsertKmReadingScheduleInput={
        frequency:String(body.frequency||'') as UpsertKmReadingScheduleInput['frequency'],
        weekday:body.weekday===undefined||body.weekday===null?null:Number(body.weekday),
        dayOfMonth:body.dayOfMonth===undefined||body.dayOfMonth===null?null:Number(body.dayOfMonth),
      };
      res.json({item:await VehicleKmReadingAuthority.upsertSchedule(p,req.params.id,input)});
    }catch(error){send(res,error);}
  });

  app.get('/api/fleet/vehicles/:id/km-tracker-candidate',async(req,res)=>{
    const p=requireActor(req,res,false);if(!p)return;
    try{res.json({item:await VehicleKmReadingAuthority.trackerCandidate(p.companyId,req.params.id)});}catch(error){send(res,error);}
  });

  app.get('/api/fleet/km-reading-alerts',async(req,res)=>{
    const p=requireActor(req,res,false);if(!p)return;
    try{
      if(Object.keys(req.query).length>0)throw new VehicleKmAlertValidationError('Consulta de alertas de KM inválida');
      res.json({items:await VehicleKmAlertAuthority.listAlerts(p.companyId)});
    }catch(error){send(res,error);}
  });

  app.post('/api/fleet/km-whatsapp/batch',async(req,res)=>{
    const p=requireActor(req,res,true);if(!p)return;
    try{
      const body=exact(req.body,new Set(['vehicleIds']));
      if(!Array.isArray(body.vehicleIds))throw new VehicleKmAlertValidationError('Seleção de veículos inválida');
      const vehicleIds=body.vehicleIds.map(value=>String(value||''));
      res.json({items:await VehicleKmAlertAuthority.prepareWhatsappBatch(p,vehicleIds),providerCallApplied:false});
    }catch(error){send(res,error);}
  });

  app.post('/api/fleet/km-records/batch',async(req,res)=>{
    const p=requireActor(req,res,true);if(!p)return;
    try{
      const body=exact(req.body,new Set(['entries']));
      if(!Array.isArray(body.entries))throw new VehicleKmReadingValidationError('Lote de KM inválido');
      const entries:BatchKmReadingEntryInput[]=body.entries.map(value=>{
        const item=exact(value,new Set(['vehicleId','sourceType','kmValue','sourceAttachmentId']));
        return{
          vehicleId:String(item.vehicleId||''),
          sourceType:String(item.sourceType||'') as BatchKmReadingEntryInput['sourceType'],
          kmValue:item.kmValue===undefined?undefined:Number(item.kmValue),
          sourceAttachmentId:item.sourceAttachmentId===undefined?undefined:String(item.sourceAttachmentId),
        };
      });
      res.status(201).json({items:await VehicleKmReadingAuthority.recordBatch(p,entries)});
    }catch(error){send(res,error);}
  });
}
