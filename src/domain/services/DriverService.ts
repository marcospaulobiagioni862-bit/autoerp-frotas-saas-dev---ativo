// AutoERP Driver Domain Service

import {
  DriverRepository,
  DriverDocumentRepository,
  ContractRepository,
  VehicleRepository,
  TrafficTicketRepository,
  AccountReceivableRepository,
  SecurityDepositRepository,
  AuditLogRepository,
  CommunicationLogRepository,
} from '../../persistence/repositories/localRepositories';
import { Driver, DriverDocument, CommunicationLog } from '../../types/entities';
import { DriverStatus, DocumentStatus, AuditAction, ObligationStatus } from '../../types/enums';
import { AuditLogger } from '../../shared/utils/auditLogger';
import { generateUUID } from '../../shared/utils/uuid';
import { hasDriverHealthPermission, isDriverHealthAuthorized } from '../../shared/security/driverHealthAuthorization';

export interface CreateDriverDTO {
  companyId: string;
  fullName: string;
  cpf: string;
  rg?: string;
  birthDate: string; // YYYY-MM-DD
  phone: string;
  whatsapp?: string;
  email?: string;
  address: {
    street: string;
    number: string;
    complement?: string;
    neighborhood: string;
    city: string;
    state: string;
    zipCode: string;
  };
  cnhNumber: string;
  cnhCategory: string;
  cnhIssueDate?: string;
  cnhExpiration: string; // YYYY-MM-DD
  appPlatforms?: string[];
  notes?: string;
}

export interface UpdateDriverDTO extends Partial<CreateDriverDTO> {
  status?: DriverStatus;
  currentVehicleId?: string;
  currentContractId?: string;
}

export interface DriverDetailedSummary {
  driver: Driver;
  currentVehicle?: any;
  currentContract?: any;
  contractHistory: any[];
  documents: DriverDocument[];
  trafficTickets: any[];
  securityDeposits: any[];
  receivables: any[];
  historyLogs: any[];
  communicationLogs: CommunicationLog[];
  financialSummary: {
    totalPendingAmount: number;
    totalOverdueAmount: number;
    totalPaidAmount: number;
    overdueCount: number;
    financialStatus: 'EM_DIA' | 'ATENCAO' | 'EM_ATRASO' | 'BLOQUEADO_FINANCEIRO';
  };
  cnhAlert: {
    status: DocumentStatus;
    daysToExpiration: number;
    message: string;
  };
}

export function isValidCPF(cpf: string): boolean {
  const clean = cpf.replace(/\D/g, '');
  if (clean.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(clean)) return false;

  let sum = 0;
  let remainder = 0;

  for (let i = 1; i <= 9; i++) {
    sum += parseInt(clean.substring(i - 1, i), 10) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(clean.substring(9, 10), 10)) return false;

  sum = 0;
  for (let i = 1; i <= 10; i++) {
    sum += parseInt(clean.substring(i - 1, i), 10) * (12 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(clean.substring(10, 11), 10)) return false;

  return true;
}

export function evaluateCnhStatus(expirationDateStr: string): {
  status: DocumentStatus;
  daysToExpiration: number;
  message: string;
} {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expDate = new Date(expirationDateStr);
  expDate.setHours(0, 0, 0, 0);

  const diffTime = expDate.getTime() - today.getTime();
  const daysToExpiration = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (daysToExpiration < 0) {
    return {
      status: DocumentStatus.EXPIRED,
      daysToExpiration,
      message: `CNH Vencida há ${Math.abs(daysToExpiration)} dias.`,
    };
  } else if (daysToExpiration <= 30) {
    return {
      status: DocumentStatus.EXPIRING_SOON,
      daysToExpiration,
      message: `CNH Vence em ${daysToExpiration} dias.`,
    };
  } else {
    return {
      status: DocumentStatus.VALID,
      daysToExpiration,
      message: 'CNH Válida.',
    };
  }
}

export class DriverService {
  private driverRepo = new DriverRepository();
  private docRepo = new DriverDocumentRepository();
  private contractRepo = new ContractRepository();
  private vehicleRepo = new VehicleRepository();
  private ticketRepo = new TrafficTicketRepository();
  private receivableRepo = new AccountReceivableRepository();
  private depositRepo = new SecurityDepositRepository();
  private auditRepo = new AuditLogRepository();
  private commRepo = new CommunicationLogRepository();

  public async createDriver(
    dto: CreateDriverDTO,
    userId: string,
    userName: string
  ): Promise<Driver> {
    if (!dto.fullName || dto.fullName.trim().length < 3) {
      throw new Error('Nome completo é obrigatório e deve ter no mínimo 3 caracteres.');
    }

    const cleanCpf = dto.cpf.replace(/\D/g, '');
    if (!isValidCPF(cleanCpf)) {
      throw new Error(`CPF ${dto.cpf} é inválido.`);
    }

    // Check CPF uniqueness
    const existingCpf = await this.driverRepo.findByCpf(cleanCpf);
    if (existingCpf) {
      throw new Error(`O CPF ${dto.cpf} já está cadastrado para o motorista ${existingCpf.fullName}.`);
    }

    const cleanCnh = dto.cnhNumber.replace(/\D/g, '');
    if (!cleanCnh || cleanCnh.length < 8) {
      throw new Error('Número de CNH inválido.');
    }

    // Check CNH uniqueness
    const existingCnh = await this.driverRepo.findByCnh(cleanCnh);
    if (existingCnh) {
      throw new Error(`A CNH ${dto.cnhNumber} já está cadastrada para o motorista ${existingCnh.fullName}.`);
    }

    // Check birthDate not in future
    const birthDateObj = new Date(dto.birthDate);
    if (isNaN(birthDateObj.getTime()) || birthDateObj > new Date()) {
      throw new Error('Data de nascimento inválida ou no futuro.');
    }

    // Evaluate CNH Expiration status
    const cnhEval = evaluateCnhStatus(dto.cnhExpiration);

    const now = new Date().toISOString();
    const newDriver: Driver = {
      id: generateUUID(),
      companyId: dto.companyId,
      fullName: dto.fullName.trim(),
      cpf: cleanCpf,
      rg: dto.rg?.trim(),
      birthDate: dto.birthDate,
      phone: dto.phone.trim(),
      whatsapp: dto.whatsapp?.trim() || dto.phone.trim(),
      email: dto.email?.trim(),
      address: dto.address,
      cnhNumber: cleanCnh,
      cnhCategory: dto.cnhCategory.trim().toUpperCase(),
      cnhExpiration: dto.cnhExpiration,
      cnhStatus: cnhEval.status,
      appPlatforms: dto.appPlatforms || ['Uber', '99'],
      status: cnhEval.status === DocumentStatus.EXPIRED ? DriverStatus.BLOCKED : DriverStatus.ACTIVE,
      notes: dto.notes,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    };

    const created = await this.driverRepo.create(newDriver);

    // Create CNH document record automatically
    await this.docRepo.create({
      id: generateUUID(),
      companyId: dto.companyId,
      driverId: created.id,
      documentType: 'CNH',
      documentNumber: cleanCnh,
      expirationDate: dto.cnhExpiration,
      status: cnhEval.status,
      notes: `Categoria ${dto.cnhCategory}`,
      createdAt: now,
      updatedAt: now,
    });

    await AuditLogger.logAction(
      dto.companyId,
      'Driver',
      created.id,
      AuditAction.CREATE,
      userId,
      userName,
      null,
      created
    );

    return created;
  }

  private static hasHealthPermission(
    action: 'VIEW_DRIVER_HEALTH' | 'EDIT_DRIVER_HEALTH',
    userContext?: { userId: string; role: string; active: boolean; companyId: string; permissions?: string[] }
  ): boolean {
    return hasDriverHealthPermission(action, userContext);
  }

  public static isHealthAuthorized(
    action: 'VIEW_DRIVER_HEALTH' | 'EDIT_DRIVER_HEALTH',
    driver: Driver,
    userContext?: { userId: string; role: string; active: boolean; companyId: string; permissions?: string[] }
  ): boolean {
    return isDriverHealthAuthorized(action, driver.companyId, userContext);
  }

  private static assertLegacyHealthTestRuntime(): void {
    if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
      throw new Error('Acesso negado: dados de saúde exigem autoridade server-side.');
    }
  }

  public async getDriverHealthAndEmergency(
    driverId: string,
    userContext?: { userId: string; role: string; active: boolean; companyId: string; permissions?: string[] }
  ): Promise<any> {
    DriverService.assertLegacyHealthTestRuntime();
    const context = userContext || { userId: 'usr-unknown', role: 'READONLY', active: false, companyId: '' };
    if (!DriverService.hasHealthPermission('VIEW_DRIVER_HEALTH', context)) {
      throw new Error('Acesso negado: Permissão VIEW_DRIVER_HEALTH necessária.');
    }
    const existing = await this.driverRepo.findById(driverId);
    if (!existing) throw new Error(`Motorista ${driverId} não encontrado.`);
    if (!DriverService.isHealthAuthorized('VIEW_DRIVER_HEALTH', existing, context)) {
      throw new Error('Acesso negado: Permissão VIEW_DRIVER_HEALTH necessária.');
    }
    return existing.healthAndEmergency || {};
  }

  public async updateHealthAndEmergency(
    driverId: string,
    healthData: any,
    userId: string,
    userName: string,
    userContext?: { userId: string; role: string; active: boolean; companyId: string; permissions?: string[] }
  ): Promise<Driver> {
    DriverService.assertLegacyHealthTestRuntime();
    if (userContext && !DriverService.hasHealthPermission('EDIT_DRIVER_HEALTH', userContext)) {
      throw new Error('Acesso negado: Permissão EDIT_DRIVER_HEALTH necessária.');
    }
    const existing = await this.driverRepo.findById(driverId);
    if (!existing) throw new Error(`Motorista ${driverId} não encontrado.`);
    const context = userContext || { userId, role: 'ADMIN', active: true, companyId: existing.companyId };
    if (!DriverService.isHealthAuthorized('EDIT_DRIVER_HEALTH', existing, context)) {
      throw new Error('Acesso negado: Permissão EDIT_DRIVER_HEALTH necessária.');
    }
    const healthAndEmergency = { ...(existing.healthAndEmergency || {}), ...healthData, lastUpdateDate: new Date().toISOString().split('T')[0], responsibleUser: userName || context.userId };
    return this.driverRepo.update(driverId, { healthAndEmergency });
  }

  public async updateDriver(
    driverId: string,
    dto: UpdateDriverDTO,
    userId: string,
    userName: string
  ): Promise<Driver> {
    const existing = await this.driverRepo.findById(driverId);
    if (!existing) {
      throw new Error(`Motorista ${driverId} não encontrado.`);
    }

    const changes: Partial<Driver> = {};

    if (dto.fullName) {
      if (dto.fullName.trim().length < 3) {
        throw new Error('Nome completo inválido.');
      }
      changes.fullName = dto.fullName.trim();
    }

    if (dto.cpf) {
      const cleanCpf = dto.cpf.replace(/\D/g, '');
      if (!isValidCPF(cleanCpf)) {
        throw new Error(`CPF ${dto.cpf} é inválido.`);
      }
      if (cleanCpf !== existing.cpf) {
        const checkCpf = await this.driverRepo.findByCpf(cleanCpf);
        if (checkCpf && checkCpf.id !== driverId) {
          throw new Error(`O CPF ${dto.cpf} pertence a outro motorista (${checkCpf.fullName}).`);
        }
        changes.cpf = cleanCpf;
      }
    }

    if (dto.cnhNumber) {
      const cleanCnh = dto.cnhNumber.replace(/\D/g, '');
      if (cleanCnh !== existing.cnhNumber) {
        const checkCnh = await this.driverRepo.findByCnh(cleanCnh);
        if (checkCnh && checkCnh.id !== driverId) {
          throw new Error(`A CNH ${dto.cnhNumber} pertence a outro motorista.`);
        }
        changes.cnhNumber = cleanCnh;
      }
    }

    if (dto.birthDate) {
      const bDate = new Date(dto.birthDate);
      if (isNaN(bDate.getTime()) || bDate > new Date()) {
        throw new Error('Data de nascimento no futuro ou inválida.');
      }
      changes.birthDate = dto.birthDate;
    }

    if (dto.cnhExpiration) {
      changes.cnhExpiration = dto.cnhExpiration;
      const evalCnh = evaluateCnhStatus(dto.cnhExpiration);
      changes.cnhStatus = evalCnh.status;
    }

    if (dto.rg !== undefined) changes.rg = dto.rg;
    if (dto.phone) changes.phone = dto.phone.trim();
    if (dto.whatsapp !== undefined) changes.whatsapp = dto.whatsapp;
    if (dto.email !== undefined) changes.email = dto.email;
    if (dto.address) changes.address = dto.address;
    if (dto.cnhCategory) changes.cnhCategory = dto.cnhCategory.toUpperCase();
    if (dto.appPlatforms) changes.appPlatforms = dto.appPlatforms;
    if (dto.notes !== undefined) changes.notes = dto.notes;
    if (dto.status) changes.status = dto.status;
    if (dto.currentVehicleId !== undefined) changes.currentVehicleId = dto.currentVehicleId;
    if (dto.currentContractId !== undefined) changes.currentContractId = dto.currentContractId;

    const updated = await this.driverRepo.update(driverId, changes);

    await AuditLogger.logAction(
      existing.companyId,
      'Driver',
      driverId,
      AuditAction.UPDATE,
      userId,
      userName,
      existing,
      updated
    );

    return updated;
  }

  public async changeStatus(
    driverId: string,
    newStatus: DriverStatus,
    reason: string | undefined,
    userId: string,
    userName: string
  ): Promise<Driver> {
    const driver = await this.driverRepo.findById(driverId);
    if (!driver) {
      throw new Error(`Motorista ${driverId} não foi encontrado.`);
    }

    const previousStatus = driver.status;
    if (previousStatus === newStatus) return driver;

    const updatedNotes = reason
      ? `${driver.notes || ''}\n[Alteração de Status - ${new Date().toLocaleDateString('pt-BR')}]: ${reason}`.trim()
      : driver.notes;

    const updated = await this.driverRepo.update(driverId, {
      status: newStatus,
      notes: updatedNotes,
    });

    await AuditLogger.logAction(
      driver.companyId,
      'Driver',
      driverId,
      AuditAction.UPDATE,
      userId,
      userName,
      { status: previousStatus },
      { status: newStatus, reason }
    );

    return updated;
  }

  public async blockDriver(
    driverId: string,
    reason: string,
    userId: string,
    userName: string
  ): Promise<Driver> {
    if (!reason || reason.trim().length === 0) {
      throw new Error('Motivo do bloqueio é obrigatório.');
    }
    return this.changeStatus(driverId, DriverStatus.BLOCKED, `BLOQUEIO: ${reason}`, userId, userName);
  }

  public async unblockDriver(
    driverId: string,
    reason: string,
    userId: string,
    userName: string
  ): Promise<Driver> {
    if (!reason || reason.trim().length === 0) {
      throw new Error('Motivo do desbloqueio é obrigatório.');
    }
    return this.changeStatus(driverId, DriverStatus.ACTIVE, `DESBLOQUEIO: ${reason}`, userId, userName);
  }

  public async addDocument(
    driverId: string,
    docData: {
      documentType: string;
      documentNumber?: string;
      expirationDate?: string;
      fileUrl?: string;
      notes?: string;
    },
    userId: string,
    userName: string
  ): Promise<DriverDocument> {
    const driver = await this.driverRepo.findById(driverId);
    if (!driver) throw new Error(`Motorista ${driverId} não encontrado.`);

    let status = DocumentStatus.VALID;
    if (docData.expirationDate) {
      const evalDoc = evaluateCnhStatus(docData.expirationDate);
      status = evalDoc.status;
    }

    const now = new Date().toISOString();
    const doc: DriverDocument = {
      id: generateUUID(),
      companyId: driver.companyId,
      driverId,
      documentType: docData.documentType,
      documentNumber: docData.documentNumber,
      expirationDate: docData.expirationDate,
      status,
      fileUrl: docData.fileUrl,
      notes: docData.notes,
      createdAt: now,
      updatedAt: now,
    };

    const createdDoc = await this.docRepo.create(doc);

    await AuditLogger.logAction(
      driver.companyId,
      'DriverDocument',
      createdDoc.id,
      AuditAction.CREATE,
      userId,
      userName,
      null,
      createdDoc
    );

    return createdDoc;
  }

  public async removeDocument(
    documentId: string,
    userId: string,
    userName: string
  ): Promise<boolean> {
    const doc = await this.docRepo.findById(documentId);
    if (!doc) throw new Error(`Documento ${documentId} não encontrado.`);

    const deleted = await this.docRepo.delete(documentId);

    if (deleted) {
      await AuditLogger.logAction(
        doc.companyId,
        'DriverDocument',
        documentId,
        AuditAction.DELETE,
        userId,
        userName,
        doc,
        null
      );
    }

    return deleted;
  }

  public async getDriverDetailedSummary(driverId: string): Promise<DriverDetailedSummary> {
    const driver = await this.driverRepo.findById(driverId);
    if (!driver) {
      throw new Error(`Motorista ${driverId} não foi encontrado.`);
    }

    const [
      currentVehicle,
      currentContract,
      allContracts,
      documents,
      trafficTickets,
      securityDeposits,
      receivables,
      allAuditLogs,
      communicationLogs,
    ] = await Promise.all([
      driver.currentVehicleId ? this.vehicleRepo.findById(driver.currentVehicleId) : Promise.resolve(null),
      driver.currentContractId ? this.contractRepo.findById(driver.currentContractId) : Promise.resolve(null),
      this.contractRepo.findAll({ driverId }),
      this.docRepo.findAll({ driverId }),
      this.ticketRepo.findAll({ driverId }),
      this.depositRepo.findAll({ driverId }),
      this.receivableRepo.findAll({ driverId }),
      this.auditRepo.findAll(),
      this.commRepo.findByDriverId(driverId),
    ]);

    // Audit logs for driver
    const historyLogs = allAuditLogs.filter((log) => log.entityId === driverId);

    // Financial calculations
    const todayStr = new Date().toISOString().split('T')[0];

    const pendingReceivables = receivables.filter((r) => r.status === ObligationStatus.PENDING || r.status === ObligationStatus.PARTIALLY_PAID || r.status === ObligationStatus.OVERDUE);
    const overdueReceivables = pendingReceivables.filter((r) => r.dueDate < todayStr || r.status === ObligationStatus.OVERDUE);

    const totalPendingAmount = pendingReceivables.reduce((acc, r) => acc + ((r.updatedAmount || r.originalAmount) - r.paidAmount), 0);
    const totalOverdueAmount = overdueReceivables.reduce((acc, r) => acc + ((r.updatedAmount || r.originalAmount) - r.paidAmount), 0);
    const totalPaidAmount = receivables
      .filter((r) => r.status === ObligationStatus.PAID)
      .reduce((acc, r) => acc + r.paidAmount, 0);

    let financialStatus: 'EM_DIA' | 'ATENCAO' | 'EM_ATRASO' | 'BLOQUEADO_FINANCEIRO' = 'EM_DIA';
    if (driver.status === DriverStatus.BLOCKED) {
      financialStatus = 'BLOQUEADO_FINANCEIRO';
    } else if (totalOverdueAmount > 0) {
      financialStatus = 'EM_ATRASO';
    } else if (totalPendingAmount > 0) {
      financialStatus = 'ATENCAO';
    }

    const cnhAlert = evaluateCnhStatus(driver.cnhExpiration);

    const driverWithoutHealth = { ...driver };
    delete driverWithoutHealth.healthAndEmergency;

    return {
      driver: driverWithoutHealth,
      currentVehicle,
      currentContract,
      contractHistory: allContracts,
      documents,
      trafficTickets,
      securityDeposits,
      receivables,
      historyLogs: historyLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
      communicationLogs,
      financialSummary: {
        totalPendingAmount,
        totalOverdueAmount,
        totalPaidAmount,
        overdueCount: overdueReceivables.length,
        financialStatus,
      },
      cnhAlert,
    };
  }

  public async addCommunicationLog(
    logData: Omit<CommunicationLog, 'id' | 'dateTime'>
  ): Promise<CommunicationLog> {
    const newLog: CommunicationLog = {
      ...logData,
      id: generateUUID(),
      dateTime: new Date().toISOString(),
    };
    return this.commRepo.create(newLog);
  }

  public async updateCommunicationStatus(
    logId: string,
    status: 'DRAFT' | 'OPENED_IN_WHATSAPP' | 'MANUALLY_CONFIRMED_SENT'
  ): Promise<CommunicationLog> {
    const existing = await this.commRepo.findById(logId);
    if (!existing) throw new Error('Log de comunicação não encontrado.');
    return this.commRepo.update(logId, { status });
  }

  public async deleteOrArchiveDriver(
    driverId: string,
    userId: string,
    userName: string
  ): Promise<{ action: 'DELETED' | 'ARCHIVED'; driver: Driver }> {
    const driver = await this.driverRepo.findById(driverId);
    if (!driver) throw new Error(`Motorista ${driverId} não encontrado.`);

    const [contracts, receivables, tickets, deposits] = await Promise.all([
      this.contractRepo.findAll({ driverId }),
      this.receivableRepo.findAll({ driverId }),
      this.ticketRepo.findAll({ driverId }),
      this.depositRepo.findAll({ driverId }),
    ]);

    const hasHistory = contracts.length > 0 || receivables.length > 0 || tickets.length > 0 || deposits.length > 0;

    if (hasHistory) {
      // Archive or mark as INACTIVE to protect operational integrity
      const updated = await this.driverRepo.update(driverId, {
        status: DriverStatus.INACTIVE,
        isArchived: true,
      });

      await AuditLogger.logAction(
        driver.companyId,
        'Driver',
        driverId,
        AuditAction.ARCHIVE,
        userId,
        userName,
        driver,
        updated
      );

      return { action: 'ARCHIVED', driver: updated };
    } else {
      await this.driverRepo.delete(driverId);

      await AuditLogger.logAction(
        driver.companyId,
        'Driver',
        driverId,
        AuditAction.DELETE,
        userId,
        userName,
        driver,
        null
      );

      return { action: 'DELETED', driver };
    }
  }
}
