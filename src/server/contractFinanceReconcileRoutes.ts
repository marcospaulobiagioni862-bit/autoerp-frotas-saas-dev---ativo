import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Express, Request, Response } from 'express';
import { UnitOfWork } from '../db/uow';
import { roundCurrency } from '../shared/utils/currency';
import { AuditAction, ContractStatus, ObligationStatus, OriginType } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';
import { ensureContractCloseReceivables } from './contractFinanceAuthority';

const WRITE_ROLES=new Set(['ADMIN','MANAGER','OPERATIONAL_MANAGER','OPERATIONAL']);

function principal(req:Request,res:Response):AuthenticatedPrincipal|null{
  const actor=(req as Request&{principal?:AuthenticatedPrincipal}).principal;
  if(!actor){res.status(401).json({error:'Unauthorized: Authentication required'});return null;}
  const role=String(actor.role||'').toUpperCase();
  const permissions=Array.isArray(actor.permissions)?actor.permissions:[];
  if(!permissions.includes('*')&&!permissions.includes('CLOSE_CONTRACT')&&!WRITE_ROLES.has(role)){
    res.status(403).json({error:'Forbidden'});return null;
  }
  return actor;
}

function sendError(res:Response,error:unknown):void{
  const message=error instanceof Error?error.message:'';
  if(message==='Contract finance reconciliation unavailable'){res.status(409).json({error:'Contract finance reconciliation unavailable'});return;}
  if(message.startsWith('Acesso negado:')){res.status(403).json({error:'Forbidden'});return;}
  if(message.includes('período financeiro')||message.includes('Período')){res.status(409).json({error:'Contract financial conflict'});return;}
  console.error('AUTOERP_CONTRACT_FINANCE_RECONCILE_FAILURE',error);
  res.status(500).json({error:'Contract finance reconciliation failed'});
}

export function registerContractFinanceReconcileRoutes(app:Express):void{
  app.post('/api/contracts/:id/reconcile-close-finance',async(req:Request,res:Response)=>{
    const actor=principal(req,res);if(!actor)return;
    try{
      const items=await UnitOfWork.run(actor.companyId,async(tx)=>{
        const contract=await tx.getContractRepo().findByIdForCompanyWithLock(actor.companyId,req.params.id);
        if(!contract||contract.isArchived||![ContractStatus.CLOSED,ContractStatus.FINISHED].includes(contract.status)||!contract.endDate){
          throw new Error('Contract finance reconciliation unavailable');
        }
        return ensureContractCloseReceivables(contract,contract.endDate,actor,tx);
      });
      res.json({items});
    }catch(error){sendError(res,error);}
  });

  app.post('/api/contracts/:id/reconcile-deposit-receivable',async(req:Request,res:Response)=>{
    const actor=principal(req,res);if(!actor)return;
    try{
      const item=await UnitOfWork.run(actor.companyId,async(tx)=>{
        const contract=await tx.getContractRepo().findByIdForCompanyWithLock(actor.companyId,req.params.id);
        if(!contract||contract.isArchived)throw new Error('Contract finance reconciliation unavailable');
        const deposit=await tx.getSecurityDepositRepo().findByContractId(contract.id);
        if(!deposit||deposit.companyId!==actor.companyId)return null;
        const receivables=await tx.getReceivableRepo().findByContractId(contract.id);
        const receivable=receivables.find((candidate)=>
          candidate.companyId===actor.companyId&&
          candidate.originType===OriginType.SECURITY_DEPOSIT&&
          candidate.originId===`${contract.id}:deposit`&&
          candidate.status!==ObligationStatus.CANCELLED
        );
        if(!receivable)return null;
        const paidAmount=roundCurrency(Math.min(Number(deposit.receivedAmount),Number(receivable.updatedAmount)));
        const balanceAmount=roundCurrency(Math.max(0,Number(receivable.updatedAmount)-paidAmount));
        const status=balanceAmount<=0.01
          ? ObligationStatus.PAID
          : paidAmount>0?ObligationStatus.PARTIALLY_PAID:ObligationStatus.PENDING;
        let updated=receivable;
        if(roundCurrency(Number(receivable.paidAmount))!==paidAmount||roundCurrency(Number(receivable.balanceAmount))!==balanceAmount||receivable.status!==status){
          const now=new Date().toISOString();
          updated=await tx.getReceivableRepo().update(receivable.id,{paidAmount,balanceAmount,status,updatedAt:now});
          await tx.getAuditLogRepo().create({
            id:randomUUID(),companyId:actor.companyId,entityName:'AccountReceivable',entityId:receivable.id,
            action:AuditAction.UPDATE,userId:actor.userId,userName:actor.name,timestamp:now,
            previousState:JSON.stringify(receivable),newState:JSON.stringify(updated),
          });
        }
        const raw=tx.getRawTransaction?.();
        if(raw){
          await raw.execute(sql`
            UPDATE financial_transactions ft
            SET receivable_id=${receivable.id}, updated_at=NOW()
            FROM security_deposit_movements sdm
            WHERE sdm.company_id=${actor.companyId}
              AND sdm.deposit_id=${deposit.id}
              AND sdm.type='RECEIPT'
              AND sdm.financial_transaction_id=ft.id
              AND ft.company_id=${actor.companyId}
              AND ft.receivable_id IS NULL
          `);
          await raw.execute(sql`
            UPDATE security_deposit_movements
            SET receivable_id=${receivable.id}
            WHERE company_id=${actor.companyId}
              AND deposit_id=${deposit.id}
              AND type='RECEIPT'
              AND receivable_id IS NULL
          `);
        }
        return updated;
      });
      res.json({item});
    }catch(error){sendError(res,error);}
  });
}
