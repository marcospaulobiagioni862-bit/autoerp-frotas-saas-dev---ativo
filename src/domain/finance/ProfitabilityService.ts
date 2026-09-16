import {
  FinancialTransactionRepository,
  AccountReceivableRepository,
  AccountPayableRepository,
  VehicleRepository,
} from '../../persistence/repositories/localRepositories';
import { AccountingRegime, TransactionType, OriginType, ObligationStatus } from '../../types/enums';
import { VehicleProfitabilityReport } from '../../types/reports';
import { roundCurrency } from '../../shared/utils/currency';

export class ProfitabilityService {
  private static txRepo = new FinancialTransactionRepository();
  private static recRepo = new AccountReceivableRepository();
  private static payRepo = new AccountPayableRepository();
  private static vehicleRepo = new VehicleRepository();

  public static async getVehicleProfitability(
    companyId: string,
    vehicleId: string,
    periodStart: string,
    periodEnd: string,
    regime: AccountingRegime = AccountingRegime.CASH
  ): Promise<VehicleProfitabilityReport> {
    const vehicle = await this.vehicleRepo.findById(vehicleId);

    let rentalIncome = 0;
    let kmExcessIncome = 0;
    let finesReimbursedIncome = 0;
    let otherIncome = 0;

    let maintenanceExpense = 0;
    let insuranceExpense = 0;
    let trackerExpense = 0;
    let documentationExpense = 0;
    let finesCompanyExpense = 0;
    let financingExpense = 0;
    let otherExpense = 0;

    const isDepositText = (desc?: string, origin?: string) => {
      const text = (desc || '').toLowerCase();
      return text.includes('caução') || text.includes('caucao') || origin === OriginType.SECURITY_DEPOSIT;
    };

    if (regime === AccountingRegime.CASH) {
      const allTx = await this.txRepo.findByVehicleId(vehicleId);
      const allPayables = await this.payRepo.findByVehicleId(vehicleId);
      const allReceivables = await this.recRepo.findByVehicleId(vehicleId);

      const payMap = new Map(allPayables.map((p) => [p.id, p]));
      const recMap = new Map(allReceivables.map((r) => [r.id, r]));

      const periodTx = allTx.filter(
        (t) =>
          (!companyId || t.companyId === companyId) &&
          t.vehicleId === vehicleId &&
          !t.isReversed &&
          t.transactionDate >= periodStart &&
          t.transactionDate <= periodEnd &&
          t.type !== TransactionType.TRANSFER &&
          t.type !== TransactionType.REVERSAL &&
          !isDepositText(t.description)
      );

      for (const t of periodTx) {
        if (t.type === TransactionType.INCOME) {
          let recOrigin: OriginType | undefined = undefined;
          if (t.receivableId && recMap.has(t.receivableId)) {
            recOrigin = recMap.get(t.receivableId)?.originType;
          }

          if (recOrigin === OriginType.KM_EXCESS || t.description.toLowerCase().includes('excesso km')) {
            kmExcessIncome += t.amount;
          } else if (recOrigin === OriginType.TRAFFIC_TICKET_DRIVER || t.description.toLowerCase().includes('reembolso de multa')) {
            finesReimbursedIncome += t.amount;
          } else {
            rentalIncome += t.amount;
          }
        } else if (t.type === TransactionType.EXPENSE) {
          let payOrigin: OriginType | undefined = undefined;
          if (t.payableId && payMap.has(t.payableId)) {
            payOrigin = payMap.get(t.payableId)?.originType;
          }

          const desc = t.description.toLowerCase();

          if (payOrigin === OriginType.MAINTENANCE || desc.includes('manutenção') || desc.includes('manutencao') || desc.includes('pneus') || desc.includes('óleo') || desc.includes('retífica')) {
            maintenanceExpense += t.amount;
          } else if (payOrigin === OriginType.INSURANCE || desc.includes('seguro')) {
            insuranceExpense += t.amount;
          } else if (payOrigin === OriginType.TRACKER || desc.includes('rastreador')) {
            trackerExpense += t.amount;
          } else if (payOrigin === OriginType.DOCUMENTATION || desc.includes('ipva') || desc.includes('licenciamento') || desc.includes('documentação')) {
            documentationExpense += t.amount;
          } else if (payOrigin === OriginType.TRAFFIC_TICKET_COMPANY || desc.includes('multa')) {
            finesCompanyExpense += t.amount;
          } else if (payOrigin === OriginType.FINANCING || desc.includes('financiamento')) {
            financingExpense += t.amount;
          } else {
            otherExpense += t.amount;
          }
        }
      }
    } else {
      // ACCRUAL REGIME
      const receivables = await this.recRepo.findByVehicleId(vehicleId);
      const payables = await this.payRepo.findByVehicleId(vehicleId);

      const periodRec = receivables.filter(
        (r) =>
          (!companyId || r.companyId === companyId) &&
          r.vehicleId === vehicleId &&
          r.status !== ObligationStatus.CANCELLED &&
          r.competenceDate >= periodStart &&
          r.competenceDate <= periodEnd &&
          !isDepositText(r.description, r.originType)
      );

      for (const r of periodRec) {
        if (r.originType === OriginType.KM_EXCESS) {
          kmExcessIncome += r.originalAmount;
        } else if (r.originType === OriginType.TRAFFIC_TICKET_DRIVER) {
          finesReimbursedIncome += r.originalAmount;
        } else {
          rentalIncome += r.originalAmount;
        }
      }

      const periodPay = payables.filter(
        (p) =>
          (!companyId || p.companyId === companyId) &&
          p.vehicleId === vehicleId &&
          p.status !== ObligationStatus.CANCELLED &&
          p.competenceDate >= periodStart &&
          p.competenceDate <= periodEnd &&
          !isDepositText(p.description, p.originType)
      );

      for (const p of periodPay) {
        if (p.originType === OriginType.MAINTENANCE) {
          maintenanceExpense += p.originalAmount;
        } else if (p.originType === OriginType.INSURANCE) {
          insuranceExpense += p.originalAmount;
        } else if (p.originType === OriginType.TRACKER) {
          trackerExpense += p.originalAmount;
        } else if (p.originType === OriginType.DOCUMENTATION) {
          documentationExpense += p.originalAmount;
        } else if (p.originType === OriginType.TRAFFIC_TICKET_COMPANY) {
          finesCompanyExpense += p.originalAmount;
        } else if (p.originType === OriginType.FINANCING) {
          financingExpense += p.originalAmount;
        } else {
          otherExpense += p.originalAmount;
        }
      }
    }

    const totalIncome = roundCurrency(rentalIncome + kmExcessIncome + finesReimbursedIncome + otherIncome);
    const totalExpense = roundCurrency(
      maintenanceExpense +
        insuranceExpense +
        trackerExpense +
        documentationExpense +
        finesCompanyExpense +
        financingExpense +
        otherExpense
    );

    const netProfit = roundCurrency(totalIncome - totalExpense);
    const profitMarginPercentage = totalIncome > 0 ? roundCurrency((netProfit / totalIncome) * 100) : 0;

    return {
      vehicleId,
      plate: vehicle?.plate || '',
      model: vehicle?.model || '',
      brand: vehicle?.brand || '',
      status: vehicle?.status || '',
      regime,
      periodStart,
      periodEnd,
      kmTraveledPeriod: 0,
      rentalIncome: roundCurrency(rentalIncome),
      kmExcessIncome: roundCurrency(kmExcessIncome),
      finesReimbursedIncome: roundCurrency(finesReimbursedIncome),
      otherIncome: roundCurrency(otherIncome),
      totalIncome,
      maintenanceExpense: roundCurrency(maintenanceExpense),
      insuranceExpense: roundCurrency(insuranceExpense),
      trackerExpense: roundCurrency(trackerExpense),
      documentationExpense: roundCurrency(documentationExpense),
      finesCompanyExpense: roundCurrency(finesCompanyExpense),
      financingExpense: roundCurrency(financingExpense),
      depreciationExpense: 0,
      otherExpense: roundCurrency(otherExpense),
      totalExpense,
      netProfit,
      profitMarginPercentage,
      costPerKm: 0,
      revenuePerKm: 0,
    };
  }
}
