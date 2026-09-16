import {
  VehicleDocumentRepository,
  FileAttachmentRepository,
} from '../../persistence/repositories/localRepositories';
import { VehicleDocument, Insurance, FileAttachment, Tracker } from '../../types/entities';
import { DocumentStatus, OriginType, AuditAction } from '../../types/enums';
import { generateUUID } from '../../shared/utils/uuid';
import { AuditLogger } from '../../shared/utils/auditLogger';
import { PayableService } from '../finance/PayableService';

export interface CreateVehicleDocumentParams {
  companyId:string;vehicleId:string;documentType:string;documentNumber?:string;issueDate?:string;expirationDate:string;cost?:number;notes?:string;fileUrl?:string;fileName?:string;generatePayable?:boolean;categoryId?:string;userId:string;userName:string;
}
export interface CreateInsuranceParams {
  companyId:string;vehicleId:string;insuranceCompany:string;policyNumber:string;coverageDetails:string;deductibleAmount:number;totalPremiumAmount:number;installmentsCount:number;startDate:string;endDate:string;brokerName?:string;brokerPhone?:string;fileUrl?:string;generatePayable?:boolean;categoryId?:string;userId:string;userName:string;
}
export interface CreateTrackerParams {
  companyId:string;vehicleId:string;equipmentModel:string;imei:string;chipCarrier:string;chipNumber:string;monthlyCost:number;installationDate:string;supplierId?:string;notes?:string;userId:string;userName:string;categoryId?:string;
}

/** Transitional compatibility service. Migrated Insurance/Tracker commands fail closed. */
export class FleetComplianceService {
  private static docRepo=new VehicleDocumentRepository();
  private static attachmentRepo=new FileAttachmentRepository();

  static calculateDocumentStatus(expirationDate:string):DocumentStatus{
    const today=new Date();today.setHours(0,0,0,0);const exp=new Date(expirationDate);exp.setHours(0,0,0,0);const diffDays=Math.ceil((exp.getTime()-today.getTime())/(1000*60*60*24));
    return diffDays<0?DocumentStatus.EXPIRED:diffDays<=30?DocumentStatus.EXPIRING_SOON:DocumentStatus.VALID;
  }

  static isCrlvSituationValid(situacao?: string, expirationDate?: string): boolean {
    const isSituationOk = !situacao || situacao === 'Em dia' || situacao === 'Regular' || situacao === 'VALID';
    if (!expirationDate) return isSituationOk;
    const today = new Date().toISOString().slice(0, 10);
    return isSituationOk && expirationDate >= today;
  }

  static async createDocument(params:CreateVehicleDocumentParams):Promise<VehicleDocument>{
    if(!params.vehicleId)throw new Error('Veículo é obrigatório para o documento');if(!params.documentType)throw new Error('Tipo de documento é obrigatório');if(!params.expirationDate)throw new Error('Data de vencimento é obrigatória');
    const now=new Date().toISOString();const doc:VehicleDocument={id:generateUUID(),companyId:params.companyId,vehicleId:params.vehicleId,documentType:params.documentType,documentNumber:params.documentNumber,issueDate:params.issueDate,expirationDate:params.expirationDate,status:this.calculateDocumentStatus(params.expirationDate),cost:params.cost||0,fileUrl:params.fileUrl,notes:params.notes,createdAt:now,updatedAt:now};
    const saved=await this.docRepo.create(doc);
    if(params.fileUrl&&params.fileName){const attachment:FileAttachment={id:generateUUID(),companyId:params.companyId,entityName:'VehicleDocument',entityId:saved.id,fileName:params.fileName,fileSize:1024,mimeType:'application/pdf',uploadedBy:params.userName,createdAt:now};await this.attachmentRepo.create(attachment);}
    if(params.generatePayable&&params.cost&&params.cost>0)await PayableService.create({companyId:params.companyId,originType:OriginType.DOCUMENTATION,originId:saved.id,vehicleId:params.vehicleId,categoryId:params.categoryId||'cat-doc-default',description:`Obrigação Documental: ${params.documentType} (${params.documentNumber||'N/A'})`,totalAmount:params.cost,dueDate:params.expirationDate,userId:params.userId,userName:params.userName});
    await AuditLogger.logAction(params.companyId,'VehicleDocument',saved.id,AuditAction.CREATE,params.userId,params.userName,null,saved);return saved;
  }
  static async updateDocument(id:string,partialData:Partial<VehicleDocument>,userId:string,userName:string):Promise<VehicleDocument>{const existing=await this.docRepo.findById(id);if(!existing)throw new Error(`Documento ${id} não encontrado`);if(partialData.expirationDate)partialData.status=this.calculateDocumentStatus(partialData.expirationDate);const updated=await this.docRepo.update(id,partialData);await AuditLogger.logAction(updated.companyId,'VehicleDocument',id,AuditAction.UPDATE,userId,userName,existing,updated);return updated;}
  static async deleteDocument(id:string,userId:string,userName:string):Promise<boolean>{const existing=await this.docRepo.findById(id);if(!existing)throw new Error(`Documento ${id} não encontrado`);await this.docRepo.delete(id);await AuditLogger.logAction(existing.companyId,'VehicleDocument',id,AuditAction.DELETE,userId,userName,existing,null);return true;}

  static async createInsurance(_params:CreateInsuranceParams):Promise<Insurance>{
    throw new Error('SECURITY-2L: criação de seguro é server-authoritative; use InsuranceClient.create');
  }
  static async cancelInsurance(_id:string,_reason:string,_userId:string,_userName:string):Promise<Insurance>{
    throw new Error('SECURITY-2L: cancelamento de seguro é server-authoritative; use InsuranceClient.cancel');
  }
  static async createTracker(_params:CreateTrackerParams):Promise<Tracker>{throw new Error('SECURITY-2K: criação de rastreador é server-authoritative; use TrackerClient.create');}
  static async removeTracker(_id:string,_reason:string,_userId:string,_userName:string):Promise<Tracker>{throw new Error('SECURITY-2K: remoção de rastreador é server-authoritative; use TrackerClient.remove');}
  static async updateTrackerCost(_id:string,_newMonthlyCost:number,_userId:string,_userName:string):Promise<Tracker>{throw new Error('SECURITY-2K: alteração de mensalidade é server-authoritative; use TrackerClient.update');}
}
