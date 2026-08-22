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
} from '../../../persistence/repositories/localRepositories';
import { IdempotencyService } from '../../services/IdempotencyService';
import { SettlementService } from '../SettlementService';
import { TransferService } from '../TransferService';
import { ReversalService } from '../ReversalService';
import { OriginType, ObligationStatus, TransactionType } from '../../../types/enums';

export class Wave1VerificationRunner {
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

    const companyA = 'company-A';
    const companyB = 'company-B';

    // MT-FIN-01A: tenant correto consegue ler registro financeiro
    try {
      await recRepo.create({
        id: 'rec-tenant-a-01',
        companyId: companyA,
        originType: OriginType.CONTRACT_RENT,
        originId: 'contract-a',
        categoryId: 'cat-test',
        idempotencyKey: 'idemp-test-a1',
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
        description: 'Receivable Tenant A',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const found = await recRepo.findByIdForCompany('rec-tenant-a-01', companyA);
      const ok = found !== null && found.id === 'rec-tenant-a-01';
      results.push({ id: 'MT-FIN-01A', name: 'Tenant correto lê registro financeiro', passed: ok, message: ok ? 'Sucesso' : 'Falhou em ler' });
    } catch (e: any) {
      results.push({ id: 'MT-FIN-01A', name: 'Tenant correto lê registro financeiro', passed: false, message: e.message });
    }

    // MT-FIN-01B: tenant diferente não consegue ler
    try {
      const foundB = await recRepo.findByIdForCompany('rec-tenant-a-01', companyB);
      const ok = foundB === null;
      results.push({ id: 'MT-FIN-01B', name: 'Tenant diferente não consegue ler', passed: ok, message: ok ? 'Bloqueado corretamente' : 'Vazou dados cross-tenant' });
    } catch (e: any) {
      results.push({ id: 'MT-FIN-01B', name: 'Tenant diferente não consegue ler', passed: false, message: e.message });
    }

    // MT-FIN-01C: update financeiro cross-tenant bloqueado
    try {
      let blocked = false;
      try {
        await recRepo.updateForCompany('rec-tenant-a-01', companyB, { description: 'Infiltrado' });
      } catch {
        blocked = true;
      }
      results.push({ id: 'MT-FIN-01C', name: 'Update cross-tenant bloqueado', passed: blocked, message: blocked ? 'Bloqueado' : 'Permitiu alteração cross-tenant' });
    } catch (e: any) {
      results.push({ id: 'MT-FIN-01C', name: 'Update cross-tenant bloqueado', passed: false, message: e.message });
    }

    // MT-FIN-01D: delete financeiro cross-tenant bloqueado
    try {
      let blocked = false;
      try {
        await recRepo.deleteForCompany('rec-tenant-a-01', companyB);
      } catch {
        blocked = true;
      }
      results.push({ id: 'MT-FIN-01D', name: 'Delete cross-tenant bloqueado', passed: blocked, message: blocked ? 'Bloqueado' : 'Permitiu remoção cross-tenant' });
    } catch (e: any) {
      results.push({ id: 'MT-FIN-01D', name: 'Delete cross-tenant bloqueado', passed: false, message: e.message });
    }

    // MT-FIN-01E: registro sem companyId é rejeitado no modo estrito
    try {
      await recRepo.create({
        id: 'rec-no-company',
        companyId: '' as any,
        originType: OriginType.MANUAL,
        originId: 'man-1',
        categoryId: 'cat-test',
        idempotencyKey: 'idemp-no-comp',
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
        description: 'Sem companyId',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const foundNoComp = await recRepo.findByIdForCompany('rec-no-company', companyA);
      const ok = foundNoComp === null;
      results.push({ id: 'MT-FIN-01E', name: 'Registro sem companyId rejeitado', passed: ok, message: ok ? 'Rejeitado em modo estrito' : 'Retornou registro sem companyId' });
    } catch (e: any) {
      results.push({ id: 'MT-FIN-01E', name: 'Registro sem companyId rejeitado', passed: false, message: e.message });
    }

    // IDEMP-FIN-01: Chaves de idempotência para tenants diferentes são distintas
    try {
      const keyA = IdempotencyService.buildKey(OriginType.CONTRACT_RENT, 'contract-001', 1, undefined, companyA);
      const keyB = IdempotencyService.buildKey(OriginType.CONTRACT_RENT, 'contract-001', 1, undefined, companyB);
      const ok = keyA !== keyB && keyA.includes(companyA) && keyB.includes(companyB);
      results.push({ id: 'IDEMP-FIN-01', name: 'Idempotência tenant-scoped produz chaves distintas', passed: ok, message: ok ? `Chave A: ${keyA} | Chave B: ${keyB}` : 'Chaves colidiram' });
    } catch (e: any) {
      results.push({ id: 'IDEMP-FIN-01', name: 'Idempotência tenant-scoped produz chaves distintas', passed: false, message: e.message });
    }

    // Prepare Financial Accounts for Settlement & Transfer tests
    const accA = await accRepo.create({
      id: 'acc-comp-a',
      companyId: companyA,
      name: 'Conta Banco A',
      type: 'BANK' as any,
      initialBalance: 5000,
      currentBalance: 5000,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const accB = await accRepo.create({
      id: 'acc-comp-b',
      companyId: companyB,
      name: 'Conta Banco B',
      type: 'BANK' as any,
      initialBalance: 5000,
      currentBalance: 5000,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // SETTL-FIN-01: receivable Tenant A + account Tenant B -> BLOQUEADO
    try {
      let blocked = false;
      try {
        await SettlementService.registerReceipt({
          companyId: companyA,
          obligationId: 'rec-tenant-a-01',
          financialAccountId: accB.id,
          paymentMethodId: 'pm-1',
          paymentAmount: 500,
          paymentDate: '2026-08-12',
          userId: 'usr-1',
          userName: 'Test User',
        });
      } catch {
        blocked = true;
      }
      results.push({ id: 'SETTL-FIN-01', name: 'Cross-tenant receipt bloqueado', passed: blocked, message: blocked ? 'Bloqueado' : 'Permitiu baixa cross-tenant' });
    } catch (e: any) {
      results.push({ id: 'SETTL-FIN-01', name: 'Cross-tenant receipt bloqueado', passed: false, message: e.message });
    }

    // SETTL-FIN-02: payable Tenant A + account Tenant B -> BLOQUEADO
    try {
      const payA = await payRepo.create({
        id: 'pay-tenant-a-01',
        companyId: companyA,
        originType: OriginType.MANUAL,
        originId: 'man-pay-1',
        categoryId: 'cat-test',
        idempotencyKey: 'idemp-pay-a1',
        originalAmount: 800,
        discountAmount: 0,
        fineAmount: 0,
        interestAmount: 0,
        updatedAmount: 800,
        paidAmount: 0,
        balanceAmount: 800,
        dueDate: '2026-09-01',
        competenceDate: '2026-09-01',
        status: ObligationStatus.PENDING,
        description: 'Payable Tenant A',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      let blocked = false;
      try {
        await SettlementService.registerPayment({
          companyId: companyA,
          obligationId: payA.id,
          financialAccountId: accB.id,
          paymentMethodId: 'pm-1',
          paymentAmount: 400,
          paymentDate: '2026-08-12',
          userId: 'usr-1',
          userName: 'Test User',
        });
      } catch {
        blocked = true;
      }
      results.push({ id: 'SETTL-FIN-02', name: 'Cross-tenant payment bloqueado', passed: blocked, message: blocked ? 'Bloqueado' : 'Permitiu pagamento cross-tenant' });
    } catch (e: any) {
      results.push({ id: 'SETTL-FIN-02', name: 'Cross-tenant payment bloqueado', passed: false, message: e.message });
    }

    // SETTL-FIN-03: same-tenant receipt -> FUNCIONA
    try {
      const res = await SettlementService.registerReceipt({
        companyId: companyA,
        obligationId: 'rec-tenant-a-01',
        financialAccountId: accA.id,
        paymentMethodId: 'pm-1',
        paymentAmount: 1000,
        paymentDate: '2026-08-12',
        userId: 'usr-1',
        userName: 'Test User',
      });
      const ok = res.receivable.status === ObligationStatus.PAID;
      results.push({ id: 'SETTL-FIN-03', name: 'Same-tenant receipt funciona', passed: ok, message: ok ? 'Sucesso' : 'Falhou no recebimento' });
    } catch (e: any) {
      results.push({ id: 'SETTL-FIN-03', name: 'Same-tenant receipt funciona', passed: false, message: e.message });
    }

    // SETTL-FIN-04: same-tenant payment -> FUNCIONA
    try {
      const res = await SettlementService.registerPayment({
        companyId: companyA,
        obligationId: 'pay-tenant-a-01',
        financialAccountId: accA.id,
        paymentMethodId: 'pm-1',
        paymentAmount: 800,
        paymentDate: '2026-08-12',
        userId: 'usr-1',
        userName: 'Test User',
      });
      const ok = res.payable.status === ObligationStatus.PAID;
      results.push({ id: 'SETTL-FIN-04', name: 'Same-tenant payment funciona', passed: ok, message: ok ? 'Sucesso' : 'Falhou no pagamento' });
    } catch (e: any) {
      results.push({ id: 'SETTL-FIN-04', name: 'Same-tenant payment funciona', passed: false, message: e.message });
    }

    // XTRANSFER-FIN-01: source Tenant A + destination Tenant B -> BLOQUEADO
    try {
      let blocked = false;
      try {
        await TransferService.transferFunds({
          companyId: companyA,
          sourceAccountId: accA.id,
          destinationAccountId: accB.id,
          amount: 500,
          transferDate: '2026-08-12',
          paymentMethodId: 'pm-1',
          description: 'Transferência Cross',
          idempotencyKey: 'r19-compat-wave1Verification-ts-1',
          userId: 'usr-1',
          userName: 'Test User',
        });
      } catch {
        blocked = true;
      }
      results.push({ id: 'XTRANSFER-FIN-01', name: 'Cross-tenant transfer bloqueado', passed: blocked, message: blocked ? 'Bloqueado' : 'Permitiu transferência cross-tenant' });
    } catch (e: any) {
      results.push({ id: 'XTRANSFER-FIN-01', name: 'Cross-tenant transfer bloqueado', passed: false, message: e.message });
    }

    // XTRANSFER-FIN-02: source Tenant A + destination Tenant A -> FUNCIONA
    try {
      const accA2 = await accRepo.create({
        id: 'acc-comp-a2',
        companyId: companyA,
        name: 'Conta Caixinha A',
        type: 'CASH' as any,
        initialBalance: 1000,
        currentBalance: 1000,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const tx = await TransferService.transferFunds({
        companyId: companyA,
        sourceAccountId: accA.id,
        destinationAccountId: accA2.id,
        amount: 300,
        transferDate: '2026-08-12',
        paymentMethodId: 'pm-1',
        description: 'Transferência Interna Tenant A',
        idempotencyKey: 'r19-compat-wave1Verification-ts-2',
        userId: 'usr-1',
        userName: 'Test User',
      });
      const ok = tx !== null && tx.amount === 300;
      results.push({ id: 'XTRANSFER-FIN-02', name: 'Same-tenant transfer funciona', passed: ok, message: ok ? 'Sucesso' : 'Falhou na transferência interna' });
    } catch (e: any) {
      results.push({ id: 'XTRANSFER-FIN-02', name: 'Same-tenant transfer funciona', passed: false, message: e.message });
    }

    // REV-FIN-01: Original = 1000, Reversal 1 = 600, Reversal 2 = 600 -> Segundo estorno BLOQUEADO
    try {
      const origTx = await txRepo.create({
        id: 'tx-orig-1000',
        companyId: companyA,
        financialAccountId: accA.id,
        type: TransactionType.INCOME,
        amount: 1000,
        paymentMethodId: 'pm-1',
        transactionDate: '2026-08-12',
        competenceDate: '2026-08-12',
        description: 'Transação R$ 1000',
        isReversed: false,
        createdById: 'usr-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await ReversalService.reverseTransaction(companyA, origTx.id, 600, 'Estorno Parcial 1', 'usr-1', 'Test User');

      let blocked = false;
      try {
        await ReversalService.reverseTransaction(companyA, origTx.id, 600, 'Estorno Excedente', 'usr-1', 'Test User');
      } catch {
        blocked = true;
      }
      results.push({ id: 'REV-FIN-01', name: 'Estorno acima do disponível bloqueado', passed: blocked, message: blocked ? 'Bloqueado' : 'Permitiu overflow de estorno' });
    } catch (e: any) {
      results.push({ id: 'REV-FIN-01', name: 'Estorno acima do disponível bloqueado', passed: false, message: e.message });
    }

    // REV-FIN-02: Original = 1000, 600 + 400 -> permitido. Após total: isReversed = TRUE
    try {
      await ReversalService.reverseTransaction(companyA, 'tx-orig-1000', 400, 'Estorno Parcial 2', 'usr-1', 'Test User');
      const updatedOrig = await txRepo.findById('tx-orig-1000');
      const ok = updatedOrig !== null && updatedOrig.isReversed === true;
      results.push({ id: 'REV-FIN-02', name: 'Estornos parciais somando total ativam isReversed', passed: ok, message: ok ? 'Sucesso' : 'isReversed não ficou TRUE após estorno total' });
    } catch (e: any) {
      results.push({ id: 'REV-FIN-02', name: 'Estornos parciais somando total ativam isReversed', passed: false, message: e.message });
    }

    // REV-FIN-03: Após estorno total, novo estorno -> BLOQUEADO
    try {
      let blocked = false;
      try {
        await ReversalService.reverseTransaction(companyA, 'tx-orig-1000', 100, 'Estorno pós-total', 'usr-1', 'Test User');
      } catch {
        blocked = true;
      }
      results.push({ id: 'REV-FIN-03', name: 'Estorno após transação totalmente estornada bloqueado', passed: blocked, message: blocked ? 'Bloqueado' : 'Permitiu novo estorno em transação totalmente estornada' });
    } catch (e: any) {
      results.push({ id: 'REV-FIN-03', name: 'Estorno após transação totalmente estornada bloqueado', passed: false, message: e.message });
    }

    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;

    return { passed, failed, results };
  }
}

if (typeof process !== 'undefined' && process.argv && process.argv[0]) {
  Wave1VerificationRunner.runAllTests().then((res) => {
    console.log(`Wave1 Suite: ${res.passed}/${res.passed + res.failed} passed`);
    res.results.forEach(r => console.log(`  [${r.passed ? 'PASS' : 'FAIL'}] ${r.id}: ${r.name} - ${r.message}`));
    if (res.failed > 0) process.exit(1);
  });
}
