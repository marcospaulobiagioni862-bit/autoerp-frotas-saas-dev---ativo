import {
  AccountReceivableRepository,
  AccountPayableRepository,
} from '../../persistence/repositories/localRepositories';
import { ObligationStatus } from '../../types/enums';
import { roundCurrency } from '../../shared/utils/currency';

export interface AccrualSummary {
  periodStart: string;
  periodEnd: string;
  totalRecognizedRevenue: number;
  totalRecognizedExpense: number;
  netAccrualResult: number;
}

export class AccrualService {
  private static recRepo = new AccountReceivableRepository();
  private static payRepo = new AccountPayableRepository();

  public static async getAccrualSummary(
    companyId: string,
    periodStart: string,
    periodEnd: string
  ): Promise<AccrualSummary> {
    const receivables = await this.recRepo.findAll();
    const payables = await this.payRepo.findAll();

    const periodRec = receivables.filter(
      (r) =>
        r.companyId === companyId &&
        r.status !== ObligationStatus.CANCELLED &&
        r.competenceDate >= periodStart &&
        r.competenceDate <= periodEnd
    );

    const periodPay = payables.filter(
      (p) =>
        p.companyId === companyId &&
        p.status !== ObligationStatus.CANCELLED &&
        p.competenceDate >= periodStart &&
        p.competenceDate <= periodEnd
    );

    const totalRecognizedRevenue = roundCurrency(periodRec.reduce((acc, r) => acc + r.originalAmount, 0));
    const totalRecognizedExpense = roundCurrency(periodPay.reduce((acc, p) => acc + p.originalAmount, 0));
    const netAccrualResult = roundCurrency(totalRecognizedRevenue - totalRecognizedExpense);

    return {
      periodStart,
      periodEnd,
      totalRecognizedRevenue,
      totalRecognizedExpense,
      netAccrualResult,
    };
  }
}
