// AutoERP FIN-WAVE-5 - Consolidação Final do Motor Financeiro e Integrações Operacionais
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
import { ContractService } from '../../services/ContractService';
import { MaintenanceService } from '../../services/MaintenanceService';
import { TrafficTicketService } from '../../services/TrafficTicketService';
import {
  ObligationStatus,
  OriginType,
  FinancialAccountType,
  FinancialPeriodStatus,
  RecurringFrequency,
  TicketResponsibility,
  TicketStatus,
  AccountingRegime,
  VehicleStatus,
  DriverStatus,
  ContractStatus,
} from '../../../types/enums';
import {
  FinancialAccountRepository,
  FinancialPeriodRepository,
  AccountPayableRepository,
  AccountReceivableRepository,
  VehicleRepository,
  DriverRepository,
  ContractRepository,
  TrackerRepository,
  RecurringRuleRepository,
  TrafficTicketRepository,
  WorkOrderRepository,
} from '../../../persistence/repositories/localRepositories';
import { StorageAdapter } from '../../../persistence/adapters/storageAdapter';
import { generateUUID } from '../../../shared/utils/uuid';

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

export async function runWave5Verification() {
  console.log('====================================================');
  console.log('STARTING FIN-WAVE-5 VERIFICATION SUITE (25 E2E FLOWS)');
  console.log('====================================================\n');

  await seedAutoERPTestData(true);

  const accountRepo = new FinancialAccountRepository();
  const periodRepo = new FinancialPeriodRepository();
  const payableRepo = new AccountPayableRepository();
  const receivableRepo = new AccountReceivableRepository();
  const vehicleRepo = new VehicleRepository();
  const driverRepo = new DriverRepository();
  const contractRepo = new ContractRepository();
  const trackerRepo = new TrackerRepository();
  const ruleRepo = new RecurringRuleRepository();
  const ticketRepo = new TrafficTicketRepository();
  const workOrderRepo = new WorkOrderRepository();

  const contractService = new ContractService();
  const ticketService = new TrafficTicketService();

  const results: { id: string; passed: boolean; message: string }[] = [];

  const test = async (id: string, name: string, fn: () => Promise<void>) => {
    try {
      await fn();
      results.push({ id, passed: true, message: `[PASS] ${id}: ${name}` });
      console.log(`  [PASS] ${id}: ${name}`);
    } catch (err: any) {
      results.push({ id, passed: false, message: `[FAIL] ${id}: ${name} -> ${err.message}` });
      console.error(`  [FAIL] ${id}: ${name} -> ${err.stack || err.message}`);
    }
  };

  // Helper to quickly setup a Company environment
  const setupCompanyEnv = async (companyId: string, balance = 10000) => {
    await registerUser(`usr-admin-${companyId}`, companyId, 'ADMIN');
    await registerUser(`usr-viewer-${companyId}`, companyId, 'FINANCIAL_VIEWER');

    const acc = await accountRepo.create({
      id: `acc-${companyId}`,
      companyId,
      name: `Conta Corrente ${companyId}`,
      type: FinancialAccountType.BANK,
      initialBalance: balance,
      currentBalance: balance,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await periodRepo.create({
      id: `per-${companyId}`,
      companyId,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      status: FinancialPeriodStatus.OPEN,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return { accountId: acc.id, userId: `usr-admin-${companyId}` };
  };

  // Helper to create basic vehicle and driver
  const createVehAndDriver = async (companyId: string, idSuffix: string) => {
    const veh = await vehicleRepo.create({
      id: `veh-${companyId}-${idSuffix}`,
      companyId,
      plate: `E2E${Math.floor(1000 + Math.random() * 9000)}`,
      brand: 'Chevrolet',
      model: 'Onix 1.0 Flex',
      yearFabrication: 2023,
      yearModel: 2024,
      color: 'Branco',
      renavam: `ren-${companyId}-${idSuffix}`,
      chassis: `cha-${companyId}-${idSuffix}`,
      currentKm: 10000,
      fuelType: 'Flex',
      category: 'Hatch',
      acquisitionValue: 70000,
      currentValue: 66000,
      rentalValueBase: 750,
      status: VehicleStatus.AVAILABLE,
      isArchived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const drv = await driverRepo.create({
      id: `drv-${companyId}-${idSuffix}`,
      companyId,
      fullName: `Motorista E2E ${idSuffix}`,
      cpf: `cpf-${companyId}-${idSuffix}`,
      rg: `rg-${companyId}-${idSuffix}`,
      birthDate: '1990-05-15',
      phone: '11999999999',
      whatsapp: '11999999999',
      email: `drv-${idSuffix}@email.com`,
      address: {
        street: 'Av Paulista',
        number: '1000',
        neighborhood: 'Bela Vista',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '01310-100',
      },
      cnhNumber: `cnh-${idSuffix}`,
      cnhCategory: 'B',
      cnhExpiration: '2030-12-31',
      cnhStatus: 'VALID' as any,
      appPlatforms: [],
      status: DriverStatus.ACTIVE,
      isArchived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return { vehicleId: veh.id, driverId: drv.id };
  };

  // =========================================================================
  // E2E-01: Contrato ACTIVE → cobrança → recebimento → caixa
  // =========================================================================
  await test('E2E-01', 'Contrato ACTIVE → cobrança → recebimento → caixa', async () => {
    const companyId = 'comp-e2e-01';
    const { accountId, userId } = await setupCompanyEnv(companyId, 5000);
    const { vehicleId, driverId } = await createVehAndDriver(companyId, '1');

    const contract = await contractService.createContract({
      companyId,
      vehicleId,
      driverId,
      startDate: '2026-08-01',
      rentalAmount: 1000,
      billingPeriodicity: RecurringFrequency.MONTHLY,
      securityDepositAmount: 1500,
      status: ContractStatus.ACTIVE,
      userId,
      userName: 'Admin',
    });

    // Check that active contract created a RecurringRule and initial Receivable
    const rules = await ruleRepo.findAll({ companyId });
    const contractRule = rules.find((r) => r.originId === contract.id);
    if (!contractRule) throw new Error('Falhou em criar regra de recorrência!');

    const recs = await receivableRepo.findByContractId(contract.id);
    if (recs.length !== 1) throw new Error('Não gerou cobrança inicial!');
    const rec = recs[0];
    if (rec.originalAmount !== 1000 || rec.status !== ObligationStatus.PENDING) {
      throw new Error('Parâmetros da cobrança inicial incorretos');
    }

    // Register receipt of full rent
    await FinanceEngine.registerReceipt({
      companyId,
      obligationId: rec.id,
      financialAccountId: accountId,
      paymentMethodId: 'pm-pix',
      paymentAmount: 1000,
      paymentDate: '2026-08-05',
      userId,
      userName: 'Admin',
    });

    // Verify account balance
    const updatedAcc = await accountRepo.findById(accountId);
    if (!updatedAcc || updatedAcc.currentBalance !== 6000) {
      throw new Error(`Saldo incorreto: esperado 6000, obtido ${updatedAcc?.currentBalance}`);
    }

    // Verify reports
    const cashFlow = await FinanceEngine.getCashFlowReport(companyId, '2026-08-01', '2026-08-31');
    if (cashFlow.totalRealizedIncomes !== 1000 || cashFlow.finalRealizedCashBalance !== 6000) {
      throw new Error('Fluxo de caixa incorreto no E2E-01');
    }

    const dre = await FinanceEngine.getDREReport(companyId, '2026-08-01', '2026-08-31', AccountingRegime.CASH);
    if (dre.grossRevenue.amount !== 1000) {
      throw new Error('DRE incorreto no E2E-01');
    }

    const profit = await FinanceEngine.getVehicleProfitability(companyId, vehicleId, '2026-08-01', '2026-08-31', AccountingRegime.CASH);
    if (profit.rentalIncome !== 1000 || profit.totalIncome !== 1000 || profit.netProfit !== 1000) {
      throw new Error('Rentabilidade do veículo incorreta no E2E-01');
    }
  });

  // =========================================================================
  // E2E-02: Contrato semanal → múltiplas competências → sem duplicidade
  // =========================================================================
  await test('E2E-02', 'Contrato semanal → múltiplas competências → sem duplicidade', async () => {
    const companyId = 'comp-e2e-02';
    const { userId } = await setupCompanyEnv(companyId, 1000);
    const { vehicleId, driverId } = await createVehAndDriver(companyId, '2');

    const contract = await contractService.createContract({
      companyId,
      vehicleId,
      driverId,
      startDate: '2026-08-01',
      rentalAmount: 250,
      billingPeriodicity: RecurringFrequency.WEEKLY,
      securityDepositAmount: 0,
      status: ContractStatus.ACTIVE,
      userId,
      userName: 'Admin',
    });

    // Trigger process Contract Recurring for same week (idempotency check)
    await contractService.processContractRecurring(contract.id, '2026-08-08', userId, 'Admin');
    await contractService.processContractRecurring(contract.id, '2026-08-08', userId, 'Admin');

    const recs = await receivableRepo.findByContractId(contract.id);
    // Should have 2: 1 initial (from start contract) + 1 for 2026-08-08
    if (recs.length !== 2) {
      throw new Error(`Quantidade de recebíveis incorreta: esperado 2, obtido ${recs.length}`);
    }

    // Process for another week
    await contractService.processContractRecurring(contract.id, '2026-08-15', userId, 'Admin');
    const recs2 = await receivableRepo.findByContractId(contract.id);
    if (recs2.length !== 3) {
      throw new Error(`Quantidade de recebíveis incorreta após semana 2: esperado 3, obtido ${recs2.length}`);
    }
  });

  // =========================================================================
  // E2E-03: Aluguel vencido → juros/multa → pagamento
  // =========================================================================
  await test('E2E-03', 'Aluguel vencido → juros/multa → pagamento', async () => {
    const companyId = 'comp-e2e-03';
    const { accountId, userId } = await setupCompanyEnv(companyId, 5000);
    const { vehicleId, driverId } = await createVehAndDriver(companyId, '3');

    const rec = await receivableRepo.create({
      id: 'rec-e2e-03',
      companyId,
      originType: OriginType.CONTRACT_RENT,
      originId: 'cnt-03',
      vehicleId,
      driverId,
      categoryId: 'cat-rent-inc',
      description: 'Aluguel Vencido',
      originalAmount: 1000,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 1000,
      paidAmount: 0,
      balanceAmount: 1000,
      dueDate: '2026-08-10',
      competenceDate: '2026-08-01',
      status: ObligationStatus.PENDING,
      idempotencyKey: 'key-e2e-03',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Run Overdue processor on 2026-08-20 (10 days overdue)
    await FinanceEngine.processOverdueReceivables(companyId, '2026-08-20', userId, 'Admin', 0, 2.0, 0.033);

    const updatedRec = await receivableRepo.findById(rec.id);
    if (!updatedRec || updatedRec.status !== ObligationStatus.OVERDUE) {
      throw new Error('Falhou em mudar status para OVERDUE!');
    }

    // 2% fine = 20, 10 days interest = 10 * 0.33 = 3.30 (approx 3.30)
    if (updatedRec.fineAmount !== 20 || updatedRec.interestAmount !== 3.30) {
      throw new Error(`Juros ou multa incorretos: multa ${updatedRec.fineAmount}, juros ${updatedRec.interestAmount}`);
    }

    const finalSum = 1000 + 20 + 3.3;
    if (updatedRec.updatedAmount !== finalSum) {
      throw new Error(`Valor total updated incorreto: esperado ${finalSum}, obtido ${updatedRec.updatedAmount}`);
    }

    // Pay full amount
    await FinanceEngine.registerReceipt({
      companyId,
      obligationId: updatedRec.id,
      financialAccountId: accountId,
      paymentMethodId: 'pm-pix',
      paymentAmount: finalSum,
      paymentDate: '2026-08-21',
      userId,
      userName: 'Admin',
    });

    const finalRec = await receivableRepo.findById(rec.id);
    if (!finalRec || finalRec.status !== ObligationStatus.PAID || finalRec.balanceAmount !== 0) {
      throw new Error('Falhou em liquidar título vencido com juros e multa');
    }
  });

  // =========================================================================
  // E2E-04: Pagamento parcial → saldo restante correto
  // =========================================================================
  await test('E2E-04', 'Pagamento parcial → saldo restante correto', async () => {
    const companyId = 'comp-e2e-04';
    const { accountId, userId } = await setupCompanyEnv(companyId, 5000);

    const rec = await receivableRepo.create({
      id: 'rec-e2e-04',
      companyId,
      originType: OriginType.CONTRACT_RENT,
      originId: 'cnt-04',
      categoryId: 'cat-rent-inc',
      description: 'Aluguel Parcial',
      originalAmount: 1000,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 1000,
      paidAmount: 0,
      balanceAmount: 1000,
      dueDate: '2026-08-25',
      competenceDate: '2026-08-01',
      status: ObligationStatus.PENDING,
      idempotencyKey: 'key-e2e-04',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await FinanceEngine.registerReceipt({
      companyId,
      obligationId: rec.id,
      financialAccountId: accountId,
      paymentMethodId: 'pm-pix',
      paymentAmount: 400,
      paymentDate: '2026-08-25',
      userId,
      userName: 'Admin',
    });

    const updated = await receivableRepo.findById(rec.id);
    if (!updated || updated.status !== ObligationStatus.PARTIALLY_PAID || updated.paidAmount !== 400 || updated.balanceAmount !== 600) {
      throw new Error('Dados de pagamento parcial incorretos');
    }
  });

  // =========================================================================
  // E2E-05: IPVA → payable → pagamento → despesa do veículo
  // =========================================================================
  await test('E2E-05', 'IPVA → payable → pagamento → despesa do veículo', async () => {
    const companyId = 'comp-e2e-05';
    const { accountId, userId } = await setupCompanyEnv(companyId, 10000);
    const { vehicleId } = await createVehAndDriver(companyId, '5');

    const payables = await FinanceEngine.createPayable({
      companyId,
      originType: OriginType.DOCUMENTATION,
      originId: 'ipva-05',
      vehicleId,
      categoryId: 'cat-doc-exp',
      description: 'IPVA Onix 2026',
      totalAmount: 1200,
      dueDate: '2026-08-20',
      competenceDate: '2026-08-01',
      userId,
      userName: 'Admin',
    });

    if (payables.length !== 1) throw new Error('Não gerou payable do IPVA');
    const pay = payables[0];

    // Pay it
    await FinanceEngine.registerPayment({
      companyId,
      obligationId: pay.id,
      financialAccountId: accountId,
      paymentMethodId: 'pm-pix',
      paymentAmount: 1200,
      paymentDate: '2026-08-20',
      userId,
      userName: 'Admin',
    });

    // Check vehicle profitability
    const profit = await FinanceEngine.getVehicleProfitability(companyId, vehicleId, '2026-08-01', '2026-08-31', AccountingRegime.CASH);
    if (profit.documentationExpense !== 1200 || profit.totalExpense !== 1200 || profit.netProfit !== -1200) {
      throw new Error(`Profitability do IPVA incorreta: doc expense ${profit.documentationExpense}`);
    }
  });

  // =========================================================================
  // E2E-06: Seguro → payable → pagamento
  // =========================================================================
  await test('E2E-06', 'Seguro → payable → pagamento', async () => {
    const companyId = 'comp-e2e-06';
    const { accountId, userId } = await setupCompanyEnv(companyId, 5000);
    const { vehicleId } = await createVehAndDriver(companyId, '6');

    const payables = await FinanceEngine.createPayable({
      companyId,
      originType: OriginType.INSURANCE,
      originId: 'seg-06',
      vehicleId,
      categoryId: 'cat-ins-exp',
      description: 'Seguro Porto Seguro Onix',
      totalAmount: 600,
      dueDate: '2026-08-20',
      competenceDate: '2026-08-01',
      userId,
      userName: 'Admin',
    });

    await FinanceEngine.registerPayment({
      companyId,
      obligationId: payables[0].id,
      financialAccountId: accountId,
      paymentMethodId: 'pm-pix',
      paymentAmount: 600,
      paymentDate: '2026-08-20',
      userId,
      userName: 'Admin',
    });

    const profit = await FinanceEngine.getVehicleProfitability(companyId, vehicleId, '2026-08-01', '2026-08-31', AccountingRegime.CASH);
    if (profit.insuranceExpense !== 600) {
      throw new Error(`Despesa de seguro incorreta na rentabilidade: ${profit.insuranceExpense}`);
    }
  });

  // =========================================================================
  // E2E-07: Tracker → recorrência → payable → pagamento
  // =========================================================================
  await test('E2E-07', 'Tracker → recorrência → payable → pagamento', async () => {
    const companyId = 'comp-e2e-07';
    const { accountId, userId } = await setupCompanyEnv(companyId, 5000);
    const { vehicleId } = await createVehAndDriver(companyId, '7');

    const tracker = await trackerRepo.create({
      id: 'trk-e2e-07',
      companyId,
      vehicleId,
      equipmentModel: 'SASCAR T1',
      imei: '123456789012345',
      chipCarrier: 'VIVO',
      chipNumber: '5511999999999',
      status: 'ACTIVE',
      monthlyCost: 50,
      installationDate: '2026-08-01',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Create a RecurringRule for tracker billing
    await ruleRepo.create({
      id: 'rule-trk-07',
      companyId,
      originType: OriginType.TRACKER,
      originId: tracker.id,
      description: 'Mensalidade Rastreador SASCAR',
      amount: 50,
      frequency: RecurringFrequency.MONTHLY,
      startDate: '2026-08-01',
      nextGenerationDate: '2026-08-01',
      categoryId: 'cat-track-exp',
      vehicleId,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Execute recurring process
    await FinanceEngine.processRecurringRules({
      companyId,
      processingDate: '2026-08-05',
      userId,
      userName: 'Admin',
    });

    const trackerPayables = await payableRepo.findAll({ companyId });
    const pay = trackerPayables.find((p) => p.originId === tracker.id);
    if (!pay || pay.originalAmount !== 50) {
      throw new Error('Não gerou conta a pagar para o rastreador recorrente');
    }

    // Pay tracker expense
    await FinanceEngine.registerPayment({
      companyId,
      obligationId: pay.id,
      financialAccountId: accountId,
      paymentMethodId: 'pm-pix',
      paymentAmount: 50,
      paymentDate: '2026-08-10',
      userId,
      userName: 'Admin',
    });

    const profit = await FinanceEngine.getVehicleProfitability(companyId, vehicleId, '2026-08-01', '2026-08-31', AccountingRegime.CASH);
    if (profit.trackerExpense !== 50) {
      throw new Error(`Mensalidade do rastreador incorreta na rentabilidade: ${profit.trackerExpense}`);
    }
  });

  // =========================================================================
  // E2E-08: Manutenção → payable → pagamento
  // =========================================================================
  await test('E2E-08', 'Manutenção → payable → pagamento', async () => {
    const companyId = 'comp-e2e-08';
    const { accountId, userId } = await setupCompanyEnv(companyId, 10000);
    const { vehicleId } = await createVehAndDriver(companyId, '8');

    // Create WorkOrder
    const wo = await MaintenanceService.createWorkOrder({
      companyId,
      number: 'OS-08',
      vehicleId,
      entryKm: 12000,
      description: 'Revisão e Troca de Freios',
      parts: [{ description: 'Pastilhas de freio', quantity: 1, unitCost: 150 }],
      services: [{ description: 'Mão de obra troca', quantity: 1, unitCost: 300 }],
      userId,
      userName: 'Admin',
    });

    await MaintenanceService.startWorkOrder(wo.id, userId, 'Admin');

    const comp = await MaintenanceService.completeWorkOrder({
      workOrderId: wo.id,
      exitKm: 12050,
      categoryId: 'cat-maint-exp',
      dueDate: '2026-08-25',
      userId,
      userName: 'Admin',
    });

    if (!comp.accountPayableId) throw new Error('OS concluída não vinculou AccountPayableId!');

    const pay = await payableRepo.findById(comp.accountPayableId);
    if (!pay || pay.originalAmount !== 450) {
      throw new Error('Conta a pagar gerada pela manutenção está inválida');
    }

    // Register payment
    await FinanceEngine.registerPayment({
      companyId,
      obligationId: pay.id,
      financialAccountId: accountId,
      paymentMethodId: 'pm-pix',
      paymentAmount: 450,
      paymentDate: '2026-08-25',
      userId,
      userName: 'Admin',
    });

    const profit = await FinanceEngine.getVehicleProfitability(companyId, vehicleId, '2026-08-01', '2026-08-31', AccountingRegime.CASH);
    if (profit.maintenanceExpense !== 450) {
      throw new Error(`Custo de manutenção incorreto na rentabilidade: ${profit.maintenanceExpense}`);
    }
  });

  // =========================================================================
  // E2E-09: Multa motorista → receivable
  // =========================================================================
  await test('E2E-09', 'Multa motorista → receivable', async () => {
    const companyId = 'comp-e2e-09';
    const { userId } = await setupCompanyEnv(companyId);
    const { vehicleId, driverId } = await createVehAndDriver(companyId, '9');

    const ticket = await ticketService.createTicket({
      companyId,
      vehicleId,
      driverId,
      autoNumber: 'MDRV009',
      infractionCode: '5010',
      description: 'Excesso de velocidade',
      infractionDate: '2026-08-05',
      dueDate: '2026-08-25',
      originalAmount: 130.16,
      responsibility: TicketResponsibility.DRIVER,
    }, userId, 'Admin');

    if (!ticket.receivableId || ticket.status !== TicketStatus.CHARGED_DRIVER) {
      throw new Error('Falhou em gerar cobrança financeira do condutor para a multa!');
    }

    const rec = await receivableRepo.findById(ticket.receivableId);
    if (!rec || rec.originalAmount !== 130.16 || rec.driverId !== driverId) {
      throw new Error('Conta a receber da multa do condutor está inválida!');
    }
  });

  // =========================================================================
  // E2E-10: Multa empresa/veículo → payable
  // =========================================================================
  await test('E2E-10', 'Multa empresa/veículo → payable', async () => {
    const companyId = 'comp-e2e-10';
    const { userId } = await setupCompanyEnv(companyId);
    const { vehicleId } = await createVehAndDriver(companyId, '10');

    const ticket = await ticketService.createTicket({
      companyId,
      vehicleId,
      autoNumber: 'MCOMP10',
      infractionCode: '6010',
      description: 'Avanço de sinal vermelho',
      infractionDate: '2026-08-05',
      dueDate: '2026-08-25',
      originalAmount: 293.47,
      responsibility: TicketResponsibility.COMPANY,
    }, userId, 'Admin');

    if (!ticket.payableId || ticket.status !== TicketStatus.PAID_BY_COMPANY) {
      throw new Error('Falhou em gerar obrigação de pagar da multa de empresa!');
    }

    const pay = await payableRepo.findById(ticket.payableId);
    if (!pay || pay.originalAmount !== 293.47 || pay.vehicleId !== vehicleId) {
      throw new Error('Conta a pagar de multa de empresa está inválida!');
    }
  });

  // =========================================================================
  // E2E-11: NIC → payable separado
  // =========================================================================
  await test('E2E-11', 'NIC → payable separado', async () => {
    const companyId = 'comp-e2e-11';
    const { userId } = await setupCompanyEnv(companyId);
    const { vehicleId } = await createVehAndDriver(companyId, '11');

    // Create a ticket with unidentified driver
    const ticket = await ticketService.createTicket({
      companyId,
      vehicleId,
      autoNumber: 'MNIC11',
      infractionCode: '7010',
      description: 'Parada em local proibido',
      infractionDate: '2026-08-05',
      dueDate: '2026-08-25',
      originalAmount: 195.23,
      responsibility: TicketResponsibility.UNIDENTIFIED,
    }, userId, 'Admin');

    if (ticket.status !== TicketStatus.PENDING_IDENTIFICATION) {
      throw new Error('Sinalização de status de identificação incorreta');
    }

    // Process NIC
    const updatedTicket = await ticketService.processNICPenalty(ticket.id, 195.23, userId, 'Admin');
    if (!updatedTicket.nicPayableId) {
      throw new Error('Processamento NIC falhou em criar nicPayableId');
    }

    const nicPay = await payableRepo.findById(updatedTicket.nicPayableId);
    if (!nicPay || nicPay.originalAmount !== 195.23) {
      throw new Error('Conta a pagar da penalidade NIC está inválida!');
    }
  });

  // =========================================================================
  // E2E-12: Caução → recebimento → compensação
  // =========================================================================
  await test('E2E-12', 'Caução → recebimento → compensação', async () => {
    const companyId = 'comp-e2e-12';
    const { accountId, userId } = await setupCompanyEnv(companyId, 5000);
    const { vehicleId, driverId } = await createVehAndDriver(companyId, '12');

    const depositObj = await FinanceEngine.receiveSecurityDeposit(
      companyId,
      'cnt-e2e-12',
      driverId,
      vehicleId,
      1500,
      accountId,
      'pm-pix',
      userId,
      'Admin'
    );

    const rec = await receivableRepo.create({
      id: 'rec-e2e-12',
      companyId,
      originType: OriginType.CONTRACT_RENT,
      originId: 'cnt-e2e-12',
      categoryId: 'cat-rent-inc',
      description: 'Aluguel Compensável',
      originalAmount: 500,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 500,
      paidAmount: 0,
      balanceAmount: 500,
      dueDate: '2026-08-20',
      competenceDate: '2026-08-01',
      status: ObligationStatus.PENDING,
      idempotencyKey: 'key-e2e-12',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Compensate deposit
    await FinanceEngine.compensateSecurityDeposit(
      companyId,
      depositObj.deposit.id,
      500,
      rec.id,
      'Compensação de aluguel pendente',
      userId,
      'Admin'
    );

    const updatedRec = await receivableRepo.findById(rec.id);
    if (!updatedRec || updatedRec.status !== ObligationStatus.PAID || updatedRec.balanceAmount !== 0) {
      throw new Error('Falhou em baixar recebível via compensação de caução');
    }

    const updatedAcc = await accountRepo.findById(accountId);
    // Receipt of 1500 makes balance 6500. Compensation of 500 should NOT alter bank cash balance (remain 6500)
    if (!updatedAcc || updatedAcc.currentBalance !== 6500) {
      throw new Error(`Saldo bancário incorreto após compensação: esperado 6500, obtido ${updatedAcc?.currentBalance}`);
    }
  });

  // =========================================================================
  // E2E-13: Caução → devolução
  // =========================================================================
  await test('E2E-13', 'Caução → devolução', async () => {
    const companyId = 'comp-e2e-13';
    const { accountId, userId } = await setupCompanyEnv(companyId, 5000);
    const { vehicleId, driverId } = await createVehAndDriver(companyId, '13');

    const depositObj = await FinanceEngine.receiveSecurityDeposit(
      companyId,
      'cnt-e2e-13',
      driverId,
      vehicleId,
      1000,
      accountId,
      'pm-pix',
      userId,
      'Admin'
    );

    // Return deposit
    await FinanceEngine.returnSecurityDeposit(
      companyId,
      depositObj.deposit.id,
      1000,
      accountId,
      'pm-pix',
      'Devolução integral da caução',
      userId,
      'Admin'
    );

    const updatedAcc = await accountRepo.findById(accountId);
    // Receive 1000 PJ -> 6000. Return 1000 -> 5000.
    if (!updatedAcc || updatedAcc.currentBalance !== 5000) {
      throw new Error(`Saldo bancário incorreto após devolução: esperado 5000, obtido ${updatedAcc?.currentBalance}`);
    }

    const profit = await FinanceEngine.getVehicleProfitability(companyId, vehicleId, '2026-08-01', '2026-08-31', AccountingRegime.CASH);
    // Returned security deposit must NOT act as operational revenue/expense
    if (profit.totalIncome !== 0 || profit.totalExpense !== 0) {
      throw new Error(`Caução indevidamente listada como receita/despesa na rentabilidade do veículo!`);
    }
  });

  // =========================================================================
  // E2E-14: Transferência entre contas → zero receita/despesa
  // =========================================================================
  await test('E2E-14', 'Transferência entre contas → zero receita/despesa', async () => {
    const companyId = 'comp-e2e-14';
    const { userId } = await setupCompanyEnv(companyId, 10000);

    const acc2 = await accountRepo.create({
      id: `acc-dest-e2e-14`,
      companyId,
      name: `Conta Corrente 2`,
      type: FinancialAccountType.BANK,
      initialBalance: 0,
      currentBalance: 0,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await FinanceEngine.transferFunds({
      companyId,
      sourceAccountId: `acc-${companyId}`,
      destinationAccountId: acc2.id,
      amount: 4000,
      transferDate: '2026-08-10',
      paymentMethodId: 'pm-pix',
      description: 'Transferência de saldo interna',
      userId,
      userName: 'Admin',
    });

    const originAcc = await accountRepo.findById(`acc-${companyId}`);
    const destAcc = await accountRepo.findById(acc2.id);

    if (originAcc?.currentBalance !== 6000 || destAcc?.currentBalance !== 4000) {
      throw new Error(`Transferência falhou nos saldos: orig ${originAcc?.currentBalance}, dest ${destAcc?.currentBalance}`);
    }

    const dre = await FinanceEngine.getDREReport(companyId, '2026-08-01', '2026-08-31', AccountingRegime.CASH);
    if (dre.grossRevenue.amount !== 0 || dre.directCosts.amount !== 0) {
      throw new Error('Transferência entre contas inflou DRE operacional!');
    }
  });

  // =========================================================================
  // E2E-15: Estorno parcial
  // =========================================================================
  await test('E2E-15', 'Estorno parcial', async () => {
    const companyId = 'comp-e2e-15';
    const { accountId, userId } = await setupCompanyEnv(companyId, 5000);

    const rec = await receivableRepo.create({
      id: 'rec-e2e-15',
      companyId,
      originType: OriginType.CONTRACT_RENT,
      originId: 'cnt-15',
      categoryId: 'cat-rent-inc',
      description: 'Aluguel estornável',
      originalAmount: 1000,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 1000,
      paidAmount: 0,
      balanceAmount: 1000,
      dueDate: '2026-08-15',
      competenceDate: '2026-08-01',
      status: ObligationStatus.PENDING,
      idempotencyKey: 'key-e2e-15',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const res = await FinanceEngine.registerReceipt({
      companyId,
      obligationId: rec.id,
      financialAccountId: accountId,
      paymentMethodId: 'pm-pix',
      paymentAmount: 1000,
      paymentDate: '2026-08-15',
      userId,
      userName: 'Admin',
    });

    // Partial reversal
    await FinanceEngine.reverseTransaction(
      companyId,
      res.transaction.id,
      300,
      'Estorno parcial do aluguel',
      userId,
      'Admin'
    );

    const updatedRec = await receivableRepo.findById(rec.id);
    if (!updatedRec || updatedRec.status !== ObligationStatus.PARTIALLY_PAID || updatedRec.paidAmount !== 700 || updatedRec.balanceAmount !== 300) {
      throw new Error('Parâmetros do estorno parcial incorretos');
    }

    const updatedAcc = await accountRepo.findById(accountId);
    // 5000 + 1000 - 300 = 5700
    if (!updatedAcc || updatedAcc.currentBalance !== 5700) {
      throw new Error(`Saldo incorreto após estorno parcial: esperado 5700, obtido ${updatedAcc?.currentBalance}`);
    }
  });

  // =========================================================================
  // E2E-16: Estorno total
  // =========================================================================
  await test('E2E-16', 'Estorno total', async () => {
    const companyId = 'comp-e2e-16';
    const { accountId, userId } = await setupCompanyEnv(companyId, 5000);

    const rec = await receivableRepo.create({
      id: 'rec-e2e-16',
      companyId,
      originType: OriginType.CONTRACT_RENT,
      originId: 'cnt-16',
      categoryId: 'cat-rent-inc',
      description: 'Aluguel estornável total',
      originalAmount: 1000,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 1000,
      paidAmount: 0,
      balanceAmount: 1000,
      dueDate: '2026-08-15',
      competenceDate: '2026-08-01',
      status: ObligationStatus.PENDING,
      idempotencyKey: 'key-e2e-16',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const res = await FinanceEngine.registerReceipt({
      companyId,
      obligationId: rec.id,
      financialAccountId: accountId,
      paymentMethodId: 'pm-pix',
      paymentAmount: 1000,
      paymentDate: '2026-08-15',
      userId,
      userName: 'Admin',
    });

    // Total reversal
    await FinanceEngine.reverseTransaction(
      companyId,
      res.transaction.id,
      1000,
      'Estorno completo do aluguel',
      userId,
      'Admin'
    );

    const updatedRec = await receivableRepo.findById(rec.id);
    if (!updatedRec || updatedRec.status !== ObligationStatus.PENDING || updatedRec.paidAmount !== 0 || updatedRec.balanceAmount !== 1000) {
      throw new Error(`Status de estorno total incorreto: ${updatedRec?.status}`);
    }

    const updatedAcc = await accountRepo.findById(accountId);
    if (!updatedAcc || updatedAcc.currentBalance !== 5000) {
      throw new Error(`Saldo incorreto após estorno total: esperado 5000, obtido ${updatedAcc?.currentBalance}`);
    }
  });

  // =========================================================================
  // E2E-17: Renegociação de dívida
  // =========================================================================
  await test('E2E-17', 'Renegociação de dívida', async () => {
    const companyId = 'comp-e2e-17';
    const { userId } = await setupCompanyEnv(companyId);

    const rec1 = await receivableRepo.create({
      id: 'rec-e2e-17-a',
      companyId,
      originType: OriginType.CONTRACT_RENT,
      originId: 'cnt-17',
      categoryId: 'cat-rent-inc',
      description: 'Parcela 1 atrasada',
      originalAmount: 500,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 500,
      paidAmount: 0,
      balanceAmount: 500,
      dueDate: '2026-08-05',
      competenceDate: '2026-08-01',
      status: ObligationStatus.PENDING,
      idempotencyKey: 'key-e2e-17-a',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const rec2 = await receivableRepo.create({
      id: 'rec-e2e-17-b',
      companyId,
      originType: OriginType.CONTRACT_RENT,
      originId: 'cnt-17',
      categoryId: 'cat-rent-inc',
      description: 'Parcela 2 atrasada',
      originalAmount: 500,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 500,
      paidAmount: 0,
      balanceAmount: 500,
      dueDate: '2026-08-12',
      competenceDate: '2026-08-01',
      status: ObligationStatus.PENDING,
      idempotencyKey: 'key-e2e-17-b',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await FinanceEngine.renegociate({
      companyId,
      obligationIds: [rec1.id, rec2.id],
      type: 'RECEIVABLE',
      newTotalAmount: 1100, // total $1100 with small renegotiation penalty/adjustment
      installmentsCount: 2,
      firstDueDate: '2026-08-25',
      categoryId: 'cat-rent-inc',
      description: 'Renegociação de aluguel',
      userId,
      userName: 'Admin',
    });

    const r1 = await receivableRepo.findById(rec1.id);
    const r2 = await receivableRepo.findById(rec2.id);

    if (r1?.status !== ObligationStatus.CANCELLED || r2?.status !== ObligationStatus.CANCELLED) {
      throw new Error('Contas a receber originais não foram marcadas como CANCELLED');
    }

    const allRecs = await receivableRepo.findAll({ companyId });
    const newRecs = allRecs.filter((r) => r.originType === OriginType.RENEGOTIATION);
    if (newRecs.length !== 2 || newRecs[0].originalAmount !== 550) {
      throw new Error('Falhou em criar novas parcelas renegociadas');
    }
  });

  // =========================================================================
  // E2E-18: Período fechado bloqueia operação retroativa
  // =========================================================================
  await test('E2E-18', 'Período fechado bloqueia operação retroativa', async () => {
    const companyId = 'comp-e2e-18';
    const { userId } = await setupCompanyEnv(companyId);

    const rec = await receivableRepo.create({
      id: 'rec-e2e-18',
      companyId,
      originType: OriginType.CONTRACT_RENT,
      originId: 'cnt-18',
      categoryId: 'cat-rent-inc',
      description: 'Aluguel retroativo bloqueado',
      originalAmount: 1000,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 1000,
      paidAmount: 0,
      balanceAmount: 1000,
      dueDate: '2026-08-15',
      competenceDate: '2026-08-01',
      status: ObligationStatus.PENDING,
      idempotencyKey: 'key-e2e-18',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Close the financial period
    await FinanceEngine.closeFinancialPeriod({
      companyId,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      userId,
      userName: 'Admin',
    });

    // Try to register a receipt on this period's date - should block
    let blocked = false;
    try {
      await FinanceEngine.registerReceipt({
        companyId,
        obligationId: rec.id,
        financialAccountId: `acc-${companyId}`,
        paymentMethodId: 'pm-pix',
        paymentAmount: 1000,
        paymentDate: '2026-08-15', // retro date inside closed period
        userId,
        userName: 'Admin',
      });
    } catch {
      blocked = true;
    }

    if (!blocked) {
      throw new Error('Permitiu faturamento/recebimento retroativo em período fechado!');
    }
  });

  // =========================================================================
  // E2E-19: Cross-tenant bloqueado
  // =========================================================================
  await test('E2E-19', 'Cross-tenant bloqueado', async () => {
    const companyA = 'comp-e2e-19-a';
    const companyB = 'comp-e2e-19-b';

    await setupCompanyEnv(companyA);
    const { accountId: accountBId, userId: userBId } = await setupCompanyEnv(companyB);

    const recA = await receivableRepo.create({
      id: 'rec-e2e-19-a',
      companyId: companyA,
      originType: OriginType.CONTRACT_RENT,
      originId: 'cnt-19',
      categoryId: 'cat-rent-inc',
      description: 'Recebível Tenant A',
      originalAmount: 1000,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 1000,
      paidAmount: 0,
      balanceAmount: 1000,
      dueDate: '2026-08-15',
      competenceDate: '2026-08-10',
      status: ObligationStatus.PENDING,
      idempotencyKey: 'key-e2e-19-a',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    let crossBlocked = false;
    try {
      // Settle Tenant A receivable using Tenant B account or context
      await FinanceEngine.registerReceipt({
        companyId: companyB, // Cross-tenant target
        obligationId: recA.id,
        financialAccountId: accountBId,
        paymentMethodId: 'pm-pix',
        paymentAmount: 1000,
        paymentDate: '2026-08-15',
        userId: userBId,
        userName: 'Admin B',
      });
    } catch {
      crossBlocked = true;
    }

    if (!crossBlocked) {
      throw new Error('Falhou isolamento de Tenant: permitiu liquidação cross-tenant!');
    }
  });

  // =========================================================================
  // E2E-20: Usuário sem permissão bloqueado antes da escrita
  // =========================================================================
  await test('E2E-20', 'Usuário sem permissão bloqueado antes da escrita', async () => {
    const companyId = 'comp-e2e-20';
    await setupCompanyEnv(companyId);

    let authBlocked = false;
    try {
      // Attempt to generate receivable using viewer role (insufficient role)
      await FinanceEngine.createReceivable({
        companyId,
        originType: OriginType.CONTRACT_RENT,
        originId: 'cnt-20',
        categoryId: 'cat-rent-inc',
        description: 'Unauthorized Write',
        totalAmount: 1000,
        dueDate: '2026-08-20',
        userId: `usr-viewer-${companyId}`, // viewer role
        userName: 'Viewer',
      });
    } catch {
      authBlocked = true;
    }

    if (!authBlocked) {
      throw new Error('RBAC falhou: permitiu escrita financeira por perfil VIEWONLY!');
    }
  });

  // =========================================================================
  // E2E-21: Rentabilidade do veículo fecha corretamente
  // =========================================================================
  await test('E2E-21', 'Rentabilidade do veículo fecha corretamente', async () => {
    const companyId = 'comp-e2e-21';
    const { accountId, userId } = await setupCompanyEnv(companyId, 10000);
    const { vehicleId } = await createVehAndDriver(companyId, '21');

    const rec = await receivableRepo.create({
      id: 'rec-e2e-21',
      companyId,
      originType: OriginType.CONTRACT_RENT,
      originId: 'cnt-21',
      vehicleId,
      categoryId: 'cat-rent-inc',
      description: 'Aluguel Rentabilidade',
      originalAmount: 1500,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 1500,
      paidAmount: 0,
      balanceAmount: 1500,
      dueDate: '2026-08-15',
      competenceDate: '2026-08-01',
      status: ObligationStatus.PENDING,
      idempotencyKey: 'key-e2e-21',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const pay = await payableRepo.create({
      id: 'pay-e2e-21',
      companyId,
      originType: OriginType.MAINTENANCE,
      originId: 'maint-21',
      vehicleId,
      categoryId: 'cat-maint-exp',
      description: 'Manutenção Rentabilidade',
      originalAmount: 300,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 300,
      paidAmount: 0,
      balanceAmount: 300,
      dueDate: '2026-08-15',
      competenceDate: '2026-08-01',
      status: ObligationStatus.PENDING,
      idempotencyKey: 'key-pay-21',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await FinanceEngine.registerReceipt({
      companyId,
      obligationId: rec.id,
      financialAccountId: accountId,
      paymentMethodId: 'pm-pix',
      paymentAmount: 1500,
      paymentDate: '2026-08-15',
      userId,
      userName: 'Admin',
    });

    await FinanceEngine.registerPayment({
      companyId,
      obligationId: pay.id,
      financialAccountId: accountId,
      paymentMethodId: 'pm-pix',
      paymentAmount: 300,
      paymentDate: '2026-08-15',
      userId,
      userName: 'Admin',
    });

    const profit = await FinanceEngine.getVehicleProfitability(companyId, vehicleId, '2026-08-01', '2026-08-31', AccountingRegime.CASH);
    if (profit.rentalIncome !== 1500 || profit.maintenanceExpense !== 300 || profit.netProfit !== 1200 || profit.profitMarginPercentage !== 80) {
      throw new Error(`Fechamento da rentabilidade incorreto no E2E-21: margin ${profit.profitMarginPercentage}`);
    }
  });

  // =========================================================================
  // E2E-22: Fluxo de caixa fecha corretamente
  // =========================================================================
  await test('E2E-22', 'Fluxo de caixa fecha corretamente', async () => {
    const companyId = 'comp-e2e-22';
    const { accountId, userId } = await setupCompanyEnv(companyId, 2000);

    const rec = await receivableRepo.create({
      id: 'rec-e2e-22',
      companyId,
      originType: OriginType.CONTRACT_RENT,
      originId: 'cnt-22',
      categoryId: 'cat-rent-inc',
      description: 'Aluguel Fluxo Caixa',
      originalAmount: 1000,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 1000,
      paidAmount: 0,
      balanceAmount: 1000,
      dueDate: '2026-08-15',
      competenceDate: '2026-08-01',
      status: ObligationStatus.PENDING,
      idempotencyKey: 'key-e2e-22',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const pay = await payableRepo.create({
      id: 'pay-e2e-22',
      companyId,
      originType: OriginType.INSURANCE,
      originId: 'ins-22',
      categoryId: 'cat-ins-exp',
      description: 'Seguro Fluxo Caixa',
      originalAmount: 300,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 300,
      paidAmount: 0,
      balanceAmount: 300,
      dueDate: '2026-08-15',
      competenceDate: '2026-08-01',
      status: ObligationStatus.PENDING,
      idempotencyKey: 'key-pay-22',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await FinanceEngine.registerReceipt({
      companyId,
      obligationId: rec.id,
      financialAccountId: accountId,
      paymentMethodId: 'pm-pix',
      paymentAmount: 1000,
      paymentDate: '2026-08-15',
      userId,
      userName: 'Admin',
    });

    await FinanceEngine.registerPayment({
      companyId,
      obligationId: pay.id,
      financialAccountId: accountId,
      paymentMethodId: 'pm-pix',
      paymentAmount: 300,
      paymentDate: '2026-08-15',
      userId,
      userName: 'Admin',
    });

    const cashFlow = await FinanceEngine.getCashFlowReport(companyId, '2026-08-01', '2026-08-31');
    if (cashFlow.initialCashBalance !== 2000 || cashFlow.totalRealizedIncomes !== 1000 || cashFlow.totalRealizedExpenses !== 300 || cashFlow.finalRealizedCashBalance !== 2700) {
      throw new Error(`Fechamento do fluxo de caixa incorreto no E2E-22: closing ${cashFlow.finalRealizedCashBalance}`);
    }
  });

  // =========================================================================
  // E2E-23: DRE fecha corretamente
  // =========================================================================
  await test('E2E-23', 'DRE fecha corretamente', async () => {
    const companyId = 'comp-e2e-23';
    const { accountId, userId } = await setupCompanyEnv(companyId, 5000);

    const recPaid = await receivableRepo.create({
      id: 'rec-paid-23',
      companyId,
      originType: OriginType.CONTRACT_RENT,
      originId: 'cnt-23',
      categoryId: 'cat-rent-inc',
      description: 'Aluguel Recebido',
      originalAmount: 1000,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 1000,
      paidAmount: 0,
      balanceAmount: 1000,
      dueDate: '2026-08-10',
      competenceDate: '2026-08-01',
      status: ObligationStatus.PENDING,
      idempotencyKey: 'key-rec-paid-23',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const recPending = await receivableRepo.create({
      id: 'rec-pend-23',
      companyId,
      originType: OriginType.CONTRACT_RENT,
      originId: 'cnt-23',
      categoryId: 'cat-rent-inc',
      description: 'Aluguel Pendente',
      originalAmount: 800,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 800,
      paidAmount: 0,
      balanceAmount: 800,
      dueDate: '2026-08-25',
      competenceDate: '2026-08-01',
      status: ObligationStatus.PENDING,
      idempotencyKey: 'key-rec-pend-23',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const pay = await payableRepo.create({
      id: 'pay-23',
      companyId,
      originType: OriginType.DOCUMENTATION,
      originId: 'ipva-23',
      categoryId: 'cat-doc-exp',
      description: 'IPVA Pago',
      originalAmount: 400,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 400,
      paidAmount: 0,
      balanceAmount: 400,
      dueDate: '2026-08-15',
      competenceDate: '2026-08-01',
      status: ObligationStatus.PENDING,
      idempotencyKey: 'key-pay-23',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Pay rent 1 and IPVA
    await FinanceEngine.registerReceipt({
      companyId,
      obligationId: recPaid.id,
      financialAccountId: accountId,
      paymentMethodId: 'pm-pix',
      paymentAmount: 1000,
      paymentDate: '2026-08-10',
      userId,
      userName: 'Admin',
    });

    await FinanceEngine.registerPayment({
      companyId,
      obligationId: pay.id,
      financialAccountId: accountId,
      paymentMethodId: 'pm-pix',
      paymentAmount: 400,
      paymentDate: '2026-08-15',
      userId,
      userName: 'Admin',
    });

    // Check CASH regime DRE: Rent paid (1000) - IPVA paid (400) = 600 Net Income
    const dreCash = await FinanceEngine.getDREReport(companyId, '2026-08-01', '2026-08-31', AccountingRegime.CASH);
    if (dreCash.grossRevenue.amount !== 1000 || dreCash.directCosts.amount !== 400 || dreCash.netIncome.amount !== 600) {
      throw new Error(`DRE de caixa incorreto no E2E-23: netIncome ${dreCash.netIncome.amount}`);
    }

    // Check ACCRUAL regime DRE: Rent (1000 + 800) - IPVA (400) = 1400 Net Income
    const dreAccrual = await FinanceEngine.getDREReport(companyId, '2026-08-01', '2026-08-31', AccountingRegime.ACCRUAL);
    if (dreAccrual.grossRevenue.amount !== 1800 || dreAccrual.directCosts.amount !== 400 || dreAccrual.netIncome.amount !== 1400) {
      throw new Error(`DRE de competência incorreto no E2E-23: netIncome ${dreAccrual.netIncome.amount}`);
    }
  });

  // =========================================================================
  // E2E-24: Aging/inadimplência atualiza após pagamento
  // =========================================================================
  await test('E2E-24', 'Aging/inadimplência atualiza após pagamento', async () => {
    const companyId = 'comp-e2e-24';
    const { accountId, userId } = await setupCompanyEnv(companyId);

    const rec = await receivableRepo.create({
      id: 'rec-e2e-24',
      companyId,
      originType: OriginType.CONTRACT_RENT,
      originId: 'cnt-24',
      categoryId: 'cat-rent-inc',
      description: 'Aluguel Atrasável Aging',
      originalAmount: 500,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 500,
      paidAmount: 0,
      balanceAmount: 500,
      dueDate: '2026-08-10',
      competenceDate: '2026-08-01',
      status: ObligationStatus.PENDING,
      idempotencyKey: 'key-e2e-24',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Run Overdue calculation on 2026-08-15 (5 days overdue)
    await FinanceEngine.processOverdueReceivables(companyId, '2026-08-15', userId, 'Admin', 0, 0, 0);

    const agingBefore = await FinanceEngine.getAgingReport(companyId, 'RECEIVABLE', '2026-08-15');
    if (agingBefore['1-7'] !== 500) {
      throw new Error(`Aging incorreto antes da quitação: ${JSON.stringify(agingBefore)}`);
    }

    const delinquentBefore = await FinanceEngine.getDelinquentReceivables(companyId, '2026-08-15');
    if (delinquentBefore.length !== 1 || delinquentBefore[0].updatedOutstandingAmount !== 500) {
      throw new Error('Delinquency incorreta antes da quitação');
    }

    // Fully pay receivable
    await FinanceEngine.registerReceipt({
      companyId,
      obligationId: rec.id,
      financialAccountId: accountId,
      paymentMethodId: 'pm-pix',
      paymentAmount: 500,
      paymentDate: '2026-08-16',
      userId,
      userName: 'Admin',
    });

    const agingAfter = await FinanceEngine.getAgingReport(companyId, 'RECEIVABLE', '2026-08-17');
    if (agingAfter['1-7'] !== 0) {
      throw new Error(`Aging permaneceu em aberto após a quitação`);
    }

    const delinquentAfter = await FinanceEngine.getDelinquentReceivables(companyId, '2026-08-17');
    if (delinquentAfter.length !== 0) {
      throw new Error('Recebível quitado continua listado como inadimplente!');
    }
  });

  // =========================================================================
  // E2E-25: Cancelamento/encerramento interrompe recorrência futura
  // =========================================================================
  await test('E2E-25', 'Cancelamento/encerramento interrompe recorrência futura', async () => {
    const companyId = 'comp-e2e-25';
    const { userId } = await setupCompanyEnv(companyId);
    const { vehicleId, driverId } = await createVehAndDriver(companyId, '25');

    const contract = await contractService.createContract({
      companyId,
      vehicleId,
      driverId,
      startDate: '2026-08-01',
      rentalAmount: 1000,
      billingPeriodicity: RecurringFrequency.MONTHLY,
      securityDepositAmount: 0,
      status: ContractStatus.ACTIVE,
      userId,
      userName: 'Admin',
    });

    // Close contract
    await contractService.closeContract({
      companyId,
      contractId: contract.id,
      closeDate: '2026-08-10',
      userId,
      userName: 'Admin',
    });

    // Now run recurring rule processor on a future date (e.g. 2026-09-05)
    await FinanceEngine.processRecurringRules({
      companyId,
      processingDate: '2026-09-05',
      userId,
      userName: 'Admin',
    });

    const allRecs = await receivableRepo.findAll({ companyId });
    // Rent should ONLY be the initial one created upon activation. No new future recurring rent was created.
    if (allRecs.length !== 1) {
      throw new Error(`Encerramento de contrato falhou em interromper cobrança recorrente! Encontrou ${allRecs.length} receivables.`);
    }
  });

  console.log('\n====================================================');
  console.log('FIN-WAVE-5 TESTS COMPLETED!');
  const failedCount = results.filter((r) => !r.passed).length;
  console.log(`TOTAL: ${results.length} | PASSED: ${results.length - failedCount} | FAILED: ${failedCount}`);
  console.log('====================================================\n');

  if (failedCount > 0) {
    return { success: false };
  }

  console.log('--- REGRESSION SUITE EXECUTION (Waves 1, 2, 3A, 3B, 3C, 3D, 4, FinanceTestRunner) ---');
  execSync('npx tsx src/domain/finance/__tests__/wave4Verification.ts', { stdio: 'inherit' });

  return { success: true };
}

runWave5Verification()
  .then((res) => {
    if (!res.success) {
      console.error('FIN-WAVE-5 HOMOLOGATION FAILED!');
      process.exit(1);
    } else {
      console.log('====================================================');
      console.log('WAVE 5 AND ALL REGRESSIONS HOMOLOGATED SUCCESSFULLY!');
      console.log('====================================================');
      process.exit(0);
    }
  })
  .catch((err) => {
    console.error('FIN-WAVE-5 UNHANDLED EXCEPTION:', err);
    process.exit(1);
  });
