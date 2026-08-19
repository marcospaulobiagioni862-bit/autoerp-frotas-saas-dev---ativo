from pathlib import Path
import re


def read(path):
    return Path(path).read_text()

def write(path, text):
    p=Path(path); p.parent.mkdir(parents=True, exist_ok=True); p.write_text(text)

def replace_once(path, old, new):
    text=read(path)
    if text.count(old)!=1:
        raise SystemExit(f'{path}: expected one match, found {text.count(old)}')
    write(path, text.replace(old,new,1))

# 1) Shared authorization helper.
write('src/shared/security/driverHealthAuthorization.ts', '''export type DriverHealthAction = 'VIEW_DRIVER_HEALTH' | 'EDIT_DRIVER_HEALTH';

export interface DriverHealthUserContext {
  userId: string;
  role: string;
  active: boolean;
  companyId: string;
  permissions?: string[];
}

const CANONICAL_ROLES = [
  'ADMIN',
  'MANAGER',
  'OPERATIONAL_MANAGER',
  'FINANCIAL',
  'OPERATIONAL',
  'READONLY',
] as const;

export function hasDriverHealthPermission(
  action: DriverHealthAction,
  userContext?: DriverHealthUserContext
): boolean {
  if (!userContext?.userId || userContext.active === false) return false;
  const roleUpper = String(userContext.role).toUpperCase();
  if (!CANONICAL_ROLES.includes(roleUpper as (typeof CANONICAL_ROLES)[number])) return false;
  const permissions = userContext.permissions || [];
  if (permissions.includes(action)) return true;
  return roleUpper === 'ADMIN' || roleUpper === 'MANAGER' || roleUpper === 'OPERATIONAL_MANAGER';
}

export function isDriverHealthAuthorized(
  action: DriverHealthAction,
  driverCompanyId: string,
  userContext?: DriverHealthUserContext
): boolean {
  return Boolean(
    hasDriverHealthPermission(action, userContext) &&
    userContext &&
    driverCompanyId === userContext.companyId
  );
}
''')

# 2) Migration 0007 (0006 belongs to SECURITY-2G8 on current main).
write('drizzle/0007_driver_health_profiles.sql', '''-- SECURITY-2H1-v2: server-authoritative driver health/emergency data.
-- General Driver authority is still being migrated; driver_id intentionally has no FK in this wave.
CREATE TABLE IF NOT EXISTS driver_health_profiles (
  id text PRIMARY KEY NOT NULL,
  company_id text NOT NULL,
  driver_id text NOT NULL,
  blood_type text,
  allergies text,
  relevant_conditions text,
  continuous_medications text,
  emergency_contact_name text,
  emergency_contact_relationship text,
  emergency_contact_phone text,
  emergency_notes text,
  last_update_date timestamp,
  responsible_user text,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT driver_health_profiles_company_driver_unique UNIQUE(company_id, driver_id)
);
CREATE INDEX IF NOT EXISTS idx_driver_health_profiles_company ON driver_health_profiles USING btree (company_id);
CREATE INDEX IF NOT EXISTS idx_driver_health_profiles_driver ON driver_health_profiles USING btree (driver_id);
ALTER TABLE driver_health_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_health_profiles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_access_driver_health_profiles ON driver_health_profiles;
CREATE POLICY tenant_access_driver_health_profiles ON driver_health_profiles AS PERMISSIVE FOR ALL
USING (company_id = current_setting('app.current_tenant', true))
WITH CHECK (company_id = current_setting('app.current_tenant', true));
DROP POLICY IF EXISTS tenant_isolation_driver_health_profiles ON driver_health_profiles;
CREATE POLICY tenant_isolation_driver_health_profiles ON driver_health_profiles AS RESTRICTIVE FOR ALL
USING (company_id = current_setting('app.current_tenant', true))
WITH CHECK (company_id = current_setting('app.current_tenant', true));
''')

journal=read('drizzle/meta/_journal.json')
needle='''    {\n      "idx": 6,\n      "version": "7",\n      "when": 1787094000000,\n      "tag": "0006_security_deposit_authority",\n      "breakpoints": true\n    }\n'''
replacement=needle[:-1]+''',\n    {\n      "idx": 7,\n      "version": "7",\n      "when": 1787097600000,\n      "tag": "0007_driver_health_profiles",\n      "breakpoints": true\n    }\n'''
if needle not in journal: raise SystemExit('journal 0006 anchor missing')
write('drizzle/meta/_journal.json', journal.replace(needle,replacement,1))

# 3) Drizzle schema table.
schema=read('src/db/schema.ts')
marker="export const contracts = pgTable('contracts', {"
health_table='''export const driverHealthProfiles = pgTable('driver_health_profiles', {\n  id: text('id').primaryKey(),\n  companyId: text('company_id').notNull(),\n  driverId: text('driver_id').notNull(),\n  bloodType: text('blood_type'),\n  allergies: text('allergies'),\n  relevantConditions: text('relevant_conditions'),\n  continuousMedications: text('continuous_medications'),\n  emergencyContactName: text('emergency_contact_name'),\n  emergencyContactRelationship: text('emergency_contact_relationship'),\n  emergencyContactPhone: text('emergency_contact_phone'),\n  emergencyNotes: text('emergency_notes'),\n  lastUpdateDate: timestamp('last_update_date', { mode: 'string' }),\n  responsibleUser: text('responsible_user'),\n  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),\n  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),\n}, (t) => ({\n  unq_company_driver: unique('driver_health_profiles_company_driver_unique').on(t.companyId, t.driverId),\n  idx_company: index('idx_driver_health_profiles_company').on(t.companyId),\n  idx_driver: index('idx_driver_health_profiles_driver').on(t.driverId),\n}));\n\n'''
if marker not in schema: raise SystemExit('schema contract marker missing')
write('src/db/schema.ts', schema.replace(marker,health_table+marker,1))

# 4) Transaction context capability.
p='src/domain/finance/ITransactionContext.ts'; text=read(p)
text=text.replace('  SecurityDepositMovement,\n', '  SecurityDepositMovement,\n  DriverHealthAndEmergency,\n',1)
insert='''\nexport interface TransactionDriverHealthProfile extends DriverHealthAndEmergency {\n  id: string;\n  companyId: string;\n  driverId: string;\n  createdAt: string;\n  updatedAt: string;\n}\n\nexport interface ITransactionDriverHealthProfileRepository {\n  findByDriverId(driverId: string): Promise<TransactionDriverHealthProfile | null>;\n  upsert(item: TransactionDriverHealthProfile): Promise<TransactionDriverHealthProfile>;\n}\n'''
anchor='export interface ITransactionContractRepository {'
if anchor not in text: raise SystemExit('transaction context contract marker missing')
text=text.replace(anchor,insert+'\n'+anchor,1)
text=text.replace('  getContractRepo(): ITransactionContractRepository;\n', '  getContractRepo(): ITransactionContractRepository;\n  getDriverHealthRepo(): ITransactionDriverHealthProfileRepository;\n',1)
write(p,text)

# 5) PostgreSQL repository.
p='src/db/repositories/postgresRepositories.ts'; text=read(p)
text=text.replace('  financialTransactions, financialAccounts, paymentMethods, auditLogs, contracts, financialPeriods\n', '  financialTransactions, financialAccounts, paymentMethods, auditLogs, contracts, financialPeriods, driverHealthProfiles\n',1)
append='''\n\nexport class PostgresDriverHealthProfileRepository extends PostgresBaseRepository<any> {\n  constructor(tx?: any) { super(driverHealthProfiles, tx); }\n\n  async findByDriverId(driverId: string): Promise<any | null> {\n    const rows = await this.tx.select().from(driverHealthProfiles).where(eq(driverHealthProfiles.driverId, driverId)).limit(1);\n    return rows[0] || null;\n  }\n\n  async upsert(item: any): Promise<any> {\n    const rows = await this.tx.insert(driverHealthProfiles).values(item).onConflictDoUpdate({\n      target: [driverHealthProfiles.companyId, driverHealthProfiles.driverId],\n      set: {\n        bloodType: item.bloodType ?? null, allergies: item.allergies ?? null,\n        relevantConditions: item.relevantConditions ?? null, continuousMedications: item.continuousMedications ?? null,\n        emergencyContactName: item.emergencyContactName ?? null, emergencyContactRelationship: item.emergencyContactRelationship ?? null,\n        emergencyContactPhone: item.emergencyContactPhone ?? null, emergencyNotes: item.emergencyNotes ?? null,\n        lastUpdateDate: item.lastUpdateDate ?? null, responsibleUser: item.responsibleUser ?? null, updatedAt: item.updatedAt,\n      },\n    }).returning();\n    return rows[0];\n  }\n}\n'''
if 'export class PostgresDriverHealthProfileRepository' in text: raise SystemExit('health repo already exists')
write(p,text.rstrip()+append+'\n')

# 6) UnitOfWork wiring.
p='src/db/uow.ts'; text=read(p)
text=text.replace('  PostgresSecurityDepositMovementRepository\n', '  PostgresSecurityDepositMovementRepository,\n  PostgresDriverHealthProfileRepository\n',1)
text=text.replace('        getSecurityDepositMovementRepo: () => new PostgresSecurityDepositMovementRepository(tx)\n', '        getSecurityDepositMovementRepo: () => new PostgresSecurityDepositMovementRepository(tx),\n        getDriverHealthRepo: () => new PostgresDriverHealthProfileRepository(tx)\n',1)
write(p,text)

# 7) DriverService: shared auth + production-local deny + remove health from detailed summary.
p='src/domain/services/DriverService.ts'; text=read(p)
text=text.replace("import { generateUUID } from '../../shared/utils/uuid';\n", "import { generateUUID } from '../../shared/utils/uuid';\nimport { hasDriverHealthPermission, isDriverHealthAuthorized } from '../../shared/security/driverHealthAuthorization';\n",1)
pattern=r"  private static hasHealthPermission\([\s\S]*?\n  public async updateDriver\("
new_block='''  private static hasHealthPermission(\n    action: 'VIEW_DRIVER_HEALTH' | 'EDIT_DRIVER_HEALTH',\n    userContext?: { userId: string; role: string; active: boolean; companyId: string; permissions?: string[] }\n  ): boolean {\n    return hasDriverHealthPermission(action, userContext);\n  }\n\n  public static isHealthAuthorized(\n    action: 'VIEW_DRIVER_HEALTH' | 'EDIT_DRIVER_HEALTH',\n    driver: Driver,\n    userContext?: { userId: string; role: string; active: boolean; companyId: string; permissions?: string[] }\n  ): boolean {\n    return isDriverHealthAuthorized(action, driver.companyId, userContext);\n  }\n\n  private static assertLegacyHealthTestRuntime(): void {\n    if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {\n      throw new Error('Acesso negado: dados de saúde exigem autoridade server-side.');\n    }\n  }\n\n  public async getDriverHealthAndEmergency(\n    driverId: string,\n    userContext?: { userId: string; role: string; active: boolean; companyId: string; permissions?: string[] }\n  ): Promise<any> {\n    DriverService.assertLegacyHealthTestRuntime();\n    const context = userContext || { userId: 'usr-unknown', role: 'READONLY', active: false, companyId: '' };\n    if (!DriverService.hasHealthPermission('VIEW_DRIVER_HEALTH', context)) {\n      throw new Error('Acesso negado: Permissão VIEW_DRIVER_HEALTH necessária.');\n    }\n    const existing = await this.driverRepo.findById(driverId);\n    if (!existing) throw new Error(`Motorista ${driverId} não encontrado.`);\n    if (!DriverService.isHealthAuthorized('VIEW_DRIVER_HEALTH', existing, context)) {\n      throw new Error('Acesso negado: Permissão VIEW_DRIVER_HEALTH necessária.');\n    }\n    return existing.healthAndEmergency || {};\n  }\n\n  public async updateHealthAndEmergency(\n    driverId: string,\n    healthData: any,\n    userId: string,\n    userName: string,\n    userContext?: { userId: string; role: string; active: boolean; companyId: string; permissions?: string[] }\n  ): Promise<Driver> {\n    DriverService.assertLegacyHealthTestRuntime();\n    if (userContext && !DriverService.hasHealthPermission('EDIT_DRIVER_HEALTH', userContext)) {\n      throw new Error('Acesso negado: Permissão EDIT_DRIVER_HEALTH necessária.');\n    }\n    const existing = await this.driverRepo.findById(driverId);\n    if (!existing) throw new Error(`Motorista ${driverId} não encontrado.`);\n    const context = userContext || { userId, role: 'ADMIN', active: true, companyId: existing.companyId };\n    if (!DriverService.isHealthAuthorized('EDIT_DRIVER_HEALTH', existing, context)) {\n      throw new Error('Acesso negado: Permissão EDIT_DRIVER_HEALTH necessária.');\n    }\n    const healthAndEmergency = { ...(existing.healthAndEmergency || {}), ...healthData, lastUpdateDate: new Date().toISOString().split('T')[0], responsibleUser: userName || context.userId };\n    return this.driverRepo.update(driverId, { healthAndEmergency });\n  }\n\n  public async updateDriver('''
text2,n=re.subn(pattern,new_block,text,count=1)
if n!=1: raise SystemExit(f'DriverService health block matches={n}')
text=text2
old='''    return {\n      driver,\n      currentVehicle,'''
new='''    const driverWithoutHealth = { ...driver };\n    delete driverWithoutHealth.healthAndEmergency;\n\n    return {\n      driver: driverWithoutHealth,\n      currentVehicle,'''
if old not in text: raise SystemExit('DriverService detailed summary return anchor missing')
text=text.replace(old,new,1)
write(p,text)

# 8) Driver health API transport.
write('src/api/driverHealthClient.ts', '''import { DriverHealthAndEmergency } from '../types/entities';\n\nexport class DriverHealthApiError extends Error {\n  constructor(public readonly status: number, message: string) { super(message); this.name = 'DriverHealthApiError'; }\n}\n\nfunction asObject(value: unknown): Record<string, unknown> {\n  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid driver health response');\n  return value as Record<string, unknown>;\n}\n\nfunction validateHealth(value: unknown): DriverHealthAndEmergency {\n  const item=asObject(value);\n  for (const [key,val] of Object.entries(item)) {\n    if (val != null && typeof val !== 'string') throw new Error(`Invalid driver health field: ${key}`);\n  }\n  return item as DriverHealthAndEmergency;\n}\n\nasync function apiError(response: Response): Promise<DriverHealthApiError> {\n  let message=`Driver health request failed (${response.status})`;\n  try { const body=asObject(await response.json()); if (typeof body.error==='string') message=body.error; } catch {}\n  return new DriverHealthApiError(response.status,message);\n}\n\nexport class DriverHealthClient {\n  static async get(driverId: string): Promise<DriverHealthAndEmergency> {\n    const response=await fetch(`/api/drivers/${encodeURIComponent(driverId)}/health`,{method:'GET',credentials:'include'});\n    if(!response.ok) throw await apiError(response);\n    const body=asObject(await response.json());\n    return validateHealth(body.health);\n  }\n\n  static async update(driverId: string, health: DriverHealthAndEmergency): Promise<DriverHealthAndEmergency> {\n    const response=await fetch(`/api/drivers/${encodeURIComponent(driverId)}/health`,{\n      method:'PUT', credentials:'include', headers:{'content-type':'application/json'}, body:JSON.stringify({health})\n    });\n    if(!response.ok) throw await apiError(response);\n    const body=asObject(await response.json());\n    return validateHealth(body.health);\n  }\n}\n''')

write('src/api/__tests__/driverHealthClientTestRunner.ts', '''import { DriverHealthApiError, DriverHealthClient } from '../driverHealthClient';\n\nexport class DriverHealthClientTestRunner {\n  static async runAllTests() {\n    const originalFetch=globalThis.fetch; let passed=0; const tests:Array<()=>Promise<void>>=[];\n    tests.push(async()=>{let url='',cred:RequestCredentials|undefined;globalThis.fetch=(async(i:RequestInfo|URL,x?:RequestInit)=>{url=String(i);cred=x?.credentials;return new Response(JSON.stringify({health:{bloodType:'O+'}}),{status:200})}) as typeof fetch;const h=await DriverHealthClient.get('drv 1');if(!url.includes('/api/drivers/drv%201/health')||cred!=='include'||h.bloodType!=='O+')throw Error('GET transport')});\n    tests.push(async()=>{let body:any,cred:RequestCredentials|undefined;globalThis.fetch=(async(_i:RequestInfo|URL,x?:RequestInit)=>{body=JSON.parse(String(x?.body));cred=x?.credentials;return new Response(JSON.stringify({health:{allergies:'latex'}}),{status:200})}) as typeof fetch;await DriverHealthClient.update('drv-1',{allergies:'latex'});if(cred!=='include'||body.health.allergies!=='latex')throw Error('PUT transport');for(const k of ['companyId','userId','userName','role'])if(k in body)throw Error(`browser authority leaked ${k}`)});\n    tests.push(async()=>{globalThis.fetch=(async()=>new Response(JSON.stringify({health:{}}),{status:200})) as typeof fetch;const h=await DriverHealthClient.get('d');if(Object.keys(h).length!==0)throw Error('empty profile')});\n    tests.push(async()=>{globalThis.fetch=(async()=>new Response(JSON.stringify({error:'Forbidden'}),{status:403})) as typeof fetch;let e:unknown;try{await DriverHealthClient.get('d')}catch(x){e=x}if(!(e instanceof DriverHealthApiError)||e.status!==403)throw Error('403 fail closed')});\n    tests.push(async()=>{globalThis.fetch=(async()=>new Response(JSON.stringify({error:'Unauthorized'}),{status:401})) as typeof fetch;let e:unknown;try{await DriverHealthClient.update('d',{})}catch(x){e=x}if(!(e instanceof DriverHealthApiError)||e.status!==401)throw Error('401 fail closed')});\n    tests.push(async()=>{globalThis.fetch=(async()=>new Response(JSON.stringify({health:{bloodType:123}}),{status:200})) as typeof fetch;let failed=false;try{await DriverHealthClient.get('d')}catch{failed=true}if(!failed)throw Error('malformed payload must fail')});\n    try{for(const t of tests){await t();passed++}}finally{globalThis.fetch=originalFetch}\n    const result={passed,failed:tests.length-passed,total:tests.length}; console.log(`DriverHealthClient ${passed}/${tests.length} PASS`); return result;\n  }\n}\nif(process.argv[1]?.includes('driverHealthClientTestRunner')) DriverHealthClientTestRunner.runAllTests().then(r=>{if(r.failed)process.exit(1)}).catch(e=>{console.error(e);process.exit(1)});\n''')

# 9) Modal: health state comes only from API; no hardcoded health identity or local health field.
p='src/components/drivers/DriverDetailsModal.tsx'; text=read(p)
text=text.replace("import { formatCurrencyBRL } from '../../shared/utils/currency';\n", "import { formatCurrencyBRL } from '../../shared/utils/currency';\nimport { DriverHealthAndEmergency } from '../../types/entities';\nimport { DriverHealthClient } from '../../api/driverHealthClient';\n",1)
text=text.replace("  const [isHealthUnlocked, setIsHealthUnlocked] = useState(false); // To enforce \"permissão restrita\" with confirmation/toggle\n", "  const [isHealthUnlocked, setIsHealthUnlocked] = useState(false);\n  const [healthProfile, setHealthProfile] = useState<DriverHealthAndEmergency>({});\n",1)
pat=r"  useEffect\(\(\) => \{\n    if \(summary\?\.driver\?\.healthAndEmergency\)[\s\S]*?\n  \}, \[summary\]\);\n"
replacement='''  const applyHealthProfile = (h: DriverHealthAndEmergency) => {\n    setHealthProfile(h);\n    setBloodType(h.bloodType || ''); setAllergies(h.allergies || '');\n    setRelevantConditions(h.relevantConditions || ''); setContinuousMedications(h.continuousMedications || '');\n    setEmergencyContactName(h.emergencyContactName || ''); setEmergencyContactRelationship(h.emergencyContactRelationship || '');\n    setEmergencyContactPhone(h.emergencyContactPhone || ''); setEmergencyNotes(h.emergencyNotes || '');\n  };\n\n  const handleUnlockHealth = async () => {\n    if (!driverId) return;\n    setActionLoading(true);\n    try {\n      const h = await DriverHealthClient.get(driverId);\n      applyHealthProfile(h);\n      setIsHealthUnlocked(true);\n    } catch (err: any) {\n      alert(err.message || 'Acesso negado aos dados de saúde.');\n      setIsHealthUnlocked(false);\n    } finally { setActionLoading(false); }\n  };\n'''
text,n=re.subn(pat,replacement,text,count=1)
if n!=1: raise SystemExit(f'modal health effect matches={n}')
pat=r"  const handleSaveHealthAndEmergency = async \(e: React\.FormEvent\) => \{[\s\S]*?\n  \};\n\n  const handleSendWhatsApp"
replacement='''  const handleSaveHealthAndEmergency = async (e: React.FormEvent) => {\n    e.preventDefault();\n    if (!driverId) return;\n    setActionLoading(true);\n    try {\n      const updated = await DriverHealthClient.update(driverId, {\n        bloodType, allergies, relevantConditions, continuousMedications, emergencyContactName,\n        emergencyContactRelationship, emergencyContactPhone, emergencyNotes,\n      });\n      applyHealthProfile(updated);\n      setIsEditHealthOpen(false);\n    } catch (err: any) { alert(err.message || 'Erro ao atualizar dados de saúde.'); }\n    finally { setActionLoading(false); }\n  };\n\n  const handleSendWhatsApp'''
text,n=re.subn(pat,replacement,text,count=1)
if n!=1: raise SystemExit(f'modal save block matches={n}')
old='''    if (isOpen && driverId) {\n      loadData();\n      setActiveTab('overview');\n    }'''
new='''    if (isOpen && driverId) {\n      setIsHealthUnlocked(false);\n      applyHealthProfile({});\n      loadData();\n      setActiveTab('overview');\n    }'''
if old not in text: raise SystemExit('modal open effect anchor missing')
text=text.replace(old,new,1)
pat=r"onClick=\{\(\) => \{\n\s*setIsHealthUnlocked\(true\);[\s\S]*?\n\s*\}\}\n\s*variant=\"primary\""
text,n=re.subn(pat,'onClick={handleUnlockHealth}\n                    disabled={actionLoading}\n                    variant="primary"',text,count=1)
if n!=1: raise SystemExit(f'modal unlock button matches={n}')
text=text.replace('driver.healthAndEmergency?', 'healthProfile?', 20)
text=text.replace('driver.healthAndEmergency.', 'healthProfile.', 20)
write(p,text)

# 10) Server routes and audit. Use trusted req.principal + UnitOfWork/RLS only.
p='server.ts'; text=read(p)
text=text.replace("import { AccountingRegime } from './src/types/enums';\n", "import { AccountingRegime, AuditAction } from './src/types/enums';\nimport { hasDriverHealthPermission } from './src/shared/security/driverHealthAuthorization';\nimport { randomUUID } from 'node:crypto';\n",1)
anchor="  // SECURITY-2G8: security-deposit read/receipt are server-authoritative.\n"
routes='''  // SECURITY-2H1-v2: driver health/emergency data is server-authoritative.\n  app.get('/api/drivers/:id/health', async (req: Request, res: Response) => {\n    const principal=req.principal;\n    if(!principal){res.status(401).json({error:'Unauthorized: Authentication required'});return;}\n    const context={userId:principal.userId,role:principal.role,active:true,companyId:principal.companyId,permissions:principal.permissions};\n    if(!hasDriverHealthPermission('VIEW_DRIVER_HEALTH',context)){res.status(403).json({error:'Forbidden'});return;}\n    const driverId=typeof req.params.id==='string'?req.params.id.trim():'';\n    if(!driverId){res.status(400).json({error:'Invalid driver health request'});return;}\n    try {\n      const health=await UnitOfWork.run(principal.companyId, async tx=>{\n        const profile=await tx.getDriverHealthRepo().findByDriverId(driverId);\n        await tx.getAuditLogRepo().create({\n          id:randomUUID(),companyId:principal.companyId,entityName:'DriverHealthSecurity',entityId:driverId,\n          action:AuditAction.UPDATE,userId:principal.userId,userName:principal.name,\n          newState:JSON.stringify({event:'VIEW_DRIVER_HEALTH'}),timestamp:new Date().toISOString(),\n        });\n        if(!profile)return {};\n        const {id:_id,companyId:_companyId,driverId:_driverId,createdAt:_createdAt,updatedAt:_updatedAt,...safe}=profile;\n        return safe;\n      });\n      res.json({health});\n    } catch { res.status(400).json({error:'Driver health request failed'}); }\n  });\n\n  app.put('/api/drivers/:id/health', async (req: Request, res: Response) => {\n    const principal=req.principal;\n    if(!principal){res.status(401).json({error:'Unauthorized: Authentication required'});return;}\n    const context={userId:principal.userId,role:principal.role,active:true,companyId:principal.companyId,permissions:principal.permissions};\n    if(!hasDriverHealthPermission('EDIT_DRIVER_HEALTH',context)){res.status(403).json({error:'Forbidden'});return;}\n    const driverId=typeof req.params.id==='string'?req.params.id.trim():'';\n    const raw=req.body?.health;\n    if(!driverId||!raw||typeof raw!=='object'||Array.isArray(raw)){res.status(400).json({error:'Invalid driver health request'});return;}\n    const allowed=['bloodType','allergies','relevantConditions','continuousMedications','emergencyContactName','emergencyContactRelationship','emergencyContactPhone','emergencyNotes'] as const;\n    const health:Record<string,string>={};\n    for(const key of allowed){const value=(raw as Record<string,unknown>)[key];if(value!==undefined){if(typeof value!=='string'){res.status(400).json({error:'Invalid driver health request'});return;}health[key]=value;}}\n    try {\n      const saved=await UnitOfWork.run(principal.companyId, async tx=>{\n        const existing=await tx.getDriverHealthRepo().findByDriverId(driverId); const now=new Date().toISOString();\n        const profile=await tx.getDriverHealthRepo().upsert({\n          id:existing?.id||randomUUID(),companyId:principal.companyId,driverId,\n          ...(existing||{}),...health,lastUpdateDate:now,responsibleUser:principal.name,createdAt:existing?.createdAt||now,updatedAt:now,\n        });\n        await tx.getAuditLogRepo().create({\n          id:randomUUID(),companyId:principal.companyId,entityName:'DriverHealthSecurity',entityId:driverId,\n          action:AuditAction.UPDATE,userId:principal.userId,userName:principal.name,\n          newState:JSON.stringify({event:'EDIT_DRIVER_HEALTH',fieldsChanged:Object.keys(health)}),timestamp:now,\n        });\n        return profile;\n      });\n      const {id:_id,companyId:_companyId,driverId:_driverId,createdAt:_createdAt,updatedAt:_updatedAt,...safe}=saved;\n      res.json({health:safe});\n    } catch { res.status(400).json({error:'Driver health request failed'}); }\n  });\n\n'''
if anchor not in text: raise SystemExit('server G8 anchor missing')
text=text.replace(anchor,routes+anchor,1)
write(p,text)

print('SECURITY-2H1-v2 patch applied')
