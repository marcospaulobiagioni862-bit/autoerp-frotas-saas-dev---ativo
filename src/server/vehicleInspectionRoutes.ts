import { randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { vehicleInspections } from '../db/schema';
import { AuditAction } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';

const ROLES=new Set(['ADMIN','MANAGER','OPERATIONAL_MANAGER','FINANCIAL','OPERATIONAL','READONLY']);
const WRITE_ROLES=new Set(['ADMIN','MANAGER','OPERATIONAL_MANAGER','OPERATIONAL']);
const TYPES=new Set(['ENTRY','EXIT']);
const CHECKLIST_KEYS=[
  'keyMain','keySpare','crlvPrinted','phoneHolder','jack','triangle',
  'wheelWrench','spareTire','seatCover','ownerManual','floorMats','multimedia',
] as const;

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
function optionalText(value:unknown,max=2000):string|undefined{
  if(value===undefined||value===null||value==='') return undefined;
  const v=String(value).trim(); if(v.length>max) throw new ValidationError(); return v||undefined;
}
function item(row:any){
  return {
    id:String(row.id),companyId:String(row.companyId),vehicleId:String(row.vehicleId),
    driverId:row.driverId||undefined,contractId:row.contractId||undefined,
    inspectionType:String(row.inspectionType),inspectionDate:String(row.inspectionDate),
    odometer:Number(row.odometer),fuelLevel:Number(row.fuelLevel),
    checklist:row.checklist||{},notes:row.notes||undefined,
    createdBy:String(row.createdBy),createdAt:String(row.createdAt),updatedAt:String(row.updatedAt),
  };
}
function sendError(res:Response,error:unknown){
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
        if(odometer<vehicle.currentKm) throw new ValidationError();
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
        const now=new Date().toISOString();
        const tx=context.getRawTransaction?.();if(!tx) throw new Error('Raw tenant transaction unavailable');
        const rows=await tx.insert(vehicleInspections).values({
          id:randomUUID(),companyId:principal.companyId,vehicleId:vehicle.id,driverId,contractId,
          inspectionType:type,inspectionDate:now,odometer,fuelLevel,checklist:checklist(req.body?.checklist),
          notes:optionalText(req.body?.notes),createdBy:principal.userId,createdAt:now,updatedAt:now,
        }).returning();
        const created=rows[0];if(!created) throw new Error('Inspection create failed');

        if(odometer>vehicle.currentKm){
          await context.getKmRecordRepo().create({
            id:randomUUID(),companyId:principal.companyId,vehicleId:vehicle.id,driverId,contractId,
            kmValue:odometer,recordDate:now.slice(0,10),readingType:type==='ENTRY'?'CHECK_IN':'CHECK_OUT',
            notes:`Vistoria de ${type==='ENTRY'?'entrada':'saída'}`,createdAt:now,
          });
          await context.getVehicleRepo().updateForCompany(principal.companyId,vehicle.id,{currentKm:odometer,updatedAt:now});
        }

        await context.getAuditLogRepo().create({
          id:randomUUID(),companyId:principal.companyId,entityName:'VehicleInspection',entityId:created.id,
          action:AuditAction.CREATE,userId:principal.userId,userName:principal.name,timestamp:now,
          newState:JSON.stringify({event:'CREATE',vehicleId:vehicle.id,inspectionType:type,odometer,fuelLevel,driverId,contractId}),
        });
        return created;
      });
      res.status(201).json({item:item(created)});
    }catch(error){sendError(res,error);}
  });
}
