from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count=text.count(old)
    if count!=1: raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old,new,1)

Path('src/api/driverClient.ts').write_text(r'''import type { Driver } from '../types/entities';
import { DriverStatus,DocumentStatus } from '../types/enums';

export class DriverApiError extends Error{constructor(public readonly status:number,message:string){super(message);this.name='DriverApiError';}}
type R=Record<string,unknown>;
function obj(v:unknown):R{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('Invalid driver response');return v as R;}
function address(v:unknown){const a=obj(v);for(const k of ['street','number','neighborhood','city','state','zipCode'])if(typeof a[k]!=='string')throw new Error('Invalid driver address');return a as unknown as Driver['address'];}
function validate(v:unknown):Driver{const d=obj(v);const status=typeof d.status==='string'?d.status:'';const cnhStatus=typeof d.cnhStatus==='string'?d.cnhStatus:'';if(typeof d.id!=='string'||typeof d.companyId!=='string'||typeof d.fullName!=='string'||typeof d.cpf!=='string'||typeof d.birthDate!=='string'||typeof d.phone!=='string'||typeof d.whatsapp!=='string'||typeof d.cnhNumber!=='string'||typeof d.cnhCategory!=='string'||typeof d.cnhExpiration!=='string'||!Object.values(DriverStatus).includes(status as DriverStatus)||!Object.values(DocumentStatus).includes(cnhStatus as DocumentStatus)||!Array.isArray(d.appPlatforms)||d.appPlatforms.some(x=>typeof x!=='string')||typeof d.isArchived!=='boolean'||typeof d.createdAt!=='string'||typeof d.updatedAt!=='string')throw new Error('Invalid driver payload');return {...d,address:address(d.address)} as unknown as Driver;}
async function apiError(r:Response){let m=`Driver request failed (${r.status})`;try{const p=obj(await r.json());if(typeof p.error==='string'&&p.error)m=p.error;}catch{}return new DriverApiError(r.status,m);}
export interface DriverCreateInput{fullName:string;cpf:string;rg?:string;birthDate:string;phone:string;whatsapp?:string;email?:string;address:Driver['address'];cnhNumber:string;cnhCategory:string;cnhExpiration:string;appPlatforms?:string[];photoUrl?:string;notes?:string;}
export type DriverUpdateInput=Partial<DriverCreateInput>;
export class DriverClient{
 static async list(){const r=await fetch('/api/drivers',{credentials:'include'});if(!r.ok)throw await apiError(r);const p=obj(await r.json());if(!Array.isArray(p.items))throw new Error('Invalid driver list');return p.items.map(validate);}
 static async get(id:string){const r=await fetch(`/api/drivers/${encodeURIComponent(id)}`,{credentials:'include'});if(!r.ok)throw await apiError(r);return validate(obj(await r.json()).item);}
 static async create(input:DriverCreateInput){const r=await fetch('/api/drivers',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify(input)});if(!r.ok)throw await apiError(r);return validate(obj(await r.json()).item);}
 static async update(id:string,input:DriverUpdateInput){const r=await fetch(`/api/drivers/${encodeURIComponent(id)}`,{method:'PATCH',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify(input)});if(!r.ok)throw await apiError(r);return validate(obj(await r.json()).item);}
 static async changeStatus(id:string,status:DriverStatus,reason?:string){const r=await fetch(`/api/drivers/${encodeURIComponent(id)}/status`,{method:'PATCH',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({status,reason})});if(!r.ok)throw await apiError(r);return validate(obj(await r.json()).item);}
 static async archive(id:string){const r=await fetch(`/api/drivers/${encodeURIComponent(id)}/archive`,{method:'POST',credentials:'include'});if(!r.ok)throw await apiError(r);return validate(obj(await r.json()).item);}
}
''',encoding='utf-8')

Path('src/domain/services/DriverLegacyDetailsBridge.ts').write_text(r'''import { DriverDocumentRepository,ContractRepository,TrafficTicketRepository,AccountReceivableRepository,SecurityDepositRepository,AuditLogRepository,CommunicationLogRepository } from '../../persistence/repositories/localRepositories';
import type { Driver,DriverDocument,CommunicationLog,Vehicle } from '../../types/entities';
import { AuditAction,DocumentStatus,DriverStatus,ObligationStatus } from '../../types/enums';
import { AuditLogger } from '../../shared/utils/auditLogger';
import { generateUUID } from '../../shared/utils/uuid';
import { evaluateCnhStatus } from '../../shared/utils/driverValidation';

export interface DriverDetailedSummary{driver:Driver;currentVehicle?:Vehicle;currentContract?:any;contractHistory:any[];documents:DriverDocument[];trafficTickets:any[];securityDeposits:any[];receivables:any[];historyLogs:any[];communicationLogs:CommunicationLog[];financialSummary:{totalPendingAmount:number;totalOverdueAmount:number;totalPaidAmount:number;overdueCount:number;financialStatus:'EM_DIA'|'ATENCAO'|'EM_ATRASO'|'BLOQUEADO_FINANCEIRO'};cnhAlert:{status:DocumentStatus;daysToExpiration:number;message:string};}
/** Supplemental legacy bridge only. Driver/Vehicle core must be supplied by server clients. */
export class DriverLegacyDetailsBridge{
 private docRepo=new DriverDocumentRepository();private contractRepo=new ContractRepository();private ticketRepo=new TrafficTicketRepository();private receivableRepo=new AccountReceivableRepository();private depositRepo=new SecurityDepositRepository();private auditRepo=new AuditLogRepository();private commRepo=new CommunicationLogRepository();
 async compose(driver:Driver,currentVehicle?:Vehicle):Promise<DriverDetailedSummary>{const id=driver.id;const [currentContract,allContracts,documents,tickets,deposits,receivables,audits,communications]=await Promise.all([driver.currentContractId?this.contractRepo.findById(driver.currentContractId):Promise.resolve(null),this.contractRepo.findAll({driverId:id}),this.docRepo.findAll({driverId:id}),this.ticketRepo.findAll({driverId:id}),this.depositRepo.findAll({driverId:id}),this.receivableRepo.findAll({driverId:id}),this.auditRepo.findAll(),this.commRepo.findByDriverId(id)]);const today=new Date().toISOString().split('T')[0];const pending=receivables.filter(r=>r.status===ObligationStatus.PENDING||r.status===ObligationStatus.PARTIALLY_PAID||r.status===ObligationStatus.OVERDUE);const overdue=pending.filter(r=>r.dueDate<today||r.status===ObligationStatus.OVERDUE);const totalPendingAmount=pending.reduce((a,r)=>a+((r.updatedAmount||r.originalAmount)-r.paidAmount),0);const totalOverdueAmount=overdue.reduce((a,r)=>a+((r.updatedAmount||r.originalAmount)-r.paidAmount),0);const totalPaidAmount=receivables.filter(r=>r.status===ObligationStatus.PAID).reduce((a,r)=>a+r.paidAmount,0);let financialStatus:DriverDetailedSummary['financialSummary']['financialStatus']='EM_DIA';if(driver.status===DriverStatus.BLOCKED)financialStatus='BLOQUEADO_FINANCEIRO';else if(totalOverdueAmount>0)financialStatus='EM_ATRASO';else if(totalPendingAmount>0)financialStatus='ATENCAO';return {driver,currentVehicle,currentContract:currentContract||undefined,contractHistory:allContracts,documents,trafficTickets:tickets,securityDeposits:deposits,receivables,historyLogs:audits.filter(x=>x.entityId===id).sort((a,b)=>new Date(b.timestamp).getTime()-new Date(a.timestamp).getTime()),communicationLogs:communications,financialSummary:{totalPendingAmount,totalOverdueAmount,totalPaidAmount,overdueCount:overdue.length,financialStatus},cnhAlert:evaluateCnhStatus(driver.cnhExpiration)};}
 async addDocument(driver:Driver,data:{documentType:string;documentNumber?:string;expirationDate?:string;notes?:string}){const now=new Date().toISOString();const status=data.expirationDate?evaluateCnhStatus(data.expirationDate).status:DocumentStatus.VALID;const doc:DriverDocument={id:generateUUID(),companyId:driver.companyId,driverId:driver.id,documentType:data.documentType,documentNumber:data.documentNumber,expirationDate:data.expirationDate,status,notes:data.notes,createdAt:now,updatedAt:now};const created=await this.docRepo.create(doc);await AuditLogger.logAction(driver.companyId,'DriverDocument',created.id,AuditAction.CREATE,'legacy-supplement','Legacy supplemental UI',null,created);return created;}
 async removeDocument(driver:Driver,id:string){const doc=await this.docRepo.findById(id);if(!doc||doc.driverId!==driver.id)return false;const ok=await this.docRepo.delete(id);if(ok)await AuditLogger.logAction(driver.companyId,'DriverDocument',id,AuditAction.DELETE,'legacy-supplement','Legacy supplemental UI',doc,null);return ok;}
 async addCommunicationLog(data:Omit<CommunicationLog,'id'|'dateTime'>){return this.commRepo.create({...data,id:generateUUID(),dateTime:new Date().toISOString()});}
 async updateCommunicationStatus(id:string,status:CommunicationLog['status']){const old=await this.commRepo.findById(id);if(!old)throw new Error('Log de comunicação não encontrado.');return this.commRepo.update(id,{status});}
}
''',encoding='utf-8')

p=Path('src/components/drivers/DriversManagement.tsx');text=p.read_text(encoding='utf-8')
text=replace_once(text,"import { DriverRepository, VehicleRepository } from '../../persistence/repositories/localRepositories';\nimport { DriverService, evaluateCnhStatus } from '../../domain/services/DriverService';","import { DriverClient } from '../../api/driverClient';\nimport { VehicleClient } from '../../api/vehicleClient';\nimport { evaluateCnhStatus } from '../../shared/utils/driverValidation';",'management imports')
text=replace_once(text,"export const DriversManagement: React.FC<DriversManagementProps> = ({\n  companyId,\n  onSelectVehicle,\n}) => {","export const DriversManagement: React.FC<DriversManagementProps> = ({\n  onSelectVehicle,\n}) => {",'management ignore company')
old="""      const driverRepo = new DriverRepository();
      const vehicleRepo = new VehicleRepository();

      const [allDrivers, allVehicles] = await Promise.all([
        driverRepo.findAll({ companyId }),
        vehicleRepo.findAll({ companyId }),
      ]);
"""
new="""      const [allDrivers, allVehicles] = await Promise.all([
        DriverClient.list(),
        VehicleClient.list(),
      ]);
"""
text=replace_once(text,old,new,'management server lists')
text=replace_once(text,'      setDrivers(allDrivers.filter((d) => !d.isArchived));','      setDrivers(allDrivers);','management archived server filtered')
text=replace_once(text,'  }, [companyId]);','  }, []);','management effect')
text=replace_once(text,"      const driverService = new DriverService();\n      await driverService.deleteOrArchiveDriver(deletingDriver.id, 'usr-admin', 'Administrador');","      await DriverClient.archive(deletingDriver.id);",'management archive')
text=replace_once(text,'        companyId={companyId}\n','', 'form remove company prop')
p.write_text(text,encoding='utf-8')

p=Path('src/components/drivers/DriverFormModal.tsx');text=p.read_text(encoding='utf-8')
text=replace_once(text,"import { DriverService, CreateDriverDTO } from '../../domain/services/DriverService';","import { DriverClient, DriverCreateInput } from '../../api/driverClient';",'form client import')
text=replace_once(text,'import { DriverStatus } from \'../../types/enums\';\n','', 'form status import')
text=replace_once(text,'  companyId: string;\n','', 'form company prop')
text=replace_once(text,'  companyId,\n','', 'form company destructure')
text=replace_once(text,"  const [status, setStatus] = useState<DriverStatus>(DriverStatus.ACTIVE);\n",'', 'form status state')
text=text.replace('      setStatus(driverToEdit.status);\n','')
text=text.replace('      setStatus(DriverStatus.ACTIVE);\n','')
old="""      const dto: CreateDriverDTO = {
        companyId,
        fullName: formData.fullName,
        cpf: formData.cpf,
        rg: formData.rg || undefined,
        birthDate: formData.birthDate,
        phone: formData.phone,
        whatsapp: formData.whatsapp || undefined,
        email: formData.email || undefined,
        address: formData.address,
        cnhNumber: formData.cnhNumber,
        cnhCategory: formData.cnhCategory,
        cnhExpiration: formData.cnhExpiration,
        appPlatforms,
        notes: formData.notes || undefined,
      };

      const driverService = new DriverService();
      if (driverToEdit) {
        await driverService.updateDriver(
          driverToEdit.id,
          { ...dto, status },
          'usr-admin',
          'Administrador'
        );
      } else {
        await driverService.createDriver(dto, 'usr-admin', 'Administrador');
      }
"""
new="""      const dto: DriverCreateInput = {
        fullName: formData.fullName,
        cpf: formData.cpf,
        rg: formData.rg || undefined,
        birthDate: formData.birthDate,
        phone: formData.phone,
        whatsapp: formData.whatsapp || undefined,
        email: formData.email || undefined,
        address: formData.address,
        cnhNumber: formData.cnhNumber,
        cnhCategory: formData.cnhCategory,
        cnhExpiration: formData.cnhExpiration,
        appPlatforms,
        notes: formData.notes || undefined,
      };

      if (driverToEdit) await DriverClient.update(driverToEdit.id, dto);
      else await DriverClient.create(dto);
"""
text=replace_once(text,old,new,'form submit')
# Remove operational status selector block.
start=text.find('          {/* STATUS OPERACIONAL (SÓ EDIÇÃO) */}')
if start>=0:
    end=text.find('          {/*',start+10)
    if end<0: raise SystemExit('form status block end not found')
    text=text[:start]+text[end:]
p.write_text(text,encoding='utf-8')

p=Path('src/components/drivers/DriverDetailsModal.tsx');text=p.read_text(encoding='utf-8')
text=replace_once(text,"import {\n  DriverService,\n  DriverDetailedSummary,\n} from '../../domain/services/DriverService';","import { DriverClient } from '../../api/driverClient';\nimport { VehicleClient } from '../../api/vehicleClient';\nimport { DriverLegacyDetailsBridge, DriverDetailedSummary } from '../../domain/services/DriverLegacyDetailsBridge';",'details imports')
text=text.replace("      const driverService = new DriverService();\n      await driverService.addCommunicationLog({","      const bridge = new DriverLegacyDetailsBridge();\n      await bridge.addCommunicationLog({")
text=text.replace("      const driverService = new DriverService();\n      await driverService.updateCommunicationStatus(logId, 'MANUALLY_CONFIRMED_SENT');","      const bridge = new DriverLegacyDetailsBridge();\n      await bridge.updateCommunicationStatus(logId, 'MANUALLY_CONFIRMED_SENT');")
old="""      const driverService = new DriverService();
      const data = await driverService.getDriverDetailedSummary(driverId);
      setSummary(data);
"""
new="""      const coreDriver = await DriverClient.get(driverId);
      const currentVehicle = coreDriver.currentVehicleId ? await VehicleClient.get(coreDriver.currentVehicleId) : undefined;
      const bridge = new DriverLegacyDetailsBridge();
      const data = await bridge.compose(coreDriver, currentVehicle);
      setSummary(data);
"""
text=replace_once(text,old,new,'details load')
text=replace_once(text,"      const driverService = new DriverService();\n      await driverService.blockDriver(driverId, blockReason, 'usr-admin', 'Administrador');","      await DriverClient.changeStatus(driverId, DriverStatus.BLOCKED, blockReason);",'details block')
text=replace_once(text,"      const driverService = new DriverService();\n      await driverService.unblockDriver(driverId, unblockReason, 'usr-admin', 'Administrador');","      await DriverClient.changeStatus(driverId, DriverStatus.ACTIVE, unblockReason);",'details unblock')
old="""      const driverService = new DriverService();
      await driverService.addDocument(
        driverId,
        {
          documentType: docType,
          documentNumber: docNumber,
          expirationDate: docExpDate || undefined,
          notes: docNotes,
        },
        'usr-admin',
        'Administrador'
      );
"""
new="""      if (!driver) throw new Error('Motorista não carregado.');
      const bridge = new DriverLegacyDetailsBridge();
      await bridge.addDocument(driver, {
        documentType: docType,
        documentNumber: docNumber,
        expirationDate: docExpDate || undefined,
        notes: docNotes,
      });
"""
text=replace_once(text,old,new,'details add doc')
text=replace_once(text,"      const driverService = new DriverService();\n      await driverService.removeDocument(docId, 'usr-admin', 'Administrador');","      if (!driver) throw new Error('Motorista não carregado.');\n      const bridge = new DriverLegacyDetailsBridge();\n      await bridge.removeDocument(driver, docId);",'details remove doc')
p.write_text(text,encoding='utf-8')
