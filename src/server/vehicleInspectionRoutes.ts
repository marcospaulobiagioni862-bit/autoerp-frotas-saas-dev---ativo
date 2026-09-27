import { randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { recordVehicleKm, VehicleKmError } from './vehicleKmAuthority';
import { vehicleInspections } from '../db/schema';
import { AuditAction, VehicleStatus } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';

const ROLES=new Set(['ADMIN','MANAGER','OPERATIONAL_MANAGER','FINANCIAL','OPERATIONAL','READONLY']);
const WRITE_ROLES=new Set(['ADMIN','MANAGER','OPERATIONAL_MANAGER','OPERATIONAL']);
const TYPES=new Set(['ENTRY','EXIT']);
const CHECKLIST_KEYS=[
  'keyMain','keySpare','crlvPrinted','phoneHolder','jack','triangle',
  'wheelWrench','spareTire','seatCover','ownerManual','floorMats','multimedia',
] as const;
const TECHNICAL_KEYS=[
  'tires','glassMirrors','bodyPaint','interior','dashboard','lighting',
  'brakes','suspension','steering','engine','transmission','safety',
] as const;
const TECHNICAL_STATUSES=new Set(['OK','ATTENTION','FAILED','NOT_APPLICABLE']);
const INSPECTION_RESULTS=new Set(['APPROVED','APPROVED_WITH_RESERVATIONS','FAILED','BLOCKED_FOR_RENTAL']);
const CRITICAL_TECHNICAL_KEYS=new Set(['tires','brakes','steering','safety']);

class ValidationError extends Error{}
class NotFoundError extends Error{}
class ForbiddenError extends Error{}

function principalFrom(req:Request):AuthenticatedPrincipal|undefined{
  return (req as Request&{principal?:AuthenticatedPrincipal}).principal;
}
function requirePrincipal(req:Request,res:Response,write=false):AuthenticatedPrincipal|null{
  const principal=principalFrom(req);
  if(!principal){res.status(401).json({error:'Unauthorized: Authentication required'});return null;}
  const role=String(principal.role||'').toUpperCase();
  if(!principal.userId||!principal.companyId||!ROLES.has(role)||(write&&!WRITE_ROLES.has(role))){
    res.status(403).json({error:'Forbidden'});return null;
  }
  return principal;
}
function checklist(value:unknown):Record<string,boolean>{
  if(value===undefined||value===null) return Object.fromEntries(CHECKLIST_KEYS.map(k=>[k,false]));
  if(!value||typeof value!=='object'||Array.isArray(value)) throw new ValidationError();
  const item=value as Record<string,unknown>;
  if(!Object.keys(item).every(k=>(CHECKLIST_KEYS as readonly string[]).includes(k))) throw new ValidationError();
  return Object.fromEntries(CHECKLIST_KEYS.map(k=>[k,item[k]===true]));
}
function technicalChecklist(value:unknown):Record<string,string>{
  if(!value||typeof value!=='object'||Array.isArray(value)) throw new ValidationError();
  const item=value as Record<string,unknown>;
  if(!Object.keys(item).every(k=>(TECHNICAL_KEYS as readonly string[]).includes(k))) throw new ValidationError();
  if(!TECHNICAL_KEYS.every(k=>TECHNICAL_STATUSES.has(String(item[k]||'')))) throw new ValidationError();
  return Object.fromEntries(TECHNICAL_KEYS.map(k=>[k,String(item[k])]));
}
function deriveInspectionResult(items:Record<string,string>):string{
  for(const key of TECHNICAL_KEYS){
    if(items[key]==='FAILED'&&CRITICAL_TECHNICAL_KEYS.has(key)) return 'BLOCKED_FOR_RENTAL';
  }
  if(TECHNICAL_KEYS.some(key=>items[key]==='FAILED')) return 'FAILED';
  if(TECHNICAL_KEYS.some(key=>items[key]==='ATTENTION')) return 'APPROVED_WITH_RESERVATIONS';
  return 'APPROVED';
}
function inspectionChecklistPayload(legacy:Record<string,boolean>,technical:Record<string,string>,result:string):Record<string,unknown>{
  return {...legacy,technical,result};
}
function optionalText(value:unknown,max=2000):string|undefined{
  if(value===undefined||value===null||value==='') return undefined;
  const v=String(value).trim(); if(v.length>max) throw new ValidationError(); return v||undefined;
}
function item(row:any){
  const stored=(row.checklist&&typeof row.checklist==='object'&&!Array.isArray(row.checklist))?row.checklist as Record<string,unknown>:{};
  const legacy=Object.fromEntries(CHECKLIST_KEYS.map(k=>[k,stored[k]===true]));
  const technicalRaw=stored.technical;
  const technical=(technicalRaw&&typeof technicalRaw==='object'&&!Array.isArray(technicalRaw))
    ? Object.fromEntries(TECHNICAL_KEYS.map(k=>[k,TECHNICAL_STATUSES.has(String((technicalRaw as Record<string,unknown>)[k]||''))?String((technicalRaw as Record<string,unknown>)[k]):'NOT_APPLICABLE']))
    : undefined;
  const result=INSPECTION_RESULTS.has(String(stored.result||''))?String(stored.result):undefined;
  return {
    id:String(row.id),companyId:String(row.companyId),vehicleId:String(row.vehicleId),
    driverId:row.driverId||undefined,contractId:row.contractId||undefined,
    inspectionType:String(row.inspectionType),inspectionDate:String(row.inspectionDate),
    odometer:Number(row.odometer),fuelLevel:Number(row.fuelLevel),
    checklist:legacy,technicalChecklist:technical,result,notes:row.notes||undefined,
    createdBy:String(row.createdBy),createdAt:String(row.createdAt),updatedAt:String(row.updatedAt),
  };
}
function sendError(res:Response,error:unknown){
  if(error instanceof VehicleKmError){res.status(error.kind==='NOT_FOUND'?404:400).json({error:error.message});return;}
  if(error instanceof ValidationError){res.status(400).json({error:'Invalid vehicle inspection request'});return;}
  if(error instanceof ForbiddenError){res.status(403).json({error:'Forbidden'});return;}
  if(error instanceof NotFoundError){res.status(404).json({error:'Not found'});return;}
  console.error('AUTOERP_VEHICLE_INSPECTION_FAILURE',error);
  res.status(500).json({error:'Vehicle inspection operation failed'});
}

export function registerVehicleInspectionRoutes(app:Express):void{
  app.get('/api/fleet/vehicles/:id/inspections',async(req,res)=>{
    const principal=requirePrincipal(req,res);if(!principal)return;
    try{
      const items=await UnitOfWork.run(principal.companyId,async context=>{
        const vehicle=await context.getVehicleRepo().findByIdForCompany(principal.companyId,req.params.id);
        if(!vehicle) throw new NotFoundError();
        const tx=context.getRawTransaction?.();if(!tx) throw new Error('Raw tenant transaction unavailable');
        return await tx.select().from(vehicleInspections).where(and(
          eq(vehicleInspections.companyId,principal.companyId),
          eq(vehicleInspections.vehicleId,vehicle.id),
        )).orderBy(desc(vehicleInspections.inspectionDate),desc(vehicleInspections.createdAt));
      });
      res.json({items:items.map(item)});
    }catch(error){sendError(res,error);}
  });

  app.post('/api/fleet/vehicles/:id/inspections',async(req,res)=>{
    const principal=requirePrincipal(req,res,true);if(!principal)return;
    try{
      const type=String(req.body?.inspectionType||'').toUpperCase();
      const odometer=Number(req.body?.odometer);
      const fuelLevel=Number(req.body?.fuelLevel);
      if(!TYPES.has(type)||!Number.isInteger(odometer)||odometer<0||!Number.isInteger(fuelLevel)||fuelLevel<0||fuelLevel>100) throw new ValidationError();

      const created=await UnitOfWork.run(principal.companyId,async context=>{
        const vehicle=await context.getVehicleRepo().findByIdForCompanyWithLock(principal.companyId,req.params.id);
        if(!vehicle||vehicle.isArchived) throw new NotFoundError();
        if(vehicle.status===VehicleStatus.SOLD||vehicle.status===VehicleStatus.ARCHIVED) throw new ValidationError();
        const driverId=optionalText(req.body?.driverId,120)||vehicle.currentDriverId||undefined;
        const contractId=optionalText(req.body?.contractId,120)||vehicle.currentContractId||undefined;
        if(driverId){
          const driver=await context.getDriverRepo().findByIdForCompany(principal.companyId,driverId);
          if(!driver||driver.isArchived) throw new NotFoundError();
        }
        if(contractId){
          const contract=await context.getContractRepo().findByIdForCompany(principal.companyId,contractId);
          if(!contract||contract.vehicleId!==vehicle.id) throw new ValidationError();
        }
        const technical=technicalChecklist(req.body?.technicalChecklist);
        const result=deriveInspectionResult(technical);
        const now=new Date().toISOString();
        const tx=context.getRawTransaction?.();if(!tx) throw new Error('Raw tenant transaction unavailable');
        const rows=await tx.insert(vehicleInspections).values({
          id:randomUUID(),companyId:principal.companyId,vehicleId:vehicle.id,driverId,contractId,
          inspectionType:type,inspectionDate:now,odometer,fuelLevel,
          checklist:inspectionChecklistPayload(checklist(req.body?.checklist),technical,result),
          notes:optionalText(req.body?.notes),createdBy:principal.userId,createdAt:now,updatedAt:now,
        }).returning();
        const created=rows[0];if(!created) throw new Error('Inspection create failed');

        await recordVehicleKm(context,principal.companyId,{
          vehicleId:vehicle.id,driverId,contractId,
          kmValue:odometer,recordDate:now.slice(0,10),readingType:type==='ENTRY'?'CHECK_IN':'CHECK_OUT',
          notes:`Vistoria de ${type==='ENTRY'?'entrada':'saída'}`,
        });

        if(result==='BLOCKED_FOR_RENTAL'&&vehicle.status!==VehicleStatus.BLOCKED){
          await context.getVehicleRepo().updateForCompany(principal.companyId,vehicle.id,{status:VehicleStatus.BLOCKED,updatedAt:now});
          await context.getAuditLogRepo().create({
            id:randomUUID(),companyId:principal.companyId,entityName:'Vehicle',entityId:vehicle.id,
            action:AuditAction.UPDATE,userId:principal.userId,userName:principal.name,timestamp:now,
            oldState:JSON.stringify({status:vehicle.status}),
            newState:JSON.stringify({status:VehicleStatus.BLOCKED,reason:'INSPECTION_CRITICAL_FAILURE',inspectionId:created.id}),
          });
        }

        await context.getAuditLogRepo().create({
          id:randomUUID(),companyId:principal.companyId,entityName:'VehicleInspection',entityId:created.id,
          action:AuditAction.CREATE,userId:principal.userId,userName:principal.name,timestamp:now,
          newState:JSON.stringify({event:'CREATE',vehicleId:vehicle.id,inspectionType:type,odometer,fuelLevel,driverId,contractId,result}),
        });
        return created;
      });
      res.status(201).json({item:item(created)});
    }catch(error){sendError(res,error);}
  });
}
