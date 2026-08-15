// Wave 3D Verification Suite - RBAC, Isolation, Audit Trail and Immutability
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
  StatementEntryStatus,
  StatementDirection,
  FinancialPeriodStatus,
  FinancialAccountType,
  OriginType,
  ObligationStatus,
  AuditAction,
} from '../../../types/enums';
import {
  FinancialAccountRepository,
  FinancialTransactionRepository,
  BankStatementEntryRepository,
  FinancialPeriodRepository,
  AccountPayableRepository,
  AccountReceivableRepository,
  AuditLogRepository,
} from '../../../persistence/repositories/localRepositories';
import { BankReconciliationService } from '../BankReconciliationService';
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

export async function runWave3DVerification() {
  console.log('====================================================');
  console.log('STARTING FIN-WAVE-3D VERIFICATION SUITE (56 TESTES)');
  console.log('====================================================\n');

  await seedAutoERPTestData(true);

  const companyA = 'company-tenant-a';
  const companyB = 'company-tenant-b';

  const accountRepo = new FinancialAccountRepository();
  const txRepo = new FinancialTransactionRepository();
  const statementRepo = new BankStatementEntryRepository();
  const periodRepo = new FinancialPeriodRepository();
  const payableRepo = new AccountPayableRepository();
  const receivableRepo = new AccountReceivableRepository();
  const auditRepo = new AuditLogRepository();

  // Setup Accounts
  const accountA = await accountRepo.create({
    id: 'acc-3d-a',
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
    id: 'acc-3d-b',
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
  const periodA = await periodRepo.create({
    id: 'per-3d-a',
    companyId: companyA,
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    status: FinancialPeriodStatus.OPEN,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const periodB = await periodRepo.create({
    id: 'per-3d-b',
    companyId: companyB,
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    status: FinancialPeriodStatus.OPEN,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Counter states
  let rbacPassed = 0;
  const rbacTotal = 12;

  let tenantPassed = 0;
  const tenantTotal = 7;

  let finPassed = 0;
  const finTotal = 10;

  let recAuthPassed = 0;
  const recAuthTotal = 7;

  let periodAuthPassed = 0;
  const periodAuthTotal = 7;

  let auditPassed = 0;
  const auditTotal = 8;

  let secRbacPassed = 0;
  const secRbacTotal = 10;

  console.log('--- 1. RBAC DOMAIN SUITE (12 TESTES) ---');

  // RBAC-01
  try {
    await registerUser('usr-admin-3d', companyA, 'ADMIN');
    const u = await FinancialAuthorizationService.authorize('usr-admin-3d', companyA, 'VIEW_FINANCIAL');
    if (u.role !== 'ADMIN') throw new Error('Role incorreto');
    console.log('  [PASS] RBAC-01: ADMIN visualiza financeiro');
    rbacPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] RBAC-01: ${err.message}`);
  }

  // RBAC-02
  try {
    await registerUser('usr-manager-3d', companyA, 'FINANCIAL_MANAGER');
    const u = await FinancialAuthorizationService.authorize('usr-manager-3d', companyA, 'VIEW_FINANCIAL');
    if ((u.role as string) !== 'FINANCIAL_MANAGER') throw new Error('Role incorreto');
    console.log('  [PASS] RBAC-02: FINANCIAL_MANAGER visualiza');
    rbacPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] RBAC-02: ${err.message}`);
  }

  // RBAC-03
  try {
    await registerUser('usr-operator-3d', companyA, 'FINANCIAL_OPERATOR');
    const u = await FinancialAuthorizationService.authorize('usr-operator-3d', companyA, 'VIEW_FINANCIAL');
    if ((u.role as string) !== 'FINANCIAL_OPERATOR') throw new Error('Role incorreto');
    console.log('  [PASS] RBAC-03: FINANCIAL_OPERATOR visualiza');
    rbacPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] RBAC-03: ${err.message}`);
  }

  // RBAC-04
  try {
    await registerUser('usr-viewer-3d', companyA, 'FINANCIAL_VIEWER');
    const u = await FinancialAuthorizationService.authorize('usr-viewer-3d', companyA, 'VIEW_FINANCIAL');
    if ((u.role as string) !== 'FINANCIAL_VIEWER') throw new Error('Role incorreto');
    console.log('  [PASS] RBAC-04: FINANCIAL_VIEWER visualiza');
    rbacPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] RBAC-04: ${err.message}`);
  }

  // RBAC-05
  try {
    let failed = false;
    try {
      await FinanceEngine.createPayable({
        companyId: companyA,
        originType: OriginType.MANUAL,
        originId: 'orig-pay-rbac-05',
        categoryId: 'cat-rbac-05',
        description: 'Payable rbac 05',
        totalAmount: 100,
        dueDate: '2026-08-15',
        competenceDate: '2026-08-15',
        userId: 'usr-viewer-3d',
        userName: 'Viewer',
      });
    } catch (err: any) {
      if (err.message.includes('Acesso negado')) {
        failed = true;
      } else {
        throw err;
      }
    }
    if (!failed) throw new Error('Permitiu criar mesmo sem permissão');
    console.log('  [PASS] RBAC-05: Viewer não cria Payable');
    rbacPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] RBAC-05: ${err.message}`);
  }

  // RBAC-06
  try {
    let failed = false;
    try {
      await FinanceEngine.createReceivable({
        companyId: companyA,
        originType: OriginType.MANUAL,
        originId: 'orig-rec-rbac-06',
        categoryId: 'cat-rbac-06',
        description: 'Receivable rbac 06',
        totalAmount: 100,
        dueDate: '2026-08-15',
        competenceDate: '2026-08-15',
        userId: 'usr-viewer-3d',
        userName: 'Viewer',
      });
    } catch (err: any) {
      if (err.message.includes('Acesso negado')) {
        failed = true;
      } else {
        throw err;
      }
    }
    if (!failed) throw new Error('Permitiu criar mesmo sem permissão');
    console.log('  [PASS] RBAC-06: Viewer não cria Receivable');
    rbacPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] RBAC-06: ${err.message}`);
  }

  // RBAC-07
  try {
    let failed = false;
    try {
      await FinanceEngine.registerPayment({
        companyId: companyA,
        obligationId: 'some-id',
        financialAccountId: accountA.id,
        paymentAmount: 100,
        paymentDate: '2026-08-15',
        paymentMethodId: 'pm-pix',
        userId: 'usr-viewer-3d',
        userName: 'Viewer',
      });
    } catch (err: any) {
      if (err.message.includes('Acesso negado')) {
        failed = true;
      } else {
        throw err;
      }
    }
    if (!failed) throw new Error('Permitiu registrar payment mesmo sem permissão');
    console.log('  [PASS] RBAC-07: Viewer não registra Payment');
    rbacPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] RBAC-07: ${err.message}`);
  }

  // RBAC-08
  try {
    let failed = false;
    try {
      await FinanceEngine.registerReceipt({
        companyId: companyA,
        obligationId: 'some-id',
        financialAccountId: accountA.id,
        paymentAmount: 100,
        paymentDate: '2026-08-15',
        paymentMethodId: 'pm-pix',
        userId: 'usr-viewer-3d',
        userName: 'Viewer',
      });
    } catch (err: any) {
      if (err.message.includes('Acesso negado')) {
        failed = true;
      } else {
        throw err;
      }
    }
    if (!failed) throw new Error('Permitiu registrar receipt mesmo sem permissão');
    console.log('  [PASS] RBAC-08: Viewer não registra Receipt');
    rbacPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] RBAC-08: ${err.message}`);
  }

  // RBAC-09
  try {
    let failed = false;
    try {
      await FinanceEngine.transferFunds({
        companyId: companyA,
        sourceAccountId: accountA.id,
        destinationAccountId: 'some-dest',
        amount: 100,
        transferDate: '2026-08-15',
        userId: 'usr-viewer-3d',
        userName: 'Viewer',
        paymentMethodId: 'pm-pix',
        description: 'rbac-09-transfer',
      });
    } catch (err: any) {
      if (err.message.includes('Acesso negado')) {
        failed = true;
      } else {
        throw err;
      }
    }
    if (!failed) throw new Error('Permitiu transferir mesmo sem permissão');
    console.log('  [PASS] RBAC-09: Viewer não executa Transfer');
    rbacPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] RBAC-09: ${err.message}`);
  }

  // RBAC-10
  try {
    let failed = false;
    try {
      await FinanceEngine.reverseTransaction(
        companyA,
        'some-tx',
        100,
        'reversal reason',
        'usr-viewer-3d',
        'Viewer'
      );
    } catch (err: any) {
      if (err.message.includes('Acesso negado')) {
        failed = true;
      } else {
        throw err;
      }
    }
    if (!failed) throw new Error('Permitiu reverter mesmo sem permissão');
    console.log('  [PASS] RBAC-10: Viewer não executa Reversal');
    rbacPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] RBAC-10: ${err.message}`);
  }

  // RBAC-11
  try {
    let failed = false;
    try {
      await FinanceEngine.renegociate({
        companyId: companyA,
        obligationIds: ['id1', 'id2'],
        type: 'PAYABLE',
        newTotalAmount: 200,
        installmentsCount: 2,
        firstDueDate: '2026-08-20',
        categoryId: 'cat-reneg',
        description: 'rbac-11-reneg',
        userId: 'usr-viewer-3d',
        userName: 'Viewer',
      });
    } catch (err: any) {
      if (err.message.includes('Acesso negado')) {
        failed = true;
      } else {
        throw err;
      }
    }
    if (!failed) throw new Error('Permitiu renegociar mesmo sem permissão');
    console.log('  [PASS] RBAC-11: Viewer não executa Renegotiation');
    rbacPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] RBAC-11: ${err.message}`);
  }

  // RBAC-12
  try {
    await registerUser('usr-unknown-3d', companyA, 'UNKNOWN_ROLE');
    let failed = false;
    try {
      await FinancialAuthorizationService.authorize('usr-unknown-3d', companyA, 'VIEW_FINANCIAL');
    } catch (err: any) {
      if (err.message.includes('Acesso negado') || err.message.includes('Permissão insuficiente')) {
        failed = true;
      } else {
        throw err;
      }
    }
    if (!failed) throw new Error('Permitiu autorizar role desconhecido');
    console.log('  [PASS] RBAC-12: role desconhecido é bloqueado');
    rbacPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] RBAC-12: ${err.message}`);
  }

  console.log('\n--- 2. RBAC TENANT ISOLATION SUITE (7 TESTES) ---');

  await registerUser('actor-adm-b', companyB, 'ADMIN');

  // RBAC-TENANT-01
  try {
    await registerUser('actor-mng-a', companyA, 'FINANCIAL_MANAGER');
    const [payB] = await FinanceEngine.createPayable({
      companyId: companyB,
      originType: OriginType.MANUAL,
      originId: 'orig-pay-b-tenant-01',
      categoryId: 'cat-pay-b',
      description: 'Payable B',
      totalAmount: 150,
      dueDate: '2026-08-15',
      competenceDate: '2026-08-15',
      userId: 'actor-adm-b',
      userName: 'Admin B',
    });

    let failed = false;
    try {
      await FinanceEngine.cancelPayable(companyB, payB.id, 'cancel reason', 'actor-mng-a', 'Manager A');
    } catch (err: any) {
      if (err.message.includes('Acesso negado')) {
        failed = true;
      } else {
        throw err;
      }
    }
    if (!failed) throw new Error('Manager A pôde operar título de B');
    console.log('  [PASS] RBAC-TENANT-01: Manager Tenant A não opera título Tenant B');
    tenantPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] RBAC-TENANT-01: ${err.message}`);
  }

  // RBAC-TENANT-02
  try {
    await registerUser('actor-adm-a', companyA, 'ADMIN');
    const [recB] = await FinanceEngine.createReceivable({
      companyId: companyB,
      originType: OriginType.MANUAL,
      originId: 'orig-rec-b-tenant-02',
      categoryId: 'cat-rec-b',
      description: 'Receivable B',
      totalAmount: 180,
      dueDate: '2026-08-15',
      competenceDate: '2026-08-15',
      userId: 'actor-adm-b',
      userName: 'Admin B',
    });

    let failed = false;
    try {
      await FinanceEngine.cancelReceivable(companyB, recB.id, 'cancel reason', 'actor-adm-a', 'Admin A');
    } catch (err: any) {
      if (err.message.includes('Acesso negado')) {
        failed = true;
      } else {
        throw err;
      }
    }
    if (!failed) throw new Error('Admin A pôde operar título de B');
    console.log('  [PASS] RBAC-TENANT-02: Admin Tenant A não opera título Tenant B');
    tenantPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] RBAC-TENANT-02: ${err.message}`);
  }

  // RBAC-TENANT-03
  try {
    await registerUser('actor-worker-a', companyA, 'FINANCIAL_OPERATOR');
    const [payB] = await FinanceEngine.createPayable({
      companyId: companyB,
      originType: OriginType.MANUAL,
      originId: 'orig-pay-b-tenant-03',
      categoryId: 'cat-pay-b',
      description: 'Payable B 03',
      totalAmount: 200,
      dueDate: '2026-08-15',
      competenceDate: '2026-08-15',
      userId: 'actor-adm-b',
      userName: 'Admin B',
    });

    let failed = false;
    try {
      await FinanceEngine.registerPayment({
        companyId: companyB,
        obligationId: payB.id,
        financialAccountId: accountB.id,
        paymentAmount: 200,
        paymentDate: '2026-08-15',
        paymentMethodId: 'pm-pix',
        userId: 'actor-worker-a',
        userName: 'Operator A',
      });
    } catch (err: any) {
      if (err.message.includes('Acesso negado')) {
        failed = true;
      } else {
        throw err;
      }
    }
    if (!failed) throw new Error('Operator A pôde pagar obrigação B');
    console.log('  [PASS] RBAC-TENANT-03: Operator A não paga obrigação B');
    tenantPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] RBAC-TENANT-03: ${err.message}`);
  }

  // RBAC-TENANT-04
  try {
    const [recB] = await FinanceEngine.createReceivable({
      companyId: companyB,
      originType: OriginType.MANUAL,
      originId: 'orig-rec-b-tenant-04',
      categoryId: 'cat-rec-b',
      description: 'Receivable B 04',
      totalAmount: 250,
      dueDate: '2026-08-15',
      competenceDate: '2026-08-15',
      userId: 'actor-adm-b',
      userName: 'Admin B',
    });

    let failed = false;
    try {
      await FinanceEngine.registerReceipt({
        companyId: companyB,
        obligationId: recB.id,
        financialAccountId: accountB.id,
        paymentAmount: 250,
        paymentDate: '2026-08-15',
        paymentMethodId: 'pm-pix',
        userId: 'actor-worker-a',
        userName: 'Operator A',
      });
    } catch (err: any) {
      if (err.message.includes('Acesso negado')) {
        failed = true;
      } else {
        throw err;
      }
    }
    if (!failed) throw new Error('Operator A pôde receber obrigação B');
    console.log('  [PASS] RBAC-TENANT-04: Operator A não recebe obrigação B');
    tenantPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] RBAC-TENANT-04: ${err.message}`);
  }

  // RBAC-TENANT-05
  try {
    let failed = false;
    try {
      await FinanceEngine.transferFunds({
        companyId: companyB,
        sourceAccountId: accountB.id,
        destinationAccountId: accountA.id,
        amount: 300,
        transferDate: '2026-08-15',
        userId: 'actor-mng-a',
        userName: 'Manager A',
        paymentMethodId: 'pm-pix',
        description: 'tenant-05-transfer',
      });
    } catch (err: any) {
      if (err.message.includes('Acesso negado')) {
        failed = true;
      } else {
        throw err;
      }
    }
    if (!failed) throw new Error('Manager A pôde transferir da conta de B');
    console.log('  [PASS] RBAC-TENANT-05: Manager A não transfere conta B');
    tenantPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] RBAC-TENANT-05: ${err.message}`);
  }

  // RBAC-TENANT-06
  try {
    const entryB = await statementRepo.create({
      id: 'entry-b-tenant-06',
      companyId: companyB,
      financialAccountId: accountB.id,
      documentNumber: 'DOC-3D-B-06',
      date: '2026-08-10',
      description: 'Statement B 06',
      amount: 400,
      direction: StatementDirection.CREDIT,
      importSource: 'MANUAL',
      status: StatementEntryStatus.UNMATCHED,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    let failed = false;
    try {
      await BankReconciliationService.matchEntry(companyB, entryB.id, 'some-tx', 'actor-mng-a', 'Manager A');
    } catch (err: any) {
      if (err.message.includes('Acesso negado')) {
        failed = true;
      } else {
        throw err;
      }
    }
    if (!failed) throw new Error('Manager A pôde conciliar conta de B');
    console.log('  [PASS] RBAC-TENANT-06: Manager A não concilia conta B');
    tenantPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] RBAC-TENANT-06: ${err.message}`);
  }

  // RBAC-TENANT-07
  try {
    await FinanceEngine.closeFinancialPeriod({
      companyId: companyB,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      userId: 'actor-adm-b',
      userName: 'Admin B',
    });

    const periodsB = await periodRepo.findAll({ companyId: companyB });
    const periodClosedB = periodsB.find((p) => p.startDate === '2026-08-01');
    if (!periodClosedB) throw new Error('Período fechado B não encontrado');

    let failed = false;
    try {
      await FinanceEngine.reopenFinancialPeriod({
        companyId: companyB,
        periodId: periodClosedB.id,
        reason: 'Reopen B',
        userId: 'actor-adm-a',
        userName: 'Admin A',
      });
    } catch (err: any) {
      if (err.message.includes('Acesso negado')) {
        failed = true;
      } else {
        throw err;
      }
    }
    if (!failed) throw new Error('Admin A pôde reabrir período de B');
    console.log('  [PASS] RBAC-TENANT-07: Admin A não reabre período B');
    tenantPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] RBAC-TENANT-07: ${err.message}`);
  }

  console.log('\n--- 3. FINANCIAL AUTHORIZATION SUITE (10 TESTES) ---');

  // FIN-AUTH-01
  try {
    const [pay] = await FinanceEngine.createPayable({
      companyId: companyA,
      originType: OriginType.MANUAL,
      originId: 'orig-pay-fin-01',
      categoryId: 'cat-pay-a',
      description: 'Payable authorized',
      totalAmount: 100,
      dueDate: '2026-08-15',
      competenceDate: '2026-08-15',
      userId: 'usr-operator-a',
      userName: 'Operator A',
    });
    if (!pay) throw new Error('Não retornou título');
    console.log('  [PASS] FIN-AUTH-01: Payable autorizado funciona');
    finPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] FIN-AUTH-01: ${err.message}`);
  }

  // FIN-AUTH-02
  try {
    const [rec] = await FinanceEngine.createReceivable({
      companyId: companyA,
      originType: OriginType.MANUAL,
      originId: 'orig-rec-fin-02',
      categoryId: 'cat-rec-a',
      description: 'Receivable authorized',
      totalAmount: 150,
      dueDate: '2026-08-15',
      competenceDate: '2026-08-15',
      userId: 'usr-operator-a',
      userName: 'Operator A',
    });
    if (!rec) throw new Error('Não retornou título');
    console.log('  [PASS] FIN-AUTH-02: Receivable autorizado funciona');
    finPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] FIN-AUTH-02: ${err.message}`);
  }

  // FIN-AUTH-03
  try {
    const [pay] = await FinanceEngine.createPayable({
      companyId: companyA,
      originType: OriginType.MANUAL,
      originId: 'orig-pay-fin-03',
      categoryId: 'cat-pay-a',
      description: 'Payable to settle',
      totalAmount: 100,
      dueDate: '2026-08-15',
      competenceDate: '2026-08-15',
      userId: 'usr-operator-a',
      userName: 'Operator A',
    });

    const res = await FinanceEngine.registerPayment({
      companyId: companyA,
      obligationId: pay.id,
      financialAccountId: accountA.id,
      paymentAmount: 100,
      paymentDate: '2026-08-15',
      paymentMethodId: 'pm-pix',
      userId: 'usr-operator-a',
      userName: 'Operator A',
    });
    if (res.payable.status !== ObligationStatus.PAID) throw new Error('Título não ficou pago');
    console.log('  [PASS] FIN-AUTH-03: Payment autorizado funciona');
    finPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] FIN-AUTH-03: ${err.message}`);
  }

  // FIN-AUTH-04
  try {
    const [rec] = await FinanceEngine.createReceivable({
      companyId: companyA,
      originType: OriginType.MANUAL,
      originId: 'orig-rec-fin-04',
      categoryId: 'cat-rec-a',
      description: 'Receivable to settle',
      totalAmount: 150,
      dueDate: '2026-08-15',
      competenceDate: '2026-08-15',
      userId: 'usr-operator-a',
      userName: 'Operator A',
    });

    const res = await FinanceEngine.registerReceipt({
      companyId: companyA,
      obligationId: rec.id,
      financialAccountId: accountA.id,
      paymentAmount: 150,
      paymentDate: '2026-08-15',
      paymentMethodId: 'pm-pix',
      userId: 'usr-operator-a',
      userName: 'Operator A',
    });
    if (res.receivable.status !== ObligationStatus.PAID) throw new Error('Título não ficou pago');
    console.log('  [PASS] FIN-AUTH-04: Receipt autorizado funciona');
    finPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] FIN-AUTH-04: ${err.message}`);
  }

  // FIN-AUTH-05
  try {
    const accountA2 = await accountRepo.create({
      id: 'acc-3d-a2',
      companyId: companyA,
      name: 'Secondary Account Tenant A',
      type: FinancialAccountType.BANK,
      initialBalance: 0,
      currentBalance: 0,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const tx = await FinanceEngine.transferFunds({
      companyId: companyA,
      sourceAccountId: accountA.id,
      destinationAccountId: accountA2.id,
      amount: 100,
      transferDate: '2026-08-15',
      userId: 'usr-manager-a',
      userName: 'Manager A',
      paymentMethodId: 'pm-pix',
      description: 'fin-05-transfer',
    });
    if (!tx) throw new Error('Transferência não retornou transação');
    console.log('  [PASS] FIN-AUTH-05: Transfer autorizado funciona');
    finPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] FIN-AUTH-05: ${err.message}`);
  }

  // FIN-AUTH-06
  try {
    const [rec] = await FinanceEngine.createReceivable({
      companyId: companyA,
      originType: OriginType.MANUAL,
      originId: 'orig-rec-fin-06',
      categoryId: 'cat-rec-a',
      description: 'Receivable to reverse',
      totalAmount: 200,
      dueDate: '2026-08-15',
      competenceDate: '2026-08-15',
      userId: 'usr-operator-a',
      userName: 'Operator A',
    });

    const settleRes = await FinanceEngine.registerReceipt({
      companyId: companyA,
      obligationId: rec.id,
      financialAccountId: accountA.id,
      paymentAmount: 200,
      paymentDate: '2026-08-15',
      paymentMethodId: 'pm-pix',
      userId: 'usr-operator-a',
      userName: 'Operator A',
    });

    const revTx = await FinanceEngine.reverseTransaction(
      companyA,
      settleRes.transaction.id,
      200,
      'reversal of test',
      'usr-manager-a',
      'Manager A'
    );
    if (!revTx) throw new Error('Estorno não retornou transação');
    console.log('  [PASS] FIN-AUTH-06: Reversal autorizado funciona');
    finPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] FIN-AUTH-06: ${err.message}`);
  }

  // FIN-AUTH-07
  try {
    const [pay1] = await FinanceEngine.createPayable({
      companyId: companyA,
      originType: OriginType.MANUAL,
      originId: 'orig-pay-fin-07a',
      categoryId: 'cat-pay-a',
      description: 'Payable to reneg 1',
      totalAmount: 100,
      dueDate: '2026-08-15',
      competenceDate: '2026-08-15',
      userId: 'usr-operator-a',
      userName: 'Operator A',
    });

    const [pay2] = await FinanceEngine.createPayable({
      companyId: companyA,
      originType: OriginType.MANUAL,
      originId: 'orig-pay-fin-07b',
      categoryId: 'cat-pay-a',
      description: 'Payable to reneg 2',
      totalAmount: 200,
      dueDate: '2026-08-15',
      competenceDate: '2026-08-15',
      userId: 'usr-operator-a',
      userName: 'Operator A',
    });

    const renegList = await FinanceEngine.renegociate({
      companyId: companyA,
      obligationIds: [pay1.id, pay2.id],
      type: 'PAYABLE',
      newTotalAmount: 300,
      installmentsCount: 3,
      firstDueDate: '2026-08-25',
      categoryId: 'cat-pay-a',
      description: 'fin-07-reneg',
      userId: 'usr-manager-a',
      userName: 'Manager A',
    });
    if (renegList.length !== 3) throw new Error('Deveriam ter sido geradas 3 parcelas');
    console.log('  [PASS] FIN-AUTH-07: Renegotiation autorizada funciona');
    finPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] FIN-AUTH-07: ${err.message}`);
  }

  // FIN-AUTH-08
  try {
    const [pay] = await FinanceEngine.createPayable({
      companyId: companyA,
      originType: OriginType.MANUAL,
      originId: 'orig-pay-fin-08',
      categoryId: 'cat-pay-a',
      description: 'Payable 08',
      totalAmount: 100,
      dueDate: '2026-08-15',
      competenceDate: '2026-08-15',
      userId: 'usr-operator-a',
      userName: 'Operator A',
    });

    const txsBefore = await txRepo.findAll({ companyId: companyA });

    try {
      await FinanceEngine.registerPayment({
        companyId: companyA,
        obligationId: pay.id,
        financialAccountId: accountA.id,
        paymentAmount: 100,
        paymentDate: '2026-08-15',
        paymentMethodId: 'pm-pix',
        userId: 'usr-viewer-3d',
        userName: 'Viewer',
      });
    } catch {
      // Expected
    }

    const txsAfter = await txRepo.findAll({ companyId: companyA });
    if (txsBefore.length !== txsAfter.length) {
      throw new Error('Uma transação financeira foi criada apesar da falha de autorização!');
    }
    console.log('  [PASS] FIN-AUTH-08: falha de autorização cria 0 FinancialTransaction');
    finPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] FIN-AUTH-08: ${err.message}`);
  }

  // FIN-AUTH-09
  try {
    const [pay] = await FinanceEngine.createPayable({
      companyId: companyA,
      originType: OriginType.MANUAL,
      originId: 'orig-pay-fin-09',
      categoryId: 'cat-pay-a',
      description: 'Payable 09',
      totalAmount: 100,
      dueDate: '2026-08-15',
      competenceDate: '2026-08-15',
      userId: 'usr-operator-a',
      userName: 'Operator A',
    });

    const accBefore = await accountRepo.findById(accountA.id);
    const balBefore = accBefore ? accBefore.currentBalance : 0;

    try {
      await FinanceEngine.registerPayment({
        companyId: companyA,
        obligationId: pay.id,
        financialAccountId: accountA.id,
        paymentAmount: 100,
        paymentDate: '2026-08-15',
        paymentMethodId: 'pm-pix',
        userId: 'usr-viewer-3d',
        userName: 'Viewer',
      });
    } catch {
      // Expected
    }

    const accAfter = await accountRepo.findById(accountA.id);
    const balAfter = accAfter ? accAfter.currentBalance : 0;
    if (balBefore !== balAfter) {
      throw new Error(`Saldo bancário mudou de ${balBefore} para ${balAfter} apesar da falha de autorização!`);
    }
    console.log('  [PASS] FIN-AUTH-09: falha de autorização altera 0 saldo');
    finPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] FIN-AUTH-09: ${err.message}`);
  }

  // FIN-AUTH-10
  try {
    const [pay] = await FinanceEngine.createPayable({
      companyId: companyA,
      originType: OriginType.MANUAL,
      originId: 'orig-pay-fin-10',
      categoryId: 'cat-pay-a',
      description: 'Payable 10',
      totalAmount: 100,
      dueDate: '2026-08-15',
      competenceDate: '2026-08-15',
      userId: 'usr-operator-a',
      userName: 'Operator A',
    });

    try {
      await FinanceEngine.registerPayment({
        companyId: companyA,
        obligationId: pay.id,
        financialAccountId: accountA.id,
        paymentAmount: 100,
        paymentDate: '2026-08-15',
        paymentMethodId: 'pm-pix',
        userId: 'usr-viewer-3d',
        userName: 'Viewer',
      });
    } catch {
      // Expected
    }

    const payAfter = await payableRepo.findById(pay.id);
    if (!payAfter || payAfter.status !== ObligationStatus.PENDING) {
      throw new Error(`Status do título mudou para ${payAfter?.status} apesar da falha de autorização!`);
    }
    console.log('  [PASS] FIN-AUTH-10: falha de autorização altera 0 status de obrigação');
    finPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] FIN-AUTH-10: ${err.message}`);
  }

  console.log('\n--- 4. BANK RECONCILIATION AUTHORIZATION SUITE (7 TESTES) ---');

  // REC-AUTH-01
  try {
    await registerUser('usr-viewer-a', companyA, 'FINANCIAL_VIEWER');
    const u = await FinancialAuthorizationService.authorize('usr-viewer-a', companyA, 'BANK_RECONCILIATION_VIEW');
    if ((u.role as string) !== 'FINANCIAL_VIEWER') throw new Error('Role incorreto');
    console.log('  [PASS] REC-AUTH-01: VIEW conciliação');
    recAuthPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] REC-AUTH-01: ${err.message}`);
  }

  // REC-AUTH-02
  try {
    const entry = await statementRepo.create({
      id: 'entry-rec-02',
      companyId: companyA,
      financialAccountId: accountA.id,
      documentNumber: 'DOC-3D-REC-02',
      date: '2026-08-10',
      description: 'Statement Entry',
      amount: 100,
      direction: StatementDirection.CREDIT,
      importSource: 'MANUAL',
      status: StatementEntryStatus.UNMATCHED,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    let failed = false;
    try {
      await BankReconciliationService.matchEntry(companyA, entry.id, 'some-tx', 'usr-viewer-a', 'Viewer A');
    } catch (err: any) {
      if (err.message.includes('Acesso negado')) {
        failed = true;
      } else {
        throw err;
      }
    }
    if (!failed) throw new Error('Viewer pôde fazer matching');
    console.log('  [PASS] REC-AUTH-02: MATCH bloqueado sem permissão');
    recAuthPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] REC-AUTH-02: ${err.message}`);
  }

  // REC-AUTH-03
  try {
    const entry = await statementRepo.create({
      id: 'entry-rec-03',
      companyId: companyA,
      financialAccountId: accountA.id,
      documentNumber: 'DOC-3D-REC-03',
      date: '2026-08-10',
      description: 'Statement Entry',
      amount: 100,
      direction: StatementDirection.CREDIT,
      importSource: 'MANUAL',
      status: StatementEntryStatus.UNMATCHED,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const [rec] = await FinanceEngine.createReceivable({
      companyId: companyA,
      originType: OriginType.MANUAL,
      originId: 'orig-rec-rec-03',
      categoryId: 'cat-rec-a',
      description: 'Receivable for match',
      totalAmount: 100,
      dueDate: '2026-08-15',
      competenceDate: '2026-08-15',
      userId: 'usr-operator-a',
      userName: 'Operator A',
    });

    const settleRes = await FinanceEngine.registerReceipt({
      companyId: companyA,
      obligationId: rec.id,
      financialAccountId: accountA.id,
      paymentAmount: 100,
      paymentDate: '2026-08-15',
      paymentMethodId: 'pm-pix',
      userId: 'usr-operator-a',
      userName: 'Operator A',
    });

    const res = await BankReconciliationService.matchEntry(
      companyA,
      entry.id,
      settleRes.transaction.id,
      'usr-manager-a',
      'Manager A'
    );
    if (res.status !== StatementEntryStatus.MATCHED) throw new Error('Não mudou status para MATCHED');
    console.log('  [PASS] REC-AUTH-03: MATCH permitido com permissão');
    recAuthPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] REC-AUTH-03: ${err.message}`);
  }

  // REC-AUTH-04
  try {
    const entry = await statementRepo.create({
      id: 'entry-rec-04',
      companyId: companyA,
      financialAccountId: accountA.id,
      documentNumber: 'DOC-3D-REC-04',
      date: '2026-08-10',
      description: 'Statement Entry matched',
      amount: 100,
      direction: StatementDirection.CREDIT,
      importSource: 'MANUAL',
      status: StatementEntryStatus.MATCHED,
      matchedTransactionId: 'tx-matched-rec-04',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    let failed = false;
    try {
      await BankReconciliationService.unmatchEntry(companyA, entry.id, 'usr-operator-a', 'Operator A', 'unmatch reason');
    } catch (err: any) {
      if (err.message.includes('Acesso negado')) {
        failed = true;
      } else {
        throw err;
      }
    }
    if (!failed) throw new Error('Operator pôde desfazer matching');
    console.log('  [PASS] REC-AUTH-04: UNMATCH bloqueado');
    recAuthPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] REC-AUTH-04: ${err.message}`);
  }

  // REC-AUTH-05
  try {
    const entry = await statementRepo.create({
      id: 'entry-rec-05',
      companyId: companyA,
      financialAccountId: accountA.id,
      documentNumber: 'DOC-3D-REC-05',
      date: '2026-08-10',
      description: 'Statement Entry matched 05',
      amount: 100,
      direction: StatementDirection.CREDIT,
      importSource: 'MANUAL',
      status: StatementEntryStatus.MATCHED,
      matchedTransactionId: 'tx-matched-rec-05',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const res = await BankReconciliationService.unmatchEntry(
      companyA,
      entry.id,
      'usr-manager-a',
      'Manager A',
      'unmatch reason'
    );
    if (res.status !== StatementEntryStatus.UNMATCHED) throw new Error('Não reverteu para UNMATCHED');
    console.log('  [PASS] REC-AUTH-05: UNMATCH permitido');
    recAuthPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] REC-AUTH-05: ${err.message}`);
  }

  // REC-AUTH-06
  try {
    const entry = await statementRepo.create({
      id: 'entry-rec-06',
      companyId: companyA,
      financialAccountId: accountA.id,
      documentNumber: 'DOC-3D-REC-06',
      date: '2026-08-10',
      description: 'Statement Entry',
      amount: 100,
      direction: StatementDirection.CREDIT,
      importSource: 'MANUAL',
      status: StatementEntryStatus.UNMATCHED,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    let failed = false;
    try {
      await BankReconciliationService.ignoreEntry(companyA, entry.id, 'usr-operator-a', 'Operator A', 'ignore reason');
    } catch (err: any) {
      if (err.message.includes('Acesso negado')) {
        failed = true;
      } else {
        throw err;
      }
    }
    if (!failed) throw new Error('Operator pôde ignorar entry');
    console.log('  [PASS] REC-AUTH-06: IGNORE bloqueado');
    recAuthPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] REC-AUTH-06: ${err.message}`);
  }

  // REC-AUTH-07
  try {
    const entry = await statementRepo.create({
      id: 'entry-rec-07',
      companyId: companyA,
      financialAccountId: accountA.id,
      documentNumber: 'DOC-3D-REC-07',
      date: '2026-08-10',
      description: 'Statement Entry',
      amount: 100,
      direction: StatementDirection.CREDIT,
      importSource: 'MANUAL',
      status: StatementEntryStatus.UNMATCHED,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const res = await BankReconciliationService.ignoreEntry(
      companyA,
      entry.id,
      'usr-manager-a',
      'Manager A',
      'ignore reason'
    );
    if (res.status !== StatementEntryStatus.IGNORED) throw new Error('Não mudou para IGNORED');
    console.log('  [PASS] REC-AUTH-07: IGNORE permitido');
    recAuthPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] REC-AUTH-07: ${err.message}`);
  }

  console.log('\n--- 5. FINANCIAL PERIOD AUTHORIZATION SUITE (7 TESTES) ---');

  // PER-AUTH-01
  try {
    let failed = false;
    try {
      await FinanceEngine.closeFinancialPeriod({
        companyId: companyA,
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        userId: 'usr-operator-a',
        userName: 'Operator A',
      });
    } catch (err: any) {
      if (err.message.includes('Acesso negado')) {
        failed = true;
      } else {
        throw err;
      }
    }
    if (!failed) throw new Error('Operator pôde fechar período');
    console.log('  [PASS] PER-AUTH-01: CLOSE bloqueado sem permissão');
    periodAuthPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] PER-AUTH-01: ${err.message}`);
  }

  // PER-AUTH-02
  try {
    const res = await FinanceEngine.closeFinancialPeriod({
      companyId: companyA,
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      userId: 'usr-manager-a',
      userName: 'Manager A',
    });
    if (res.status !== FinancialPeriodStatus.CLOSED) throw new Error('Status não mudou para CLOSED');
    console.log('  [PASS] PER-AUTH-02: CLOSE autorizado');
    periodAuthPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] PER-AUTH-02: ${err.message}`);
  }

  // PER-AUTH-03
  try {
    const periods = await periodRepo.findAll({ companyId: companyA });
    const sepPeriod = periods.find((p) => p.startDate === '2026-09-01');
    if (!sepPeriod) throw new Error('Período de setembro não encontrado');

    let failed = false;
    try {
      await FinanceEngine.reopenFinancialPeriod({
        companyId: companyA,
        periodId: sepPeriod.id,
        reason: 'Reason',
        userId: 'usr-manager-a',
        userName: 'Manager A',
      });
    } catch (err: any) {
      if (err.message.includes('Acesso negado')) {
        failed = true;
      } else {
        throw err;
      }
    }
    if (!failed) throw new Error('Manager pôde reabrir período');
    console.log('  [PASS] PER-AUTH-03: REOPEN bloqueado sem permissão');
    periodAuthPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] PER-AUTH-03: ${err.message}`);
  }

  // PER-AUTH-04
  try {
    const periods = await periodRepo.findAll({ companyId: companyA });
    const sepPeriod = periods.find((p) => p.startDate === '2026-09-01');
    if (!sepPeriod) throw new Error('Período de setembro não encontrado');

    let failed = false;
    try {
      await FinanceEngine.reopenFinancialPeriod({
        companyId: companyA,
        periodId: sepPeriod.id,
        reason: '   ',
        userId: 'usr-admin-a',
        userName: 'Admin A',
      });
    } catch (err: any) {
      if (err.message.includes('Justificativa é obrigatória')) {
        failed = true;
      } else {
        throw err;
      }
    }
    if (!failed) throw new Error('Permitiu reabrir sem justificativa');
    console.log('  [PASS] PER-AUTH-04: REOPEN autorizado sem justificativa continua bloqueado');
    periodAuthPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] PER-AUTH-04: ${err.message}`);
  }

  // PER-AUTH-05
  try {
    const periods = await periodRepo.findAll({ companyId: companyA });
    const sepPeriod = periods.find((p) => p.startDate === '2026-09-01');
    if (!sepPeriod) throw new Error('Período de setembro não encontrado');

    const res = await FinanceEngine.reopenFinancialPeriod({
      companyId: companyA,
      periodId: sepPeriod.id,
      reason: 'Valid justification text',
      userId: 'usr-admin-a',
      userName: 'Admin A',
    });
    if (res.status !== FinancialPeriodStatus.OPEN) throw new Error('Status não voltou para OPEN');
    console.log('  [PASS] PER-AUTH-05: REOPEN autorizado + justificativa funciona');
    periodAuthPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] PER-AUTH-05: ${err.message}`);
  }

  // PER-AUTH-06
  try {
    const logs = await auditRepo.findAll({ companyId: companyA });
    const hasLog = logs.some((l) => l.action === AuditAction.PERIOD_REOPENED);
    if (!hasLog) throw new Error('AuditLog PERIOD_REOPENED não encontrado');
    console.log('  [PASS] PER-AUTH-06: REOPEN gera AuditLog');
    periodAuthPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] PER-AUTH-06: ${err.message}`);
  }

  // PER-AUTH-07
  try {
    const periodsB = await periodRepo.findAll({ companyId: companyB });
    const periodBObj = periodsB[0];

    let failed = false;
    try {
      await FinanceEngine.reopenFinancialPeriod({
        companyId: companyB,
        periodId: periodBObj.id,
        reason: 'Attempt cross tenant reopen',
        userId: 'actor-adm-a',
        userName: 'Admin A',
      });
    } catch (err: any) {
      if (err.message.includes('Acesso negado')) {
        failed = true;
      } else {
        throw err;
      }
    }
    if (!failed) throw new Error('Permitiu reabrir período cross-tenant');
    console.log('  [PASS] PER-AUTH-07: cross-tenant reopen bloqueado');
    periodAuthPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] PER-AUTH-07: ${err.message}`);
  }

  console.log('\n--- 6. IMMUTABLE AUDIT TRAIL SUITE (8 TESTES) ---');

  // AUD-FIN-01
  try {
    const logs = await auditRepo.findAll({ companyId: companyA });
    const payLog = logs.some((l) => l.action === AuditAction.PAY && l.entityName === 'AccountPayable');
    if (!payLog) throw new Error('Log de pagamento não encontrado');
    console.log('  [PASS] AUD-FIN-01: Payment gera AuditLog');
    auditPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] AUD-FIN-01: ${err.message}`);
  }

  // AUD-FIN-02
  try {
    const logs = await auditRepo.findAll({ companyId: companyA });
    const recLog = logs.some((l) => l.action === AuditAction.RECEIVE && l.entityName === 'AccountReceivable');
    if (!recLog) throw new Error('Log de recebimento não encontrado');
    console.log('  [PASS] AUD-FIN-02: Receipt gera AuditLog');
    auditPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] AUD-FIN-02: ${err.message}`);
  }

  // AUD-FIN-03
  try {
    const logs = await auditRepo.findAll({ companyId: companyA });
    const trLog = logs.some((l) => l.action === AuditAction.CREATE && l.entityName === 'FinancialTransaction');
    if (!trLog) throw new Error('Log de transferência não encontrado');
    console.log('  [PASS] AUD-FIN-03: Transfer gera AuditLog');
    auditPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] AUD-FIN-03: ${err.message}`);
  }

  // AUD-FIN-04
  try {
    const logs = await auditRepo.findAll({ companyId: companyA });
    const revLog = logs.some((l) => (l.action === AuditAction.REVERSE || l.action === AuditAction.PARTIAL_REVERSE) && l.entityName === 'FinancialTransaction');
    if (!revLog) throw new Error('Log de estorno não encontrado');
    console.log('  [PASS] AUD-FIN-04: Reversal gera AuditLog');
    auditPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] AUD-FIN-04: ${err.message}`);
  }

  // AUD-FIN-05
  try {
    const logs = await auditRepo.findAll({ companyId: companyA });
    const renegLog = logs.some((l) => l.entityName === 'Renegotiation');
    if (!renegLog) throw new Error('Log de renegociação não encontrado');
    console.log('  [PASS] AUD-FIN-05: Renegotiation gera AuditLog');
    auditPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] AUD-FIN-05: ${err.message}`);
  }

  // AUD-FIN-06
  try {
    const logs = await auditRepo.findAll({ companyId: companyA });
    const closeLog = logs.some((l) => l.action === AuditAction.PERIOD_CLOSED && l.entityName === 'FinancialPeriod');
    if (!closeLog) throw new Error('Log de fechamento de período não encontrado');
    console.log('  [PASS] AUD-FIN-06: Period Close gera AuditLog');
    auditPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] AUD-FIN-06: ${err.message}`);
  }

  // AUD-FIN-07
  try {
    const logs = await auditRepo.findAll({ companyId: companyA });
    const reopenLog = logs.some((l) => l.action === AuditAction.PERIOD_REOPENED && l.entityName === 'FinancialPeriod');
    if (!reopenLog) throw new Error('Log de reabertura de período não encontrado');
    console.log('  [PASS] AUD-FIN-07: Period Reopen gera AuditLog');
    auditPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] AUD-FIN-07: ${err.message}`);
  }

  // AUD-FIN-08
  try {
    const logs = await auditRepo.findAll({ companyId: companyA });
    if (logs.length === 0) throw new Error('Sem logs disponíveis para testar imutabilidade');
    const targetLog = logs[0];

    let updateFailed = false;
    try {
      await auditRepo.update(targetLog.id, { userName: 'Hack attempt' });
    } catch (err: any) {
      if (err.message.includes('Logs de auditoria são imutáveis')) {
        updateFailed = true;
      } else {
        throw err;
      }
    }

    let deleteFailed = false;
    try {
      await auditRepo.delete(targetLog.id);
    } catch (err: any) {
      if (err.message.includes('Logs de auditoria são imutáveis')) {
        deleteFailed = true;
      } else {
        throw err;
      }
    }

    let updateCompanyFailed = false;
    try {
      await auditRepo.updateForCompany(targetLog.id, companyA, { userName: 'Hack' });
    } catch (err: any) {
      if (err.message.includes('Logs de auditoria são imutáveis')) {
        updateCompanyFailed = true;
      } else {
        throw err;
      }
    }

    let deleteCompanyFailed = false;
    try {
      await auditRepo.deleteForCompany(targetLog.id, companyA);
    } catch (err: any) {
      if (err.message.includes('Logs de auditoria são imutáveis')) {
        deleteCompanyFailed = true;
      } else {
        throw err;
      }
    }

    if (!updateFailed || !deleteFailed || !updateCompanyFailed || !deleteCompanyFailed) {
      throw new Error('Permitiu mutação de log de auditoria!');
    }
    console.log('  [PASS] AUD-FIN-08: tentativa de update/delete em AuditLog bloqueada');
    auditPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] AUD-FIN-08: ${err.message}`);
  }

  console.log('\n--- 7. SECURITY & PENETRATION SUITE (5 TESTES) ---');

  // SEC-RBAC-01
  try {
    await registerUser('usr-viewer-attacker', companyA, 'FINANCIAL_VIEWER');
    const resolvedUser = await FinancialAuthorizationService.authorize('usr-viewer-attacker', companyA, 'VIEW_FINANCIAL');
    if ((resolvedUser.role as string) !== 'FINANCIAL_VIEWER') throw new Error('Role pôde ser alterado pelo caller!');

    let failed = false;
    try {
      await FinancialAuthorizationService.authorize('usr-viewer-attacker', companyA, 'PAYABLE_CREATE');
    } catch (err: any) {
      if (err.message.includes('Permissão insuficiente')) {
        failed = true;
      }
    }
    if (!failed) throw new Error('Caller pôde injetar role ou passar sem permissão');
    console.log('  [PASS] SEC-RBAC-01: role falso enviado pelo caller');
    secRbacPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] SEC-RBAC-01: ${err.message}`);
  }

  // SEC-RBAC-02
  try {
    const storage = StorageAdapter.getInstance();
    await storage.saveItem('users', {
      id: 'usr-viewer-escalate',
      companyId: companyA,
      name: 'Hack User',
      email: 'hack@test.com',
      role: 'FINANCIAL_VIEWER',
      active: true,
      isAdmin: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);

    let failed = false;
    try {
      await FinancialAuthorizationService.authorize('usr-viewer-escalate', companyA, 'PAYABLE_CREATE');
    } catch (err: any) {
      if (err.message.includes('Permissão insuficiente')) {
        failed = true;
      }
    }
    if (!failed) throw new Error('Manualmente injetar isAdmin=true burlou a segurança!');
    console.log('  [PASS] SEC-RBAC-02: isAdmin=true manual');
    secRbacPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] SEC-RBAC-02: ${err.message}`);
  }

  // SEC-RBAC-03
  try {
    await registerUser('usr-operator-escalate', companyA, 'FINANCIAL_OPERATOR');
    let failed = false;
    try {
      await FinancialAuthorizationService.authorize('usr-operator-escalate', companyA, 'FINANCIAL_PERIOD_CLOSE');
    } catch (err: any) {
      if (err.message.includes('Permissão insuficiente')) {
        failed = true;
      }
    }
    if (!failed) throw new Error('Operator conseguiu fechar período!');
    console.log('  [PASS] SEC-RBAC-03: permissions arbitrárias');
    secRbacPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] SEC-RBAC-03: ${err.message}`);
  }

  // SEC-RBAC-04
  try {
    let failed = false;
    try {
      await FinancialAuthorizationService.authorize('fake-unknown-actor', companyA, 'VIEW_FINANCIAL');
    } catch (err: any) {
      if (err.message.includes('Usuário inválido ou inexistente')) {
        failed = true;
      }
    }
    if (!failed) throw new Error('Permitiu autorizar usuário inexistente!');
    console.log('  [PASS] SEC-RBAC-04: usuário inexistente');
    secRbacPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] SEC-RBAC-04: ${err.message}`);
  }

  // SEC-RBAC-05
  try {
    await registerUser('usr-inactive-3d', companyA, 'ADMIN', false);
    let failed = false;
    try {
      await FinancialAuthorizationService.authorize('usr-inactive-3d', companyA, 'VIEW_FINANCIAL');
    } catch (err: any) {
      if (err.message.includes('Usuário inativo ou suspenso')) {
        failed = true;
      }
    }
    if (!failed) throw new Error('Permitiu autorizar usuário inativo!');
    console.log('  [PASS] SEC-RBAC-05: usuário inativo');
    secRbacPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] SEC-RBAC-05: ${err.message}`);
  }

  // SEC-RBAC-06: system substring blocked (e.g. user-system-fake)
  try {
    let failed = false;
    try {
      await FinancialAuthorizationService.authorize('user-system-fake', companyA, 'VIEW_FINANCIAL');
    } catch (err: any) {
      if (err.message.includes('Acesso negado')) {
        failed = true;
      }
    }
    if (!failed) throw new Error('Permitiu autorizar substring de system!');
    console.log('  [PASS] SEC-RBAC-06: system substring blocked');
    secRbacPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] SEC-RBAC-06: ${err.message}`);
  }

  // SEC-RBAC-07: system exact match allowed
  try {
    const u = await FinancialAuthorizationService.authorize('system', companyA, 'VIEW_FINANCIAL');
    if (u.id !== 'system' || u.role !== 'ADMIN') throw new Error('Falha no role ou ID do principal system');
    console.log('  [PASS] SEC-RBAC-07: system exact match allowed');
    secRbacPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] SEC-RBAC-07: ${err.message}`);
  }

  // SEC-RBAC-08: system-recurring exact match allowed
  try {
    const u = await FinancialAuthorizationService.authorize('system-recurring', companyA, 'VIEW_FINANCIAL');
    if (u.id !== 'system-recurring' || u.role !== 'ADMIN') throw new Error('Falha no role ou ID do principal system-recurring');
    console.log('  [PASS] SEC-RBAC-08: system-recurring exact match allowed');
    secRbacPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] SEC-RBAC-08: ${err.message}`);
  }

  // SEC-RBAC-09: unauthorized user view blocked
  try {
    let failed = false;
    try {
      await FinancialAuthorizationService.authorize('fake-unauthorized-user', companyA, 'VIEW_FINANCIAL');
    } catch (err: any) {
      failed = true;
    }
    if (!failed) throw new Error('Permitiu usuário não cadastrado/não dinâmico!');
    console.log('  [PASS] SEC-RBAC-09: unauthorized user view blocked');
    secRbacPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] SEC-RBAC-09: ${err.message}`);
  }

  // SEC-RBAC-10: unknown/invalid role blocked
  try {
    await registerUser('usr-invalid-role-3d', companyA, 'INVALID_ROLE' as any);
    let failed = false;
    try {
      await FinancialAuthorizationService.authorize('usr-invalid-role-3d', companyA, 'VIEW_FINANCIAL');
    } catch (err: any) {
      if (err.message.includes('Permissão insuficiente')) {
        failed = true;
      }
    }
    if (!failed) throw new Error('Permitiu role inválido sem permissão!');
    console.log('  [PASS] SEC-RBAC-10: unknown/invalid role blocked');
    secRbacPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] SEC-RBAC-10: ${err.message}`);
  }

  // Confirm results
  const totalPassed = rbacPassed + tenantPassed + finPassed + recAuthPassed + periodAuthPassed + auditPassed + secRbacPassed;
  const totalExpected = rbacTotal + tenantTotal + finTotal + recAuthTotal + periodAuthTotal + auditTotal + secRbacTotal;

  console.log('\n====================================================');
  console.log(`WAVE 3D INDIVIDUAL SUITE SUMMARY: ${totalPassed}/${totalExpected}`);
  console.log('====================================================');
  console.log(`RBAC_TESTS = ${rbacPassed}/${rbacTotal}`);
  console.log(`RBAC_TENANT_TESTS = ${tenantPassed}/${tenantTotal}`);
  console.log(`FIN_AUTH_TESTS = ${finPassed}/${finTotal}`);
  console.log(`RECONCILIATION_AUTH_TESTS = ${recAuthPassed}/${recAuthTotal}`);
  console.log(`PERIOD_AUTH_TESTS = ${periodAuthPassed}/${periodAuthTotal}`);
  console.log(`AUDIT_TESTS = ${auditPassed}/${auditTotal}`);
  console.log(`SECURITY_RBAC_TESTS = ${secRbacPassed}/${secRbacTotal}`);
  console.log('====================================================\n');

  if (totalPassed !== totalExpected) {
    console.error('FIN-WAVE-3D FALHOU EM SEUS TESTES INDIVIDUAIS!');
    return {
      success: false,
      rbacPassed,
      tenantPassed,
      finPassed,
      recAuthPassed,
      periodAuthPassed,
      auditPassed,
      secRbacPassed,
    };
  }

  console.log('--- REGRESSION SUITE EXECUTION (Waves 1, 2, 3A, 3B, 3C, FinanceTestRunner) ---');
  execSync('npx tsx src/domain/finance/__tests__/wave3cVerification.ts', { stdio: 'inherit' });

  return {
    success: true,
    rbacPassed,
    tenantPassed,
    finPassed,
    recAuthPassed,
    periodAuthPassed,
    auditPassed,
    secRbacPassed,
  };
}

runWave3DVerification()
  .then((res) => {
    if (!res.success) {
      console.error('FIN-WAVE-3D HOMOLOGATION FAILED!');
      process.exit(1);
    } else {
      console.log('====================================================');
      console.log('WAVE 3D AND ALL REGRESSIONS HOMOLOGATED SUCCESSFULLY!');
      console.log('====================================================');
      process.exit(0);
    }
  })
  .catch((err) => {
    console.error('FIN-WAVE-3D UNHANDLED EXCEPTION:', err);
    process.exit(1);
  });
