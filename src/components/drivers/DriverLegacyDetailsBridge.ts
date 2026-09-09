import { ContractClient } from '../../api/contractClient';
import { DetailAuthorityClient } from '../../api/detailAuthorityClient';
import { FinanceDepositClient } from '../../api/financeDepositClient';
import { FinanceObligationClient } from '../../api/financeObligationClient';
import { TrafficTicketClient } from '../../api/trafficTicketClient';
import type { CommunicationLog, DocumentRecord, Driver } from '../../types/entities';
import { DocumentStatus, DriverStatus, ObligationStatus } from '../../types/enums';
import { selectCurrentBlockingContract } from '../../domain/operations/fleetOperationalState';

export interface DriverLegacyDetailedSummary {
  driver: Driver;
  currentVehicle?: any;
  currentContract?: any;
  contractHistory: any[];
  documents: DocumentRecord[];
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
  const explicit = Number(item.balanceAmount);
  if (Number.isFinite(explicit)) return explicit;
  return Number(item.updatedAmount ?? item.originalAmount ?? 0) - Number(item.paidAmount ?? 0);
}

/**
 * Compatibility adapter for the existing Driver details UI. Every source in
 * this adapter is server-authoritative and fail-closed; there is deliberately
 * no localRepositories/IndexedDB/localStorage fallback.
 */
export class DriverLegacyDetailsBridge {
  async getSupplementalSummary(driver: Driver): Promise<DriverLegacyDetailedSummary> {
    const driverId = driver.id;
    const [contracts, trafficTickets, allReceivables, historyLogs, communicationLogs] = await Promise.all([
      ContractClient.list(),
      TrafficTicketClient.list({ driverId }),
      FinanceObligationClient.listReceivables(),
      DetailAuthorityClient.listAudit('Driver', driverId),
      DetailAuthorityClient.listDriverCommunications(driverId),
    ]);

    const contractHistory = contracts.filter((item) => item.driverId === driverId);
    const currentContract = driver.currentContractId
      ? contractHistory.find((item) => item.id === driver.currentContractId)
      : selectCurrentBlockingContract(contractHistory);
    const receivables = allReceivables.filter((item) => item.driverId === driverId);
    const securityDeposits = (await Promise.all(
      contractHistory.map((contract) => FinanceDepositClient.getByContract(contract.id))
    )).filter((item): item is NonNullable<typeof item> => item !== null);

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
      contractHistory,
      documents: [],
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

  async addCommunicationLog(
    driver: Driver,
    logData: Omit<CommunicationLog, 'id' | 'dateTime' | 'companyId' | 'driverId'>
  ): Promise<CommunicationLog> {
    return await DetailAuthorityClient.createDriverCommunication(driver.id, {
      type: logData.type,
      message: logData.message,
    });
  }

  async updateCommunicationStatus(
    logId: string,
    status: 'DRAFT' | 'OPENED_IN_WHATSAPP' | 'MANUALLY_CONFIRMED_SENT'
  ): Promise<CommunicationLog> {
    if (status !== 'MANUALLY_CONFIRMED_SENT') {
      throw new Error('Transição de comunicação não autorizada nesta tela.');
    }
    return await DetailAuthorityClient.confirmCommunicationSent(logId);
  }
}