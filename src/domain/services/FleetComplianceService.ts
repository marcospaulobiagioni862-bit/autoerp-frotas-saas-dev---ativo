import {
  VehicleDocumentRepository,
  InsuranceRepository,
  TrackerRepository,
  FileAttachmentRepository,
  AuditLogRepository,
  RecurringRuleRepository,
  VehicleRepository,
} from '../../persistence/repositories/localRepositories';
import { VehicleDocument, Insurance, Tracker, FileAttachment } from '../../types/entities';
import { DocumentStatus, OriginType, AuditAction, RecurringFrequency } from '../../types/enums';
import { generateUUID } from '../../shared/utils/uuid';
import { AuditLogger } from '../../shared/utils/auditLogger';
import { PayableService } from '../finance/PayableService';

export interface CreateVehicleDocumentParams {
  companyId: string;
  vehicleId: string;
  documentType: string;
  documentNumber?: string;
  issueDate?: string;
  expirationDate: string;
  cost?: number;
  notes?: string;
  fileUrl?: string;
  fileName?: string;
  generatePayable?: boolean;
  categoryId?: string;
  userId: string;
  userName: string;
}

export interface CreateInsuranceParams {
  companyId: string;
  vehicleId: string;
  insuranceCompany: string;
  policyNumber: string;
  coverageDetails: string;
  deductibleAmount: number;
  totalPremiumAmount: number;
  installmentsCount: number;
  startDate: string;
  endDate: string;
  brokerName?: string;
  brokerPhone?: string;
  fileUrl?: string;
  generatePayable?: boolean;
  categoryId?: string;
  userId: string;
  userName: string;
}

export interface CreateTrackerParams {
  companyId: string;
  vehicleId: string;
  equipmentModel: string;
  imei: string;
  chipCarrier: string;
  chipNumber: string;
  monthlyCost: number;
  installationDate: string;
  supplierId?: string;
  notes?: string;
  userId: string;
  userName: string;
}

export class FleetComplianceService {
  private static docRepo = new VehicleDocumentRepository();
  private static insuranceRepo = new InsuranceRepository();
  private static trackerRepo = new TrackerRepository();
  private static attachmentRepo = new FileAttachmentRepository();
  private static vehicleRepo = new VehicleRepository();
  private static recurringRuleRepo = new RecurringRuleRepository();

  public static calculateDocumentStatus(expirationDate: string): DocumentStatus {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const exp = new Date(expirationDate);
    exp.setHours(0, 0, 0, 0);

    const diffTime = exp.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return DocumentStatus.EXPIRED;
    } else if (diffDays <= 30) {
      return DocumentStatus.EXPIRING_SOON;
    } else {
      return DocumentStatus.VALID;
    }
  }

  // --- DOCUMENTS ---
  public static async createDocument(params: CreateVehicleDocumentParams): Promise<VehicleDocument> {
    if (!params.vehicleId) throw new Error('Veículo é obrigatório para o documento');
    if (!params.documentType) throw new Error('Tipo de documento é obrigatório');
    if (!params.expirationDate) throw new Error('Data de vencimento é obrigatória');

    const status = this.calculateDocumentStatus(params.expirationDate);
    const id = generateUUID();

    const doc: VehicleDocument = {
      id,
      companyId: params.companyId,
      vehicleId: params.vehicleId,
      documentType: params.documentType,
      documentNumber: params.documentNumber,
      issueDate: params.issueDate,
      expirationDate: params.expirationDate,
      status,
      cost: params.cost || 0,
      fileUrl: params.fileUrl,
      notes: params.notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const saved = await this.docRepo.create(doc);

    // If attachment file name provided, save file attachment record
    if (params.fileUrl && params.fileName) {
      const attachment: FileAttachment = {
        id: generateUUID(),
        companyId: params.companyId,
        entityName: 'VehicleDocument',
        entityId: saved.id,
        fileName: params.fileName,
        fileSize: 1024,
        mimeType: 'application/pdf',
        uploadedBy: params.userName,
        createdAt: new Date().toISOString(),
      };
      await this.attachmentRepo.create(attachment);
    }

    // Generate Payable if requested and cost > 0
    if (params.generatePayable && params.cost && params.cost > 0) {
      await PayableService.create({
        companyId: params.companyId,
        originType: OriginType.DOCUMENTATION,
        originId: saved.id,
        vehicleId: params.vehicleId,
        categoryId: params.categoryId || 'cat-doc-default',
        description: `Obrigação Documental: ${params.documentType} (${params.documentNumber || 'N/A'})`,
        totalAmount: params.cost,
        dueDate: params.expirationDate,
        userId: params.userId,
        userName: params.userName,
      });
    }

    await AuditLogger.logAction(
      params.companyId,
      'VehicleDocument',
      saved.id,
      AuditAction.CREATE,
      params.userId,
      params.userName,
      null,
      saved
    );

    return saved;
  }

  public static async updateDocument(
    id: string,
    partialData: Partial<VehicleDocument>,
    userId: string,
    userName: string
  ): Promise<VehicleDocument> {
    const existing = await this.docRepo.findById(id);
    if (!existing) throw new Error(`Documento ${id} não encontrado`);

    if (partialData.expirationDate) {
      partialData.status = this.calculateDocumentStatus(partialData.expirationDate);
    }

    const updated = await this.docRepo.update(id, partialData);

    await AuditLogger.logAction(
      updated.companyId,
      'VehicleDocument',
      id,
      AuditAction.UPDATE,
      userId,
      userName,
      existing,
      updated
    );

    return updated;
  }

  public static async deleteDocument(id: string, userId: string, userName: string): Promise<boolean> {
    const existing = await this.docRepo.findById(id);
    if (!existing) throw new Error(`Documento ${id} não encontrado`);

    await this.docRepo.delete(id);

    await AuditLogger.logAction(
      existing.companyId,
      'VehicleDocument',
      id,
      AuditAction.DELETE,
      userId,
      userName,
      existing,
      null
    );

    return true;
  }

  // --- INSURANCES ---
  public static async createInsurance(params: CreateInsuranceParams): Promise<Insurance> {
    if (!params.vehicleId) throw new Error('Veículo é obrigatório para apólice de seguro');
    if (!params.policyNumber) throw new Error('Número da apólice é obrigatório');

    const status = this.calculateDocumentStatus(params.endDate);
    const id = generateUUID();

    const insurance: Insurance = {
      id,
      companyId: params.companyId,
      vehicleId: params.vehicleId,
      insuranceCompany: params.insuranceCompany,
      policyNumber: params.policyNumber,
      coverageDetails: params.coverageDetails,
      deductibleAmount: params.deductibleAmount,
      totalPremiumAmount: params.totalPremiumAmount,
      installmentsCount: params.installmentsCount,
      startDate: params.startDate,
      endDate: params.endDate,
      status,
      brokerName: params.brokerName,
      brokerPhone: params.brokerPhone,
      fileUrl: params.fileUrl,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const saved = await this.insuranceRepo.create(insurance);

    // Generate Payable if requested
    if (params.generatePayable && params.totalPremiumAmount > 0) {
      await PayableService.create({
        companyId: params.companyId,
        originType: OriginType.INSURANCE,
        originId: saved.id,
        vehicleId: params.vehicleId,
        categoryId: params.categoryId || 'cat-insurance-default',
        description: `Apólice de Seguro: ${params.insuranceCompany} (${params.policyNumber})`,
        totalAmount: params.totalPremiumAmount,
        dueDate: params.startDate,
        installmentsCount: params.installmentsCount || 1,
        userId: params.userId,
        userName: params.userName,
      });
    }

    await AuditLogger.logAction(
      params.companyId,
      'Insurance',
      saved.id,
      AuditAction.CREATE,
      params.userId,
      params.userName,
      null,
      saved
    );

    return saved;
  }

  public static async cancelInsurance(
    id: string,
    reason: string,
    userId: string,
    userName: string
  ): Promise<Insurance> {
    const existing = await this.insuranceRepo.findById(id);
    if (!existing) throw new Error(`Seguro ${id} não encontrado`);

    const updated = await this.insuranceRepo.update(id, {
      status: DocumentStatus.EXPIRED,
      updatedAt: new Date().toISOString(),
    });

    await AuditLogger.logAction(
      existing.companyId,
      'Insurance',
      id,
      AuditAction.CANCEL,
      userId,
      userName,
      existing,
      updated
    );

    return updated;
  }

  // --- TRACKERS ---
  public static async createTracker(params: CreateTrackerParams): Promise<Tracker> {
    if (!params.vehicleId) throw new Error('Veículo é obrigatório para o rastreador');
    if (!params.imei) throw new Error('IMEI do rastreador é obrigatório');

    // Multi-tenancy check
    const vehicle = await this.vehicleRepo.findById(params.vehicleId);
    if (vehicle && vehicle.companyId !== params.companyId) {
      throw new Error('Veículo pertence a outra empresa (tenant)');
    }

    // Deactivate previous active trackers for this vehicle and complete their recurring rules
    const existingTrackers = await this.trackerRepo.findAll({ vehicleId: params.vehicleId });
    for (const t of existingTrackers) {
      if (t.status === 'ACTIVE') {
        await this.trackerRepo.update(t.id, { status: 'REMOVED' });
        const companyRules = await this.recurringRuleRepo.findAll({ companyId: params.companyId });
        const activeRule = companyRules.find(
          (r) => r.originType === OriginType.TRACKER && r.originId === t.id && r.status === 'ACTIVE'
        );
        if (activeRule) {
          await this.recurringRuleRepo.update(activeRule.id, {
            status: 'COMPLETED',
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }

    const id = generateUUID();
    const tracker: Tracker = {
      id,
      companyId: params.companyId,
      vehicleId: params.vehicleId,
      equipmentModel: params.equipmentModel,
      imei: params.imei,
      chipCarrier: params.chipCarrier,
      chipNumber: params.chipNumber,
      monthlyCost: params.monthlyCost,
      installationDate: params.installationDate,
      status: 'ACTIVE',
      supplierId: params.supplierId,
      notes: params.notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const saved = await this.trackerRepo.create(tracker);

    // Create RecurringRule if monthlyCost > 0
    if (params.monthlyCost && params.monthlyCost > 0) {
      await this.recurringRuleRepo.create({
        id: generateUUID(),
        companyId: params.companyId,
        originType: OriginType.TRACKER,
        originId: saved.id,
        description: `Mensalidade Rastreador - Veículo ${vehicle?.plate || params.vehicleId} (${params.equipmentModel})`,
        amount: params.monthlyCost,
        frequency: RecurringFrequency.MONTHLY,
        startDate: params.installationDate,
        nextGenerationDate: params.installationDate,
        categoryId: 'cat-tracker-exp',
        vehicleId: params.vehicleId,
        supplierId: params.supplierId,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    await AuditLogger.logAction(
      params.companyId,
      'Tracker',
      saved.id,
      AuditAction.CREATE,
      params.userId,
      params.userName,
      null,
      saved
    );

    return saved;
  }

  public static async removeTracker(
    id: string,
    reason: string,
    userId: string,
    userName: string
  ): Promise<Tracker> {
    const existing = await this.trackerRepo.findById(id);
    if (!existing) throw new Error(`Rastreador ${id} não encontrado`);

    const updated = await this.trackerRepo.update(id, {
      status: 'REMOVED',
      notes: `${existing.notes || ''} [Removido: ${reason}]`,
      updatedAt: new Date().toISOString(),
    });

    // Complete/deactivate recurring rules for this tracker
    const companyRules = await this.recurringRuleRepo.findAll({ companyId: existing.companyId });
    const activeRules = companyRules.filter(
      (r) => r.originType === OriginType.TRACKER && r.originId === id && r.status === 'ACTIVE'
    );
    for (const rule of activeRules) {
      await this.recurringRuleRepo.update(rule.id, {
        status: 'COMPLETED',
        updatedAt: new Date().toISOString(),
      });
    }

    await AuditLogger.logAction(
      existing.companyId,
      'Tracker',
      id,
      AuditAction.UPDATE,
      userId,
      userName,
      existing,
      updated
    );

    return updated;
  }

  public static async updateTrackerCost(
    id: string,
    newMonthlyCost: number,
    userId: string,
    userName: string
  ): Promise<Tracker> {
    const existing = await this.trackerRepo.findById(id);
    if (!existing) throw new Error(`Rastreador ${id} não encontrado`);

    const updated = await this.trackerRepo.update(id, {
      monthlyCost: newMonthlyCost,
      updatedAt: new Date().toISOString(),
    });

    // Update active RecurringRule amount for this tracker
    const companyRules = await this.recurringRuleRepo.findAll({ companyId: existing.companyId });
    const activeRule = companyRules.find(
      (r) => r.originType === OriginType.TRACKER && r.originId === id && r.status === 'ACTIVE'
    );
    if (activeRule) {
      await this.recurringRuleRepo.update(activeRule.id, {
        amount: newMonthlyCost,
        updatedAt: new Date().toISOString(),
      });
    }

    await AuditLogger.logAction(
      existing.companyId,
      'Tracker',
      id,
      AuditAction.UPDATE,
      userId,
      userName,
      existing,
      updated
    );

    return updated;
  }
}
