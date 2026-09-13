import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { AuditAction } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';
import { MaintenanceConflictError, MaintenanceNotFoundError, MaintenanceValidationError } from './maintenanceAuthority';

export type PartStockManualMovementType='ENTRY'|'ADJUSTMENT_IN'|'ADJUSTMENT_OUT'|'RETURN'|'LOSS';
export interface PartStockMovement {
  id:string; companyId:string; partId:string; movementType:PartStockManualMovementType|'USE_WORK_ORDER'|'REVERSAL'; quantityDelta:number; balanceAfter:number;
  workOrderId?:string; vehicleId?:string; reason?:string; reversedMovementId?:string; idempotencyKey:string; userId:string; userName:string; createdAt:string;
}
export interface MovePartStockInput { movementType:PartStockManualMovementType; quantity:number; reason?:string; idempotencyKey:string; }

const MANUAL_TYPES:readonly PartStockManualMovementType[]=['ENTRY','ADJUSTMENT_IN','ADJUSTMENT_OUT','RETURN','LOSS'];
const ALL_TYPES:readonly PartStockMovement['movementType'][]=[...MANUAL_TYPES,'USE_WORK_ORDER','REVERSAL'];
const rows=(result:any):any[]=>Array.isArray(result?.rows)?result.rows:[];
function parseMovementType(value:unknown):PartStockMovement['movementType']{
  const type=String(value) as PartStockMovement['movementType'];
  if(!ALL_TYPES.includes(type))throw new Error('Invalid stock movement type');
  return type;
}
const movement=(row:any):PartStockMovement=>({
  id:String(row.id),companyId:String(row.company_id),partId:String(row.part_id),movementType:parseMovementType(row.movement_type),quantityDelta:Number(row.quantity_delta),balanceAfter:Number(row.balance_after),
  workOrderId:row.work_order_id?String(row.work_order_id):undefined,vehicleId:row.vehicle_id?String(row.vehicle_id):undefined,reason:row.reason?String(row.reason):undefined,reversedMovementId:row.reversed_movement_id?String(row.reversed_movement_id):undefined,
  idempotencyKey:String(row.idempotency_key),userId:String(row.user_id),userName:String(row.user_name),createdAt:row.created_at instanceof Date?row.created_at.toISOString():String(row.created_at),
});
const text=(value:unknown,field:string,max:number):string=>{const result=typeof value==='string'?value.trim():'';if(!result||result.length>max)throw new MaintenanceValidationError(`Invalid ${field}`);return result;};
const quantity=(value:unknown):number=>{const n=Number(value);if(!Number.isFinite(n)||n<=0)throw new MaintenanceValidationError('Invalid quantity');return n;};

export class MaintenancePartStockAuthority {
  static list(companyId:string,partId:string):Promise<PartStockMovement[]> { return UnitOfWork.run(companyId,async tx=>{
    const raw=tx.getRawTransaction?.();if(!raw)throw new Error('Maintenance persistence unavailable');
    const part=await tx.getPartRepo().findByIdForCompany(companyId,partId);if(!part)throw new MaintenanceNotFoundError('Peça não encontrada');
    const result=await raw.execute(sql`SELECT * FROM part_stock_movements WHERE company_id=${companyId} AND part_id=${partId} ORDER BY created_at DESC,id DESC`);
    return rows(result).map(movement);
  }); }

  static move(p:AuthenticatedPrincipal,partId:string,input:MovePartStockInput):Promise<{part:any;movement:PartStockMovement}> { return UnitOfWork.run(p.companyId,async tx=>{
    const raw=tx.getRawTransaction?.();if(!raw)throw new Error('Maintenance persistence unavailable');
    const idempotencyKey=text(input.idempotencyKey,'idempotencyKey',200);
    const existingRows=rows(await raw.execute(sql`SELECT * FROM part_stock_movements WHERE company_id=${p.companyId} AND idempotency_key=${idempotencyKey} LIMIT 1`));
    if(existingRows[0]){
      const existing=movement(existingRows[0]);
      if(existing.partId!==partId)throw new MaintenanceConflictError('Chave de idempotência já usada em outra peça');
      const current=await tx.getPartRepo().findByIdForCompany(p.companyId,partId);if(!current)throw new MaintenanceNotFoundError('Peça não encontrada');
      return {part:current,movement:existing};
    }
    const part=await tx.getPartRepo().findByIdForCompanyWithLock(p.companyId,partId);if(!part)throw new MaintenanceNotFoundError('Peça não encontrada');
    if(part.status!=='ACTIVE')throw new MaintenanceConflictError('Peça arquivada não aceita movimentação');
    const type:PartStockManualMovementType=input.movementType;
    if(!MANUAL_TYPES.includes(type))throw new MaintenanceValidationError('Invalid movement type');
    const q=quantity(input.quantity),positive=type==='ENTRY'||type==='ADJUSTMENT_IN'||type==='RETURN',delta=positive?q:-q;
    if((type==='ADJUSTMENT_IN'||type==='ADJUSTMENT_OUT'||type==='LOSS')&&!String(input.reason||'').trim())throw new MaintenanceValidationError('Motivo obrigatório');
    const next=Number(part.currentStock)+delta;if(next<0)throw new MaintenanceConflictError('Estoque insuficiente para movimentação');
    const reason=input.reason===undefined?undefined:text(input.reason,'reason',500),now=new Date().toISOString(),id=randomUUID();
    const updated=await tx.getPartRepo().updateForCompany(p.companyId,partId,{...part,currentStock:next,updatedAt:now});if(!updated)throw new MaintenanceNotFoundError('Peça não encontrada');
    const inserted=rows(await raw.execute(sql`
      INSERT INTO part_stock_movements (id,company_id,part_id,movement_type,quantity_delta,balance_after,reason,idempotency_key,user_id,user_name,created_at)
      VALUES (${id},${p.companyId},${partId},${type},${String(delta)},${String(next)},${reason||null},${idempotencyKey},${p.userId},${p.name},${now}) RETURNING *
    `))[0];
    const created=movement(inserted);
    await tx.getAuditLogRepo().create({id:randomUUID(),companyId:p.companyId,entityName:'PartStockMovement',entityId:id,action:AuditAction.CREATE,newState:JSON.stringify(created),userId:p.userId,userName:p.name,timestamp:now});
    return {part:updated,movement:created};
  }); }

  static reverse(p:AuthenticatedPrincipal,partId:string,movementId:string,reasonValue:unknown):Promise<{part:any;movement:PartStockMovement}> { return UnitOfWork.run(p.companyId,async tx=>{
    const raw=tx.getRawTransaction?.();if(!raw)throw new Error('Maintenance persistence unavailable');
    const reason=text(reasonValue,'reason',500),key=`reverse:${movementId}`;
    const existingReverse=rows(await raw.execute(sql`SELECT * FROM part_stock_movements WHERE company_id=${p.companyId} AND idempotency_key=${key} LIMIT 1`))[0];
    if(existingReverse){
      const existing=movement(existingReverse);if(existing.partId!==partId)throw new MaintenanceConflictError('Estorno pertence a outra peça');
      const current=await tx.getPartRepo().findByIdForCompany(p.companyId,partId);if(!current)throw new MaintenanceNotFoundError('Peça não encontrada');
      return {part:current,movement:existing};
    }
    const originalRow=rows(await raw.execute(sql`SELECT * FROM part_stock_movements WHERE company_id=${p.companyId} AND part_id=${partId} AND id=${movementId} LIMIT 1`))[0];
    if(!originalRow)throw new MaintenanceNotFoundError('Movimento não encontrado');
    const original=movement(originalRow);if(original.movementType==='REVERSAL')throw new MaintenanceConflictError('Movimento de estorno não pode ser estornado novamente');
    const alreadyReversed=rows(await raw.execute(sql`SELECT id FROM part_stock_movements WHERE company_id=${p.companyId} AND reversed_movement_id=${movementId} LIMIT 1`))[0];if(alreadyReversed)throw new MaintenanceConflictError('Movimento já estornado');
    const part=await tx.getPartRepo().findByIdForCompanyWithLock(p.companyId,partId);if(!part)throw new MaintenanceNotFoundError('Peça não encontrada');
    const delta=-original.quantityDelta,next=Number(part.currentStock)+delta;if(next<0)throw new MaintenanceConflictError('Estorno deixaria estoque negativo');
    const now=new Date().toISOString(),id=randomUUID();
    const updated=await tx.getPartRepo().updateForCompany(p.companyId,partId,{...part,currentStock:next,updatedAt:now});if(!updated)throw new MaintenanceNotFoundError('Peça não encontrada');
    const inserted=rows(await raw.execute(sql`
      INSERT INTO part_stock_movements (id,company_id,part_id,movement_type,quantity_delta,balance_after,work_order_id,vehicle_id,reason,reversed_movement_id,idempotency_key,user_id,user_name,created_at)
      VALUES (${id},${p.companyId},${partId},'REVERSAL',${String(delta)},${String(next)},${original.workOrderId||null},${original.vehicleId||null},${reason},${movementId},${key},${p.userId},${p.name},${now}) RETURNING *
    `))[0];
    const created=movement(inserted);
    await tx.getAuditLogRepo().create({id:randomUUID(),companyId:p.companyId,entityName:'PartStockMovement',entityId:id,action:AuditAction.CREATE,previousState:JSON.stringify(original),newState:JSON.stringify(created),userId:p.userId,userName:p.name,timestamp:now});
    return {part:updated,movement:created};
  }); }
}
