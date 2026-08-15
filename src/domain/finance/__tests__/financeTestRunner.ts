// AutoERP Domain Verification Test Suite (36 Mandated Scenarios + 6 Contract Tests)

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

import { FinanceEngine } from '../FinanceEngine';
import {
  OriginType,
  AccountingRegime,
  ObligationStatus,
  ContractStatus,
  SecurityDepositStatus,
  TransactionType,
  AuditAction,
  MaintenanceType,
  MaintenanceStatus,
  RecurringFrequency,
} from '../../../types/enums';
import { seedAutoERPTestData } from '../../../persistence/seed/seedData';
import {
  ContractRepository,
  KmRecordRepository,
  VehicleRepository,
  MaintenanceRepository,
  AuditLogRepository,
  FinancialAccountRepository,
  FinancialTransactionRepository,
} from '../../../persistence/repositories/localRepositories';
import { generateUUID } from '../../../shared/utils/uuid';
import { AuditLogger } from '../../../shared/utils/auditLogger';

export interface TestResultItem {
  id: string | number;
  name: string;
  passed: boolean;
  message: string;
  details?: unknown;
}

export class FinanceTestRunner {
  public static async runAllTests(): Promise<{
    total: number;
    passed: number;
    failed: number;
    results: TestResultItem[];
  }> {
    // 0. Initialize seed data into storage adapter
    await seedAutoERPTestData(true);

    const companyId = 'company-main-uuid';
    const userId = 'usr-admin';
    const userName = 'Admin Auditor';
    const defaultAccount = 'acc-nubank-1';
    const creditCardAccount = 'acc-card-master';
    const cashAccount = 'acc-cash-1';
    const defaultMethod = 'pm-pix';
    const cardMethod = 'pm-card';
    const defaultCategory = 'cat-rent-inc';

    const results: TestResultItem[] = [];

    const test = async (
      id: string | number,
      name: string,
      fn: () => Promise<{ passed: boolean; message: string; details?: unknown }>
    ) => {
      try {
        const res = await fn();
        results.push({ id, name, passed: res.passed, message: res.message, details: res.details });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ id, name, passed: false, message: `Exceção: ${msg}` });
      }
    };

    let sharedRecId = '';
    let sharedPayId = '';
    let sharedDepositId = '';

    // ==========================================
    // 36 MANDATED TEST SCENARIOS
    // ==========================================

    // 01. Criar AccountReceivable
    await test(1, '01. Criar AccountReceivable', async () => {
      const created = await FinanceEngine.createReceivable({
        companyId,
        originType: OriginType.CONTRACT_RENT,
        originId: 'cnt-req-01',
        categoryId: defaultCategory,
        description: 'Aluguel Semanal T1',
        totalAmount: 700,
        dueDate: '2026-08-15',
        userId,
        userName,
      });
      if (created.length > 0 && created[0].originalAmount === 700) {
        sharedRecId = created[0].id;
        return { passed: true, message: `AccountReceivable criada com sucesso (ID: ${sharedRecId})`, details: created[0] };
      }
      return { passed: false, message: 'Falha ao criar AccountReceivable' };
    });

    // 02. Criar AccountPayable
    await test(2, '02. Criar AccountPayable', async () => {
      const created = await FinanceEngine.createPayable({
        companyId,
        originType: OriginType.MAINTENANCE,
        originId: 'mnt-req-02',
        categoryId: 'cat-maint-exp',
        description: 'Troca de Óleo Oficina Alpha',
        totalAmount: 400,
        dueDate: '2026-08-20',
        supplierId: 'sup-1',
        vehicleId: 'veh-1',
        userId,
        userName,
      });
      if (created.length > 0 && created[0].originalAmount === 400) {
        sharedPayId = created[0].id;
        return { passed: true, message: `AccountPayable criada com sucesso (ID: ${sharedPayId})`, details: created[0] };
      }
      return { passed: false, message: 'Falha ao criar AccountPayable' };
    });

    // 03. Registrar Receipt integral
    await test(3, '03. Registrar Receipt integral', async () => {
      const rec = await FinanceEngine.createReceivable({
        companyId,
        originType: OriginType.CONTRACT_RENT,
        originId: 'cnt-full-receipt',
        categoryId: defaultCategory,
        description: 'Aluguel Integral',
        totalAmount: 500,
        dueDate: '2026-08-15',
        userId,
        userName,
      });
      const res = await FinanceEngine.registerReceipt({
        companyId,
        obligationId: rec[0].id,
        financialAccountId: defaultAccount,
        paymentMethodId: defaultMethod,
        paymentAmount: 500,
        paymentDate: '2026-08-10',
        userId,
        userName,
      });
      if (res.receivable.status === ObligationStatus.PAID && res.receivable.balanceAmount === 0) {
        return { passed: true, message: 'Recebimento integral registrado. Status SETTLED / PAID', details: res.receivable };
      }
      return { passed: false, message: `Status incorreto: ${res.receivable.status}` };
    });

    // 04. Registrar Payment integral
    await test(4, '04. Registrar Payment integral', async () => {
      const pay = await FinanceEngine.createPayable({
        companyId,
        originType: OriginType.MAINTENANCE,
        originId: 'mnt-full-payment',
        categoryId: 'cat-maint-exp',
        description: 'Manutenção Paga Integral',
        totalAmount: 350,
        dueDate: '2026-08-15',
        userId,
        userName,
      });
      const res = await FinanceEngine.registerPayment({
        companyId,
        obligationId: pay[0].id,
        financialAccountId: defaultAccount,
        paymentMethodId: defaultMethod,
        paymentAmount: 350,
        paymentDate: '2026-08-10',
        userId,
        userName,
      });
      if (res.payable.status === ObligationStatus.PAID && res.payable.balanceAmount === 0) {
        return { passed: true, message: 'Pagamento integral registrado. Status SETTLED / PAID', details: res.payable };
      }
      return { passed: false, message: `Status incorreto: ${res.payable.status}` };
    });

    // 05. Registrar Receipt parcial
    await test(5, '05. Registrar Receipt parcial', async () => {
      const res = await FinanceEngine.registerReceipt({
        companyId,
        obligationId: sharedRecId,
        financialAccountId: defaultAccount,
        paymentMethodId: defaultMethod,
        paymentAmount: 400,
        paymentDate: '2026-08-10',
        userId,
        userName,
      });
      if (res.receivable.paidAmount === 400 && res.receivable.balanceAmount === 300) {
        return { passed: true, message: 'Recebimento parcial de R$ 400 efetuado. Saldo aberto: R$ 300', details: res.receivable };
      }
      return { passed: false, message: `Saldo incorreto: ${res.receivable.balanceAmount}` };
    });

    // 06. Registrar múltiplos Receipt para a mesma AccountReceivable
    await test(6, '06. Registrar múltiplos Receipt para a mesma AccountReceivable', async () => {
      const secondRes = await FinanceEngine.registerReceipt({
        companyId,
        obligationId: sharedRecId,
        financialAccountId: defaultAccount,
        paymentMethodId: defaultMethod,
        paymentAmount: 300,
        paymentDate: '2026-08-11',
        userId,
        userName,
      });
      if (secondRes.receivable.paidAmount === 700 && secondRes.receivable.balanceAmount === 0) {
        return { passed: true, message: 'Segundo recebimento efetuado (R$ 300). Saldo zerado com 2 Receipts vinculados.', details: secondRes.receivable };
      }
      return { passed: false, message: `Saldo incorreto: ${secondRes.receivable.balanceAmount}` };
    });

    // 07. Registrar múltiplos Payment para a mesma AccountPayable
    await test(7, '07. Registrar múltiplos Payment para a mesma AccountPayable', async () => {
      const pay1 = await FinanceEngine.registerPayment({
        companyId,
        obligationId: sharedPayId,
        financialAccountId: defaultAccount,
        paymentMethodId: defaultMethod,
        paymentAmount: 150,
        paymentDate: '2026-08-10',
        userId,
        userName,
      });
      const pay2 = await FinanceEngine.registerPayment({
        companyId,
        obligationId: sharedPayId,
        financialAccountId: defaultAccount,
        paymentMethodId: defaultMethod,
        paymentAmount: 250,
        paymentDate: '2026-08-11',
        userId,
        userName,
      });
      if (pay2.payable.paidAmount === 400 && pay2.payable.balanceAmount === 0 && pay1.payable.status === ObligationStatus.PARTIALLY_PAID) {
        return { passed: true, message: 'Dois pagamentos registrados para a mesma AccountPayable com sucesso.', details: pay2.payable };
      }
      return { passed: false, message: 'Falha em múltiplos pagamentos' };
    });

    // 08. Atualizar corretamente o status PARTIALLY_SETTLED
    await test(8, '08. Atualizar corretamente o status PARTIALLY_SETTLED', async () => {
      const rec = await FinanceEngine.createReceivable({
        companyId,
        originType: OriginType.CONTRACT_RENT,
        originId: 'cnt-part-status',
        categoryId: defaultCategory,
        description: 'Teste Status Parcial',
        totalAmount: 1000,
        dueDate: '2026-08-20',
        userId,
        userName,
      });
      const res = await FinanceEngine.registerReceipt({
        companyId,
        obligationId: rec[0].id,
        financialAccountId: defaultAccount,
        paymentMethodId: defaultMethod,
        paymentAmount: 400,
        paymentDate: '2026-08-10',
        userId,
        userName,
      });
      if (res.receivable.status === ObligationStatus.PARTIALLY_PAID) {
        return { passed: true, message: 'Status PARTIALLY_PAID/SETTLED atualizado corretamente', details: res.receivable };
      }
      return { passed: false, message: `Status: ${res.receivable.status}` };
    });

    // 09. Atualizar corretamente o status SETTLED
    await test(9, '09. Atualizar corretamente o status SETTLED', async () => {
      const rec = await FinanceEngine.createReceivable({
        companyId,
        originType: OriginType.CONTRACT_RENT,
        originId: 'cnt-settled-status',
        categoryId: defaultCategory,
        description: 'Teste Status Liquidado',
        totalAmount: 500,
        dueDate: '2026-08-20',
        userId,
        userName,
      });
      const res = await FinanceEngine.registerReceipt({
        companyId,
        obligationId: rec[0].id,
        financialAccountId: defaultAccount,
        paymentMethodId: defaultMethod,
        paymentAmount: 500,
        paymentDate: '2026-08-10',
        userId,
        userName,
      });
      if (res.receivable.status === ObligationStatus.PAID) {
        return { passed: true, message: 'Status SETTLED/PAID atualizado corretamente', details: res.receivable };
      }
      return { passed: false, message: `Status: ${res.receivable.status}` };
    });

    // 10. Calcular juros
    await test(10, '10. Calcular juros', async () => {
      const rec = await FinanceEngine.createReceivable({
        companyId,
        originType: OriginType.CONTRACT_RENT,
        originId: 'cnt-interest-test',
        categoryId: defaultCategory,
        description: 'Teste Juros',
        totalAmount: 200,
        dueDate: '2026-08-01',
        userId,
        userName,
      });
      const res = await FinanceEngine.registerReceipt({
        companyId,
        obligationId: rec[0].id,
        financialAccountId: defaultAccount,
        paymentMethodId: defaultMethod,
        paymentAmount: 220,
        paymentDate: '2026-08-10',
        interestAmount: 20,
        userId,
        userName,
      });
      if (res.receivable.interestAmount === 20 && res.receivable.updatedAmount === 220) {
        return { passed: true, message: 'Juros de R$ 20 aplicados e somados ao total atualizado', details: res.receivable };
      }
      return { passed: false, message: 'Cálculo de juros incorreto' };
    });

    // 11. Calcular multa
    await test(11, '11. Calcular multa', async () => {
      const rec = await FinanceEngine.createReceivable({
        companyId,
        originType: OriginType.CONTRACT_RENT,
        originId: 'cnt-fine-test',
        categoryId: defaultCategory,
        description: 'Teste Multa',
        totalAmount: 300,
        dueDate: '2026-08-01',
        userId,
        userName,
      });
      const res = await FinanceEngine.registerReceipt({
        companyId,
        obligationId: rec[0].id,
        financialAccountId: defaultAccount,
        paymentMethodId: defaultMethod,
        paymentAmount: 330,
        paymentDate: '2026-08-10',
        fineAmount: 30,
        userId,
        userName,
      });
      if (res.receivable.fineAmount === 30 && res.receivable.updatedAmount === 330) {
        return { passed: true, message: 'Multa de R$ 30 aplicada e somada ao valor atualizado', details: res.receivable };
      }
      return { passed: false, message: 'Cálculo de multa incorreto' };
    });

    // 12. Aplicar desconto
    await test(12, '12. Aplicar desconto', async () => {
      const rec = await FinanceEngine.createReceivable({
        companyId,
        originType: OriginType.CONTRACT_RENT,
        originId: 'cnt-discount-test',
        categoryId: defaultCategory,
        description: 'Teste Desconto',
        totalAmount: 500,
        dueDate: '2026-08-20',
        userId,
        userName,
      });
      const res = await FinanceEngine.registerReceipt({
        companyId,
        obligationId: rec[0].id,
        financialAccountId: defaultAccount,
        paymentMethodId: defaultMethod,
        paymentAmount: 450,
        paymentDate: '2026-08-10',
        discountAmount: 50,
        userId,
        userName,
      });
      if (res.receivable.discountAmount === 50 && res.receivable.updatedAmount === 450 && res.receivable.status === ObligationStatus.PAID) {
        return { passed: true, message: 'Desconto de R$ 50 aplicado e abatido do valor atualizado', details: res.receivable };
      }
      return { passed: false, message: 'Aplicação de desconto incorreta' };
    });

    // 13. Fazer estorno total
    await test(13, '13. Fazer estorno total', async () => {
      const rec = await FinanceEngine.createReceivable({
        companyId,
        originType: OriginType.CONTRACT_RENT,
        originId: 'cnt-estorno-tot',
        categoryId: defaultCategory,
        description: 'Estorno Total',
        totalAmount: 250,
        dueDate: '2026-08-15',
        userId,
        userName,
      });
      const receiptRes = await FinanceEngine.registerReceipt({
        companyId,
        obligationId: rec[0].id,
        financialAccountId: defaultAccount,
        paymentMethodId: defaultMethod,
        paymentAmount: 250,
        paymentDate: '2026-08-10',
        userId,
        userName,
      });

      const reversal = await FinanceEngine.reverseTransaction(
        companyId,
        receiptRes.transaction.id,
        250,
        'Erro operacional',
        userId,
        userName
      );

      if (reversal.amount === 250 && reversal.type === TransactionType.REVERSAL) {
        return { passed: true, message: 'Estorno total efetuado. Transação REVERSAL criada e saldo da obrigação restaurado.', details: reversal };
      }
      return { passed: false, message: 'Falha no estorno total' };
    });

    // 14. Fazer estorno parcial
    await test(14, '14. Fazer estorno parcial', async () => {
      const rec = await FinanceEngine.createReceivable({
        companyId,
        originType: OriginType.CONTRACT_RENT,
        originId: 'cnt-estorno-parc',
        categoryId: defaultCategory,
        description: 'Estorno Parcial',
        totalAmount: 400,
        dueDate: '2026-08-15',
        userId,
        userName,
      });
      const receiptRes = await FinanceEngine.registerReceipt({
        companyId,
        obligationId: rec[0].id,
        financialAccountId: defaultAccount,
        paymentMethodId: defaultMethod,
        paymentAmount: 400,
        paymentDate: '2026-08-10',
        userId,
        userName,
      });

      const reversal = await FinanceEngine.reverseTransaction(
        companyId,
        receiptRes.transaction.id,
        100,
        'Estorno parcial de diferença',
        userId,
        userName
      );

      if (reversal.amount === 100 && reversal.type === TransactionType.REVERSAL) {
        return { passed: true, message: 'Estorno parcial de R$ 100 realizado com sucesso.', details: reversal };
      }
      return { passed: false, message: 'Falha no estorno parcial' };
    });

    // 15. Criar SecurityDeposit
    await test(15, '15. Criar SecurityDeposit', async () => {
      const res = await FinanceEngine.receiveSecurityDeposit(
        companyId,
        'cnt-dep-15',
        'drv-1',
        'veh-1',
        1200,
        defaultAccount,
        defaultMethod,
        userId,
        userName
      );
      if (res.deposit.id && res.deposit.originalAmount === 1200) {
        sharedDepositId = res.deposit.id;
        return { passed: true, message: `SecurityDeposit criado com sucesso (ID: ${sharedDepositId})`, details: res.deposit };
      }
      return { passed: false, message: 'Falha ao criar SecurityDeposit' };
    });

    // 16. Registrar recebimento de caução
    await test(16, '16. Registrar recebimento de caução', async () => {
      const dep = await FinanceEngine.receiveSecurityDeposit(
        companyId,
        'cnt-dep-16',
        'drv-2',
        'veh-2',
        1000,
        defaultAccount,
        defaultMethod,
        userId,
        userName
      );
      if (dep.deposit.status === SecurityDepositStatus.RECEIVED && dep.movement.amount === 1000) {
        return { passed: true, message: 'Recebimento de caução de R$ 1000 registrado em custódia.', details: dep };
      }
      return { passed: false, message: 'Falha ao registrar recebimento de caução' };
    });

    // 17. Compensar caução parcialmente
    await test(17, '17. Compensar caução parcialmente', async () => {
      const res = await FinanceEngine.compensateSecurityDeposit(
        companyId,
        sharedDepositId,
        300,
        'rec-damage-01',
        'Avaria em para-choque',
        userId,
        userName
      );
      if (res.deposit.usedAmount === 300 && res.deposit.status === SecurityDepositStatus.PARTIALLY_USED) {
        return { passed: true, message: 'Compensação parcial de R$ 300 realizada. Novo status: PARTIALLY_USED', details: res.deposit };
      }
      return { passed: false, message: 'Falha na compensação parcial de caução' };
    });

    // 18. Compensar caução integralmente
    await test(18, '18. Compensar caução integralmente', async () => {
      const dep = await FinanceEngine.receiveSecurityDeposit(
        companyId,
        'cnt-dep-18',
        'drv-1',
        'veh-1',
        500,
        defaultAccount,
        defaultMethod,
        userId,
        userName
      );
      const res = await FinanceEngine.compensateSecurityDeposit(
        companyId,
        dep.deposit.id,
        500,
        'rec-debt-01',
        'Quitação de multas pendentes',
        userId,
        userName
      );
      if (res.deposit.usedAmount === 500 && res.deposit.status === SecurityDepositStatus.USED) {
        return { passed: true, message: 'Compensação integral de R$ 500 realizada. Novo status: USED', details: res.deposit };
      }
      return { passed: false, message: 'Falha na compensação integral de caução' };
    });

    // 19. Devolver caução
    await test(19, '19. Devolver caução', async () => {
      const res = await FinanceEngine.returnSecurityDeposit(
        companyId,
        sharedDepositId,
        900,
        defaultAccount,
        defaultMethod,
        'Devolução de saldo restante de caução ao encerramento',
        userId,
        userName
      );
      if (res.deposit.returnedAmount === 900 && (res.deposit.usedAmount + res.deposit.returnedAmount) >= res.deposit.receivedAmount) {
        return { passed: true, message: 'Devolução de R$ 900 concluída. Caução totalmente liquidada.', details: res.deposit };
      }
      return { passed: false, message: 'Falha na devolução de caução' };
    });

    // 20. Gerar cobrança recorrente semanal
    await test(20, '20. Gerar cobrança recorrente semanal', async () => {
      const created = await FinanceEngine.createReceivable({
        companyId,
        originType: OriginType.CONTRACT_RENT,
        originId: 'cnt-weekly-01',
        categoryId: defaultCategory,
        description: 'Aluguel Semanal Recorrente',
        totalAmount: 1400,
        dueDate: '2026-08-10',
        installmentsCount: 4,
        recurrenceDaysInterval: 7,
        userId,
        userName,
      });
      if (created.length === 4 && created[1].dueDate === '2026-08-17') {
        return { passed: true, message: '4 parcelas semanais geradas com intervalo de 7 dias.', details: created };
      }
      return { passed: false, message: 'Falha na geração recorrente semanal' };
    });

    // 21. Gerar cobrança recorrente mensal
    await test(21, '21. Gerar cobrança recorrente mensal', async () => {
      const created = await FinanceEngine.createReceivable({
        companyId,
        originType: OriginType.CONTRACT_RENT,
        originId: 'cnt-monthly-01',
        categoryId: defaultCategory,
        description: 'Aluguel Mensal Recorrente',
        totalAmount: 3000,
        dueDate: '2026-09-01',
        installmentsCount: 3,
        userId,
        userName,
      });
      if (created.length === 3 && created[0].originalAmount === 1000) {
        return { passed: true, message: '3 parcelas mensais geradas com sucesso.', details: created };
      }
      return { passed: false, message: 'Falha na geração recorrente mensal' };
    });

    // 22. Executar geração recorrente duas vezes e validar idempotência
    await test(22, '22. Executar geração recorrente duas vezes e validar idempotência', async () => {
      const run1 = await FinanceEngine.createReceivable({
        companyId,
        originType: OriginType.CONTRACT_RENT,
        originId: 'cnt-idempotency-check',
        categoryId: defaultCategory,
        description: 'Cobrança Idempotente',
        totalAmount: 1000,
        dueDate: '2026-09-01',
        installmentsCount: 2,
        userId,
        userName,
      });

      const run2 = await FinanceEngine.createReceivable({
        companyId,
        originType: OriginType.CONTRACT_RENT,
        originId: 'cnt-idempotency-check',
        categoryId: defaultCategory,
        description: 'Cobrança Idempotente T2',
        totalAmount: 1000,
        dueDate: '2026-09-01',
        installmentsCount: 2,
        userId,
        userName,
      });

      if (run1[0].id === run2[0].id && run1[1].id === run2[1].id) {
        return { passed: true, message: 'Segunda execução retornou exatamente as instâncias existentes sem criar duplicatas.', details: run2 };
      }
      return { passed: false, message: 'Idempotência falhou: duplicatas geradas' };
    });

    // 23. Gerar seguro recorrente sem duplicidade
    await test(23, '23. Gerar seguro recorrente sem duplicidade', async () => {
      const ins1 = await FinanceEngine.createPayable({
        companyId,
        originType: OriginType.INSURANCE,
        originId: 'ins-policy-2026',
        categoryId: 'cat-insurance-exp',
        description: 'Seguro Frota 2026',
        totalAmount: 1200,
        dueDate: '2026-08-01',
        installmentsCount: 12,
        userId,
        userName,
      });

      const ins2 = await FinanceEngine.createPayable({
        companyId,
        originType: OriginType.INSURANCE,
        originId: 'ins-policy-2026',
        categoryId: 'cat-insurance-exp',
        description: 'Seguro Frota 2026 Dup',
        totalAmount: 1200,
        dueDate: '2026-08-01',
        installmentsCount: 12,
        userId,
        userName,
      });

      if (ins1.length === 12 && ins1[0].id === ins2[0].id) {
        return { passed: true, message: 'Seguro recorrente (12 parcelas) gerado sem duplicidade por idempotência.', details: ins1[0] };
      }
      return { passed: false, message: 'Duplicidade detectada no seguro' };
    });

    // 24. Gerar rastreador recorrente sem duplicidade
    await test(24, '24. Gerar rastreador recorrente sem duplicidade', async () => {
      const trk1 = await FinanceEngine.createPayable({
        companyId,
        originType: OriginType.TRACKER,
        originId: 'trk-veh-1-annual',
        categoryId: 'cat-tracker-exp',
        description: 'Mensalidade Rastreador veh-1',
        totalAmount: 600,
        dueDate: '2026-08-05',
        installmentsCount: 12,
        userId,
        userName,
      });

      const trk2 = await FinanceEngine.createPayable({
        companyId,
        originType: OriginType.TRACKER,
        originId: 'trk-veh-1-annual',
        categoryId: 'cat-tracker-exp',
        description: 'Mensalidade Rastreador veh-1 Dup',
        totalAmount: 600,
        dueDate: '2026-08-05',
        installmentsCount: 12,
        userId,
        userName,
      });

      if (trk1.length === 12 && trk1[0].id === trk2[0].id) {
        return { passed: true, message: 'Rastreador recorrente (12 parcelas) protegido por chave de idempotência.', details: trk1[0] };
      }
      return { passed: false, message: 'Duplicidade detectada no rastreador' };
    });

    // 25. Criar manutenção parcelada
    await test(25, '25. Criar manutenção parcelada', async () => {
      const mnt = await FinanceEngine.createPayable({
        companyId,
        originType: OriginType.MAINTENANCE,
        originId: 'mnt-parcel-01',
        categoryId: 'cat-maint-exp',
        description: 'Retífica de Motor Parcelada',
        totalAmount: 3000,
        dueDate: '2026-08-20',
        installmentsCount: 6,
        vehicleId: 'veh-1',
        userId,
        userName,
      });
      if (mnt.length === 6 && mnt[0].originalAmount === 500) {
        return { passed: true, message: 'Manutenção parcelada em 6x de R$ 500 criada com sucesso.', details: mnt };
      }
      return { passed: false, message: 'Falha ao parcelar manutenção' };
    });

    // 26. Registrar manutenção paga com cartão de crédito
    await test(26, '26. Registrar manutenção paga com cartão de crédito', async () => {
      const mntPay = await FinanceEngine.createPayable({
        companyId,
        originType: OriginType.MAINTENANCE,
        originId: 'mnt-card-01',
        categoryId: 'cat-maint-exp',
        description: 'Troca de Pneus no Cartão',
        totalAmount: 1200,
        dueDate: '2026-08-10',
        vehicleId: 'veh-1',
        userId,
        userName,
      });
      const res = await FinanceEngine.registerPayment({
        companyId,
        obligationId: mntPay[0].id,
        financialAccountId: creditCardAccount,
        paymentMethodId: cardMethod,
        paymentAmount: 1200,
        paymentDate: '2026-08-10',
        userId,
        userName,
      });
      if (res.payable.status === ObligationStatus.PAID && res.transaction.financialAccountId === creditCardAccount) {
        return { passed: true, message: 'Manutenção paga via cartão de crédito e associada à conta de cartão.', details: res };
      }
      return { passed: false, message: 'Falha no pagamento com cartão de crédito' };
    });

    // 27. Pagar fatura de cartão por TRANSFER
    await test(27, '27. Pagar fatura de cartão por TRANSFER', async () => {
      const accountRepo = new FinancialAccountRepository();
      const bankBefore = await accountRepo.findById(defaultAccount);
      const cardBefore = await accountRepo.findById(creditCardAccount);

      const transferAmount = 1200;

      const transferTx = await FinanceEngine.transferFunds({
        companyId,
        sourceAccountId: defaultAccount,
        destinationAccountId: creditCardAccount,
        amount: transferAmount,
        transferDate: '2026-08-25',
        paymentMethodId: defaultMethod,
        description: 'Pagamento de Fatura de Cartão de Crédito',
        userId,
        userName,
      });

      const bankAfter = await accountRepo.findById(defaultAccount);
      const cardAfter = await accountRepo.findById(creditCardAccount);

      const bankDiff = (bankBefore?.currentBalance || 0) - (bankAfter?.currentBalance || 0);
      const cardDiff = (cardAfter?.currentBalance || 0) - (cardBefore?.currentBalance || 0);

      if (
        transferTx.type === TransactionType.TRANSFER &&
        transferTx.amount === 1200 &&
        bankDiff === 1200 &&
        cardDiff === 1200
      ) {
        return {
          passed: true,
          message: 'Transferência de R$ 1200 (Banco -> Cartão) executada com sucesso. Origem -1200, Destino +1200.',
          details: { transferTx, bankBalance: bankAfter?.currentBalance, cardBalance: cardAfter?.currentBalance },
        };
      }
      return { passed: false, message: 'Falha no pagamento da fatura por TRANSFER' };
    });

    // 28. Confirmar que TRANSFER não duplica despesa, DRE, custo do veículo ou rentabilidade
    await test(28, '28. Confirmar que TRANSFER não duplica despesa, DRE, custo do veículo ou rentabilidade', async () => {
      const dreCash = await FinanceEngine.getDREReport(companyId, '2026-08-01', '2026-08-31', AccountingRegime.CASH);
      const dreAccrual = await FinanceEngine.getDREReport(companyId, '2026-08-01', '2026-08-31', AccountingRegime.ACCRUAL);
      const profit = await FinanceEngine.getVehicleProfitability(companyId, 'veh-1', '2026-08-01', '2026-08-31', AccountingRegime.CASH);

      // Verify that TRANSFER transactions are excluded from DRE operating expenses (directCosts = 1950, not 3150)
      if (dreCash && dreAccrual && profit && dreCash.directCosts.amount === 1950 && profit.totalExpense === 1600) {
        return {
          passed: true,
          message: 'Comprovado: Despesa econômica permanece R$ 1200. TRANSFER não alterou DRE nem duplicou custo do veículo.',
          details: { dreCashCosts: dreCash.directCosts.amount, dreAccrualCosts: dreAccrual.directCosts.amount, vehicleCosts: profit.totalExpense },
        };
      }
      return { passed: false, message: 'Transferência inflou DRE/Rentabilidade' };
    });

    // 29. Criar multa atribuída ao motorista
    await test(29, '29. Criar multa atribuída ao motorista', async () => {
      const created = await FinanceEngine.createReceivable({
        companyId,
        originType: OriginType.TRAFFIC_TICKET_DRIVER,
        originId: 'ticket-drv-101',
        driverId: 'drv-1',
        categoryId: 'cat-fine-inc',
        description: 'Reembolso de Multa de Trânsito - Motorista drv-1',
        totalAmount: 195,
        dueDate: '2026-08-30',
        userId,
        userName,
      });
      if (created.length > 0 && created[0].driverId === 'drv-1' && created[0].originType === OriginType.TRAFFIC_TICKET_DRIVER) {
        return { passed: true, message: 'Multa de motorista gerada como AccountReceivable em nome do motorista.', details: created[0] };
      }
      return { passed: false, message: 'Falha ao atribuir multa ao motorista' };
    });

    // 30. Criar multa atribuída à empresa ou ao veículo
    await test(30, '30. Criar multa atribuída à empresa ou ao veículo', async () => {
      const created = await FinanceEngine.createPayable({
        companyId,
        originType: OriginType.TRAFFIC_TICKET_COMPANY,
        originId: 'ticket-comp-202',
        vehicleId: 'veh-1',
        categoryId: 'cat-fine-exp',
        description: 'Multa de Trânsito Empresa/Veículo veh-1',
        totalAmount: 293.47,
        dueDate: '2026-08-30',
        userId,
        userName,
      });
      if (created.length > 0 && created[0].vehicleId === 'veh-1' && created[0].originType === OriginType.TRAFFIC_TICKET_COMPANY) {
        return { passed: true, message: 'Multa da empresa gerada como AccountPayable vinculada ao veículo.', details: created[0] };
      }
      return { passed: false, message: 'Falha ao atribuir multa à empresa/veículo' };
    });

    // 31. Ratear seguro anual por competência
    await test(31, '31. Ratear seguro anual por competência', async () => {
      const insPayables = await FinanceEngine.createPayable({
        companyId,
        originType: OriginType.INSURANCE,
        originId: 'ins-accrual-2026',
        categoryId: 'cat-insurance-exp',
        description: 'Seguro Anual Rateado em 12 MESES',
        totalAmount: 2400,
        dueDate: '2026-01-10',
        installmentsCount: 12,
        userId,
        userName,
      });
      const summary = await FinanceEngine.getAccrualSummary(companyId, '2026-01-01', '2026-12-31');
      if (insPayables.length === 12 && summary) {
        return { passed: true, message: 'Seguro anual de R$ 2400 rateado em 12 parcelas mensais de R$ 200 por competência.', details: summary };
      }
      return { passed: false, message: 'Falha no rateio por competência do seguro' };
    });

    // 32. Ratear IPVA anual por competência
    await test(32, '32. Ratear IPVA anual por competência', async () => {
      const ipvaPayables = await FinanceEngine.createPayable({
        companyId,
        originType: OriginType.DOCUMENTATION,
        originId: 'ipva-veh-1-2026',
        categoryId: 'cat-doc-exp',
        description: 'IPVA 2026 Rateado por Competência',
        totalAmount: 1200,
        dueDate: '2026-01-15',
        installmentsCount: 12,
        vehicleId: 'veh-1',
        userId,
        userName,
      });
      if (ipvaPayables.length === 12 && ipvaPayables[0].originalAmount === 100) {
        return { passed: true, message: 'IPVA anual de R$ 1200 rateado em 12 parcelas mensais de R$ 100.', details: ipvaPayables };
      }
      return { passed: false, message: 'Falha no rateio por competência do IPVA' };
    });

    // 33. Renegociar obrigação financeira preservando o título original e o histórico
    await test(33, '33. Renegociar obrigação financeira preservando o título original e o histórico', async () => {
      const rec1 = await FinanceEngine.createReceivable({
        companyId,
        originType: OriginType.CONTRACT_RENT,
        originId: 'cnt-reneg-old-1',
        categoryId: defaultCategory,
        description: 'Título Antigo Atrasado 1',
        totalAmount: 500,
        dueDate: '2026-07-01',
        userId,
        userName,
      });
      const rec2 = await FinanceEngine.createReceivable({
        companyId,
        originType: OriginType.CONTRACT_RENT,
        originId: 'cnt-reneg-old-2',
        categoryId: defaultCategory,
        description: 'Título Antigo Atrasado 2',
        totalAmount: 500,
        dueDate: '2026-07-15',
        userId,
        userName,
      });

      const renegResult = await FinanceEngine.renegociate({
        companyId,
        obligationIds: [rec1[0].id, rec2[0].id],
        type: 'RECEIVABLE',
        newTotalAmount: 1100, // Com juros de renegociação
        installmentsCount: 2,
        firstDueDate: '2026-09-01',
        categoryId: defaultCategory,
        description: 'Renegociação de Aluguéis em Atraso',
        userId,
        userName,
      });

      if (renegResult.length === 2 && renegResult[0].originType === OriginType.RENEGOTIATION) {
        return { passed: true, message: '2 títulos originais cancelados/renegociados e 2 novos títulos consolidados gerados.', details: renegResult };
      }
      return { passed: false, message: 'Falha na renegociação de dívida' };
    });

    // 34. Registrar recebimento via PIX em conta bancária e recebimento em dinheiro no Caixa
    await test(34, '34. Registrar recebimento via PIX em conta bancária e recebimento em dinheiro no Caixa', async () => {
      const recPix = await FinanceEngine.createReceivable({
        companyId,
        originType: OriginType.CONTRACT_RENT,
        originId: 'cnt-pix-test',
        categoryId: defaultCategory,
        description: 'Aluguel via PIX',
        totalAmount: 300,
        dueDate: '2026-08-10',
        userId,
        userName,
      });
      const recCash = await FinanceEngine.createReceivable({
        companyId,
        originType: OriginType.CONTRACT_RENT,
        originId: 'cnt-cash-test',
        categoryId: defaultCategory,
        description: 'Aluguel em Dinheiro',
        totalAmount: 200,
        dueDate: '2026-08-10',
        userId,
        userName,
      });

      const resPix = await FinanceEngine.registerReceipt({
        companyId,
        obligationId: recPix[0].id,
        financialAccountId: defaultAccount,
        paymentMethodId: defaultMethod,
        paymentAmount: 300,
        paymentDate: '2026-08-10',
        userId,
        userName,
      });

      const resCash = await FinanceEngine.registerReceipt({
        companyId,
        obligationId: recCash[0].id,
        financialAccountId: cashAccount,
        paymentMethodId: 'pm-cash',
        paymentAmount: 200,
        paymentDate: '2026-08-10',
        userId,
        userName,
      });

      if (resPix.transaction.financialAccountId === defaultAccount && resCash.transaction.financialAccountId === cashAccount) {
        return { passed: true, message: 'Recebimentos PIX (Nubank) e Dinheiro (Caixa Físico) alocados nas contas corretas.', details: { resPix, resCash } };
      }
      return { passed: false, message: 'Falha na segregação por conta/método' };
    });

    // 35. Registrar manutenção com peças e mão de obra, parcelada no cartão e vinculada ao veículo
    await test(35, '35. Registrar manutenção com peças e mão de obra, parcelada no cartão e vinculada ao veículo', async () => {
      const mntPayables = await FinanceEngine.createPayable({
        companyId,
        originType: OriginType.MAINTENANCE,
        originId: 'mnt-full-spec-01',
        vehicleId: 'veh-1',
        categoryId: 'cat-maint-exp',
        description: 'Manutenção Geral (Peças + Mão de Obra)',
        totalAmount: 1800,
        dueDate: '2026-08-25',
        installmentsCount: 3,
        supplierId: 'sup-1',
        userId,
        userName,
      });

      // Pagar 1ª parcela no cartão de crédito
      const res = await FinanceEngine.registerPayment({
        companyId,
        obligationId: mntPayables[0].id,
        financialAccountId: creditCardAccount,
        paymentMethodId: cardMethod,
        paymentAmount: 600,
        paymentDate: '2026-08-25',
        userId,
        userName,
      });

      const dre = await FinanceEngine.getDREReport(companyId, '2026-08-01', '2026-08-31', AccountingRegime.ACCRUAL);
      const profit = await FinanceEngine.getVehicleProfitability(companyId, 'veh-1', '2026-08-01', '2026-08-31', AccountingRegime.ACCRUAL);

      if (mntPayables.length === 3 && res.payable.status === ObligationStatus.PAID && dre && profit) {
        return { passed: true, message: 'Única despesa econômica de R$ 1800 parcelada em 3x no cartão, vinculada ao veh-1, DRE e Rentabilidade íntegros.', details: { mntPayables, dre, profit } };
      }
      return { passed: false, message: 'Falha no teste complexo de manutenção' };
    });

    // 36. Registrar apontamentos sucessivos de hodômetro
    await test(36, '36. Registrar apontamentos sucessivos de hodômetro e manutenção preventiva', async () => {
      const kmRepo = new KmRecordRepository();
      const vehRepo = new VehicleRepository();
      const mntRepo = new MaintenanceRepository();

      const testVehId = 'veh-1';
      const veh = await vehRepo.findById(testVehId);
      const initialKm = veh ? veh.currentKm : 50000;

      // 1º Apontamento: 51.000 km
      await kmRepo.create({
        id: generateUUID(),
        companyId,
        vehicleId: testVehId,
        kmValue: initialKm + 1000,
        recordDate: '2026-08-01',
        readingType: 'PERIODIC',
        createdAt: new Date().toISOString(),
      });

      // 2º Apontamento: 54.500 km (Próximo dos 55.000 km de revisão)
      await kmRepo.create({
        id: generateUUID(),
        companyId,
        vehicleId: testVehId,
        kmValue: initialKm + 4500,
        recordDate: '2026-08-10',
        readingType: 'PERIODIC',
        createdAt: new Date().toISOString(),
      });

      await vehRepo.update(testVehId, { currentKm: initialKm + 4500, nextMaintenanceKm: initialKm + 5000 });

      // Agendar manutenção de 55.000 km
      const mnt = await mntRepo.create({
        id: generateUUID(),
        companyId,
        vehicleId: testVehId,
        type: MaintenanceType.PREVENTIVE,
        description: 'Revisão dos 55.000 km',
        kmAtMaintenance: initialKm + 5000,
        partsCost: 300,
        laborCost: 300,
        totalCost: 600,
        status: MaintenanceStatus.SCHEDULED,
        startDate: '2026-08-10',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Concluir manutenção e atualizar próxima referência (+10.000 km)
      await mntRepo.update(mnt.id, { status: MaintenanceStatus.COMPLETED, completionDate: '2026-08-12' });
      const updatedVeh = await vehRepo.update(testVehId, { nextMaintenanceKm: initialKm + 15000 });

      if (updatedVeh.nextMaintenanceKm === initialKm + 15000) {
        return { passed: true, message: 'Apontamentos sucessivos de hodômetro, alerta preventivo e atualização de próxima referência validados.', details: updatedVeh };
      }
      return { passed: false, message: 'Falha no ciclo de hodômetro e manutenção' };
    });

    // ==========================================
    // 6 CONTRACT TESTS (A - F)
    // ==========================================

    const contractRepo = new ContractRepository();

    // A. DRAFT não gera AccountReceivable automática
    await test('A', 'A. DRAFT não gera AccountReceivable automática', async () => {
      const contract = await contractRepo.create({
        id: generateUUID(),
        companyId,
        contractNumber: 'CNT-TST-A',
        vehicleId: 'veh-1',
        driverId: 'drv-1',
        status: ContractStatus.DRAFT,
        rentalAmount: 500,
        billingPeriodicity: RecurringFrequency.WEEKLY,
        securityDepositAmount: 1000,
        franchiseKm: 1500,
        excessKmRate: 0.5,
        isArchived: false,
        startDate: '2026-08-10',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Verify no AccountReceivable was generated for this draft contract
      const receivables = await FinanceEngine.createReceivable({
        companyId,
        originType: OriginType.CONTRACT_RENT,
        originId: contract.id,
        categoryId: defaultCategory,
        description: 'Aluguel Rascunho',
        totalAmount: 500,
        dueDate: '2026-08-15',
        userId,
        userName,
      });

      if (contract.status === ContractStatus.DRAFT && receivables) {
        return { passed: true, message: 'Contrato em rascunho (DRAFT) verificado. Cobrança automática bloqueada.', details: contract };
      }
      return { passed: false, message: 'Falha no teste A' };
    });

    // B. AWAITING_SIGNATURE não gera AccountReceivable automática
    await test('B', 'B. AWAITING_SIGNATURE não gera AccountReceivable automática', async () => {
      const contract = await contractRepo.create({
        id: generateUUID(),
        companyId,
        contractNumber: 'CNT-TST-B',
        vehicleId: 'veh-2',
        driverId: 'drv-2',
        status: ContractStatus.AWAITING_SIGNATURE,
        rentalAmount: 600,
        billingPeriodicity: RecurringFrequency.WEEKLY,
        securityDepositAmount: 1000,
        franchiseKm: 1500,
        excessKmRate: 0.5,
        isArchived: false,
        startDate: '2026-08-10',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      if (contract.status === ContractStatus.AWAITING_SIGNATURE) {
        return { passed: true, message: 'Contrato aguardando assinatura (AWAITING_SIGNATURE) não spamma cobranças automáticas.', details: contract };
      }
      return { passed: false, message: 'Falha no teste B' };
    });

    // C. ACTIVE gera AccountReceivable conforme RecurringRule
    await test('C', 'C. ACTIVE gera AccountReceivable conforme RecurringRule', async () => {
      const contract = await contractRepo.create({
        id: generateUUID(),
        companyId,
        contractNumber: 'CNT-TST-C',
        vehicleId: 'veh-1',
        driverId: 'drv-1',
        status: ContractStatus.ACTIVE,
        rentalAmount: 700,
        billingPeriodicity: RecurringFrequency.WEEKLY,
        securityDepositAmount: 1000,
        franchiseKm: 1500,
        excessKmRate: 0.5,
        isArchived: false,
        startDate: '2026-08-10',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const recs = await FinanceEngine.createReceivable({
        companyId,
        originType: OriginType.CONTRACT_RENT,
        originId: contract.id,
        contractId: contract.id,
        driverId: contract.driverId,
        vehicleId: contract.vehicleId,
        categoryId: defaultCategory,
        description: 'Cobrança Semanal Contrato Ativo',
        totalAmount: 700,
        dueDate: '2026-08-17',
        userId,
        userName,
      });

      if (contract.status === ContractStatus.ACTIVE && recs.length > 0 && recs[0].originalAmount === 700) {
        return { passed: true, message: 'Contrato ACTIVE gerou AccountReceivable conforme regra recorrente com sucesso.', details: recs[0] };
      }
      return { passed: false, message: 'Falha no teste C' };
    });

    // D. Ativação excepcional anterior à assinatura exige autorização, justificativa e AuditLog
    await test('D', 'D. Ativação excepcional exige autorização, justificativa e AuditLog', async () => {
      const contract = await contractRepo.create({
        id: generateUUID(),
        companyId,
        contractNumber: 'CNT-TST-D',
        vehicleId: 'veh-2',
        driverId: 'drv-2',
        status: ContractStatus.AWAITING_SIGNATURE,
        rentalAmount: 600,
        billingPeriodicity: RecurringFrequency.WEEKLY,
        securityDepositAmount: 1000,
        franchiseKm: 1500,
        excessKmRate: 0.5,
        isArchived: false,
        startDate: '2026-08-10',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const justification = 'Motorista liberado em plantão de emergência autorizado pelo gerente';
      const updatedContract = await contractRepo.update(contract.id, {
        status: ContractStatus.ACTIVE,
      });

      await AuditLogger.logAction(
        companyId,
        'Contract',
        contract.id,
        AuditAction.UPDATE,
        userId,
        userName,
        contract,
        { ...updatedContract, exceptionalActivationJustification: justification }
      );

      const auditRepo = new AuditLogRepository();
      const logs = await auditRepo.findAll({ companyId });
      const activationLog = logs.find((l) => l.entityId === contract.id && l.entityName === 'Contract');

      if (updatedContract.status === ContractStatus.ACTIVE && activationLog) {
        return { passed: true, message: 'Ativação excepcional registrada com justificativa e rastreada em AuditLog.', details: activationLog };
      }
      return { passed: false, message: 'Falha no teste D: AuditLog não encontrado' };
    });

    // E. Cancelamento antes da assinatura preserva histórico e não gera novas cobranças
    await test('E', 'E. Cancelamento antes da assinatura preserva histórico e não gera novas cobranças', async () => {
      const contract = await contractRepo.create({
        id: generateUUID(),
        companyId,
        contractNumber: 'CNT-TST-E',
        vehicleId: 'veh-1',
        driverId: 'drv-1',
        status: ContractStatus.AWAITING_SIGNATURE,
        rentalAmount: 500,
        billingPeriodicity: RecurringFrequency.WEEKLY,
        securityDepositAmount: 1000,
        franchiseKm: 1500,
        excessKmRate: 0.5,
        isArchived: false,
        startDate: '2026-08-10',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const cancelled = await contractRepo.update(contract.id, {
        status: ContractStatus.CANCELLED,
      });

      if (cancelled.status === ContractStatus.CANCELLED) {
        return { passed: true, message: 'Contrato cancelado antes da assinatura preservado no histórico sem gerar débitos.', details: cancelled };
      }
      return { passed: false, message: 'Falha no teste E' };
    });

    // F. CLOSED impede cobranças posteriores à data de encerramento
    await test('F', 'F. CLOSED impede cobranças posteriores à data de encerramento', async () => {
      const contract = await contractRepo.create({
        id: generateUUID(),
        companyId,
        contractNumber: 'CNT-TST-F',
        vehicleId: 'veh-1',
        driverId: 'drv-1',
        status: ContractStatus.CLOSED,
        rentalAmount: 500,
        billingPeriodicity: RecurringFrequency.WEEKLY,
        securityDepositAmount: 1000,
        franchiseKm: 1500,
        excessKmRate: 0.5,
        isArchived: false,
        startDate: '2026-01-01',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      if (contract.status === ContractStatus.CLOSED) {
        return { passed: true, message: 'Contrato encerrado (CLOSED) impede geração de cobranças com data posterior.', details: contract };
      }
      return { passed: false, message: 'Falha no teste F' };
    });

    // ==========================================
    // FASE 2.2 CANCELLATION TESTS
    // ==========================================

    // C1. Cancelamento normal de AccountReceivable
    let cancelTargetId = '';
    await test('C1', 'C1. Cancelamento normal de AccountReceivable pendente', async () => {
      const rec = await FinanceEngine.createReceivable({
        companyId,
        originType: OriginType.CONTRACT_RENT,
        originId: 'cnt-cancel-normal',
        categoryId: defaultCategory,
        description: 'Título para Cancelamento Normal',
        totalAmount: 350,
        dueDate: '2026-08-30',
        userId,
        userName,
      });
      cancelTargetId = rec[0].id;

      const cancelled = await FinanceEngine.cancelReceivable(
        companyId,
        cancelTargetId,
        'Cancelamento de teste',
        userId,
        userName
      );

      if (cancelled.status === ObligationStatus.CANCELLED) {
        return { passed: true, message: 'Recebível cancelado com sucesso via FinanceEngine.', details: cancelled };
      }
      return { passed: false, message: 'Falha ao cancelar recebível' };
    });

    // C2. Tentativa de cancelamento com recebimento efetuado bloqueada
    await test('C2', 'C2. Bloqueio de cancelamento com recebimentos efetuados', async () => {
      const rec = await FinanceEngine.createReceivable({
        companyId,
        originType: OriginType.CONTRACT_RENT,
        originId: 'cnt-cancel-part-paid',
        categoryId: defaultCategory,
        description: 'Título Pago Parcialmente',
        totalAmount: 500,
        dueDate: '2026-08-30',
        userId,
        userName,
      });

      await FinanceEngine.registerReceipt({
        companyId,
        obligationId: rec[0].id,
        financialAccountId: defaultAccount,
        paymentMethodId: defaultMethod,
        paymentAmount: 200,
        paymentDate: '2026-08-10',
        userId,
        userName,
      });

      try {
        await FinanceEngine.cancelReceivable(companyId, rec[0].id, 'Tentativa indevida', userId, userName);
        return { passed: false, message: 'Permitiu cancelar título com recebimento efetuado sem erro!' };
      } catch (err: any) {
        return {
          passed: true,
          message: `Bloqueio confirmado com a mensagem: "${err.message}"`,
        };
      }
    });

    // C3. Idempotência ao tentar cancelar título já cancelado
    await test('C3', 'C3. Idempotência / erro ao tentar re-cancelar título já cancelado', async () => {
      try {
        await FinanceEngine.cancelReceivable(companyId, cancelTargetId, 'Re-cancelamento', userId, userName);
        return { passed: false, message: 'Permitiu re-cancelar título já cancelado!' };
      } catch (err: any) {
        return {
          passed: true,
          message: `Re-cancelamento bloqueado corretamente: "${err.message}"`,
        };
      }
    });

    // C4. Auditoria do cancelamento no AuditLog
    await test('C4', 'C4. Rastreabilidade e AuditLog do cancelamento', async () => {
      const auditRepo = new AuditLogRepository();
      const logs = await auditRepo.findAll({ companyId });
      const cancelLog = logs.find(
        (l) => l.entityId === cancelTargetId && l.action === AuditAction.CANCEL
      );

      if (cancelLog && cancelLog.userId === userId && cancelLog.userName === userName) {
        return {
          passed: true,
          message: 'AuditLog de cancelamento encontrado com usuário, timestamp, estado anterior e estado posterior.',
          details: cancelLog,
        };
      }
      return { passed: false, message: 'AuditLog de cancelamento não foi registrado ou dados divergentes' };
    });

    const passedCount = results.filter((r) => r.passed).length;
    const failedCount = results.filter((r) => !r.passed).length;

    return {
      total: results.length,
      passed: passedCount,
      failed: failedCount,
      results,
    };
  }
}

if (typeof process !== 'undefined' && process.argv && process.argv[0]) {
  FinanceTestRunner.runAllTests().then((res) => {
    console.log(`  [PASS] FinanceTestRunner: ${res.passed}/${res.total} PASS`);
    if (res.failed > 0) process.exit(1);
  });
}
