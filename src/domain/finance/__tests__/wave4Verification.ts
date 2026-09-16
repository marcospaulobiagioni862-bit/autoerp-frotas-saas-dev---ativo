// Wave 4 Verification Suite - Consolidação Financeira, Regime de Caixa e Competência, Multas e Juros, Inadimplência e Aging
import { execSync } from 'child_process';

if (typeof global.localStorage === 'undefined') {
  const store = new Map<string, string>();
  global.localStorage = {
    getItem: (k: string) => store.get(k) || null,
    setItem: (k: string, v: string) => store.set(k, String(v)),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
  } as unknown as Storage;
}

import { FinanceEngine } from '../FinanceEngine';
import { seedAutoERPTestData } from '../../../persistence/seed/seedData';
import { FinancialAuthorizationService } from '../FinancialAuthorizationService';
import {
  ObligationStatus,
  OriginType,
  FinancialAccountType,
  FinancialPeriodStatus,
} from '../../../types/enums';
import {
  FinancialAccountRepository,
  FinancialPeriodRepository,
  AccountPayableRepository,
  AccountReceivableRepository,
} from '../../../persistence/repositories/localRepositories';
import { StorageAdapter } from '../../../persistence/adapters/storageAdapter';

async function registerUser(id: string, companyId: string, role: string, active = true) {
  const storage = StorageAdapter.getInstance();
  await storage.saveItem('users', {
    id,
    companyId,
    name: `Test User ${id}`,
    email: `${id}@test.com`,
    role,
    active,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

export async function runWave4Verification() {
  console.log('====================================================');
  console.log('STARTING FIN-WAVE-4 VERIFICATION SUITE (49 TESTES)');
  console.log('====================================================\n');

  await seedAutoERPTestData(true);

  const companyA = 'company-tenant-a';
  const companyB = 'company-tenant-b';

  const accountRepo = new FinancialAccountRepository();
  const periodRepo = new FinancialPeriodRepository();
  const payableRepo = new AccountPayableRepository();
  const receivableRepo = new AccountReceivableRepository();

  // Setup Accounts
  const accountA = await accountRepo.create({
    id: 'acc-4-a',
    companyId: companyA,
    name: 'Conta Corrente Tenant A',
    type: FinancialAccountType.BANK,
    initialBalance: 10000,
    currentBalance: 10000,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const accountB = await accountRepo.create({
    id: 'acc-4-b',
    companyId: companyB,
    name: 'Conta Corrente Tenant B',
    type: FinancialAccountType.BANK,
    initialBalance: 5000,
    currentBalance: 5000,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Setup Periods
  await periodRepo.create({
    id: 'per-4-a',
    companyId: companyA,
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    status: FinancialPeriodStatus.OPEN,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  await periodRepo.create({
    id: 'per-4-b',
    companyId: companyB,
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    status: FinancialPeriodStatus.OPEN,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const results: { id: string; passed: boolean; message: string }[] = [];

  const test = async (id: string, name: string, fn: () => Promise<void>) => {
    try {
      await fn();
      results.push({ id, passed: true, message: `[PASS] ${id}: ${name}` });
      console.log(`  [PASS] ${id}: ${name}`);
    } catch (err: any) {
      results.push({ id, passed: false, message: `[FAIL] ${id}: ${name} -> ${err.message}` });
      console.error(`  [FAIL] ${id}: ${name} -> ${err.message}`);
    }
  };

  // Register users with different roles
  await registerUser('usr-admin-4', companyA, 'ADMIN');
  await registerUser('usr-viewer-4', companyA, 'FINANCIAL_VIEWER');
  await registerUser('usr-manager-4', companyA, 'FINANCIAL_MANAGER');

  console.log('--- 1. CONTAS A RECEBER VENCIDAS (W4-AR) ---');

  // W4-AR-01-A
  await test('W4-AR-01-A', 'Status transitions to OVERDUE for simple pending receivable', async () => {
    const rec = await receivableRepo.create({
      id: 'rec-ar-01a',
      companyId: companyA,
      originType: OriginType.CONTRACT_RENT,
      originId: 'origin-ar-01a',
      categoryId: 'cat-rent',
      description: 'Aluguel Atrasado',
      originalAmount: 1000,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 1000,
      paidAmount: 0,
      balanceAmount: 1000,
      dueDate: '2026-08-10',
      competenceDate: '2026-08-05',
      status: ObligationStatus.PENDING,
      idempotencyKey: 'key-ar-01a',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await FinanceEngine.processOverdueReceivables(companyA, '2026-08-12', 'usr-admin-4', 'Admin');
    const updated = await receivableRepo.findById(rec.id);
    if (!updated || updated.status !== ObligationStatus.OVERDUE) {
      throw new Error('Status não transicionou para OVERDUE');
    }
  });

  // W4-AR-01-B
  await test('W4-AR-01-B', 'Status transitions to OVERDUE for partially paid receivable', async () => {
    const rec = await receivableRepo.create({
      id: 'rec-ar-01b',
      companyId: companyA,
      originType: OriginType.CONTRACT_RENT,
      originId: 'origin-ar-01b',
      categoryId: 'cat-rent',
      description: 'Aluguel Parcial Atrasado',
      originalAmount: 1000,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 1000,
      paidAmount: 400,
      balanceAmount: 600,
      dueDate: '2026-08-10',
      competenceDate: '2026-08-05',
      status: ObligationStatus.PARTIALLY_PAID,
      idempotencyKey: 'key-ar-01b',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await FinanceEngine.processOverdueReceivables(companyA, '2026-08-12', 'usr-admin-4', 'Admin');
    const updated = await receivableRepo.findById(rec.id);
    if (!updated || updated.status !== ObligationStatus.OVERDUE) {
      throw new Error('Status parcial não transicionou para OVERDUE');
    }
  });

  // W4-AR-01-C
  await test('W4-AR-01-C', 'Status remains PENDING if not yet due', async () => {
    const rec = await receivableRepo.create({
      id: 'rec-ar-01c',
      companyId: companyA,
      originType: OriginType.CONTRACT_RENT,
      originId: 'origin-ar-01c',
      categoryId: 'cat-rent',
      description: 'Aluguel Futuro',
      originalAmount: 1000,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 1000,
      paidAmount: 0,
      balanceAmount: 1000,
      dueDate: '2026-08-20',
      competenceDate: '2026-08-05',
      status: ObligationStatus.PENDING,
      idempotencyKey: 'key-ar-01c',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await FinanceEngine.processOverdueReceivables(companyA, '2026-08-12', 'usr-admin-4', 'Admin');
    const updated = await receivableRepo.findById(rec.id);
    if (!updated || updated.status !== ObligationStatus.PENDING) {
      throw new Error('Status pendente alterado incorretamente');
    }
  });

  // W4-AR-02-A
  await test('W4-AR-02-A', 'Fine calculated correctly (2%) on original amount when no payment', async () => {
    const rec = await receivableRepo.create({
      id: 'rec-ar-02a',
      companyId: companyA,
      originType: OriginType.CONTRACT_RENT,
      originId: 'origin-ar-02a',
      categoryId: 'cat-rent',
      description: 'Aluguel Fine',
      originalAmount: 1000,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 1000,
      paidAmount: 0,
      balanceAmount: 1000,
      dueDate: '2026-08-10',
      competenceDate: '2026-08-05',
      status: ObligationStatus.PENDING,
      idempotencyKey: 'key-ar-02a',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 2% of 1000 is 20
    await FinanceEngine.processOverdueReceivables(companyA, '2026-08-12', 'usr-admin-4', 'Admin', 0, 2.0, 0);
    const updated = await receivableRepo.findById(rec.id);
    if (!updated || updated.fineAmount !== 20) {
      throw new Error(`Multa incorreta: esperada 20, obtida ${updated?.fineAmount}`);
    }
  });

  // W4-AR-02-B
  await test('W4-AR-02-B', 'Fine calculated correctly on residual balance when partially paid', async () => {
    const rec = await receivableRepo.create({
      id: 'rec-ar-02b',
      companyId: companyA,
      originType: OriginType.CONTRACT_RENT,
      originId: 'origin-ar-02b',
      categoryId: 'cat-rent',
      description: 'Aluguel Fine Parcial',
      originalAmount: 1000,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 1000,
      paidAmount: 600,
      balanceAmount: 400,
      dueDate: '2026-08-10',
      competenceDate: '2026-08-05',
      status: ObligationStatus.PARTIALLY_PAID,
      idempotencyKey: 'key-ar-02b',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 2% of outstanding principal (1000 - 600 = 400) is 8
    await FinanceEngine.processOverdueReceivables(companyA, '2026-08-12', 'usr-admin-4', 'Admin', 0, 2.0, 0);
    const updated = await receivableRepo.findById(rec.id);
    if (!updated || updated.fineAmount !== 8) {
      throw new Error(`Multa residual incorreta: esperada 8, obtida ${updated?.fineAmount}`);
    }
  });

  // W4-AR-02-C
  await test('W4-AR-02-C', 'Fine is not applied when daysOverdue is 0', async () => {
    const rec = await receivableRepo.create({
      id: 'rec-ar-02c',
      companyId: companyA,
      originType: OriginType.CONTRACT_RENT,
      originId: 'origin-ar-02c',
      categoryId: 'cat-rent',
      description: 'Aluguel Fine No Delay',
      originalAmount: 1000,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 1000,
      paidAmount: 0,
      balanceAmount: 1000,
      dueDate: '2026-08-10',
      competenceDate: '2026-08-05',
      status: ObligationStatus.PENDING,
      idempotencyKey: 'key-ar-02c',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await FinanceEngine.processOverdueReceivables(companyA, '2026-08-10', 'usr-admin-4', 'Admin', 0, 2.0, 0);
    const updated = await receivableRepo.findById(rec.id);
    if (!updated || updated.fineAmount !== 0) {
      throw new Error('Multa aplicada indevidamente a título no prazo');
    }
  });

  // W4-AR-03-A
  await test('W4-AR-03-A', 'Interest calculated correctly for 1 day overdue', async () => {
    const rec = await receivableRepo.create({
      id: 'rec-ar-03a',
      companyId: companyA,
      originType: OriginType.CONTRACT_RENT,
      originId: 'origin-ar-03a',
      categoryId: 'cat-rent',
      description: 'Aluguel Juros 1 dia',
      originalAmount: 1000,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 1000,
      paidAmount: 0,
      balanceAmount: 1000,
      dueDate: '2026-08-10',
      competenceDate: '2026-08-05',
      status: ObligationStatus.PENDING,
      idempotencyKey: 'key-ar-03a',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 0.033% daily interest for 1 day overdue on 1000 is 0.33
    await FinanceEngine.processOverdueReceivables(companyA, '2026-08-11', 'usr-admin-4', 'Admin', 0, 0, 0.033);
    const updated = await receivableRepo.findById(rec.id);
    if (!updated || updated.interestAmount !== 0.33) {
      throw new Error(`Juros incorretos para 1 dia: esperado 0.33, obtido ${updated?.interestAmount}`);
    }
  });

  // W4-AR-03-B
  await test('W4-AR-03-B', 'Interest calculated correctly for 10 days overdue', async () => {
    const rec = await receivableRepo.create({
      id: 'rec-ar-03b',
      companyId: companyA,
      originType: OriginType.CONTRACT_RENT,
      originId: 'origin-ar-03b',
      categoryId: 'cat-rent',
      description: 'Aluguel Juros 10 dias',
      originalAmount: 1000,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 1000,
      paidAmount: 0,
      balanceAmount: 1000,
      dueDate: '2026-08-10',
      competenceDate: '2026-08-05',
      status: ObligationStatus.PENDING,
      idempotencyKey: 'key-ar-03b',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 0.033% daily interest for 10 days on 1000 is 3.3
    await FinanceEngine.processOverdueReceivables(companyA, '2026-08-20', 'usr-admin-4', 'Admin', 0, 0, 0.033);
    const updated = await receivableRepo.findById(rec.id);
    if (!updated || updated.interestAmount !== 3.3) {
      throw new Error(`Juros incorretos para 10 dias: esperado 3.3, obtido ${updated?.interestAmount}`);
    }
  });

  // W4-AR-03-C
  await test('W4-AR-03-C', 'Interest calculated on outstanding principal only (no compounding/anatocismo)', async () => {
    const rec = await receivableRepo.create({
      id: 'rec-ar-03c',
      companyId: companyA,
      originType: OriginType.CONTRACT_RENT,
      originId: 'origin-ar-03c',
      categoryId: 'cat-rent',
      description: 'Aluguel Juros Anatocismo',
      originalAmount: 1000,
      discountAmount: 0,
      fineAmount: 20, // pre-existing fine
      interestAmount: 10, // pre-existing interest
      updatedAmount: 1030,
      paidAmount: 0,
      balanceAmount: 1030,
      dueDate: '2026-08-10',
      competenceDate: '2026-08-05',
      status: ObligationStatus.PENDING,
      idempotencyKey: 'key-ar-03c',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Interest must apply to the original principal amount (1000), not the updatedAmount (1030).
    // For 10 days, 1000 * 0.033% * 10 = 3.30.
    await FinanceEngine.processOverdueReceivables(companyA, '2026-08-20', 'usr-admin-4', 'Admin', 0, 0, 0.033);
    const updated = await receivableRepo.findById(rec.id);
    if (!updated || updated.interestAmount !== 3.30) {
      throw new Error(`Juros incorretos (deve ignorar multa/juros anteriores): esperado 3.30, obtido ${updated?.interestAmount}`);
    }
  });

  // W4-AR-03-D
  await test('W4-AR-03-D', 'Interest calculated correctly on partially paid obligation', async () => {
    const rec = await receivableRepo.create({
      id: 'rec-ar-03d',
      companyId: companyA,
      originType: OriginType.CONTRACT_RENT,
      originId: 'origin-ar-03d',
      categoryId: 'cat-rent',
      description: 'Aluguel Juros Parcial',
      originalAmount: 1000,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 1000,
      paidAmount: 700,
      balanceAmount: 300,
      dueDate: '2026-08-10',
      competenceDate: '2026-08-05',
      status: ObligationStatus.PARTIALLY_PAID,
      idempotencyKey: 'key-ar-03d',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Interest must apply on remaining principal (300).
    // 300 * 0.033% * 10 days = 0.99
    await FinanceEngine.processOverdueReceivables(companyA, '2026-08-20', 'usr-admin-4', 'Admin', 0, 0, 0.033);
    const updated = await receivableRepo.findById(rec.id);
    if (!updated || updated.interestAmount !== 0.99) {
      throw new Error(`Juros residuais incorretos: esperado 0.99, obtido ${updated?.interestAmount}`);
    }
  });

  // W4-AR-04-A
  await test('W4-AR-04-A', 'Grace period of 1 day respected (0 fees on day 1)', async () => {
    const rec = await receivableRepo.create({
      id: 'rec-ar-04a',
      companyId: companyA,
      originType: OriginType.CONTRACT_RENT,
      originId: 'origin-ar-04a',
      categoryId: 'cat-rent',
      description: 'Aluguel Grace 1 dia',
      originalAmount: 1000,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 1000,
      paidAmount: 0,
      balanceAmount: 1000,
      dueDate: '2026-08-10',
      competenceDate: '2026-08-05',
      status: ObligationStatus.PENDING,
      idempotencyKey: 'key-ar-04a',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Process on 2026-08-11 with gracePeriod = 1 day
    await FinanceEngine.processOverdueReceivables(companyA, '2026-08-11', 'usr-admin-4', 'Admin', 1, 2.0, 0.033);
    const updated = await receivableRepo.findById(rec.id);
    if (!updated || updated.fineAmount !== 0 || updated.interestAmount !== 0) {
      throw new Error('Tolerância de 1 dia violada: multas/juros aplicados');
    }
  });

  // W4-AR-04-B
  await test('W4-AR-04-B', 'Grace period of 3 days respected (0 fees on day 3)', async () => {
    const rec = await receivableRepo.create({
      id: 'rec-ar-04b',
      companyId: companyA,
      originType: OriginType.CONTRACT_RENT,
      originId: 'origin-ar-04b',
      categoryId: 'cat-rent',
      description: 'Aluguel Grace 3 dias',
      originalAmount: 1000,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 1000,
      paidAmount: 0,
      balanceAmount: 1000,
      dueDate: '2026-08-10',
      competenceDate: '2026-08-05',
      status: ObligationStatus.PENDING,
      idempotencyKey: 'key-ar-04b',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Process on 2026-08-13 (3 days overdue) with gracePeriod = 3 days
    await FinanceEngine.processOverdueReceivables(companyA, '2026-08-13', 'usr-admin-4', 'Admin', 3, 2.0, 0.033);
    const updated = await receivableRepo.findById(rec.id);
    if (!updated || updated.fineAmount !== 0 || updated.interestAmount !== 0) {
      throw new Error('Tolerância de 3 dias violada: multas/juros aplicados');
    }
  });

  // W4-AR-04-C
  await test('W4-AR-04-C', 'Charge applied correctly once grace period exceeded (on day 4)', async () => {
    const rec = await receivableRepo.create({
      id: 'rec-ar-04c',
      companyId: companyA,
      originType: OriginType.CONTRACT_RENT,
      originId: 'origin-ar-04c',
      categoryId: 'cat-rent',
      description: 'Aluguel Grace Exceeded',
      originalAmount: 1000,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 1000,
      paidAmount: 0,
      balanceAmount: 1000,
      dueDate: '2026-08-10',
      competenceDate: '2026-08-05',
      status: ObligationStatus.PENDING,
      idempotencyKey: 'key-ar-04c',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Process on 2026-08-14 (4 days overdue) with gracePeriod = 3 days
    await FinanceEngine.processOverdueReceivables(companyA, '2026-08-14', 'usr-admin-4', 'Admin', 3, 2.0, 0.033);
    const updated = await receivableRepo.findById(rec.id);
    if (!updated || updated.fineAmount !== 20 || updated.interestAmount !== 1.32) {
      throw new Error(`Encargos não aplicados após tolerância: multa ${updated?.fineAmount}, juros ${updated?.interestAmount}`);
    }
  });

  // W4-AR-05-A
  await test('W4-AR-05-A', 'Overpayment of receivables with exactly 0 balance throws', async () => {
    const rec = await receivableRepo.create({
      id: 'rec-ar-05a',
      companyId: companyA,
      originType: OriginType.CONTRACT_RENT,
      originId: 'origin-ar-05a',
      categoryId: 'cat-rent',
      description: 'Aluguel Overpay Zero Balance',
      originalAmount: 1000,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 1000,
      paidAmount: 1000,
      balanceAmount: 0,
      dueDate: '2026-08-10',
      competenceDate: '2026-08-05',
      status: ObligationStatus.PAID,
      idempotencyKey: 'key-ar-05a',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    try {
      await FinanceEngine.registerReceipt({
        companyId: companyA,
        obligationId: rec.id,
        financialAccountId: 'acc-4-a',
        paymentMethodId: 'pm-pix',
        paymentAmount: 100,
        paymentDate: '2026-08-12',
        userId: 'usr-admin-4',
        userName: 'Admin',
      });
      throw new Error('Permitiu pagamento acima do saldo!');
    } catch (err: any) {
      if (!err.message.includes('Overpayment bloqueado') && !err.message.includes('não aceita recebimento')) {
        throw err;
      }
    }
  });

  // W4-AR-05-B
  await test('W4-AR-05-B', 'Overpayment of receivables with partial balance throws', async () => {
    const rec = await receivableRepo.create({
      id: 'rec-ar-05b',
      companyId: companyA,
      originType: OriginType.CONTRACT_RENT,
      originId: 'origin-ar-05b',
      categoryId: 'cat-rent',
      description: 'Aluguel Overpay Parcial Balance',
      originalAmount: 1000,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 1000,
      paidAmount: 600,
      balanceAmount: 400,
      dueDate: '2026-08-10',
      competenceDate: '2026-08-05',
      status: ObligationStatus.PARTIALLY_PAID,
      idempotencyKey: 'key-ar-05b',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    try {
      await FinanceEngine.registerReceipt({
        companyId: companyA,
        obligationId: rec.id,
        financialAccountId: 'acc-4-a',
        paymentMethodId: 'pm-pix',
        paymentAmount: 500, // over outstanding 400
        paymentDate: '2026-08-12',
        userId: 'usr-admin-4',
        userName: 'Admin',
      });
      throw new Error('Permitiu pagamento de 500 para saldo de 400!');
    } catch (err: any) {
      if (!err.message.includes('Overpayment bloqueado') && !err.message.includes('excede')) {
        throw err;
      }
    }
  });

  console.log('--- 2. CONTAS A PAGAR VENCIDAS (W4-AP) ---');

  // W4-AP-01-A
  await test('W4-AP-01-A', 'Status transitions to OVERDUE for simple pending payable', async () => {
    const pay = await payableRepo.create({
      id: 'pay-ap-01a',
      companyId: companyA,
      originType: OriginType.MAINTENANCE,
      originId: 'origin-ap-01a',
      categoryId: 'cat-maint',
      description: 'Oficina Atrasada',
      originalAmount: 800,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 800,
      paidAmount: 0,
      balanceAmount: 800,
      dueDate: '2026-08-10',
      competenceDate: '2026-08-05',
      status: ObligationStatus.PENDING,
      idempotencyKey: 'key-ap-01a',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await FinanceEngine.processOverduePayables(companyA, '2026-08-12', 'usr-admin-4', 'Admin');
    const updated = await payableRepo.findById(pay.id);
    if (!updated || updated.status !== ObligationStatus.OVERDUE) {
      throw new Error('Status não transicionou para OVERDUE no payable');
    }
  });

  // W4-AP-01-B
  await test('W4-AP-01-B', 'Status transitions to OVERDUE for partially paid payable', async () => {
    const pay = await payableRepo.create({
      id: 'pay-ap-01b',
      companyId: companyA,
      originType: OriginType.MAINTENANCE,
      originId: 'origin-ap-01b',
      categoryId: 'cat-maint',
      description: 'Oficina Parcial Atrasada',
      originalAmount: 800,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 800,
      paidAmount: 300,
      balanceAmount: 500,
      dueDate: '2026-08-10',
      competenceDate: '2026-08-05',
      status: ObligationStatus.PARTIALLY_PAID,
      idempotencyKey: 'key-ap-01b',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await FinanceEngine.processOverduePayables(companyA, '2026-08-12', 'usr-admin-4', 'Admin');
    const updated = await payableRepo.findById(pay.id);
    if (!updated || updated.status !== ObligationStatus.OVERDUE) {
      throw new Error('Status parcial não transicionou para OVERDUE no payable');
    }
  });

  // W4-AP-01-C
  await test('W4-AP-01-C', 'Status remains PENDING if payable not yet due', async () => {
    const pay = await payableRepo.create({
      id: 'pay-ap-01c',
      companyId: companyA,
      originType: OriginType.MAINTENANCE,
      originId: 'origin-ap-01c',
      categoryId: 'cat-maint',
      description: 'Oficina Futura',
      originalAmount: 800,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 800,
      paidAmount: 0,
      balanceAmount: 800,
      dueDate: '2026-08-20',
      competenceDate: '2026-08-05',
      status: ObligationStatus.PENDING,
      idempotencyKey: 'key-ap-01c',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await FinanceEngine.processOverduePayables(companyA, '2026-08-12', 'usr-admin-4', 'Admin');
    const updated = await payableRepo.findById(pay.id);
    if (!updated || updated.status !== ObligationStatus.PENDING) {
      throw new Error('Status pendente de payable alterado incorretamente');
    }
  });

  // W4-AP-02-A
  await test('W4-AP-02-A', 'Fine calculated correctly on payable when no payment', async () => {
    const pay = await payableRepo.create({
      id: 'pay-ap-02a',
      companyId: companyA,
      originType: OriginType.MAINTENANCE,
      originId: 'origin-ap-02a',
      categoryId: 'cat-maint',
      description: 'Oficina Fine',
      originalAmount: 500,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 500,
      paidAmount: 0,
      balanceAmount: 500,
      dueDate: '2026-08-10',
      competenceDate: '2026-08-05',
      status: ObligationStatus.PENDING,
      idempotencyKey: 'key-ap-02a',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await FinanceEngine.processOverduePayables(companyA, '2026-08-12', 'usr-admin-4', 'Admin', 0, 2.0, 0);
    const updated = await payableRepo.findById(pay.id);
    if (!updated || updated.fineAmount !== 10) {
      throw new Error(`Multa payable incorreta: esperada 10, obtida ${updated?.fineAmount}`);
    }
  });

  // W4-AP-02-B
  await test('W4-AP-02-B', 'Fine calculated correctly on payable residual balance when partially paid', async () => {
    const pay = await payableRepo.create({
      id: 'pay-ap-02b',
      companyId: companyA,
      originType: OriginType.MAINTENANCE,
      originId: 'origin-ap-02b',
      categoryId: 'cat-maint',
      description: 'Oficina Fine Parcial',
      originalAmount: 500,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 500,
      paidAmount: 200,
      balanceAmount: 300,
      dueDate: '2026-08-10',
      competenceDate: '2026-08-05',
      status: ObligationStatus.PARTIALLY_PAID,
      idempotencyKey: 'key-ap-02b',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await FinanceEngine.processOverduePayables(companyA, '2026-08-12', 'usr-admin-4', 'Admin', 0, 2.0, 0);
    const updated = await payableRepo.findById(pay.id);
    if (!updated || updated.fineAmount !== 6) {
      throw new Error(`Multa residual payable incorreta: esperada 6, obtida ${updated?.fineAmount}`);
    }
  });

  // W4-AP-02-C
  await test('W4-AP-02-C', 'Fine is not applied to payable when daysOverdue is 0', async () => {
    const pay = await payableRepo.create({
      id: 'pay-ap-02c',
      companyId: companyA,
      originType: OriginType.MAINTENANCE,
      originId: 'origin-ap-02c',
      categoryId: 'cat-maint',
      description: 'Oficina Fine No Delay',
      originalAmount: 500,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 500,
      paidAmount: 0,
      balanceAmount: 500,
      dueDate: '2026-08-10',
      competenceDate: '2026-08-05',
      status: ObligationStatus.PENDING,
      idempotencyKey: 'key-ap-02c',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await FinanceEngine.processOverduePayables(companyA, '2026-08-10', 'usr-admin-4', 'Admin', 0, 2.0, 0);
    const updated = await payableRepo.findById(pay.id);
    if (!updated || updated.fineAmount !== 0) {
      throw new Error('Multa aplicada indevidamente a payable no prazo');
    }
  });

  // W4-AP-03-A
  await test('W4-AP-03-A', 'Payable interest calculated correctly for 1 day overdue', async () => {
    const pay = await payableRepo.create({
      id: 'pay-ap-03a',
      companyId: companyA,
      originType: OriginType.MAINTENANCE,
      originId: 'origin-ap-03a',
      categoryId: 'cat-maint',
      description: 'Oficina Juros 1 dia',
      originalAmount: 1000,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 1000,
      paidAmount: 0,
      balanceAmount: 1000,
      dueDate: '2026-08-10',
      competenceDate: '2026-08-05',
      status: ObligationStatus.PENDING,
      idempotencyKey: 'key-ap-03a',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await FinanceEngine.processOverduePayables(companyA, '2026-08-11', 'usr-admin-4', 'Admin', 0, 0, 0.033);
    const updated = await payableRepo.findById(pay.id);
    if (!updated || updated.interestAmount !== 0.33) {
      throw new Error(`Juros payable 1 dia incorretos: esperado 0.33, obtido ${updated?.interestAmount}`);
    }
  });

  // W4-AP-03-B
  await test('W4-AP-03-B', 'Payable interest calculated correctly for 15 days overdue', async () => {
    const pay = await payableRepo.create({
      id: 'pay-ap-03b',
      companyId: companyA,
      originType: OriginType.MAINTENANCE,
      originId: 'origin-ap-03b',
      categoryId: 'cat-maint',
      description: 'Oficina Juros 15 dias',
      originalAmount: 1000,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 1000,
      paidAmount: 0,
      balanceAmount: 1000,
      dueDate: '2026-08-10',
      competenceDate: '2026-08-05',
      status: ObligationStatus.PENDING,
      idempotencyKey: 'key-ap-03b',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 1000 * 0.00033 * 15 = 4.95
    await FinanceEngine.processOverduePayables(companyA, '2026-08-25', 'usr-admin-4', 'Admin', 0, 0, 0.033);
    const updated = await payableRepo.findById(pay.id);
    if (!updated || updated.interestAmount !== 4.95) {
      throw new Error(`Juros payable 15 dias incorretos: esperado 4.95, obtido ${updated?.interestAmount}`);
    }
  });

  // W4-AP-03-C
  await test('W4-AP-03-C', 'Payable interest calculated on outstanding principal only', async () => {
    const pay = await payableRepo.create({
      id: 'pay-ap-03c',
      companyId: companyA,
      originType: OriginType.MAINTENANCE,
      originId: 'origin-ap-03c',
      categoryId: 'cat-maint',
      description: 'Oficina Anatocismo',
      originalAmount: 1000,
      discountAmount: 0,
      fineAmount: 20,
      interestAmount: 10,
      updatedAmount: 1030,
      paidAmount: 0,
      balanceAmount: 1030,
      dueDate: '2026-08-10',
      competenceDate: '2026-08-05',
      status: ObligationStatus.PENDING,
      idempotencyKey: 'key-ap-03c',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await FinanceEngine.processOverduePayables(companyA, '2026-08-20', 'usr-admin-4', 'Admin', 0, 0, 0.033);
    const updated = await payableRepo.findById(pay.id);
    if (!updated || updated.interestAmount !== 3.30) {
      throw new Error(`Juros payable anatocismo incorretos: esperado 3.30, obtido ${updated?.interestAmount}`);
    }
  });

  // W4-AP-04-A
  await test('W4-AP-04-A', 'Payable grace period of 2 days respected', async () => {
    const pay = await payableRepo.create({
      id: 'pay-ap-04a',
      companyId: companyA,
      originType: OriginType.MAINTENANCE,
      originId: 'origin-ap-04a',
      categoryId: 'cat-maint',
      description: 'Oficina Grace 2 dias',
      originalAmount: 1000,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 1000,
      paidAmount: 0,
      balanceAmount: 1000,
      dueDate: '2026-08-10',
      competenceDate: '2026-08-05',
      status: ObligationStatus.PENDING,
      idempotencyKey: 'key-ap-04a',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await FinanceEngine.processOverduePayables(companyA, '2026-08-12', 'usr-admin-4', 'Admin', 2, 2.0, 0.033);
    const updated = await payableRepo.findById(pay.id);
    if (!updated || updated.fineAmount !== 0 || updated.interestAmount !== 0) {
      throw new Error('Grace period de 2 dias violado no payable');
    }
  });

  // W4-AP-04-B
  await test('W4-AP-04-B', 'Payable charge applied when grace period exceeded', async () => {
    const pay = await payableRepo.create({
      id: 'pay-ap-04b',
      companyId: companyA,
      originType: OriginType.MAINTENANCE,
      originId: 'origin-ap-04b',
      categoryId: 'cat-maint',
      description: 'Oficina Grace Exceeded',
      originalAmount: 1000,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 1000,
      paidAmount: 0,
      balanceAmount: 1000,
      dueDate: '2026-08-10',
      competenceDate: '2026-08-05',
      status: ObligationStatus.PENDING,
      idempotencyKey: 'key-ap-04b',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await FinanceEngine.processOverduePayables(companyA, '2026-08-13', 'usr-admin-4', 'Admin', 2, 2.0, 0.033);
    const updated = await payableRepo.findById(pay.id);
    if (!updated || updated.fineAmount !== 20 || updated.interestAmount !== 0.99) {
      throw new Error(`Encargos payable após grace não aplicados: multa ${updated?.fineAmount}, juros ${updated?.interestAmount}`);
    }
  });

  // W4-AP-05-A
  await test('W4-AP-05-A', 'Overpayment of payable with exactly 0 balance throws', async () => {
    const pay = await payableRepo.create({
      id: 'pay-ap-05a',
      companyId: companyA,
      originType: OriginType.MAINTENANCE,
      originId: 'origin-ap-05a',
      categoryId: 'cat-maint',
      description: 'Oficina Overpay Zero',
      originalAmount: 1000,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 1000,
      paidAmount: 1000,
      balanceAmount: 0,
      dueDate: '2026-08-10',
      competenceDate: '2026-08-05',
      status: ObligationStatus.PAID,
      idempotencyKey: 'key-ap-05a',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    try {
      await FinanceEngine.registerPayment({
        companyId: companyA,
        obligationId: pay.id,
        financialAccountId: 'acc-4-a',
        paymentMethodId: 'pm-pix',
        paymentAmount: 100,
        paymentDate: '2026-08-12',
        userId: 'usr-admin-4',
        userName: 'Admin',
      });
      throw new Error('Permitiu pagar acima do saldo!');
    } catch (err: any) {
      if (!err.message.includes('Overpayment bloqueado') && !err.message.includes('não aceita pagamento')) {
        throw err;
      }
    }
  });

  // W4-AP-05-B
  await test('W4-AP-05-B', 'Overpayment of payable with partial balance throws', async () => {
    const pay = await payableRepo.create({
      id: 'pay-ap-05b',
      companyId: companyA,
      originType: OriginType.MAINTENANCE,
      originId: 'origin-ap-05b',
      categoryId: 'cat-maint',
      description: 'Oficina Overpay Parcial',
      originalAmount: 1000,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 1000,
      paidAmount: 500,
      balanceAmount: 500,
      dueDate: '2026-08-10',
      competenceDate: '2026-08-05',
      status: ObligationStatus.PARTIALLY_PAID,
      idempotencyKey: 'key-ap-05b',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    try {
      await FinanceEngine.registerPayment({
        companyId: companyA,
        obligationId: pay.id,
        financialAccountId: 'acc-4-a',
        paymentMethodId: 'pm-pix',
        paymentAmount: 600, // over outstanding 500
        paymentDate: '2026-08-12',
        userId: 'usr-admin-4',
        userName: 'Admin',
      });
      throw new Error('Permitiu pagamento de 600 para saldo de 500!');
    } catch (err: any) {
      if (!err.message.includes('Overpayment bloqueado') && !err.message.includes('excede')) {
        throw err;
      }
    }
  });

  console.log('--- 3. INADIMPLÊNCIA / DELINQUENCY (W4-DEL) ---');

  // W4-DEL-01-A
  await test('W4-DEL-01-A', 'Delinquency detected for simple receivable', async () => {
    await receivableRepo.create({
      id: 'rec-del-01a',
      companyId: companyA,
      originType: OriginType.CONTRACT_RENT,
      originId: 'origin-del-01a',
      categoryId: 'cat-rent',
      description: 'Aluguel Delinquent',
      originalAmount: 750,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 750,
      paidAmount: 0,
      balanceAmount: 750,
      dueDate: '2026-08-10',
      competenceDate: '2026-08-05',
      status: ObligationStatus.PENDING,
      idempotencyKey: 'key-del-01a',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const delinquents = await FinanceEngine.getDelinquentReceivables(companyA, '2026-08-12');
    const item = delinquents.find((d) => d.receivableId === 'rec-del-01a');
    if (!item || item.daysOverdue !== 2 || item.updatedOutstandingAmount !== 750) {
      throw new Error('Inadimplência não detectada ou campos incorretos');
    }
  });

  // W4-DEL-01-B
  await test('W4-DEL-01-B', 'Delinquency contains correct driverId when present', async () => {
    await receivableRepo.create({
      id: 'rec-del-01b',
      companyId: companyA,
      originType: OriginType.CONTRACT_RENT,
      originId: 'origin-del-01b',
      driverId: 'drv-test-4',
      categoryId: 'cat-rent',
      description: 'Aluguel Delinquent Condutor',
      originalAmount: 750,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 750,
      paidAmount: 0,
      balanceAmount: 750,
      dueDate: '2026-08-10',
      competenceDate: '2026-08-05',
      status: ObligationStatus.PENDING,
      idempotencyKey: 'key-del-01b',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const delinquents = await FinanceEngine.getDelinquentReceivables(companyA, '2026-08-12');
    const item = delinquents.find((d) => d.receivableId === 'rec-del-01b');
    if (!item || item.driverId !== 'drv-test-4') {
      throw new Error('driverId ausente ou incorreto na inadimplência');
    }
  });

  // W4-DEL-01-C
  await test('W4-DEL-01-C', 'Delinquency contains correct vehicleId when present', async () => {
    await receivableRepo.create({
      id: 'rec-del-01c',
      companyId: companyA,
      originType: OriginType.CONTRACT_RENT,
      originId: 'origin-del-01c',
      vehicleId: 'veh-test-4',
      categoryId: 'cat-rent',
      description: 'Aluguel Delinquent Veículo',
      originalAmount: 750,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 750,
      paidAmount: 0,
      balanceAmount: 750,
      dueDate: '2026-08-10',
      competenceDate: '2026-08-05',
      status: ObligationStatus.PENDING,
      idempotencyKey: 'key-del-01c',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const delinquents = await FinanceEngine.getDelinquentReceivables(companyA, '2026-08-12');
    const item = delinquents.find((d) => d.receivableId === 'rec-del-01c');
    if (!item || item.vehicleId !== 'veh-test-4') {
      throw new Error('vehicleId ausente ou incorreto na inadimplência');
    }
  });

  // W4-DEL-02-A
  await test('W4-DEL-02-A', 'Fully paid receivable is removed from delinquency', async () => {
    const rec = await receivableRepo.create({
      id: 'rec-del-02a',
      companyId: companyA,
      originType: OriginType.CONTRACT_RENT,
      originId: 'origin-del-02a',
      categoryId: 'cat-rent',
      description: 'Aluguel Liquidado',
      originalAmount: 500,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 500,
      paidAmount: 500,
      balanceAmount: 0,
      dueDate: '2026-08-10',
      competenceDate: '2026-08-05',
      status: ObligationStatus.PAID,
      idempotencyKey: 'key-del-02a',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const delinquents = await FinanceEngine.getDelinquentReceivables(companyA, '2026-08-12');
    const item = delinquents.find((d) => d.receivableId === rec.id);
    if (item) {
      throw new Error('Título totalmente pago listado na inadimplência');
    }
  });

  // W4-DEL-02-B
  await test('W4-DEL-02-B', 'Cancelled receivable is removed from delinquency', async () => {
    const rec = await receivableRepo.create({
      id: 'rec-del-02b',
      companyId: companyA,
      originType: OriginType.CONTRACT_RENT,
      originId: 'origin-del-02b',
      categoryId: 'cat-rent',
      description: 'Aluguel Cancelado',
      originalAmount: 500,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 500,
      paidAmount: 0,
      balanceAmount: 500,
      dueDate: '2026-08-10',
      competenceDate: '2026-08-05',
      status: ObligationStatus.CANCELLED,
      idempotencyKey: 'key-del-02b',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const delinquents = await FinanceEngine.getDelinquentReceivables(companyA, '2026-08-12');
    const item = delinquents.find((d) => d.receivableId === rec.id);
    if (item) {
      throw new Error('Título cancelado listado na inadimplência');
    }
  });

  // W4-DEL-03-A
  await test('W4-DEL-03-A', 'Partially paid receivable remains in delinquency', async () => {
    const rec = await receivableRepo.create({
      id: 'rec-del-03a',
      companyId: companyA,
      originType: OriginType.CONTRACT_RENT,
      originId: 'origin-del-03a',
      categoryId: 'cat-rent',
      description: 'Aluguel Parcial Delinquent',
      originalAmount: 500,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 500,
      paidAmount: 200,
      balanceAmount: 300,
      dueDate: '2026-08-10',
      competenceDate: '2026-08-05',
      status: ObligationStatus.PARTIALLY_PAID,
      idempotencyKey: 'key-del-03a',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const delinquents = await FinanceEngine.getDelinquentReceivables(companyA, '2026-08-12');
    const item = delinquents.find((d) => d.receivableId === rec.id);
    if (!item) {
      throw new Error('Título parcial não listado na inadimplência');
    }
  });

  // W4-DEL-03-B
  await test('W4-DEL-03-B', 'Delinquency report displays the correct updated outstanding balance', async () => {
    const delinquents = await FinanceEngine.getDelinquentReceivables(companyA, '2026-08-12');
    const item = delinquents.find((d) => d.receivableId === 'rec-del-03a');
    if (!item || item.updatedOutstandingAmount !== 300 || item.receivedAmount !== 200) {
      throw new Error(`Valores incorretos na inadimplência parcial: recebido ${item?.receivedAmount}, saldo ${item?.updatedOutstandingAmount}`);
    }
  });

  console.log('--- 4. AGING CATEGORIES (W4-AGE) ---');

  const setupAgingTestData = async () => {
    // Clear previous for clean test
    localStorage.setItem('autoerp_accountsReceivable', JSON.stringify([]));
    localStorage.setItem('autoerp_accountsPayable', JSON.stringify([]));

    // A VENCER (Due 2026-08-25)
    await receivableRepo.create({
      id: 'rec-age-1', companyId: companyA, originType: OriginType.CONTRACT_RENT, originId: 'a',
      categoryId: 'cat', description: 'a', originalAmount: 100, discountAmount: 0, fineAmount: 0, interestAmount: 0,
      updatedAmount: 100, paidAmount: 0, balanceAmount: 100, dueDate: '2026-08-25', competenceDate: '2026-08-01',
      status: ObligationStatus.PENDING, idempotencyKey: 'age-1', createdAt: '', updatedAt: ''
    });

    // 1-7 (Due 2026-08-15 -> 5 days overdue)
    await receivableRepo.create({
      id: 'rec-age-2', companyId: companyA, originType: OriginType.CONTRACT_RENT, originId: 'b',
      categoryId: 'cat', description: 'b', originalAmount: 200, discountAmount: 0, fineAmount: 0, interestAmount: 0,
      updatedAmount: 200, paidAmount: 0, balanceAmount: 200, dueDate: '2026-08-15', competenceDate: '2026-08-01',
      status: ObligationStatus.PENDING, idempotencyKey: 'age-2', createdAt: '', updatedAt: ''
    });

    // 8-15 (Due 2026-08-10 -> 10 days overdue)
    await receivableRepo.create({
      id: 'rec-age-3', companyId: companyA, originType: OriginType.CONTRACT_RENT, originId: 'c',
      categoryId: 'cat', description: 'c', originalAmount: 300, discountAmount: 0, fineAmount: 0, interestAmount: 0,
      updatedAmount: 300, paidAmount: 0, balanceAmount: 300, dueDate: '2026-08-10', competenceDate: '2026-08-01',
      status: ObligationStatus.PENDING, idempotencyKey: 'age-3', createdAt: '', updatedAt: ''
    });

    // 16-30 (Due 2026-08-01 -> 19 days overdue)
    await receivableRepo.create({
      id: 'rec-age-4', companyId: companyA, originType: OriginType.CONTRACT_RENT, originId: 'd',
      categoryId: 'cat', description: 'd', originalAmount: 400, discountAmount: 0, fineAmount: 0, interestAmount: 0,
      updatedAmount: 400, paidAmount: 0, balanceAmount: 400, dueDate: '2026-08-01', competenceDate: '2026-08-01',
      status: ObligationStatus.PENDING, idempotencyKey: 'age-4', createdAt: '', updatedAt: ''
    });

    // 31-60 (Due 2026-07-15 -> 36 days overdue)
    await receivableRepo.create({
      id: 'rec-age-5', companyId: companyA, originType: OriginType.CONTRACT_RENT, originId: 'e',
      categoryId: 'cat', description: 'e', originalAmount: 500, discountAmount: 0, fineAmount: 0, interestAmount: 0,
      updatedAmount: 500, paidAmount: 0, balanceAmount: 500, dueDate: '2026-07-15', competenceDate: '2026-07-01',
      status: ObligationStatus.PENDING, idempotencyKey: 'age-5', createdAt: '', updatedAt: ''
    });

    // 61-90 (Due 2026-06-11 -> 70 days overdue)
    await receivableRepo.create({
      id: 'rec-age-6', companyId: companyA, originType: OriginType.CONTRACT_RENT, originId: 'f',
      categoryId: 'cat', description: 'f', originalAmount: 600, discountAmount: 0, fineAmount: 0, interestAmount: 0,
      updatedAmount: 600, paidAmount: 0, balanceAmount: 600, dueDate: '2026-06-11', competenceDate: '2026-06-01',
      status: ObligationStatus.PENDING, idempotencyKey: 'age-6', createdAt: '', updatedAt: ''
    });

    // 90+ (Due 2026-05-10 -> 102 days overdue)
    await receivableRepo.create({
      id: 'rec-age-7', companyId: companyA, originType: OriginType.CONTRACT_RENT, originId: 'g',
      categoryId: 'cat', description: 'g', originalAmount: 700, discountAmount: 0, fineAmount: 0, interestAmount: 0,
      updatedAmount: 700, paidAmount: 0, balanceAmount: 700, dueDate: '2026-05-10', competenceDate: '2026-05-01',
      status: ObligationStatus.PENDING, idempotencyKey: 'age-7', createdAt: '', updatedAt: ''
    });
  };

  await setupAgingTestData();

  // W4-AGE-01
  await test('W4-AGE-01', 'Aging category A VENCER is calculated correctly', async () => {
    const report = await FinanceEngine.getAgingReport(companyA, 'RECEIVABLE', '2026-08-20');
    if (report['A VENCER'] !== 100 && report.aVencer !== 100) {
      throw new Error(`A VENCER incorreto: obtido ${report['A VENCER']}`);
    }
  });

  // W4-AGE-02
  await test('W4-AGE-02', 'Aging category 1-7 is calculated correctly', async () => {
    const report = await FinanceEngine.getAgingReport(companyA, 'RECEIVABLE', '2026-08-20');
    if (report['1-7'] !== 200 && report['1_7'] !== 200) {
      throw new Error(`1-7 incorreto: obtido ${report['1-7']}`);
    }
  });

  // W4-AGE-03
  await test('W4-AGE-03', 'Aging category 8-15 is calculated correctly', async () => {
    const report = await FinanceEngine.getAgingReport(companyA, 'RECEIVABLE', '2026-08-20');
    if (report['8-15'] !== 300 && report['8_15'] !== 300) {
      throw new Error(`8-15 incorreto: obtido ${report['8-15']}`);
    }
  });

  // W4-AGE-04
  await test('W4-AGE-04', 'Aging category 16-30 is calculated correctly', async () => {
    const report = await FinanceEngine.getAgingReport(companyA, 'RECEIVABLE', '2026-08-20');
    if (report['16-30'] !== 400 && report['16_30'] !== 400) {
      throw new Error(`16-30 incorreto: obtido ${report['16-30']}`);
    }
  });

  // W4-AGE-05
  await test('W4-AGE-05', 'Aging category 31-60 is calculated correctly', async () => {
    const report = await FinanceEngine.getAgingReport(companyA, 'RECEIVABLE', '2026-08-20');
    if (report['31-60'] !== 500 && report['31_60'] !== 500) {
      throw new Error(`31-60 incorreto: obtido ${report['31-60']}`);
    }
  });

  // W4-AGE-06
  await test('W4-AGE-06', 'Aging category 61-90 is calculated correctly', async () => {
    const report = await FinanceEngine.getAgingReport(companyA, 'RECEIVABLE', '2026-08-20');
    if (report['61-90'] !== 600 && report['61_90'] !== 600) {
      throw new Error(`61-90 incorreto: obtido ${report['61-90']}`);
    }
  });

  // W4-AGE-07
  await test('W4-AGE-07', 'Aging category 90+ is calculated correctly', async () => {
    const report = await FinanceEngine.getAgingReport(companyA, 'RECEIVABLE', '2026-08-20');
    if (report['90+'] !== 700 && report['90_plus'] !== 700) {
      throw new Error(`90+ incorreto: obtido ${report['90+']}`);
    }
  });

  console.log('--- 5. RBAC PENETRATION & AUTHORIZATION (W4-RBAC) ---');

  // W4-RBAC-01-A
  await test('W4-RBAC-01-A', 'Viewer role is blocked from recalculating receivable charges', async () => {
    try {
      await FinanceEngine.processOverdueReceivables(companyA, '2026-08-12', 'usr-viewer-4', 'Viewer');
      throw new Error('Viewer conseguiu executar recalculo de encargos!');
    } catch (err: any) {
      if (!err.message.includes('Acesso negado') && !err.message.includes('não possui a permissão')) {
        throw err;
      }
    }
  });

  // W4-RBAC-01-B
  await test('W4-RBAC-01-B', 'Viewer role is blocked from recalculating payable charges', async () => {
    try {
      await FinanceEngine.processOverduePayables(companyA, '2026-08-12', 'usr-viewer-4', 'Viewer');
      throw new Error('Viewer conseguiu executar recalculo de payable!');
    } catch (err: any) {
      if (!err.message.includes('Acesso negado') && !err.message.includes('não possui a permissão')) {
        throw err;
      }
    }
  });

  // W4-RBAC-02-A
  await test('W4-RBAC-02-A', 'Admin role is authorized to recalculate receivable charges', async () => {
    // Should run with no errors
    await FinanceEngine.processOverdueReceivables(companyA, '2026-08-12', 'usr-admin-4', 'Admin');
  });

  // W4-RBAC-02-B
  await test('W4-RBAC-02-B', 'Financial Manager role is authorized to recalculate payable charges', async () => {
    // Should run with no errors
    await FinanceEngine.processOverduePayables(companyA, '2026-08-12', 'usr-manager-4', 'Manager');
  });

  console.log('--- 6. IDEMPOTENCY & CLOSED PERIODS (W4-IDEMP / CLOSED) ---');

  // W4-IDEMP-01-A
  await test('W4-IDEMP-01-A', 'Recalculating overdue charges twice on same date is idempotent (no duplicates)', async () => {
    const rec = await receivableRepo.create({
      id: 'rec-idemp-1',
      companyId: companyA,
      originType: OriginType.CONTRACT_RENT,
      originId: 'origin-idemp-1',
      categoryId: 'cat-rent',
      description: 'Aluguel Idempotency',
      originalAmount: 1000,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 1000,
      paidAmount: 0,
      balanceAmount: 1000,
      dueDate: '2026-08-10',
      competenceDate: '2026-08-05',
      status: ObligationStatus.PENDING,
      idempotencyKey: 'key-idemp-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Run 1
    await FinanceEngine.processOverdueReceivables(companyA, '2026-08-12', 'usr-admin-4', 'Admin', 0, 2.0, 0.033);
    const updated1 = await receivableRepo.findById(rec.id);
    const fine1 = updated1?.fineAmount;
    const interest1 = updated1?.interestAmount;

    // Run 2 on same date
    await FinanceEngine.processOverdueReceivables(companyA, '2026-08-12', 'usr-admin-4', 'Admin', 0, 2.0, 0.033);
    const updated2 = await receivableRepo.findById(rec.id);

    if (updated2?.fineAmount !== fine1 || updated2?.interestAmount !== interest1) {
      throw new Error(`Reprocessamento duplicou encargos! Fine: ${fine1} -> ${updated2?.fineAmount}, Interest: ${interest1} -> ${updated2?.interestAmount}`);
    }
  });

  // W4-IDEMP-01-B
  await test('W4-IDEMP-01-B', 'Recalculating twice does not create extra ledger transactions', async () => {
    // Overdue calculations should not generate any transactions.
    const storage = StorageAdapter.getInstance();
    const transactions = await storage.getCollection('financialTransactions');
    const overdueTransactions = transactions.filter((t: any) => t.description && t.description.includes('Idempotency'));
    if (overdueTransactions.length > 0) {
      throw new Error('Transações de caixa indesejadas criadas durante cálculo de juros/multas');
    }
  });

  // W4-CLOSED-01
  await test('W4-CLOSED-01', 'Overdue calculation on closed financial periods is skipped (immutability)', async () => {
    const rec = await receivableRepo.create({
      id: 'rec-closed-1',
      companyId: companyA,
      originType: OriginType.CONTRACT_RENT,
      originId: 'origin-closed-1',
      categoryId: 'cat-rent',
      description: 'Aluguel Período Fechado',
      originalAmount: 1000,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 1000,
      paidAmount: 0,
      balanceAmount: 1000,
      dueDate: '2026-08-10',
      competenceDate: '2026-08-05', // in period 2026-08-01 to 2026-08-31
      status: ObligationStatus.PENDING,
      idempotencyKey: 'key-closed-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Close the period
    await FinanceEngine.closeFinancialPeriod({
      companyId: companyA,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      userId: 'usr-admin-4',
      userName: 'Admin',
    });

    // Try to process overdue charges. The competence date is in a closed period, so it should be skipped.
    await FinanceEngine.processOverdueReceivables(companyA, '2026-08-20', 'usr-admin-4', 'Admin', 0, 2.0, 0.033);

    const updated = await receivableRepo.findById(rec.id);
    if (!updated || updated.fineAmount !== 0 || updated.interestAmount !== 0 || updated.status !== ObligationStatus.PENDING) {
      throw new Error('Alterou dados financeiros retroativos de título em período fechado!');
    }
  });

  console.log('\n====================================================');
  console.log('FIN-WAVE-4 TESTS COMPLETED!');
  const failedCount = results.filter((r) => !r.passed).length;
  console.log(`TOTAL: ${results.length} | PASSED: ${results.length - failedCount} | FAILED: ${failedCount}`);
  console.log('====================================================\n');

  if (failedCount > 0) {
    return { success: false };
  }

  console.log('--- REGRESSION SUITE EXECUTION (Waves 1, 2, 3A, 3B, 3C, 3D, FinanceTestRunner) ---');
  execSync('npx tsx src/domain/finance/__tests__/wave3dVerification.ts', { stdio: 'inherit' });

  return { success: true };
}

runWave4Verification()
  .then((res) => {
    if (!res.success) {
      console.error('FIN-WAVE-4 HOMOLOGATION FAILED!');
      process.exit(1);
    } else {
      console.log('====================================================');
      console.log('WAVE 4 AND ALL REGRESSIONS HOMOLOGATED SUCCESSFULLY!');
      console.log('====================================================');
      process.exit(0);
    }
  })
  .catch((err) => {
    console.error('FIN-WAVE-4 UNHANDLED EXCEPTION:', err);
    process.exit(1);
  });
