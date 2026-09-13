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

const rows=(result:any):any[]=>Array.isArray(result?.rows)?result.rows:[];
const movement=(row:any):PartStockMovement=>({
  id:String(row.id),companyId:String(row.company_id),partId:String(row.part_id),movementType:String(row.movement_type) as PartStockMovement['movementType'],quantityDelta:Number(row.quantity_delta),balanceAfter:Number(row.balance_after),
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
    const existingRows=rows(await raw.execute(sql`SELECT * FROM part_stock_movements WHERE company_id=${p.companyId} AND idempotency_key=${text(input.idempotencyKey,'idempotencyKey',200)} LIMIT 1`));
    if(existingRows[0]){
      const existing=movement(existingRows[0]);
      if(existing.partId!==partId)throw new MaintenanceConflictError('Chave de idempotência já usada em outra peça');
      const current=await tx.getPartRepo().findByIdForCompany(p.companyId,partId);if(!current)throw new MaintenanceNotFoundError('Peça não encontrada');
      return {part:current,movement:existing};
    }
    const part=await tx.getPartRepo().findByIdForCompanyWithLock(p.companyId,partId);if(!part)throw new MaintenanceNotFoundError('Peça não encontrada');
    if(part.status!=='ACTIVE')throw new MaintenanceConflictError('Peça arquivada não aceita movimentação');
    const type=input.movementType;if(!['ENTRY','ADJUSTMENT_IN','ADJUSTMENT_OUT','RETURN','LOSS'].includes(type))throw new MaintenanceValidationError('Invalid movement type');
    const q=quantity(input.quantity),positive=type==='ENTRY'||type==='ADJUSTMENT_IN'||type==='RETURN',delta=positive?q:-q;
    if(['ADJUSTMENT_IN','ADJUSTMENT_OUT','LOSS'].includes(type)&&!String(input.reason||'').trim())throw new MaintenanceValidationError('Motivo obrigatório');
    const next=Number(part.currentStock)+delta;if(next<0)throw new MaintenanceConflictError('Estoque insuficiente para movimentação');
    const reason=input.reason===undefined?undefined:text(input.reason,'reason',500),now=new Date().toISOString(),id=randomUUID();
    const updated=await tx.getPartRepo().updateForCompany(p.companyId,partId,{...part,currentStock:next,updatedAt:now});if(!updated)throw new MaintenanceNotFoundError('Peça não encontrada');
    const inserted=rows(await raw.execute(sql`
      INSERT INTO part_stock_movements (id,company_id,part_id,movement_type,quantity_delta,balance_after,reason,idempotency_key,user_id,user_name,created_at)
      VALUES (${id},${p.companyId},${partId},${type},${String(delta)},${String(next)},${reason||null},${input.idempotencyKey.trim()},${p.userId},${p.name},${now}) RETURNING *
    `))[0];
    const created=movement(inserted);
    await tx.getAuditLogRepo().create({id:randomUUID(),companyId:p.companyId,entityName:'PartStockMovement',entityId:id,action:AuditAction.CREATE,newState:JSON.stringify(created),userId:p.userId,userName:p.name,timestamp:now});
    return {part:updated,movement:created};
  }); }

  static consumeForWorkOrder(tx:any,p:AuthenticatedPrincipal,workOrder:any):Promise<void>{
    const raw=tx.getRawTransaction?.();if(!raw)throw new Error('Maintenance persistence unavailable');
    for(const item of workOrder.parts||[]){
      if(!item.partId)continue;
      const key=`work-order-use:${workOrder.id}:${item.id}`;
      const existing=rows(await raw.execute(sql`SELECT id FROM part_stock_movements WHERE company_id=${p.companyId} AND idempotency_key=${key} LIMIT 1`))[0];if(existing)continue;
      const part=await tx.getPartRepo().findByIdForCompanyWithLock(p.companyId,item.partId);if(!part)throw new MaintenanceNotFoundError('Peça não encontrada');if(part.status!=='ACTIVE')throw new MaintenanceConflictError('Peça arquivada não pode ser consumida');
      const q=quantity(item.quantity),next=Number(part.currentStock)-q;if(next<0)throw new MaintenanceConflictError(`Estoque insuficiente para ${part.name}`);
      const now=new Date().toISOString();const updated=await tx.getPartRepo().updateForCompany(p.companyId,part.id,{...part,currentStock:next,updatedAt:now});if(!updated)throw new MaintenanceNotFoundError('Peça não encontrada');
      const id=randomUUID();const inserted=rows(await raw.execute(sql`
        INSERT INTO part_stock_movements (id,company_id,part_id,movement_type,quantity_delta,balance_after,work_order_id,vehicle_id,reason,idempotency_key,user_id,user_name,created_at)
        VALUES (${id},${p.companyId},${part.id},'USE_WORK_ORDER',${String(-q)},${String(next)},${workOrder.id},${workOrder.vehicleId},'Consumo confirmado na conclusão da OS',${key},${p.userId},${p.name},${now}) RETURNING *
      `))[0];
      await tx.getAuditLogRepo().create({id:randomUUID(),companyId:p.companyId,entityName:'PartStockMovement',entityId:id,action:AuditAction.CREATE,newState:JSON.stringify(movement(inserted)),userId:p.userId,userName:p.name,timestamp:now});
    }
  }
}
