import {
  AccountReceivableRepository,
  AccountPayableRepository,
} from '../../persistence/repositories/localRepositories';
import { AccountReceivable, AccountPayable } from '../../types/entities';
import { ObligationStatus, OriginType } from '../../types/enums';
import { roundCurrency } from '../../shared/utils/currency';
import { getDaysDiff } from '../../shared/utils/date';
import { FinancialPeriodService } from './FinancialPeriodService';
import { FinancialAuthorizationService } from './FinancialAuthorizationService';

export interface DelinquentReceivable {
  companyId: string;
  receivableId: string;
  originType: OriginType;
  originId: string;
  driverId?: string;
  vehicleId?: string;
  contractId?: string;
  dueDate: string;
  daysOverdue: number;
  originalAmount: number;
  receivedAmount: number;
  lateFee: number;
  interest: number;
  updatedOutstandingAmount: number;
}

export interface AgingReport {
  'A VENCER': number;
  '1-7': number;
  '8-15': number;
  '16-30': number;
  '31-60': number;
  '61-90': number;
  '90+': number;
  aVencer: number;
  '1_7': number;
  '8_15': number;
  '16_30': number;
  '31_60': number;
  '61_90': number;
  '90_plus': number;
}

export class OverdueService {
  private static receivableRepo = new AccountReceivableRepository();
  private static payableRepo = new AccountPayableRepository();

  public static async processOverdueReceivables(
    companyId: string,
    processingDate: string,
    userId: string,
    userName: string,
    gracePeriod: number = 0,
    finePercent: number = 2.0,
    dailyInterestPercent: number = 0.033
  ): Promise<AccountReceivable[]> {
    // 1. RBAC check using RECEIPT_REGISTER permission (possessed by all mutational roles, but not viewers)
    await FinancialAuthorizationService.authorize(userId, companyId, 'RECEIPT_REGISTER');

    // 2. Fetch all receivables for the company
    const allReceivables = await this.receivableRepo.findAll();
    const companyReceivables = allReceivables.filter((r) => r.companyId === companyId);

    const updatedReceivables: AccountReceivable[] = [];

    for (const r of companyReceivables) {
      // Skip already paid or cancelled
      if (r.status === ObligationStatus.PAID || r.status === ObligationStatus.CANCELLED) {
        continue;
      }

      const daysOverdue = Math.max(0, getDaysDiff(r.dueDate, processingDate));

      // Check if period is open for its competence date before mutating
      const isPeriodOpen = await FinancialPeriodService.isDateOpen(companyId, r.competenceDate);
      if (!isPeriodOpen) {
        // Skip mutating closed periods retroactively
        continue;
      }

      let statusChanged = false;
      let chargesChanged = false;

      let newStatus = r.status;
      if (daysOverdue > 0 && r.status !== ObligationStatus.OVERDUE) {
        newStatus = ObligationStatus.OVERDUE;
        statusChanged = true;
      } else if (daysOverdue === 0 && r.status === ObligationStatus.OVERDUE) {
        newStatus = r.paidAmount > 0 ? ObligationStatus.PARTIALLY_PAID : ObligationStatus.PENDING;
        statusChanged = true;
      }

      // Calculate charges
      let fineAmount = 0;
      let interestAmount = 0;

      if (daysOverdue > gracePeriod) {
        const principalEmAberto = Math.max(0, r.originalAmount - r.paidAmount);
        fineAmount = roundCurrency(principalEmAberto * (finePercent / 100));
        interestAmount = roundCurrency(principalEmAberto * (dailyInterestPercent / 100) * daysOverdue);
      }

      if (r.fineAmount !== fineAmount || r.interestAmount !== interestAmount) {
        chargesChanged = true;
      }

      if (statusChanged || chargesChanged) {
        const updatedAmount = roundCurrency(r.originalAmount + fineAmount + interestAmount - r.discountAmount);
        const balanceAmount = roundCurrency(Math.max(0, updatedAmount - r.paidAmount));

        const updated = await this.receivableRepo.update(r.id, {
          status: newStatus,
          fineAmount,
          interestAmount,
          updatedAmount,
          balanceAmount,
          updatedAt: new Date().toISOString(),
        });
        updatedReceivables.push(updated);
      }
    }

    return updatedReceivables;
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
    // 1. RBAC check using PAYMENT_REGISTER permission
    await FinancialAuthorizationService.authorize(userId, companyId, 'PAYMENT_REGISTER');

    const allPayables = await this.payableRepo.findAll();
    const companyPayables = allPayables.filter((p) => p.companyId === companyId);

    const updatedPayables: AccountPayable[] = [];

    for (const p of companyPayables) {
      if (p.status === ObligationStatus.PAID || p.status === ObligationStatus.CANCELLED) {
        continue;
      }

      const daysOverdue = Math.max(0, getDaysDiff(p.dueDate, processingDate));

      const isPeriodOpen = await FinancialPeriodService.isDateOpen(companyId, p.competenceDate);
      if (!isPeriodOpen) {
        continue;
      }

      let statusChanged = false;
      let chargesChanged = false;

      let newStatus = p.status;
      if (daysOverdue > 0 && p.status !== ObligationStatus.OVERDUE) {
        newStatus = ObligationStatus.OVERDUE;
        statusChanged = true;
      } else if (daysOverdue === 0 && p.status === ObligationStatus.OVERDUE) {
        newStatus = p.paidAmount > 0 ? ObligationStatus.PARTIALLY_PAID : ObligationStatus.PENDING;
        statusChanged = true;
      }

      let fineAmount = 0;
      let interestAmount = 0;

      if (daysOverdue > gracePeriod) {
        const principalEmAberto = Math.max(0, p.originalAmount - p.paidAmount);
        fineAmount = roundCurrency(principalEmAberto * (finePercent / 100));
        interestAmount = roundCurrency(principalEmAberto * (dailyInterestPercent / 100) * daysOverdue);
      }

      if (p.fineAmount !== fineAmount || p.interestAmount !== interestAmount) {
        chargesChanged = true;
      }

      if (statusChanged || chargesChanged) {
        const updatedAmount = roundCurrency(p.originalAmount + fineAmount + interestAmount - p.discountAmount);
        const balanceAmount = roundCurrency(Math.max(0, updatedAmount - p.paidAmount));

        const updated = await this.payableRepo.update(p.id, {
          status: newStatus,
          fineAmount,
          interestAmount,
          updatedAmount,
          balanceAmount,
          updatedAt: new Date().toISOString(),
        });
        updatedPayables.push(updated);
      }
    }

    return updatedPayables;
  }

  public static async getDelinquentReceivables(
    companyId: string,
    processingDate: string
  ): Promise<DelinquentReceivable[]> {
    const allReceivables = await this.receivableRepo.findAll();
    const companyReceivables = allReceivables.filter((r) => r.companyId === companyId);

    const delinquentList: DelinquentReceivable[] = [];

    for (const r of companyReceivables) {
      // Must be overdue at processingDate
      const daysOverdue = getDaysDiff(r.dueDate, processingDate);

      // Only count as delinquent if:
      // 1. Not cancelled
      // 2. Not fully paid (balance > 0)
      // 3. Due date has passed (daysOverdue > 0)
      if (
        r.status !== ObligationStatus.CANCELLED &&
        r.status !== ObligationStatus.PAID &&
        r.balanceAmount > 0 &&
        daysOverdue > 0
      ) {
        delinquentList.push({
          companyId: r.companyId,
          receivableId: r.id,
          originType: r.originType,
          originId: r.originId,
          driverId: r.driverId,
          vehicleId: r.vehicleId,
          contractId: r.contractId,
          dueDate: r.dueDate,
          daysOverdue,
          originalAmount: r.originalAmount,
          receivedAmount: r.paidAmount,
          lateFee: r.fineAmount,
          interest: r.interestAmount,
          updatedOutstandingAmount: r.balanceAmount,
        });
      }
    }

    return delinquentList;
  }

  public static async getAgingReport(
    companyId: string,
    type: 'RECEIVABLE' | 'PAYABLE',
    processingDate: string
  ): Promise<AgingReport> {
    let aVencer = 0;
    let u1_7 = 0;
    let u8_15 = 0;
    let u16_30 = 0;
    let u31_60 = 0;
    let u61_90 = 0;
    let u90_plus = 0;

    if (type === 'RECEIVABLE') {
      const allReceivables = await this.receivableRepo.findAll();
      const companyReceivables = allReceivables.filter(
        (r) => r.companyId === companyId && r.status !== ObligationStatus.CANCELLED && r.status !== ObligationStatus.PAID && r.balanceAmount > 0
      );

      for (const r of companyReceivables) {
        const daysOverdue = getDaysDiff(r.dueDate, processingDate);
        if (daysOverdue <= 0) {
          aVencer += r.balanceAmount;
        } else if (daysOverdue >= 1 && daysOverdue <= 7) {
          u1_7 += r.balanceAmount;
        } else if (daysOverdue >= 8 && daysOverdue <= 15) {
          u8_15 += r.balanceAmount;
        } else if (daysOverdue >= 16 && daysOverdue <= 30) {
          u16_30 += r.balanceAmount;
        } else if (daysOverdue >= 31 && daysOverdue <= 60) {
          u31_60 += r.balanceAmount;
        } else if (daysOverdue >= 61 && daysOverdue <= 90) {
          u61_90 += r.balanceAmount;
        } else {
          u90_plus += r.balanceAmount;
        }
      }
    } else {
      const allPayables = await this.payableRepo.findAll();
      const companyPayables = allPayables.filter(
        (p) => p.companyId === companyId && p.status !== ObligationStatus.CANCELLED && p.status !== ObligationStatus.PAID && p.balanceAmount > 0
      );

      for (const p of companyPayables) {
        const daysOverdue = getDaysDiff(p.dueDate, processingDate);
        if (daysOverdue <= 0) {
          aVencer += p.balanceAmount;
        } else if (daysOverdue >= 1 && daysOverdue <= 7) {
          u1_7 += p.balanceAmount;
        } else if (daysOverdue >= 8 && daysOverdue <= 15) {
          u8_15 += p.balanceAmount;
        } else if (daysOverdue >= 16 && daysOverdue <= 30) {
          u16_30 += p.balanceAmount;
        } else if (daysOverdue >= 31 && daysOverdue <= 60) {
          u31_60 += p.balanceAmount;
        } else if (daysOverdue >= 61 && daysOverdue <= 90) {
          u61_90 += p.balanceAmount;
        } else {
          u90_plus += p.balanceAmount;
        }
      }
    }

    aVencer = roundCurrency(aVencer);
    u1_7 = roundCurrency(u1_7);
    u8_15 = roundCurrency(u8_15);
    u16_30 = roundCurrency(u16_30);
    u31_60 = roundCurrency(u31_60);
    u61_90 = roundCurrency(u61_90);
    u90_plus = roundCurrency(u90_plus);

    return {
      'A VENCER': aVencer,
      '1-7': u1_7,
      '8-15': u8_15,
      '16-30': u16_30,
      '31-60': u31_60,
      '61-90': u61_90,
      '90+': u90_plus,
      aVencer,
      '1_7': u1_7,
      '8_15': u8_15,
      '16_30': u16_30,
      '31_60': u31_60,
      '61_90': u61_90,
      '90_plus': u90_plus,
    };
  }
}
