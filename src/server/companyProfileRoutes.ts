import { randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/index';
import { companies } from '../db/schema';
import { UnitOfWork } from '../db/uow';
import { AuditAction } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';

const ROLES = new Set(['ADMIN','MANAGER','OPERATIONAL_MANAGER','FINANCIAL','OPERATIONAL','READONLY']);
const WRITE_ROLES = new Set(['ADMIN','MANAGER']);

function principalFrom(req: Request): AuthenticatedPrincipal | undefined {
  return (req as Request & { principal?: AuthenticatedPrincipal }).principal;
}
function requirePrincipal(req: Request, res: Response, write = false): AuthenticatedPrincipal | null {
  const principal = principalFrom(req);
  if (!principal) { res.status(401).json({ error:'Unauthorized: Authentication required' }); return null; }
  const role=String(principal.role||'').toUpperCase();
  const permissions = Array.isArray(principal.permissions) ? principal.permissions : [];
  if (permissions.includes('*')) return principal;
  if (permissions.length > 0) {
    if (write) {
      if (!permissions.includes('MANAGE_TENANT')) {
        res.status(403).json({ error: 'Forbidden' });
        return null;
      }
    }
    return principal;
  }
  if (!principal.userId || !principal.companyId || !ROLES.has(role) || (write && !WRITE_ROLES.has(role))) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return principal;
}
function optional(value: unknown, max = 180): string | null {
  if (value === undefined || value === null) return null;
  const clean=String(value).trim();
  if(clean.length>max) throw new Error('VALIDATION');
  return clean || null;
}
function required(value: unknown, max = 180): string {
  const clean=optional(value,max);
  if(!clean) throw new Error('VALIDATION');
  return clean;
}
function profile(row:any){
  return {
    id:String(row.id), name:String(row.name), tradeName:row.tradeName ?? '',
    document:row.document ?? '', email:row.email ?? '', phone:row.phone ?? '', whatsapp:row.whatsapp ?? '',
    address:{street:row.addressStreet ?? '',number:row.addressNumber ?? '',complement:row.addressComplement ?? '',
      neighborhood:row.addressNeighborhood ?? '',city:row.addressCity ?? '',state:row.addressState ?? '',zipCode:row.addressZipCode ?? ''},
    legalRepresentative:{name:row.legalRepresentativeName ?? '',cpf:row.legalRepresentativeCpf ?? ''},
    updatedAt:String(row.updatedAt)
  };
}
export function registerCompanyProfileRoutes(app: Express): void {
  app.get('/api/company-profile', async (req,res)=>{
    const principal=requirePrincipal(req,res); if(!principal) return;
    const rows=await db.select().from(companies).where(eq(companies.id,principal.companyId)).limit(1);
    if(!rows[0]) { res.status(404).json({error:'Not found'}); return; }
    res.json({item:profile(rows[0])});
  });

  app.patch('/api/company-profile', async (req,res)=>{
    const principal=requirePrincipal(req,res,true); if(!principal) return;
    const body=req.body && typeof req.body==='object' && !Array.isArray(req.body) ? req.body as Record<string,unknown> : {};
    const address=body.address && typeof body.address==='object' && !Array.isArray(body.address) ? body.address as Record<string,unknown> : {};
    const legal=body.legalRepresentative && typeof body.legalRepresentative==='object' && !Array.isArray(body.legalRepresentative) ? body.legalRepresentative as Record<string,unknown> : {};
    try{
      const now=new Date().toISOString();
      const patch={
        name: required(body.name,180),
        tradeName: optional(body.tradeName,180),
        document: optional(body.document,30),
        email: optional(body.email,180),
        phone: optional(body.phone,40),
        whatsapp: optional(body.whatsapp,40),
        addressStreet: optional(address.street,180),
        addressNumber: optional(address.number,40),
        addressComplement: optional(address.complement,120),
        addressNeighborhood: optional(address.neighborhood,120),
        addressCity: optional(address.city,120),
        addressState: optional(address.state,40),
        addressZipCode: optional(address.zipCode,20),
        legalRepresentativeName: optional(legal.name,180),
        legalRepresentativeCpf: optional(legal.cpf,30),
        updatedAt: now,
      };
      const rows=await db.update(companies).set(patch).where(eq(companies.id,principal.companyId)).returning();
      if(!rows[0]) { res.status(404).json({error:'Not found'}); return; }
      await UnitOfWork.run(principal.companyId, async tx=>{
        await tx.getAuditLogRepo().create({
          id:randomUUID(),companyId:principal.companyId,entityName:'CompanyProfile',entityId:principal.companyId,
          action:AuditAction.UPDATE,userId:principal.userId,userName:principal.name,
          newState:JSON.stringify({event:'UPDATE_COMPANY_PROFILE'}),timestamp:now
        });
      });
      res.json({item:profile(rows[0])});
    }catch(error){
      if(error instanceof Error && error.message==='VALIDATION'){res.status(400).json({error:'Invalid company profile'});return;}
      console.error('AUTOERP_COMPANY_PROFILE_FAILURE',error);res.status(500).json({error:'Company profile operation failed'});
    }
  });
}
