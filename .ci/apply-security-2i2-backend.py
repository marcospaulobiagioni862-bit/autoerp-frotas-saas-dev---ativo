from pathlib import Path
import json


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


Path('drizzle/0010_driver_core_authority.sql').write_text(r'''-- SECURITY-2I2: Driver core server authority.
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS rg text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS birth_date text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '';
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS whatsapp text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS address_street text NOT NULL DEFAULT '';
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS address_number text NOT NULL DEFAULT '';
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS address_complement text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS address_neighborhood text NOT NULL DEFAULT '';
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS address_city text NOT NULL DEFAULT '';
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS address_state text NOT NULL DEFAULT '';
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS address_zip_code text NOT NULL DEFAULT '';
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS cnh_category text NOT NULL DEFAULT 'B';
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS cnh_expiration text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS app_platforms text[] NOT NULL DEFAULT ARRAY['Uber','99']::text[];
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

UPDATE drivers SET status = CASE WHEN active THEN 'ACTIVE' ELSE 'INACTIVE' END WHERE status IS NULL;
ALTER TABLE drivers ALTER COLUMN status SET DEFAULT 'ACTIVE';
ALTER TABLE drivers ALTER COLUMN status SET NOT NULL;
ALTER TABLE drivers DROP CONSTRAINT IF EXISTS drivers_status_check;
ALTER TABLE drivers ADD CONSTRAINT drivers_status_check CHECK (status IN ('ACTIVE','INACTIVE','PENDING','PENDING_DOCS','BLOCKED','ARCHIVED'));

ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_dr ON drivers;
CREATE POLICY tenant_isolation_dr ON drivers
  AS PERMISSIVE
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
''', encoding='utf-8')

p=Path('drizzle/meta/_journal.json')
data=json.loads(p.read_text(encoding='utf-8'))
if not any(e.get('tag')=='0010_driver_core_authority' for e in data['entries']):
    data['entries'].append({'idx':10,'version':'7','when':1787112000000,'tag':'0010_driver_core_authority','breakpoints':True})
p.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')

Path('src/shared/utils/driverValidation.ts').write_text(r'''import { DocumentStatus } from '../../types/enums';

export function normalizeCpf(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}

export function isValidCPF(value: string): boolean {
  const clean = normalizeCpf(value);
  if (clean.length !== 11 || /^(\d)\1{10}$/.test(clean)) return false;
  let sum = 0;
  for (let i = 1; i <= 9; i++) sum += Number(clean.substring(i - 1, i)) * (11 - i);
  let remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== Number(clean.substring(9, 10))) return false;
  sum = 0;
  for (let i = 1; i <= 10; i++) sum += Number(clean.substring(i - 1, i)) * (12 - i);
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  return remainder === Number(clean.substring(10, 11));
}

export function normalizeCnh(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}

export function isValidCnh(value: string): boolean {
  const clean = normalizeCnh(value);
  return clean.length >= 8 && clean.length <= 11 && !/^(\d)\1+$/.test(clean);
}

export function isValidDateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y,m,d]=value.split('-').map(Number);
  const parsed=new Date(Date.UTC(y,m-1,d));
  return parsed.getUTCFullYear()===y && parsed.getUTCMonth()===m-1 && parsed.getUTCDate()===d;
}

export function todayDateOnly(): string {
  return new Date().toISOString().slice(0,10);
}

export function evaluateCnhStatus(expirationDateStr: string): {status:DocumentStatus;daysToExpiration:number;message:string} {
  if(!isValidDateOnly(expirationDateStr)) return {status:DocumentStatus.PENDING,daysToExpiration:0,message:'Validade da CNH pendente.'};
  const today=new Date(todayDateOnly()+'T00:00:00.000Z').getTime();
  const exp=new Date(expirationDateStr+'T00:00:00.000Z').getTime();
  const days=Math.round((exp-today)/86400000);
  if(days<0)return {status:DocumentStatus.EXPIRED,daysToExpiration:days,message:`CNH Vencida há ${Math.abs(days)} dias.`};
  if(days<=30)return {status:DocumentStatus.EXPIRING_SOON,daysToExpiration:days,message:`CNH Vence em ${days} dias.`};
  return {status:DocumentStatus.VALID,daysToExpiration:days,message:'CNH Válida.'};
}
''',encoding='utf-8')

p=Path('src/db/schema.ts'); text=p.read_text(encoding='utf-8')
old="""export const drivers = pgTable('drivers', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  name: text('name').notNull(),
  cpf: text('cpf').notNull(),
  cnh: text('cnh').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
}, (t) => ({
"""
new="""export const drivers = pgTable('drivers', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  name: text('name').notNull(),
  cpf: text('cpf').notNull(),
  cnh: text('cnh').notNull(),
  active: boolean('active').notNull().default(true),
  rg: text('rg'),
  birthDate: text('birth_date'),
  phone: text('phone').notNull().default(''),
  whatsapp: text('whatsapp'),
  email: text('email'),
  addressStreet: text('address_street').notNull().default(''),
  addressNumber: text('address_number').notNull().default(''),
  addressComplement: text('address_complement'),
  addressNeighborhood: text('address_neighborhood').notNull().default(''),
  addressCity: text('address_city').notNull().default(''),
  addressState: text('address_state').notNull().default(''),
  addressZipCode: text('address_zip_code').notNull().default(''),
  cnhCategory: text('cnh_category').notNull().default('B'),
  cnhExpiration: text('cnh_expiration'),
  appPlatforms: text('app_platforms').array().notNull(),
  status: text('status').notNull().default('ACTIVE'),
  photoUrl: text('photo_url'),
  notes: text('notes'),
  isArchived: boolean('is_archived').notNull().default(false),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
}, (t) => ({
"""
text=replace_once(text,old,new,'drivers schema');p.write_text(text,encoding='utf-8')

p=Path('src/domain/finance/ITransactionContext.ts');text=p.read_text(encoding='utf-8')
text=replace_once(text,"  KmRecord,\n} from '../../types/entities';","  KmRecord,\n  Driver,\n} from '../../types/entities';",'Driver type import')
iface="""export interface ITransactionDriverRepository {
  findByIdForCompany(companyId: string, id: string): Promise<Driver | null>;
  findAllByCompany(companyId: string): Promise<Driver[]>;
  findByCpf(companyId: string, cpf: string): Promise<Driver | null>;
  findByCnh(companyId: string, cnh: string): Promise<Driver | null>;
  create(item: Driver): Promise<Driver>;
  updateForCompany(companyId: string, id: string, item: Partial<Driver>): Promise<Driver | null>;
}

"""
text=replace_once(text,'export interface ITransactionKmRecordRepository {',iface+'export interface ITransactionKmRecordRepository {','driver repo iface')
text=replace_once(text,'  getVehicleRepo(): ITransactionVehicleRepository;\n','  getVehicleRepo(): ITransactionVehicleRepository;\n  getDriverRepo(): ITransactionDriverRepository;\n','driver getter');p.write_text(text,encoding='utf-8')

p=Path('src/db/repositories/postgresRepositories.ts');text=p.read_text(encoding='utf-8')
text=replace_once(text,'  securityDeposits, securityDepositMovements, driverHealthProfiles, vehicles, vehicleKmRecords\n','  securityDeposits, securityDepositMovements, driverHealthProfiles, vehicles, vehicleKmRecords, drivers\n','driver table import')
text=replace_once(text,"import { AuditLog, SecurityDeposit, SecurityDepositMovement, Vehicle, KmRecord } from '../../types/entities';","import { AuditLog, SecurityDeposit, SecurityDepositMovement, Vehicle, KmRecord, Driver } from '../../types/entities';\nimport { DriverStatus } from '../../types/enums';\nimport { evaluateCnhStatus } from '../../shared/utils/driverValidation';",'driver imports')
klass=r'''export class PostgresDriverRepository {
  private tx:any;
  constructor(tx?:any){this.tx=tx||db;}
  private map(row:any):Driver{return {
    id:row.id,companyId:row.companyId,fullName:row.name,cpf:row.cpf,rg:row.rg||undefined,
    birthDate:row.birthDate||'',phone:row.phone||'',whatsapp:row.whatsapp||row.phone||'',email:row.email||undefined,
    address:{street:row.addressStreet||'',number:row.addressNumber||'',complement:row.addressComplement||undefined,
      neighborhood:row.addressNeighborhood||'',city:row.addressCity||'',state:row.addressState||'',zipCode:row.addressZipCode||''},
    cnhNumber:row.cnh,cnhCategory:row.cnhCategory||'B',cnhExpiration:row.cnhExpiration||'',
    cnhStatus:evaluateCnhStatus(row.cnhExpiration||'').status,appPlatforms:Array.isArray(row.appPlatforms)?row.appPlatforms:[],
    status:row.status as DriverStatus,photoUrl:row.photoUrl||undefined,notes:row.notes||undefined,
    isArchived:Boolean(row.isArchived),createdAt:row.createdAt,updatedAt:row.updatedAt,
  };}
  async findByIdForCompany(companyId:string,id:string):Promise<Driver|null>{const rows=await this.tx.select().from(drivers).where(and(eq(drivers.companyId,companyId),eq(drivers.id,id))).limit(1);return rows[0]?this.map(rows[0]):null;}
  async findAllByCompany(companyId:string):Promise<Driver[]>{const rows=await this.tx.select().from(drivers).where(eq(drivers.companyId,companyId));return rows.map((r:any)=>this.map(r));}
  async findByCpf(companyId:string,cpf:string):Promise<Driver|null>{const rows=await this.tx.select().from(drivers).where(and(eq(drivers.companyId,companyId),eq(drivers.cpf,cpf))).limit(1);return rows[0]?this.map(rows[0]):null;}
  async findByCnh(companyId:string,cnh:string):Promise<Driver|null>{const rows=await this.tx.select().from(drivers).where(and(eq(drivers.companyId,companyId),eq(drivers.cnh,cnh))).limit(1);return rows[0]?this.map(rows[0]):null;}
  async create(item:Driver):Promise<Driver>{const rows=await this.tx.insert(drivers).values({
    id:item.id,companyId:item.companyId,name:item.fullName,cpf:item.cpf,cnh:item.cnhNumber,active:item.status===DriverStatus.ACTIVE&&!item.isArchived,
    rg:item.rg||null,birthDate:item.birthDate,phone:item.phone,whatsapp:item.whatsapp||null,email:item.email||null,
    addressStreet:item.address.street,addressNumber:item.address.number,addressComplement:item.address.complement||null,
    addressNeighborhood:item.address.neighborhood,addressCity:item.address.city,addressState:item.address.state,addressZipCode:item.address.zipCode,
    cnhCategory:item.cnhCategory,cnhExpiration:item.cnhExpiration,appPlatforms:item.appPlatforms,status:item.status,
    photoUrl:item.photoUrl||null,notes:item.notes||null,isArchived:item.isArchived,createdAt:item.createdAt,updatedAt:item.updatedAt,
  }).returning();return this.map(rows[0]);}
  async updateForCompany(companyId:string,id:string,item:Partial<Driver>):Promise<Driver|null>{const v:any={};
    if(item.fullName!==undefined)v.name=item.fullName;if(item.cpf!==undefined)v.cpf=item.cpf;if(item.cnhNumber!==undefined)v.cnh=item.cnhNumber;
    if(item.rg!==undefined)v.rg=item.rg||null;if(item.birthDate!==undefined)v.birthDate=item.birthDate;if(item.phone!==undefined)v.phone=item.phone;
    if(item.whatsapp!==undefined)v.whatsapp=item.whatsapp||null;if(item.email!==undefined)v.email=item.email||null;
    if(item.address!==undefined){v.addressStreet=item.address.street;v.addressNumber=item.address.number;v.addressComplement=item.address.complement||null;v.addressNeighborhood=item.address.neighborhood;v.addressCity=item.address.city;v.addressState=item.address.state;v.addressZipCode=item.address.zipCode;}
    if(item.cnhCategory!==undefined)v.cnhCategory=item.cnhCategory;if(item.cnhExpiration!==undefined)v.cnhExpiration=item.cnhExpiration;
    if(item.appPlatforms!==undefined)v.appPlatforms=item.appPlatforms;if(item.status!==undefined){v.status=item.status;v.active=item.status===DriverStatus.ACTIVE;}
    if(item.photoUrl!==undefined)v.photoUrl=item.photoUrl||null;if(item.notes!==undefined)v.notes=item.notes||null;
    if(item.isArchived!==undefined){v.isArchived=item.isArchived;if(item.isArchived)v.active=false;}if(item.updatedAt!==undefined)v.updatedAt=item.updatedAt;
    const rows=await this.tx.update(drivers).set(v).where(and(eq(drivers.companyId,companyId),eq(drivers.id,id))).returning();return rows[0]?this.map(rows[0]):null;}
}

'''
text=replace_once(text,'export class PostgresKmRecordRepository',klass+'export class PostgresKmRecordRepository','driver repo class');p.write_text(text,encoding='utf-8')

p=Path('src/db/uow.ts');text=p.read_text(encoding='utf-8')
text=replace_once(text,'  PostgresKmRecordRepository\n','  PostgresKmRecordRepository,\n  PostgresDriverRepository\n','uow driver import')
text=replace_once(text,'        getVehicleRepo: () => new PostgresVehicleRepository(tx),\n','        getVehicleRepo: () => new PostgresVehicleRepository(tx),\n        getDriverRepo: () => new PostgresDriverRepository(tx),\n','uow driver getter');p.write_text(text,encoding='utf-8')

Path('src/server/driverRoutes.ts').write_text(r'''import { randomUUID } from 'node:crypto';
import type { Express,Request,Response } from 'express';
import { UnitOfWork } from '../db/uow';
import { AuditAction,DriverStatus,DocumentStatus } from '../types/enums';
import type { Driver,Vehicle } from '../types/entities';
import type { AuthenticatedPrincipal } from './auth';
import { normalizeCpf,isValidCPF,normalizeCnh,isValidCnh,isValidDateOnly,todayDateOnly,evaluateCnhStatus } from '../shared/utils/driverValidation';

type Action='VIEW_DRIVER'|'CREATE_DRIVER'|'EDIT_DRIVER'|'CHANGE_DRIVER_STATUS'|'ARCHIVE_DRIVER';
const ROLES=new Set(['ADMIN','MANAGER','OPERATIONAL_MANAGER','FINANCIAL','OPERATIONAL','READONLY']);
const WRITERS=new Set(['ADMIN','MANAGER','OPERATIONAL_MANAGER','OPERATIONAL']);
class ValidationError extends Error{} class ConflictError extends Error{} class NotFoundError extends Error{}
function principal(req:Request){return (req as Request&{principal?:AuthenticatedPrincipal}).principal;}
function allowed(p:AuthenticatedPrincipal,a:Action){const role=String(p.role||'').toUpperCase();if(!p.userId||!p.companyId||!ROLES.has(role))return false;const perms=Array.isArray(p.permissions)?p.permissions:[];if(perms.includes('*')||perms.includes(a))return true;if(a==='VIEW_DRIVER')return true;return WRITERS.has(role);}
function requirePrincipal(req:Request,res:Response,a:Action){const p=principal(req);if(!p){res.status(401).json({error:'Unauthorized: Authentication required'});return null;}if(!allowed(p,a)){res.status(403).json({error:'Forbidden'});return null;}return p;}
function uniqueViolation(error:unknown){let cur:unknown=error;for(let i=0;i<5&&cur&&typeof cur==='object';i++){if('code' in cur&&(cur as {code?:unknown}).code==='23505')return true;cur='cause' in cur?(cur as {cause?:unknown}).cause:undefined;}return false;}
function sendError(res:Response,error:unknown){if(error instanceof ValidationError){res.status(400).json({error:'Invalid driver request'});return;}if(error instanceof ConflictError||uniqueViolation(error)){res.status(409).json({error:'Driver conflict'});return;}if(error instanceof NotFoundError){res.status(404).json({error:'Not found'});return;}console.error('AUTOERP_DRIVER_AUTHORITY_FAILURE',error);res.status(500).json({error:'Driver operation failed'});}
function txt(v:unknown,field:string){const s=typeof v==='string'?v.trim():'';if(!s)throw new ValidationError(field);return s;}
function opt(v:unknown){return v===undefined||v===null?undefined:String(v).trim();}
function validBirth(v:unknown){if(!isValidDateOnly(v)||v>todayDateOnly())throw new ValidationError('birthDate');return v;}
function validExp(v:unknown){if(!isValidDateOnly(v))throw new ValidationError('cnhExpiration');return v;}
function address(v:any){const a=v&&typeof v==='object'&&!Array.isArray(v)?v:{};return {street:opt(a.street)||'',number:opt(a.number)||'',complement:opt(a.complement),neighborhood:opt(a.neighborhood)||'',city:opt(a.city)||'',state:(opt(a.state)||'').toUpperCase(),zipCode:opt(a.zipCode)||''};}
function platforms(v:unknown){if(v===undefined)return [];if(!Array.isArray(v)||v.some(x=>typeof x!=='string'))throw new ValidationError('appPlatforms');return v.map(x=>String(x).trim()).filter(Boolean);}
function enrich(driver:Driver,vehicles:Vehicle[]):Driver{const linked=vehicles.find(v=>v.currentDriverId===driver.id&&!v.isArchived);return {...driver,currentVehicleId:linked?.id,currentContractId:linked?.currentContractId};}
function appendReason(notes:string|undefined,status:DriverStatus,reason?:string){return reason?`${notes||''}\n[Status ${status}]: ${reason}`.trim():notes;}

export function registerDriverRoutes(app:Express):void{
 app.get('/api/drivers',async(req,res)=>{const p=requirePrincipal(req,res,'VIEW_DRIVER');if(!p)return;try{const items=await UnitOfWork.run(p.companyId,async tx=>{const [drivers,vehicles]=await Promise.all([tx.getDriverRepo().findAllByCompany(p.companyId),tx.getVehicleRepo().findAllByCompany(p.companyId)]);return drivers.filter(d=>!d.isArchived).map(d=>enrich(d,vehicles));});res.json({items});}catch(e){sendError(res,e);}});
 app.get('/api/drivers/:id',async(req,res)=>{const p=requirePrincipal(req,res,'VIEW_DRIVER');if(!p)return;try{const item=await UnitOfWork.run(p.companyId,async tx=>{const d=await tx.getDriverRepo().findByIdForCompany(p.companyId,req.params.id);if(!d||d.isArchived)throw new NotFoundError();const vs=await tx.getVehicleRepo().findAllByCompany(p.companyId);return enrich(d,vs);});res.json({item});}catch(e){sendError(res,e);}});
 app.post('/api/drivers',async(req,res)=>{const p=requirePrincipal(req,res,'CREATE_DRIVER');if(!p)return;try{const fullName=txt(req.body?.fullName,'fullName');if(fullName.length<3)throw new ValidationError('fullName');const cpf=normalizeCpf(req.body?.cpf);if(!isValidCPF(cpf))throw new ValidationError('cpf');const cnh=normalizeCnh(req.body?.cnhNumber);if(!isValidCnh(cnh))throw new ValidationError('cnh');const birthDate=validBirth(req.body?.birthDate);const phone=txt(req.body?.phone,'phone');const expiration=validExp(req.body?.cnhExpiration);const created=await UnitOfWork.run(p.companyId,async tx=>{const repo=tx.getDriverRepo();if(await repo.findByCpf(p.companyId,cpf))throw new ConflictError();if(await repo.findByCnh(p.companyId,cnh))throw new ConflictError();const now=new Date().toISOString();const status=evaluateCnhStatus(expiration).status===DocumentStatus.EXPIRED?DriverStatus.BLOCKED:DriverStatus.ACTIVE;const d=await repo.create({id:randomUUID(),companyId:p.companyId,fullName,cpf,rg:opt(req.body?.rg),birthDate,phone,whatsapp:opt(req.body?.whatsapp)||phone,email:opt(req.body?.email),address:address(req.body?.address),cnhNumber:cnh,cnhCategory:(opt(req.body?.cnhCategory)||'B').toUpperCase(),cnhExpiration:expiration,cnhStatus:evaluateCnhStatus(expiration).status,appPlatforms:platforms(req.body?.appPlatforms),status,photoUrl:opt(req.body?.photoUrl),notes:opt(req.body?.notes),isArchived:false,createdAt:now,updatedAt:now});await tx.getAuditLogRepo().create({id:randomUUID(),companyId:p.companyId,entityName:'Driver',entityId:d.id,action:AuditAction.CREATE,newState:JSON.stringify(d),userId:p.userId,userName:p.name,timestamp:now});return d;});res.status(201).json({item:created});}catch(e){sendError(res,e);}});
 app.patch('/api/drivers/:id',async(req,res)=>{const p=requirePrincipal(req,res,'EDIT_DRIVER');if(!p)return;for(const key of ['companyId','userId','userName','role','status','isArchived','currentVehicleId','currentContractId','healthAndEmergency'])if(Object.prototype.hasOwnProperty.call(req.body||{},key)){res.status(400).json({error:'Invalid driver request'});return;}try{const updated=await UnitOfWork.run(p.companyId,async tx=>{const repo=tx.getDriverRepo();const old=await repo.findByIdForCompany(p.companyId,req.params.id);if(!old||old.isArchived)throw new NotFoundError();const c:Partial<Driver>={updatedAt:new Date().toISOString()};if(req.body?.fullName!==undefined){const n=txt(req.body.fullName,'fullName');if(n.length<3)throw new ValidationError('fullName');c.fullName=n;}if(req.body?.cpf!==undefined){const cpf=normalizeCpf(req.body.cpf);if(!isValidCPF(cpf))throw new ValidationError('cpf');const dup=await repo.findByCpf(p.companyId,cpf);if(dup&&dup.id!==old.id)throw new ConflictError();c.cpf=cpf;}if(req.body?.cnhNumber!==undefined){const n=normalizeCnh(req.body.cnhNumber);if(!isValidCnh(n))throw new ValidationError('cnh');const dup=await repo.findByCnh(p.companyId,n);if(dup&&dup.id!==old.id)throw new ConflictError();c.cnhNumber=n;}if(req.body?.birthDate!==undefined)c.birthDate=validBirth(req.body.birthDate);if(req.body?.phone!==undefined)c.phone=txt(req.body.phone,'phone');if(req.body?.whatsapp!==undefined)c.whatsapp=opt(req.body.whatsapp)||'';if(req.body?.email!==undefined)c.email=opt(req.body.email)||'';if(req.body?.rg!==undefined)c.rg=opt(req.body.rg)||'';if(req.body?.address!==undefined)c.address=address(req.body.address);if(req.body?.cnhCategory!==undefined)c.cnhCategory=txt(req.body.cnhCategory,'cnhCategory').toUpperCase();if(req.body?.cnhExpiration!==undefined){const exp=validExp(req.body.cnhExpiration);c.cnhExpiration=exp;c.cnhStatus=evaluateCnhStatus(exp).status;if(c.cnhStatus===DocumentStatus.EXPIRED&&old.status!==DriverStatus.ARCHIVED)c.status=DriverStatus.BLOCKED;}if(req.body?.appPlatforms!==undefined)c.appPlatforms=platforms(req.body.appPlatforms);if(req.body?.notes!==undefined)c.notes=opt(req.body.notes)||'';if(req.body?.photoUrl!==undefined)c.photoUrl=opt(req.body.photoUrl)||'';if(Object.keys(c).length===1)throw new ValidationError('no changes');const d=await repo.updateForCompany(p.companyId,old.id,c);if(!d)throw new NotFoundError();await tx.getAuditLogRepo().create({id:randomUUID(),companyId:p.companyId,entityName:'Driver',entityId:old.id,action:AuditAction.UPDATE,previousState:JSON.stringify(old),newState:JSON.stringify(d),userId:p.userId,userName:p.name,timestamp:c.updatedAt!});return d;});res.json({item:updated});}catch(e){sendError(res,e);}});
 app.patch('/api/drivers/:id/status',async(req,res)=>{const p=requirePrincipal(req,res,'CHANGE_DRIVER_STATUS');if(!p)return;const status=typeof req.body?.status==='string'?req.body.status:'';if(!Object.values(DriverStatus).includes(status as DriverStatus)||status===DriverStatus.ARCHIVED){res.status(400).json({error:'Invalid driver status'});return;}const reason=opt(req.body?.reason);try{const item=await UnitOfWork.run(p.companyId,async tx=>{const repo=tx.getDriverRepo();const old=await repo.findByIdForCompany(p.companyId,req.params.id);if(!old||old.isArchived)throw new NotFoundError();if((status===DriverStatus.BLOCKED||old.status===DriverStatus.BLOCKED)&&!reason)throw new ValidationError('reason');if(old.status===status)return old;const now=new Date().toISOString();const d=await repo.updateForCompany(p.companyId,old.id,{status:status as DriverStatus,isArchived:false,notes:appendReason(old.notes,status as DriverStatus,reason),updatedAt:now});if(!d)throw new NotFoundError();await tx.getAuditLogRepo().create({id:randomUUID(),companyId:p.companyId,entityName:'Driver',entityId:old.id,action:AuditAction.UPDATE,previousState:JSON.stringify({status:old.status}),newState:JSON.stringify({status,reason}),userId:p.userId,userName:p.name,timestamp:now});return d;});res.json({item});}catch(e){sendError(res,e);}});
 app.post('/api/drivers/:id/archive',async(req,res)=>{const p=requirePrincipal(req,res,'ARCHIVE_DRIVER');if(!p)return;try{const item=await UnitOfWork.run(p.companyId,async tx=>{const repo=tx.getDriverRepo();const old=await repo.findByIdForCompany(p.companyId,req.params.id);if(!old)throw new NotFoundError();if(old.isArchived)return old;const now=new Date().toISOString();const d=await repo.updateForCompany(p.companyId,old.id,{status:DriverStatus.ARCHIVED,isArchived:true,updatedAt:now});if(!d)throw new NotFoundError();await tx.getAuditLogRepo().create({id:randomUUID(),companyId:p.companyId,entityName:'Driver',entityId:old.id,action:AuditAction.ARCHIVE,previousState:JSON.stringify(old),newState:JSON.stringify(d),userId:p.userId,userName:p.name,timestamp:now});return d;});res.json({item});}catch(e){sendError(res,e);}});
}
''',encoding='utf-8')

p=Path('server.ts');text=p.read_text(encoding='utf-8')
text=replace_once(text,"import { registerVehicleRoutes } from './src/server/vehicleRoutes';","import { registerVehicleRoutes } from './src/server/vehicleRoutes';\nimport { registerDriverRoutes } from './src/server/driverRoutes';",'driver route import')
text=replace_once(text,'  registerVehicleRoutes(app);\n','  registerVehicleRoutes(app);\n  registerDriverRoutes(app);\n','driver route register')
text=replace_once(text,"      const health=await UnitOfWork.run(principal.companyId, async tx=>{\n        const profile=await tx.getDriverHealthRepo().findByDriverId(driverId);","      const health=await UnitOfWork.run(principal.companyId, async tx=>{\n        const driver=await tx.getDriverRepo().findByIdForCompany(principal.companyId,driverId);\n        if(!driver||driver.isArchived)throw new Error('DRIVER_CORE_NOT_FOUND');\n        const profile=await tx.getDriverHealthRepo().findByDriverId(driverId);",'health GET existence')
text=replace_once(text,"    } catch { res.status(400).json({error:'Driver health request failed'}); }\n  });\n\n  app.put('/api/drivers/:id/health'","    } catch(error) { if(error instanceof Error&&error.message==='DRIVER_CORE_NOT_FOUND'){res.status(404).json({error:'Not found'});return;} res.status(400).json({error:'Driver health request failed'}); }\n  });\n\n  app.put('/api/drivers/:id/health'",'health GET 404')
text=replace_once(text,"      const saved=await UnitOfWork.run(principal.companyId, async tx=>{\n        const existing=await tx.getDriverHealthRepo().findByDriverId(driverId); const now=new Date().toISOString();","      const saved=await UnitOfWork.run(principal.companyId, async tx=>{\n        const driver=await tx.getDriverRepo().findByIdForCompany(principal.companyId,driverId);\n        if(!driver||driver.isArchived)throw new Error('DRIVER_CORE_NOT_FOUND');\n        const existing=await tx.getDriverHealthRepo().findByDriverId(driverId); const now=new Date().toISOString();",'health PUT existence')
text=replace_once(text,"    } catch { res.status(400).json({error:'Driver health request failed'}); }\n  });\n\n  // SECURITY-2G8","    } catch(error) { if(error instanceof Error&&error.message==='DRIVER_CORE_NOT_FOUND'){res.status(404).json({error:'Not found'});return;} res.status(400).json({error:'Driver health request failed'}); }\n  });\n\n  // SECURITY-2G8",'health PUT 404')
p.write_text(text,encoding='utf-8')
