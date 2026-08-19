import {
  DriverDocumentRepository,
  ContractRepository,
  TrafficTicketRepository,
  AccountReceivableRepository,
  SecurityDepositRepository,
  AuditLogRepository,
  CommunicationLogRepository,
} from '../../persistence/repositories/localRepositories';
import type { CommunicationLog, Driver, DriverDocument } from '../../types/entities';
import { DocumentStatus, DriverStatus, ObligationStatus } from '../../types/enums';
import { generateUUID } from '../../shared/utils/uuid';

export interface DriverLegacyDetailedSummary {
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

function evaluateExpiration(expirationDate: string): {
  status: DocumentStatus;
  daysToExpiration: number;
  message: string;
} {
  const parsed = new Date(`${expirationDate}T00:00:00Z`).getTime();
  if (!Number.isFinite(parsed)) {
    return { status: DocumentStatus.PENDING, daysToExpiration: 0, message: 'Data de validade não informada.' };
  }
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const daysToExpiration = Math.ceil((parsed - today) / 86_400_000);
  if (daysToExpiration < 0) {
    return {
      status: DocumentStatus.EXPIRED,
      daysToExpiration,
      message: `CNH Vencida há ${Math.abs(daysToExpiration)} dias.`,
    };
  }
  if (daysToExpiration <= 30) {
    return {
      status: DocumentStatus.EXPIRING_SOON,
      daysToExpiration,
      message: `CNH Vence em ${daysToExpiration} dias.`,
    };
  }
  return { status: DocumentStatus.VALID, daysToExpiration, message: 'CNH Válida.' };
}

function obligationBalance(item: any): number {
  return Number(item.updatedAmount ?? item.originalAmount ?? 0) - Number(item.paidAmount ?? 0);
}

/**
 * Temporary read/write bridge for Driver-adjacent entities that are explicitly
 * outside SECURITY-2I2. It never imports DriverRepository or VehicleRepository
 * and it never supplies Driver/Vehicle core authority.
 */
export class DriverLegacyDetailsBridge {
  private readonly docRepo = new DriverDocumentRepository();
  private readonly contractRepo = new ContractRepository();
  private readonly ticketRepo = new TrafficTicketRepository();
  private readonly receivableRepo = new AccountReceivableRepository();
  private readonly depositRepo = new SecurityDepositRepository();
  private readonly auditRepo = new AuditLogRepository();
  private readonly commRepo = new CommunicationLogRepository();

  async getSupplementalSummary(driver: Driver): Promise<DriverLegacyDetailedSummary> {
    const driverId = driver.id;
    const [currentContract, allContracts, documents, trafficTickets, securityDeposits, receivables, allAuditLogs, communicationLogs] = await Promise.all([
      driver.currentContractId ? this.contractRepo.findById(driver.currentContractId) : Promise.resolve(null),
      this.contractRepo.findAll({ driverId }),
      this.docRepo.findAll({ driverId }),
      this.ticketRepo.findAll({ driverId }),
      this.depositRepo.findAll({ driverId }),
      this.receivableRepo.findAll({ driverId }),
      this.auditRepo.findAll(),
      this.commRepo.findByDriverId(driverId),
    ]);

    const historyLogs = allAuditLogs
      .filter((log) => log.entityId === driverId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const today = new Date().toISOString().slice(0, 10);
    const pendingReceivables = receivables.filter((item) =>
      item.status === ObligationStatus.PENDING ||
      item.status === ObligationStatus.PARTIALLY_PAID ||
      item.status === ObligationStatus.OVERDUE
    );
    const overdueReceivables = pendingReceivables.filter((item) =>
      String(item.dueDate).slice(0, 10) < today || item.status === ObligationStatus.OVERDUE
    );
    const totalPendingAmount = pendingReceivables.reduce((sum, item) => sum + obligationBalance(item), 0);
    const totalOverdueAmount = overdueReceivables.reduce((sum, item) => sum + obligationBalance(item), 0);
    const totalPaidAmount = receivables
      .filter((item) => item.status === ObligationStatus.PAID)
      .reduce((sum, item) => sum + Number(item.paidAmount ?? 0), 0);

    let financialStatus: DriverLegacyDetailedSummary['financialSummary']['financialStatus'] = 'EM_DIA';
    if (driver.status === DriverStatus.BLOCKED) financialStatus = 'BLOQUEADO_FINANCEIRO';
    else if (totalOverdueAmount > 0) financialStatus = 'EM_ATRASO';
    else if (totalPendingAmount > 0) financialStatus = 'ATENCAO';

    return {
      driver,
      currentVehicle: undefined,
      currentContract: currentContract || undefined,
      contractHistory: allContracts,
      documents,
      trafficTickets,
      securityDeposits,
      receivables,
      historyLogs,
      communicationLogs,
      financialSummary: {
        totalPendingAmount,
        totalOverdueAmount,
        totalPaidAmount,
        overdueCount: overdueReceivables.length,
        financialStatus,
      },
      cnhAlert: evaluateExpiration(driver.cnhExpiration),
    };
  }

  async addDocument(driver: Driver, docData: {
    documentType: string;
    documentNumber?: string;
    expirationDate?: string;
    fileUrl?: string;
    notes?: string;
  }): Promise<DriverDocument> {
    const now = new Date().toISOString();
    const status = docData.expirationDate
      ? evaluateExpiration(docData.expirationDate).status
      : DocumentStatus.VALID;
    return await this.docRepo.create({
      id: generateUUID(),
      companyId: driver.companyId,
      driverId: driver.id,
      documentType: docData.documentType,
      documentNumber: docData.documentNumber,
      expirationDate: docData.expirationDate,
      status,
      fileUrl: docData.fileUrl,
      notes: docData.notes,
      createdAt: now,
      updatedAt: now,
    });
  }

  async removeDocument(documentId: string): Promise<boolean> {
    const existing = await this.docRepo.findById(documentId);
    if (!existing) throw new Error(`Documento ${documentId} não encontrado.`);
    return await this.docRepo.delete(documentId);
  }

  async addCommunicationLog(driver: Driver, logData: Omit<CommunicationLog, 'id' | 'dateTime' | 'companyId' | 'driverId'>): Promise<CommunicationLog> {
    return await this.commRepo.create({
      ...logData,
      id: generateUUID(),
      companyId: driver.companyId,
      driverId: driver.id,
      dateTime: new Date().toISOString(),
    });
  }

  async updateCommunicationStatus(
    logId: string,
    status: 'DRAFT' | 'OPENED_IN_WHATSAPP' | 'MANUALLY_CONFIRMED_SENT'
  ): Promise<CommunicationLog> {
    const existing = await this.commRepo.findById(logId);
    if (!existing) throw new Error('Log de comunicação não encontrado.');
    return await this.commRepo.update(logId, { status });
  }
}
