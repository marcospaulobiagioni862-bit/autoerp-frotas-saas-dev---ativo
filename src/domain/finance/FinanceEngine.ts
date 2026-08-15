import { ITransactionContext } from './ITransactionContext';
// AutoERP Financial Domain Engine (Facade / Coordinator)

import { ReceivableService, CreateReceivableParams } from './ReceivableService';
import { PayableService, CreatePayableParams } from './PayableService';
import { SettlementService, SettlementParams } from './SettlementService';
import { ReversalService } from './ReversalService';
import { DepositService } from './DepositService';
import { RenegotiationService, RenegotiateParams } from './RenegotiationService';
import { CashFlowService } from './CashFlowService';
import { AccrualService } from './AccrualService';
import { DREService } from './DREService';
import { ProfitabilityService } from './ProfitabilityService';
import { TransferService, TransferParams } from './TransferService';
import { RecurringProcessingService, ProcessRecurringRulesParams, RecurringProcessingResult } from './RecurringProcessingService';
import { BankReconciliationService, ImportStatementParams, MatchSuggestion } from './BankReconciliationService';
import { FinancialPeriodService, ClosePeriodParams, ReopenPeriodParams } from './FinancialPeriodService';
import { TrafficTicketService } from '../services/TrafficTicketService';
import { OverdueService, DelinquentReceivable, AgingReport } from './OverdueService';

import {
  AccountReceivable,
  AccountPayable,
  FinancialTransaction,
  SecurityDeposit,
  SecurityDepositMovement,
  BankStatementEntry,
  FinancialPeriod,
} from '../../types/entities';
import { AccountingRegime, StatementEntryStatus } from '../../types/enums';
import { VehicleProfitabilityReport, DREReport, CashFlowReport } from '../../types/reports';

export type CreateObligationParams = CreateReceivableParams & CreatePayableParams;
export type PaymentParams = SettlementParams;
export type { TransferParams };

export class FinanceEngine {
  public static uowRunner: ((companyId: string, callback: (txContext: ITransactionContext) => Promise<any>) => Promise<any>) | null = null;
  // 0. Recurring Rules Processing
  public static async processRecurringRules(params: ProcessRecurringRulesParams): Promise<RecurringProcessingResult> {
    return RecurringProcessingService.processRecurringRules(params);
  }

  // 0. Transfer
  public static async transferFunds(params: TransferParams): Promise<FinancialTransaction> {
    if (this.uowRunner) {
      return this.uowRunner(params.companyId, async (txContext) => {
        return TransferService.transferFunds(params, txContext);
      });
    }
    return TransferService.transferFunds(params);
  }
  // 1. Receivables
  public static async createReceivable(params: CreateReceivableParams): Promise<AccountReceivable[]> {
    return ReceivableService.create(params);
  }

  public static async cancelReceivable(
    companyId: string,
    receivableId: string,
    reason: string,
    userId: string,
    userName: string
  ): Promise<AccountReceivable> {
    return ReceivableService.cancelReceivable(companyId, receivableId, reason, userId, userName);
  }

  // 2. Payables
  public static async createPayable(params: CreatePayableParams): Promise<AccountPayable[]> {
    return PayableService.create(params);
  }

  public static async cancelPayable(
    companyId: string,
    payableId: string,
    reason: string,
    userId: string,
    userName: string
  ): Promise<AccountPayable> {
    return PayableService.cancelPayable(companyId, payableId, reason, userId, userName);
  }

  // 3. Receipt / Payment Settlement
  public static async registerReceipt(params: SettlementParams): Promise<{
    receivable: AccountReceivable;
    transaction: FinancialTransaction;
  }> {
    if (this.uowRunner) {
      return this.uowRunner(params.companyId, async (txContext) => {
        return SettlementService.registerReceipt(params, txContext);
      });
    }
    return SettlementService.registerReceipt(params);
  }

  public static async registerPayment(params: SettlementParams): Promise<{
    payable: AccountPayable;
    transaction: FinancialTransaction;
  }> {
    if (this.uowRunner) {
      return this.uowRunner(params.companyId, async (txContext) => {
        return SettlementService.registerPayment(params, txContext);
      });
    }
    return SettlementService.registerPayment(params);
  }

  // 4. Reversal
  public static async reverseTransaction(
    companyId: string,
    transactionId: string,
    reversalAmount: number,
    reason: string,
    userId: string,
    userName: string
  ): Promise<FinancialTransaction> {
    if (this.uowRunner) {
      return this.uowRunner(companyId, async (txContext) => {
        return ReversalService.reverseTransaction(companyId, transactionId, reversalAmount, reason, userId, userName, txContext);
      });
    }
    return ReversalService.reverseTransaction(companyId, transactionId, reversalAmount, reason, userId, userName);
  }

  // 5. Renegotiation
  public static async renegociate(params: RenegotiateParams) {
    if (this.uowRunner) {
      return this.uowRunner(params.companyId, async (txContext) => {
        return RenegotiationService.renegociate(params, txContext);
      });
    }
    return RenegotiationService.renegociate(params);
  }

  // 6. Security Deposit
  public static async receiveSecurityDeposit(
    companyId: string,
    contractId: string,
    driverId: string,
    vehicleId: string,
    amount: number,
    financialAccountId: string,
    paymentMethodId: string,
    userId: string,
    userName: string
  ): Promise<{ deposit: SecurityDeposit; movement: SecurityDepositMovement }> {
    return DepositService.receiveSecurityDeposit(
      companyId,
      contractId,
      driverId,
      vehicleId,
      amount,
      financialAccountId,
      paymentMethodId,
      userId,
      userName
    );
  }

  public static async returnSecurityDeposit(
    companyId: string,
    depositId: string,
    returnAmount: number,
    financialAccountId: string,
    paymentMethodId: string,
    notes: string,
    userId: string,
    userName: string
  ): Promise<{ deposit: SecurityDeposit; movement: SecurityDepositMovement }> {
    return DepositService.returnSecurityDeposit(
      companyId,
      depositId,
      returnAmount,
      financialAccountId,
      paymentMethodId,
      notes,
      userId,
      userName
    );
  }

  public static async compensateSecurityDeposit(
    companyId: string,
    depositId: string,
    compensationAmount: number,
    receivableId: string,
    notes: string,
    userId: string,
    userName: string
  ): Promise<{ deposit: SecurityDeposit; movement: SecurityDepositMovement }> {
    return DepositService.compensateSecurityDeposit(
      companyId,
      depositId,
      compensationAmount,
      receivableId,
      notes,
      userId,
      userName
    );
  }

  // 7. Cash Flow
  public static async getCashFlowReport(
    companyId: string,
    periodStart: string,
    periodEnd: string
  ): Promise<CashFlowReport> {
    return CashFlowService.getCashFlowReport(companyId, periodStart, periodEnd);
  }

  // 8. Accrual
  public static async getAccrualSummary(companyId: string, periodStart: string, periodEnd: string) {
    return AccrualService.getAccrualSummary(companyId, periodStart, periodEnd);
  }

  // 9. DRE
  public static async getDREReport(
    companyId: string,
    periodStart: string,
    periodEnd: string,
    regime: AccountingRegime = AccountingRegime.ACCRUAL
  ): Promise<DREReport> {
    return DREService.getDREReport(companyId, periodStart, periodEnd, regime);
  }

  // 10. Vehicle Profitability
  public static async getVehicleProfitability(
    companyId: string,
    vehicleId: string,
    periodStart: string,
    periodEnd: string,
    regime: AccountingRegime = AccountingRegime.CASH
  ): Promise<VehicleProfitabilityReport> {
    return ProfitabilityService.getVehicleProfitability(companyId, vehicleId, periodStart, periodEnd, regime);
  }

  // 11. NIC Penalties
  private static trafficTicketService = new TrafficTicketService();

  public static async processNICPenalty(
    ticketId: string,
    nicAmount?: number,
    userId: string = 'system',
    userName: string = 'System'
  ) {
    return this.trafficTicketService.processNICPenalty(ticketId, nicAmount, userId, userName);
  }

  public static async processPendingNICPenalties(
    companyId: string,
    userId: string = 'system',
    userName: string = 'System'
  ) {
    return this.trafficTicketService.processPendingNICPenalties(companyId, userId, userName);
  }

  // 12. Bank Reconciliation
  public static async importStatementEntries(params: ImportStatementParams) {
    return BankReconciliationService.importStatementEntries(params);
  }

  public static async matchStatementEntry(
    companyId: string,
    statementEntryId: string,
    transactionId: string,
    userId: string = 'system',
    userName: string = 'System'
  ): Promise<BankStatementEntry> {
    return BankReconciliationService.matchEntry(companyId, statementEntryId, transactionId, userId, userName);
  }

  public static async unmatchStatementEntry(
    companyId: string,
    statementEntryId: string,
    userId: string = 'system',
    userName: string = 'System',
    reason?: string
  ): Promise<BankStatementEntry> {
    return BankReconciliationService.unmatchEntry(companyId, statementEntryId, userId, userName, reason);
  }

  public static async ignoreStatementEntry(
    companyId: string,
    statementEntryId: string,
    userId: string = 'system',
    userName: string = 'System',
    reason?: string
  ): Promise<BankStatementEntry> {
    return BankReconciliationService.ignoreEntry(companyId, statementEntryId, userId, userName, reason);
  }

  public static async suggestReconciliationMatches(
    companyId: string,
    financialAccountId: string
  ): Promise<MatchSuggestion[]> {
    return BankReconciliationService.suggestMatches(companyId, financialAccountId);
  }

  public static async getStatementEntries(
    companyId: string,
    financialAccountId?: string,
    status?: StatementEntryStatus
  ): Promise<BankStatementEntry[]> {
    return BankReconciliationService.getStatementEntries(companyId, financialAccountId, status);
  }

  // 13. Financial Period Closing
  public static async closeFinancialPeriod(params: ClosePeriodParams): Promise<FinancialPeriod> {
    return FinancialPeriodService.closePeriod(params);
  }

  public static async reopenFinancialPeriod(params: ReopenPeriodParams): Promise<FinancialPeriod> {
    return FinancialPeriodService.reopenPeriod(params);
  }

  public static async getFinancialPeriods(companyId: string): Promise<FinancialPeriod[]> {
    return FinancialPeriodService.getPeriods(companyId);
  }

  public static async assertFinancialPeriodOpen(companyId: string, date: string): Promise<void> {
    return FinancialPeriodService.assertDateOpen(companyId, date);
  }

  // 14. Overdue and Delinquency Processing
  public static async processOverdueReceivables(
    companyId: string,
    processingDate: string,
    userId: string,
    userName: string,
    gracePeriod: number = 0,
    finePercent: number = 2.0,
    dailyInterestPercent: number = 0.033
  ): Promise<AccountReceivable[]> {
    return OverdueService.processOverdueReceivables(
      companyId,
      processingDate,
      userId,
      userName,
      gracePeriod,
      finePercent,
      dailyInterestPercent
    );
  }

  public static async processOverduePayables(
    companyId: string,
    processingDate: string,
    userId: string,
    userName: string,
    gracePeriod: number = 0,
    finePercent: number = 2.0,
    dailyInterestPercent: number = 0.033
  ): Promise<AccountPayable[]> {
    return OverdueService.processOverduePayables(
      companyId,
      processingDate,
      userId,
      userName,
      gracePeriod,
      finePercent,
      dailyInterestPercent
    );
  }

  public static async getDelinquentReceivables(
    companyId: string,
    processingDate: string
  ): Promise<DelinquentReceivable[]> {
    return OverdueService.getDelinquentReceivables(companyId, processingDate);
  }

  public static async getAgingReport(
    companyId: string,
    type: 'RECEIVABLE' | 'PAYABLE',
    processingDate: string
  ): Promise<AgingReport> {
    return OverdueService.getAgingReport(companyId, type, processingDate);
  }
}
