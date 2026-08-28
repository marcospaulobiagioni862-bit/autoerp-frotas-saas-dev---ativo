import type { Express, Request, Response } from 'express';
import type { AuthenticatedPrincipal } from './auth';
import type { CreditCardStatementActor } from './creditCardStatementAuthority';
import { CreditCardPurchaseCycleAuthority } from './creditCardPurchaseCycleAuthority';

class CreditCardPurchaseCycleValidationError extends Error {}
function principal(req: Request): AuthenticatedPrincipal | undefined { return (req as Request & { principal?: AuthenticatedPrincipal }).principal; }
function requirePrincipal(req: Request, res: Response): AuthenticatedPrincipal | null { const p=principal(req); if(!p){res.status(401).json({error:'Unauthorized: Authentication required'});return null;} return p; }
function actor(p: AuthenticatedPrincipal): CreditCardStatementActor { return { companyId:p.companyId,userId:p.userId,name:p.name }; }
function body(value: unknown): Record<string, unknown> { if(value===undefined||value===null) return {}; if(typeof value!=='object'||Array.isArray(value)) throw new CreditCardPurchaseCycleValidationError(); return value as Record<string,unknown>; }
function only(value: Record<string,unknown>, allowed: string[]): void { const set=new Set(allowed); if(!Object.keys(value).every(k=>set.has(k))) throw new CreditCardPurchaseCycleValidationError(); }
function text(value: unknown,max=200): string { const v=typeof value==='string'?value.trim():''; if(!v||v.length>max) throw new CreditCardPurchaseCycleValidationError(); return v; }
function optionalText(value: unknown,max=200): string|undefined { if(value===undefined||value===null||value==='') return undefined; return text(value,max); }
function send(res: Response,error: unknown): void { const m=error instanceof Error?error.message:''; if(error instanceof CreditCardPurchaseCycleValidationError){res.status(400).json({error:'Invalid credit-card purchase cycle request'});return;} if(m.startsWith('Acesso negado:')){res.status(403).json({error:'Forbidden'});return;} if(m.includes('não encontrada')||m.includes('não encontrado')){res.status(404).json({error:'Not found'});return;} if(m.includes('incompatível')||m.includes('inativo')||m.includes('inativa')||m.includes('revertida')||m.includes('já vinculada')||m.includes('Nenhuma fatura aberta')){res.status(409).json({error:'Credit-card purchase cycle conflict'});return;} console.error('AUTOERP_CREDIT_CARD_PURCHASE_CYCLE_API_FAILURE',error);res.status(500).json({error:'Credit-card purchase cycle operation failed'}); }

export function registerCreditCardPurchaseCycleRoutes(app: Express): void {
  app.post('/api/finance/credit-cards/purchases/:transactionId/statement-item',async(req,res)=>{
    const p=requirePrincipal(req,res);if(!p)return;
    try{
      const b=body(req.body);only(b,['payableId','originType','originId']);
      const result=await CreditCardPurchaseCycleAuthority.linkPurchase(actor(p),text(req.params.transactionId),{
        payableId:optionalText(b.payableId),originType:optionalText(b.originType),originId:optionalText(b.originId),
      });
      res.status(result.replayed?200:201).json(result);
    }catch(e){send(res,e);}
  });
}
