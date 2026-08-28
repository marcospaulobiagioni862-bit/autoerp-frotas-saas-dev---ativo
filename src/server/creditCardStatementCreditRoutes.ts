import type { Express, Request, Response } from 'express';
import type { AuthenticatedPrincipal } from './auth';
import { CreditCardStatementCreditAuthority } from './creditCardStatementCreditAuthority';

class CreditCardCreditValidationError extends Error {}
function principal(req: Request): AuthenticatedPrincipal | undefined { return (req as Request & { principal?: AuthenticatedPrincipal }).principal; }
function text(value: unknown, max=200): string { const v=typeof value==='string'?value.trim():''; if(!v||v.length>max) throw new CreditCardCreditValidationError(); return v; }
function amount(value: unknown): number { const v=Number(value); if(!Number.isFinite(v)||v<=0||Math.abs(v)>999999999.99) throw new CreditCardCreditValidationError(); return Math.round(v*100)/100; }
function body(value: unknown): Record<string,unknown> { if(!value||typeof value!=='object'||Array.isArray(value)) throw new CreditCardCreditValidationError(); return value as Record<string,unknown>; }
function only(value: Record<string,unknown>, allowed: string[]): void { const set=new Set(allowed); if(!Object.keys(value).every(k=>set.has(k))) throw new CreditCardCreditValidationError(); }
function send(res: Response,error: unknown): void { const m=error instanceof Error?error.message:''; if(error instanceof CreditCardCreditValidationError){res.status(400).json({error:'Invalid credit-card credit request'});return;} if(m.startsWith('Acesso negado:')){res.status(403).json({error:'Forbidden'});return;} if(m.includes('não encontrada')||m.includes('não encontrado')||m.includes('não pertence')){res.status(404).json({error:'Not found'});return;} if(m.includes('elegível')||m.includes('excede')||m.includes('divergente')||m.includes('inválido')){res.status(409).json({error:'Credit-card credit conflict'});return;} console.error('AUTOERP_CREDIT_CARD_CREDIT_API_FAILURE',error);res.status(500).json({error:'Credit-card credit operation failed'}); }

export function registerCreditCardStatementCreditRoutes(app: Express): void {
  app.post('/api/finance/credit-cards/statements/:id/credits',async(req,res)=>{
    const p=principal(req); if(!p){res.status(401).json({error:'Unauthorized: Authentication required'});return;}
    try {
      const b=body(req.body); only(b,['financialTransactionId','amount','reason','idempotencyKey']);
      res.status(201).json(await CreditCardStatementCreditAuthority.apply(
        {companyId:p.companyId,userId:p.userId,name:p.name}, text(req.params.id),
        {financialTransactionId:text(b.financialTransactionId),amount:amount(b.amount),reason:text(b.reason,1000),idempotencyKey:text(b.idempotencyKey,200)}
      ));
    } catch(e) { send(res,e); }
  });
}
