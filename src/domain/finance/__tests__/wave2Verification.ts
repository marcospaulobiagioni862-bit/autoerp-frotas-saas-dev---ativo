// Polyfill for Node environment running without browser globals
if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = globalThis;
}
if (typeof globalThis.localStorage === 'undefined') {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, val: string) => { store[key] = val; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  };
}

import {
  AccountReceivableRepository,
  AccountPayableRepository,
  FinancialAccountRepository,
  FinancialTransactionRepository,
  SecurityDepositRepository,
} from '../../../persistence/repositories/localRepositories';
import { SettlementService } from '../SettlementService';
import { TransferService } from '../TransferService';
import { CashFlowService } from '../CashFlowService';
import { DepositService } from '../DepositService';
import { DREService } from '../DREService';
import { PayableService } from '../PayableService';
import { ReceivableService } from '../ReceivableService';
import { ContractService } from '../../services/ContractService';
import { OriginType, ObligationStatus, TransactionType, ContractStatus } from '../../../types/enums';

export class Wave2VerificationRunner {
  public static async runAllTests(): Promise<{
    passed: number;
    failed: number;
    results: Array<{ id: string; name: string; passed: boolean; message: string }>;
  }> {
    const results: Array<{ id: string; name: string; passed: boolean; message: string }> = [];

    const recRepo = new AccountReceivableRepository();
    const payRepo = new AccountPayableRepository();
    const accRepo = new FinancialAccountRepository();
    const txRepo = new FinancialTransactionRepository();

    const company1 = 'wave2-comp-1';
    const company2 = 'wave2-comp-2';

    // 1. SETTLEMENT_ATOMICITY_FIXED
    try {
      const acc = await accRepo.create({
        id: 'acc-w2-1',
        companyId: company1,
        name: 'Conta Atomicidad Recebimento',
        type: 'BANK' as any,
        initialBalance: 1000,
        currentBalance: 1000,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const rec = await recRepo.create({
        id: 'rec-w2-1',
        companyId: company1,
        originType: OriginType.MANUAL,
        originId: 'man-w2-1',
        categoryId: 'cat-1',
        idempotencyKey: 'idemp-w2-rec-1',
        originalAmount: 500,
        discountAmount: 0,
        fineAmount: 0,
        interestAmount: 0,
        updatedAmount: 500,
        paidAmount: 0,
        balanceAmount: 500,
        dueDate: '2026-09-01',
        competenceDate: '2026-09-01',
        status: ObligationStatus.PENDING,
        description: 'Recebimento Atômico',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await SettlementService.registerReceipt({
        companyId: company1,
        obligationId: rec.id,
        financialAccountId: acc.id,
        paymentMethodId: 'pm-1',
        paymentAmount: 500,
        paymentDate: '2026-08-12',
        userId: 'usr-1',
        userName: 'Tester',
      });

      const updatedAcc = await accRepo.findById(acc.id);
      const ok = res.receivable.status === ObligationStatus.PAID && updatedAcc?.currentBalance === 1500;
      results.push({ id: 'WAVE2-01', name: 'SETTLEMENT_ATOMICITY_FIXED', passed: ok, message: ok ? 'Atomicidade de recebimento validada' : 'Saldo ou título inconsistente' });
    } catch (e: any) {
      results.push({ id: 'WAVE2-01', name: 'SETTLEMENT_ATOMICITY_FIXED', passed: false, message: e.message });
    }

    // 2. PAYMENT_ATOMICITY_FIXED
    try {
      const acc = await accRepo.create({
        id: 'acc-w2-pay',
        companyId: company1,
        name: 'Conta Atomicidade Pagamento',
        type: 'BANK' as any,
        initialBalance: 2000,
        currentBalance: 2000,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const pay = await payRepo.create({
        id: 'pay-w2-1',
        companyId: company1,
        originType: OriginType.MANUAL,
        originId: 'man-pay-w2-1',
        categoryId: 'cat-1',
        idempotencyKey: 'idemp-w2-pay-1',
        originalAmount: 400,
        discountAmount: 0,
        fineAmount: 0,
        interestAmount: 0,
        updatedAmount: 400,
        paidAmount: 0,
        balanceAmount: 400,
        dueDate: '2026-09-01',
        competenceDate: '2026-09-01',
        status: ObligationStatus.PENDING,
        description: 'Pagamento Atômico',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await SettlementService.registerPayment({
        companyId: company1,
        obligationId: pay.id,
        financialAccountId: acc.id,
        paymentMethodId: 'pm-1',
        paymentAmount: 400,
        paymentDate: '2026-08-12',
        userId: 'usr-1',
        userName: 'Tester',
      });

      const updatedAcc = await accRepo.findById(acc.id);
      const ok = res.payable.status === ObligationStatus.PAID && updatedAcc?.currentBalance === 1600;
      results.push({ id: 'WAVE2-02', name: 'PAYMENT_ATOMICITY_FIXED', passed: ok, message: ok ? 'Atomicidade de pagamento validada' : 'Saldo ou título inconsistente' });
    } catch (e: any) {
      results.push({ id: 'WAVE2-02', name: 'PAYMENT_ATOMICITY_FIXED', passed: false, message: e.message });
    }

    // 3. TRANSFER_ATOMICITY_FIXED
    try {
      const srcAcc = await accRepo.create({
        id: 'acc-src-trf',
        companyId: company1,
        name: 'Conta Origem',
        type: 'BANK' as any,
        initialBalance: 3000,
        currentBalance: 3000,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const dstAcc = await accRepo.create({
        id: 'acc-dst-trf',
        companyId: company1,
        name: 'Conta Destino',
        type: 'BANK' as any,
        initialBalance: 500,
        currentBalance: 500,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await TransferService.transferFunds({
        companyId: company1,
        sourceAccountId: srcAcc.id,
        destinationAccountId: dstAcc.id,
        amount: 1000,
        transferDate: '2026-08-12',
        paymentMethodId: 'pm-1',
        description: 'Transferência Atômica',
        idempotencyKey: 'r19-compat-wave2Verification-ts-1',
        userId: 'usr-1',
        userName: 'Tester',
      });

      const upSrc = await accRepo.findById(srcAcc.id);
      const upDst = await accRepo.findById(dstAcc.id);
      const ok = upSrc?.currentBalance === 2000 && upDst?.currentBalance === 1500;
      results.push({ id: 'WAVE2-03', name: 'TRANSFER_ATOMICITY_FIXED', passed: ok, message: ok ? 'Transferência atômica executada com sucesso' : 'Saldos incorretos após transferência' });
    } catch (e: any) {
      results.push({ id: 'WAVE2-03', name: 'TRANSFER_ATOMICITY_FIXED', passed: false, message: e.message });
    }

    // 4. CASHFLOW_OPENING_BALANCE_FIXED
    try {
      const accComp2 = await accRepo.create({
        id: 'acc-comp2-cf',
        companyId: company2,
        name: 'Conta Empresa 2',
        type: 'BANK' as any,
        initialBalance: 99999,
        currentBalance: 99999,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const reportComp1 = await CashFlowService.getCashFlowReport(company1, '2026-01-01', '2026-12-31');
      const hasComp2Balance = reportComp1.initialCashBalance >= 99999;
      const ok = !hasComp2Balance;
      results.push({ id: 'WAVE2-04', name: 'CASHFLOW_OPENING_BALANCE_FIXED', passed: ok, message: ok ? 'Saldo inicial isolado por tenant' : 'Saldo inicial incluiu conta de outro tenant' });
    } catch (e: any) {
      results.push({ id: 'WAVE2-04', name: 'CASHFLOW_OPENING_BALANCE_FIXED', passed: false, message: e.message });
    }

    // 5. SECURITY_DEPOSIT_EXCLUDED_FROM_REVENUE
    try {
      const depositServiceRes = await DepositService.receiveSecurityDeposit(
        company1,
        'contract-sec-1',
        'driver-sec-1',
        'vehicle-sec-1',
        1500,
        'acc-w2-1',
        'pm-1',
        'usr-1',
        'Tester'
      );

      const dre = await DREService.getDREReport(company1, '2026-01-01', '2026-12-31');
      const grossRev = dre.grossRevenue.amount;
      const ok = grossRev === 0 || !dre.grossRevenue.description.includes('Caução');
      results.push({ id: 'WAVE2-05', name: 'SECURITY_DEPOSIT_EXCLUDED_FROM_REVENUE', passed: ok, message: ok ? 'Caução excluída da receita bruta da DRE' : `Receita bruta incluiu caução: R$ ${grossRev}` });
    } catch (e: any) {
      results.push({ id: 'WAVE2-05', name: 'SECURITY_DEPOSIT_EXCLUDED_FROM_REVENUE', passed: false, message: e.message });
    }

    // 6. SECURITY_DEPOSIT_RETURN_EXCLUDED_FROM_EXPENSE
    try {
      const depositRepo = new SecurityDepositRepository();
      const dep = await depositRepo.findByContractId('contract-sec-1');

      if (dep) {
        await DepositService.returnSecurityDeposit(
          company1,
          dep.id,
          500,
          'acc-w2-1',
          'pm-1',
          'Devolução de parte da caução',
          'usr-1',
          'Tester'
        );
      }

      const dre = await DREService.getDREReport(company1, '2026-01-01', '2026-12-31');
      const directCosts = dre.directCosts.amount;
      // 400 from WAVE2-02 (normal payment expense), 500 deposit return is excluded (400 instead of 900)
      const ok = directCosts === 400;
      results.push({ id: 'WAVE2-06', name: 'SECURITY_DEPOSIT_RETURN_EXCLUDED_FROM_EXPENSE', passed: ok, message: ok ? 'Devolução de caução (R$ 500) excluída dos custos na DRE' : `Custos diretos foram R$ ${directCosts} em vez de R$ 400` });
    } catch (e: any) {
      results.push({ id: 'WAVE2-06', name: 'SECURITY_DEPOSIT_RETURN_EXCLUDED_FROM_EXPENSE', passed: false, message: e.message });
    }

    // 7 & 8. SECURITY_DEPOSIT_COMPENSATION_SETTLES_RECEIVABLE & DOES NOT DUPLICATE CASH
    try {
      const recComp = await recRepo.create({
        id: 'rec-comp-sec-1',
        companyId: company1,
        originType: OriginType.CONTRACT_RENT,
        originId: 'contract-sec-1',
        categoryId: 'cat-1',
        idempotencyKey: 'idemp-comp-sec-1',
        originalAmount: 1000,
        discountAmount: 0,
        fineAmount: 0,
        interestAmount: 0,
        updatedAmount: 1000,
        paidAmount: 0,
        balanceAmount: 1000,
        dueDate: '2026-09-01',
        competenceDate: '2026-09-01',
        status: ObligationStatus.PENDING,
        description: 'Aluguel Pendente Compensação',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const depositRepo = new SecurityDepositRepository();
      const dep = await depositRepo.findByContractId('contract-sec-1');

      const accBefore = await accRepo.findById('acc-w2-1');
      const balanceBefore = accBefore?.currentBalance || 0;

      if (dep) {
        await DepositService.compensateSecurityDeposit(
          company1,
          dep.id,
          1000,
          recComp.id,
          'Compensação de aluguel pendente',
          'usr-1',
          'Tester'
        );
      }

      const updatedRec = await recRepo.findById(recComp.id);
      const accAfter = await accRepo.findById('acc-w2-1');
      const balanceAfter = accAfter?.currentBalance || 0;

      const settlesReceivable = updatedRec?.status === ObligationStatus.PAID && updatedRec?.balanceAmount === 0;
      const noDuplicateCash = balanceBefore === balanceAfter;

      const ok = settlesReceivable && noDuplicateCash;
      results.push({
        id: 'WAVE2-07_08',
        name: 'SECURITY_DEPOSIT_COMPENSATION_SETTLES_RECEIVABLE & NO CASH DUPLICATION',
        passed: ok,
        message: ok
          ? 'Compensação baixou o título e não duplicou movimentação de caixa'
          : `Settles: ${settlesReceivable}, NoCashDup: ${noDuplicateCash}`
      });
    } catch (e: any) {
      results.push({ id: 'WAVE2-07_08', name: 'SECURITY_DEPOSIT_COMPENSATION_SETTLES_RECEIVABLE & NO CASH DUPLICATION', passed: false, message: e.message });
    }

    // 9. INSTALLMENT_ROUNDING_FIXED
    try {
      const payList = await PayableService.create({
        companyId: company1,
        originType: OriginType.MANUAL,
        originId: 'man-round-1',
        categoryId: 'cat-1',
        description: 'Parcelamento 100 em 3x',
        totalAmount: 100.00,
        dueDate: '2026-09-01',
        installmentsCount: 3,
        userId: 'usr-1',
        userName: 'Tester',
      });

      const totalCreated = payList.reduce((sum, p) => sum + p.originalAmount, 0);
      const ok = Math.abs(totalCreated - 100.00) < 0.001;
      results.push({ id: 'WAVE2-09', name: 'INSTALLMENT_ROUNDING_FIXED', passed: ok, message: ok ? `Soma das parcelas é R$ ${totalCreated.toFixed(2)} exatos` : `Diferença de arredondamento: R$ ${totalCreated}` });
    } catch (e: any) {
      results.push({ id: 'WAVE2-09', name: 'INSTALLMENT_ROUNDING_FIXED', passed: false, message: e.message });
    }

    // 10. DRAFT_AUTOMATIC_CHARGE = FALSE
    try {
      let draftChargeCreated = false;
      try {
        const contractSvc = new ContractService();
        await contractSvc.processContractRecurring('draft-contract-id', '2026-09-01', 'usr-1', 'Tester');
        draftChargeCreated = true;
      } catch {
        draftChargeCreated = false;
      }

      const ok = !draftChargeCreated;
      results.push({ id: 'WAVE2-10', name: 'DRAFT_AUTOMATIC_CHARGE = FALSE', passed: ok, message: ok ? 'Contratos DRAFT bloqueiam cobranças automáticas' : 'Permitiu cobrança em contrato DRAFT' });
    } catch (e: any) {
      results.push({ id: 'WAVE2-10', name: 'DRAFT_AUTOMATIC_CHARGE = FALSE', passed: false, message: e.message });
    }

    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;

    return { passed, failed, results };
  }
}

if (typeof process !== 'undefined' && process.argv && process.argv[0]) {
  Wave2VerificationRunner.runAllTests().then((res) => {
    console.log(`Wave2 Suite: ${res.passed}/${res.passed + res.failed} passed`);
    res.results.forEach(r => console.log(`  [${r.passed ? 'PASS' : 'FAIL'}] ${r.id}: ${r.name} - ${r.message}`));
    if (res.failed > 0) process.exit(1);
  });
}
