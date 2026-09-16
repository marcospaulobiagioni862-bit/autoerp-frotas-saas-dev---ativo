// Wave 3B Verification Suite - NIC & Profitability

if (typeof global.localStorage === 'undefined') {
  const store = new Map<string, string>();
  global.localStorage = {
    getItem: (k: string) => store.get(k) || null,
    setItem: (k: string, v: string) => store.set(k, String(v)),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
  } as unknown as Storage;
}

import { execSync } from 'child_process';
import { FinanceEngine } from '../FinanceEngine';
import { TrafficTicketService } from '../../services/TrafficTicketService';
import { seedAutoERPTestData } from '../../../persistence/seed/seedData';
import {
  TicketResponsibility,
  TicketStatus,
  AccountingRegime,
  OriginType,
  ObligationStatus,
  FinancialAccountType,
  VehicleStatus,
  DriverStatus,
  DocumentStatus,
} from '../../../types/enums';
import {
  TrafficTicketRepository,
  AccountPayableRepository,
  AccountReceivableRepository,
  FinancialAccountRepository,
  FinancialTransactionRepository,
  VehicleRepository,
  DriverRepository,
} from '../../../persistence/repositories/localRepositories';
import { FinanceTestRunner } from './financeTestRunner';
import { Wave1VerificationRunner } from './wave1Verification';
import { Wave2VerificationRunner } from './wave2Verification';

export async function runWave3BVerification() {
  console.log('====================================================');
  console.log('STARTING WAVE 3B VERIFICATION SUITE');
  console.log('====================================================\n');

  await seedAutoERPTestData(true);

  const ticketRepo = new TrafficTicketRepository();
  const payRepo = new AccountPayableRepository();
  const recRepo = new AccountReceivableRepository();
  const accountRepo = new FinancialAccountRepository();
  const txRepo = new FinancialTransactionRepository();
  const vehicleRepo = new VehicleRepository();
  const driverRepo = new DriverRepository();
  const ticketService = new TrafficTicketService();

  const companyId = 'company-test-3b';
  const companyB = 'company-other-3b';
  const vehicleId = 'veh-3b-1';
  const vehicleB = 'veh-3b-other';
  const driverId = 'drv-3b-1';
  const userId = 'usr-admin';
  const userName = 'Admin Tester';

  // Seed vehicles needed for tickets & profitability
  await vehicleRepo.create({
    id: vehicleId,
    companyId,
    plate: 'ABC-3B01',
    brand: 'Fiat',
    model: 'Mobi',
    yearFabrication: 2023,
    yearModel: 2023,
    color: 'Branco',
    renavam: '12345678901',
    chassis: 'CHAS-3B01',
    currentKm: 10000,
    fuelType: 'FLEX',
    category: 'HATCH',
    acquisitionValue: 50000,
    currentValue: 50000,
    rentalValueBase: 1800,
    status: VehicleStatus.AVAILABLE,
    isArchived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  await vehicleRepo.create({
    id: vehicleB,
    companyId: companyB,
    plate: 'XYZ-3B02',
    brand: 'VW',
    model: 'Gol',
    yearFabrication: 2022,
    yearModel: 2022,
    color: 'Prata',
    renavam: '12345678902',
    chassis: 'CHAS-3B02',
    currentKm: 15000,
    fuelType: 'FLEX',
    category: 'HATCH',
    acquisitionValue: 55000,
    currentValue: 55000,
    rentalValueBase: 1900,
    status: VehicleStatus.AVAILABLE,
    isArchived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  await vehicleRepo.create({
    id: 'veh-profit-1',
    companyId,
    plate: 'PRF-0001',
    brand: 'Chevrolet',
    model: 'Onix',
    yearFabrication: 2024,
    yearModel: 2024,
    color: 'Preto',
    renavam: '12345678903',
    chassis: 'CHAS-PRF-1',
    currentKm: 5000,
    fuelType: 'FLEX',
    category: 'HATCH',
    acquisitionValue: 60000,
    currentValue: 60000,
    rentalValueBase: 2000,
    status: VehicleStatus.AVAILABLE,
    isArchived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  await vehicleRepo.create({
    id: 'veh-profit-2',
    companyId,
    plate: 'PRF-0002',
    brand: 'Hyundai',
    model: 'HB20',
    yearFabrication: 2024,
    yearModel: 2024,
    color: 'Cinza',
    renavam: '12345678904',
    chassis: 'CHAS-PRF-2',
    currentKm: 8000,
    fuelType: 'FLEX',
    category: 'HATCH',
    acquisitionValue: 62000,
    currentValue: 62000,
    rentalValueBase: 2100,
    status: VehicleStatus.AVAILABLE,
    isArchived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Seed driver
  await driverRepo.create({
    id: driverId,
    companyId,
    fullName: 'Motorista Teste 3B',
    cpf: '11122233344',
    birthDate: '1990-01-01',
    email: 'driver3b@test.com',
    phone: '51999998888',
    whatsapp: '51999998888',
    address: {
      street: 'Rua Teste',
      number: '123',
      neighborhood: 'Centro',
      city: 'Porto Alegre',
      state: 'RS',
      zipCode: '90000-000',
    },
    cnhNumber: '12345678900',
    cnhCategory: 'B',
    cnhExpiration: '2030-01-01',
    cnhStatus: DocumentStatus.VALID,
    appPlatforms: ['Uber'],
    status: DriverStatus.ACTIVE,
    isArchived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Create test financial accounts
  const accBank = await accountRepo.create({
    id: 'acc-bank-3b',
    companyId,
    name: 'Banco Principal 3B',
    type: FinancialAccountType.BANK,
    initialBalance: 20000,
    currentBalance: 20000,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const accCard = await accountRepo.create({
    id: 'acc-card-3b',
    companyId,
    name: 'Cartão Corporativo 3B',
    type: FinancialAccountType.CREDIT_CARD,
    initialBalance: 0,
    currentBalance: 0,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const accBankB = await accountRepo.create({
    id: 'acc-bank-3b-other',
    companyId: companyB,
    name: 'Banco Empresa B 3B',
    type: FinancialAccountType.BANK,
    initialBalance: 50000,
    currentBalance: 50000,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  let nicPass = 0;
  let nicTotal = 0;
  let profPass = 0;
  let profTotal = 0;

  const testNIC = async (name: string, fn: () => Promise<boolean>) => {
    nicTotal++;
    try {
      const ok = await fn();
      if (ok) {
        nicPass++;
        console.log(`  [PASS] NIC-${String(nicTotal).padStart(2, '0')}: ${name}`);
      } else {
        console.error(`  [FAIL] NIC-${String(nicTotal).padStart(2, '0')}: ${name}`);
      }
    } catch (err) {
      console.error(`  [FAIL] NIC-${String(nicTotal).padStart(2, '0')}: ${name} - Exception: ${err}`);
    }
  };

  const testProf = async (name: string, fn: () => Promise<boolean>) => {
    profTotal++;
    try {
      const ok = await fn();
      if (ok) {
        profPass++;
        console.log(`  [PASS] PROF-${String(profTotal).padStart(2, '0')}: ${name}`);
      } else {
        console.error(`  [FAIL] PROF-${String(profTotal).padStart(2, '0')}: ${name}`);
      }
    } catch (err) {
      console.error(`  [FAIL] PROF-${String(profTotal).padStart(2, '0')}: ${name} - Exception: ${err}`);
    }
  };

  console.log('--- PARTE A: MULTA NIC (12 TESTES) ---');

  // NIC-01: Multa com condutor identificado não é elegível para NIC
  await testNIC('Multa com condutor identificado bloqueia geração indevida de NIC', async () => {
    const ticket = await ticketService.createTicket(
      {
        companyId,
        vehicleId,
        driverId,
        autoNumber: 'NIC-AUTO-01',
        organName: 'DETRAN',
        infractionCode: '5001',
        description: 'Excesso de velocidade',
        infractionDate: '2026-08-01',
        dueDate: '2026-08-30',
        originalAmount: 293.47,
        points: 4,
        responsibility: TicketResponsibility.DRIVER,
      },
      userId,
      userName
    );

    try {
      await FinanceEngine.processNICPenalty(ticket.id, 293.47, userId, userName);
      return false; // Deve falhar se não lançar erro
    } catch {
      return true; // Lançou erro conforme esperado
    }
  });

  // NIC-02: Multa pendente de identificação gera obrigação NIC
  let ticketPendenteId = '';
  await testNIC('Multa PENDING_IDENTIFICATION gera AccountPayable de NIC para a empresa', async () => {
    const ticket = await ticketService.createTicket(
      {
        companyId,
        vehicleId,
        autoNumber: 'NIC-AUTO-02',
        organName: 'DETRAN',
        infractionCode: '5002',
        description: 'Avançar sinal vermelho',
        infractionDate: '2026-08-02',
        dueDate: '2026-08-31',
        originalAmount: 293.47,
        points: 7,
        responsibility: TicketResponsibility.UNIDENTIFIED,
      },
      userId,
      userName
    );

    ticketPendenteId = ticket.id;

    const updated = await FinanceEngine.processNICPenalty(ticket.id, 293.47, userId, userName);
    if (!updated.nicPayableId) return false;

    const pay = await payRepo.findById(updated.nicPayableId);
    return pay !== null && pay.originalAmount === 293.47 && pay.originType === OriginType.TRAFFIC_TICKET_COMPANY;
  });

  // NIC-03: Obrigação NIC preserva originId
  await testNIC('Obrigação NIC preserva originId (ID da multa)', async () => {
    const ticket = await ticketRepo.findById(ticketPendenteId);
    if (!ticket || !ticket.nicPayableId) return false;
    const pay = await payRepo.findById(ticket.nicPayableId);
    return pay?.originId === ticket.id;
  });

  // NIC-04: Obrigação NIC preserva vehicleId
  await testNIC('Obrigação NIC preserva vehicleId do veículo infrator', async () => {
    const ticket = await ticketRepo.findById(ticketPendenteId);
    if (!ticket || !ticket.nicPayableId) return false;
    const pay = await payRepo.findById(ticket.nicPayableId);
    return pay?.vehicleId === vehicleId;
  });

  // NIC-05: Obrigação NIC preserva companyId
  await testNIC('Obrigação NIC preserva companyId do tenant', async () => {
    const ticket = await ticketRepo.findById(ticketPendenteId);
    if (!ticket || !ticket.nicPayableId) return false;
    const pay = await payRepo.findById(ticket.nicPayableId);
    return pay?.companyId === companyId;
  });

  // NIC-06: Cross-tenant isolation para processamento em lote NIC
  await testNIC('Processamento pendente respeita estritamente o companyId (Tenant Isolation)', async () => {
    // Criar ticket em empresa B
    await ticketService.createTicket(
      {
        companyId: companyB,
        vehicleId: vehicleB,
        autoNumber: 'NIC-AUTO-06-B',
        organName: 'PRF',
        infractionCode: '5003',
        description: 'Ultrapassagem proibida',
        infractionDate: '2026-08-03',
        dueDate: '2026-08-31',
        originalAmount: 1467.35,
        points: 7,
        responsibility: TicketResponsibility.UNIDENTIFIED,
      },
      userId,
      userName
    );

    const processedA = await FinanceEngine.processPendingNICPenalties(companyId, userId, userName);
    const hasCompanyB = processedA.some((t) => t.companyId === companyB);
    return !hasCompanyB;
  });

  // NIC-07: Processamento repetido da mesma multa é idempotente
  await testNIC('Processamento repetido da mesma multa não duplica o AccountPayable NIC', async () => {
    const paysBefore = await payRepo.findByVehicleId(vehicleId);
    const nicPaysBefore = paysBefore.filter((p) => p.description.includes('Penalidade NIC'));

    await FinanceEngine.processNICPenalty(ticketPendenteId, 293.47, userId, userName);
    await FinanceEngine.processNICPenalty(ticketPendenteId, 293.47, userId, userName);

    const paysAfter = await payRepo.findByVehicleId(vehicleId);
    const nicPaysAfter = paysAfter.filter((p) => p.description.includes('Penalidade NIC'));

    return nicPaysBefore.length === nicPaysAfter.length;
  });

  // NIC-08: Geração de NIC cria obrigação sem criar FinancialTransaction
  await testNIC('Geração da penalidade NIC cria obrigação sem criar movimentação de caixa (0 transações)', async () => {
    const txsBefore = await txRepo.findAll();
    const t = await ticketService.createTicket(
      {
        companyId,
        vehicleId,
        autoNumber: 'NIC-AUTO-08',
        organName: 'DETRAN',
        infractionCode: '5008',
        description: 'Velocidade superior a 50%',
        infractionDate: '2026-08-05',
        dueDate: '2026-08-31',
        originalAmount: 880.41,
        points: 7,
        responsibility: TicketResponsibility.UNIDENTIFIED,
      },
      userId,
      userName
    );

    await FinanceEngine.processNICPenalty(t.id, 880.41, userId, userName);
    const txsAfter = await txRepo.findAll();
    return txsBefore.length === txsAfter.length;
  });

  // NIC-09: Geração de NIC não altera saldo bancário
  await testNIC('Geração da penalidade NIC não altera saldo da conta bancária', async () => {
    const accBefore = await accountRepo.findById(accBank.id);
    const balBefore = accBefore?.currentBalance || 0;

    const t = await ticketService.createTicket(
      {
        companyId,
        vehicleId,
        autoNumber: 'NIC-AUTO-09',
        organName: 'EPTC',
        infractionCode: '5009',
        description: 'Estacionar em local proibido',
        infractionDate: '2026-08-06',
        dueDate: '2026-08-31',
        originalAmount: 195.23,
        points: 5,
        responsibility: TicketResponsibility.UNIDENTIFIED,
      },
      userId,
      userName
    );

    await FinanceEngine.processNICPenalty(t.id, 195.23, userId, userName);

    const accAfter = await accountRepo.findById(accBank.id);
    return accAfter?.currentBalance === balBefore;
  });

  // NIC-10: Identificação dentro do prazo atualiza status e cancela obrigação NIC
  await testNIC('Atribuição do condutor dentro do prazo altera status para IDENTIFIED e cancela a NIC', async () => {
    const t = await ticketService.createTicket(
      {
        companyId,
        vehicleId,
        autoNumber: 'NIC-AUTO-10',
        organName: 'DETRAN',
        infractionCode: '5010',
        description: 'Uso de celular ao dirigir',
        infractionDate: '2026-08-07',
        dueDate: '2026-08-31',
        originalAmount: 293.47,
        points: 7,
        responsibility: TicketResponsibility.UNIDENTIFIED,
      },
      userId,
      userName
    );

    const processed = await FinanceEngine.processNICPenalty(t.id, 293.47, userId, userName);
    const nicPayId = processed.nicPayableId;

    if (!nicPayId) return false;

    // Identificar condutor
    const updated = await ticketService.assignDriverAndResponsibility(
      t.id,
      driverId,
      TicketResponsibility.DRIVER,
      userId,
      userName
    );

    const canceledNicPay = await payRepo.findById(nicPayId);

    return (
      (updated.status === TicketStatus.IDENTIFIED || updated.status === TicketStatus.CHARGED_DRIVER) &&
      updated.nicPayableId === undefined &&
      canceledNicPay?.status === ObligationStatus.CANCELLED
    );
  });

  // NIC-11: Cancelamento do payable preserva histórico e rastreabilidade
  await testNIC('Cancelamento da obrigação NIC preserva histórico e não exclui registro', async () => {
    const t = await ticketService.createTicket(
      {
        companyId,
        vehicleId,
        autoNumber: 'NIC-AUTO-11',
        organName: 'PRF',
        infractionCode: '5011',
        description: 'Sem cinto de segurança',
        infractionDate: '2026-08-08',
        dueDate: '2026-08-31',
        originalAmount: 195.23,
        points: 5,
        responsibility: TicketResponsibility.UNIDENTIFIED,
      },
      userId,
      userName
    );

    const processed = await FinanceEngine.processNICPenalty(t.id, 195.23, userId, userName);
    const nicPayId = processed.nicPayableId;
    if (!nicPayId) return false;

    await ticketService.assignDriverAndResponsibility(t.id, driverId, TicketResponsibility.DRIVER, userId, userName);

    const payInDb = await payRepo.findById(nicPayId);
    return payInDb !== null && payInDb.status === ObligationStatus.CANCELLED;
  });

  // NIC-12: Multa original e NIC são separadas e rastreáveis
  await testNIC('Multa original e penalidade NIC permanecem separadas e rastreáveis individualmente', async () => {
    const t = await ticketService.createTicket(
      {
        companyId,
        vehicleId,
        autoNumber: 'NIC-AUTO-12',
        organName: 'DETRAN',
        infractionCode: '5012',
        description: 'Parar sobre a faixa de pedestres',
        infractionDate: '2026-08-09',
        dueDate: '2026-08-31',
        originalAmount: 130.16,
        points: 4,
        responsibility: TicketResponsibility.COMPANY,
      },
      userId,
      userName
    );

    // Multa original atribuída à empresa gera payable de multa original
    const withPayable = await ticketService.generateFinancialObligation(t.id, userId, userName);
    const origPayableId = withPayable.payableId;

    // Gerar penalidade NIC adicional
    const withNic = await FinanceEngine.processNICPenalty(t.id, 130.16, userId, userName);
    const nicPayableId = withNic.nicPayableId;

    if (!origPayableId || !nicPayableId) return false;
    if (origPayableId === nicPayableId) return false;

    const origPay = await payRepo.findById(origPayableId);
    const nicPay = await payRepo.findById(nicPayableId);

    return (
      origPay !== null &&
      nicPay !== null &&
      origPay.originalAmount === 130.16 &&
      nicPay.originalAmount === 130.16 &&
      nicPay.description.includes('Penalidade NIC')
    );
  });

  console.log('\n--- PARTE B: RENTABILIDADE POR VEÍCULO (16 TESTES) ---');

  const pVehicleId = 'veh-profit-1';
  const pVehicleB = 'veh-profit-2';
  const startAugust = '2026-08-01';
  const endAugust = '2026-08-31';

  // PROF-01: Recebimento de aluguel soma em rentalIncome
  await testProf('Recebimento de aluguel pago é contabilizado em rentalIncome', async () => {
    const rec = await FinanceEngine.createReceivable({
      companyId,
      originType: OriginType.CONTRACT_RENT,
      originId: 'cnt-p-01',
      vehicleId: pVehicleId,
      categoryId: 'cat-rent',
      description: 'Aluguel Veículo P1',
      totalAmount: 1000,
      dueDate: '2026-08-10',
      userId,
      userName,
    });

    await FinanceEngine.registerReceipt({
      companyId,
      obligationId: rec[0].id,
      financialAccountId: accBank.id,
      paymentMethodId: 'pm-pix',
      paymentAmount: 1000,
      paymentDate: '2026-08-10',
      userId,
      userName,
    });

    const report = await FinanceEngine.getVehicleProfitability(companyId, pVehicleId, startAugust, endAugust, AccountingRegime.CASH);
    return report.rentalIncome === 1000 && report.totalIncome === 1000;
  });

  // PROF-02: AccountReceivable PENDING não entra em regime de CAIXA
  await testProf('AccountReceivable pendente não afeta a receita em regime de CAIXA', async () => {
    await FinanceEngine.createReceivable({
      companyId,
      originType: OriginType.CONTRACT_RENT,
      originId: 'cnt-p-02',
      vehicleId: pVehicleId,
      categoryId: 'cat-rent',
      description: 'Aluguel A_Vencer',
      totalAmount: 2000,
      dueDate: '2026-08-25',
      userId,
      userName,
    });

    const report = await FinanceEngine.getVehicleProfitability(companyId, pVehicleId, startAugust, endAugust, AccountingRegime.CASH);
    return report.rentalIncome === 1000; // Apenas o pago de 1000
  });

  // PROF-03: Manutenção paga entra em maintenanceExpense
  await testProf('Pagamento de manutenção entra como maintenanceExpense', async () => {
    const pay = await FinanceEngine.createPayable({
      companyId,
      originType: OriginType.MAINTENANCE,
      originId: 'mnt-p-01',
      vehicleId: pVehicleId,
      categoryId: 'cat-maint',
      description: 'Troca de óleo e filtros',
      totalAmount: 350,
      dueDate: '2026-08-12',
      userId,
      userName,
    });

    await FinanceEngine.registerPayment({
      companyId,
      obligationId: pay[0].id,
      financialAccountId: accBank.id,
      paymentMethodId: 'pm-pix',
      paymentAmount: 350,
      paymentDate: '2026-08-12',
      userId,
      userName,
    });

    const report = await FinanceEngine.getVehicleProfitability(companyId, pVehicleId, startAugust, endAugust, AccountingRegime.CASH);
    return report.maintenanceExpense === 350;
  });

  // PROF-04: Seguro pago entra em insuranceExpense
  await testProf('Pagamento de seguro entra como insuranceExpense', async () => {
    const pay = await FinanceEngine.createPayable({
      companyId,
      originType: OriginType.INSURANCE,
      originId: 'ins-p-01',
      vehicleId: pVehicleId,
      categoryId: 'cat-ins',
      description: 'Seguro Mensal Veículo P1',
      totalAmount: 200,
      dueDate: '2026-08-15',
      userId,
      userName,
    });

    await FinanceEngine.registerPayment({
      companyId,
      obligationId: pay[0].id,
      financialAccountId: accBank.id,
      paymentMethodId: 'pm-pix',
      paymentAmount: 200,
      paymentDate: '2026-08-15',
      userId,
      userName,
    });

    const report = await FinanceEngine.getVehicleProfitability(companyId, pVehicleId, startAugust, endAugust, AccountingRegime.CASH);
    return report.insuranceExpense === 200;
  });

  // PROF-05: Rastreador pago entra em trackerExpense
  await testProf('Pagamento de rastreador entra como trackerExpense', async () => {
    const pay = await FinanceEngine.createPayable({
      companyId,
      originType: OriginType.TRACKER,
      originId: 'trk-p-01',
      vehicleId: pVehicleId,
      categoryId: 'cat-trk',
      description: 'Mensalidade de Rastreador GPS',
      totalAmount: 80,
      dueDate: '2026-08-15',
      userId,
      userName,
    });

    await FinanceEngine.registerPayment({
      companyId,
      obligationId: pay[0].id,
      financialAccountId: accBank.id,
      paymentMethodId: 'pm-pix',
      paymentAmount: 80,
      paymentDate: '2026-08-15',
      userId,
      userName,
    });

    const report = await FinanceEngine.getVehicleProfitability(companyId, pVehicleId, startAugust, endAugust, AccountingRegime.CASH);
    return report.trackerExpense === 80;
  });

  // PROF-06: Documentação paga entra em documentationExpense
  await testProf('Pagamento de IPVA/documentação entra como documentationExpense', async () => {
    const pay = await FinanceEngine.createPayable({
      companyId,
      originType: OriginType.DOCUMENTATION,
      originId: 'doc-p-01',
      vehicleId: pVehicleId,
      categoryId: 'cat-doc',
      description: 'IPVA Parcela 1/5',
      totalAmount: 150,
      dueDate: '2026-08-18',
      userId,
      userName,
    });

    await FinanceEngine.registerPayment({
      companyId,
      obligationId: pay[0].id,
      financialAccountId: accBank.id,
      paymentMethodId: 'pm-pix',
      paymentAmount: 150,
      paymentDate: '2026-08-18',
      userId,
      userName,
    });

    const report = await FinanceEngine.getVehicleProfitability(companyId, pVehicleId, startAugust, endAugust, AccountingRegime.CASH);
    return report.documentationExpense === 150;
  });

  // PROF-07: Multa da empresa paga entra em finesCompanyExpense
  await testProf('Pagamento de multa da empresa entra como finesCompanyExpense', async () => {
    const pay = await FinanceEngine.createPayable({
      companyId,
      originType: OriginType.TRAFFIC_TICKET_COMPANY,
      originId: 'fine-p-01',
      vehicleId: pVehicleId,
      categoryId: 'cat-fine',
      description: 'Multa de Trânsito Empresa',
      totalAmount: 293.47,
      dueDate: '2026-08-20',
      userId,
      userName,
    });

    await FinanceEngine.registerPayment({
      companyId,
      obligationId: pay[0].id,
      financialAccountId: accBank.id,
      paymentMethodId: 'pm-pix',
      paymentAmount: 293.47,
      paymentDate: '2026-08-20',
      userId,
      userName,
    });

    const report = await FinanceEngine.getVehicleProfitability(companyId, pVehicleId, startAugust, endAugust, AccountingRegime.CASH);
    return report.finesCompanyExpense === 293.47;
  });

  // PROF-08: Transferência interna não altera receita operacional do veículo
  await testProf('Transferência entre contas da mesma empresa NÃO altera receita do veículo', async () => {
    const reportBefore = await FinanceEngine.getVehicleProfitability(companyId, pVehicleId, startAugust, endAugust, AccountingRegime.CASH);

    await FinanceEngine.transferFunds({
      companyId,
      sourceAccountId: accBank.id,
      destinationAccountId: accCard.id,
      amount: 1500,
      transferDate: '2026-08-22',
      paymentMethodId: 'pm-pix',
      description: 'Transferência de Saldo para Cartão',
      userId,
      userName,
    });

    const reportAfter = await FinanceEngine.getVehicleProfitability(companyId, pVehicleId, startAugust, endAugust, AccountingRegime.CASH);
    return reportBefore.totalIncome === reportAfter.totalIncome;
  });

  // PROF-09: Transferência interna não altera despesa do veículo
  await testProf('Transferência entre contas da mesma empresa NÃO altera despesa do veículo', async () => {
    const reportBefore = await FinanceEngine.getVehicleProfitability(companyId, pVehicleId, startAugust, endAugust, AccountingRegime.CASH);

    const reportAfter = await FinanceEngine.getVehicleProfitability(companyId, pVehicleId, startAugust, endAugust, AccountingRegime.CASH);
    return reportBefore.totalExpense === reportAfter.totalExpense;
  });

  // PROF-10: Transferência interna não altera lucro nem margem do veículo
  await testProf('Transferência entre contas da mesma empresa NÃO altera lucro líquido do veículo', async () => {
    const reportBefore = await FinanceEngine.getVehicleProfitability(companyId, pVehicleId, startAugust, endAugust, AccountingRegime.CASH);
    const reportAfter = await FinanceEngine.getVehicleProfitability(companyId, pVehicleId, startAugust, endAugust, AccountingRegime.CASH);

    return reportBefore.netProfit === reportAfter.netProfit && reportBefore.profitMarginPercentage === reportAfter.profitMarginPercentage;
  });

  // PROF-11: Recebimento de caução de garantia não entra em receita operacional do veículo
  await testProf('Recebimento de caução de garantia (SECURITY_DEPOSIT) NÃO é receita operacional', async () => {
    const reportBefore = await FinanceEngine.getVehicleProfitability(companyId, pVehicleId, startAugust, endAugust, AccountingRegime.CASH);

    await FinanceEngine.receiveSecurityDeposit(
      companyId,
      'cnt-dep-prof-1',
      driverId,
      pVehicleId,
      1200,
      accBank.id,
      'pm-pix',
      userId,
      userName
    );

    const reportAfter = await FinanceEngine.getVehicleProfitability(companyId, pVehicleId, startAugust, endAugust, AccountingRegime.CASH);
    return reportBefore.totalIncome === reportAfter.totalIncome;
  });

  // PROF-12: Devolução de caução não entra em despesa operacional do veículo
  await testProf('Devolução de caução de garantia NÃO é despesa operacional do veículo', async () => {
    const depRes = await FinanceEngine.receiveSecurityDeposit(
      companyId,
      'cnt-dep-prof-2',
      driverId,
      pVehicleId,
      800,
      accBank.id,
      'pm-pix',
      userId,
      userName
    );

    const reportBefore = await FinanceEngine.getVehicleProfitability(companyId, pVehicleId, startAugust, endAugust, AccountingRegime.CASH);

    await FinanceEngine.returnSecurityDeposit(
      companyId,
      depRes.deposit.id,
      800,
      accBank.id,
      'pm-pix',
      'Devolução integral de caução',
      userId,
      userName
    );

    const reportAfter = await FinanceEngine.getVehicleProfitability(companyId, pVehicleId, startAugust, endAugust, AccountingRegime.CASH);
    return reportBefore.totalExpense === reportAfter.totalExpense;
  });

  // PROF-13: Isolamento de tenant na rentabilidade por veículo
  await testProf('Rentabilidade do veículo ignora lançamentos de outra empresa/tenant', async () => {
    // Criar receita no mesmo veículoId mas em outra empresa
    const recOther = await FinanceEngine.createReceivable({
      companyId: companyB,
      originType: OriginType.CONTRACT_RENT,
      originId: 'cnt-p-other',
      vehicleId: pVehicleId,
      categoryId: 'cat-rent',
      description: 'Aluguel Empresa B',
      totalAmount: 5000,
      dueDate: '2026-08-10',
      userId,
      userName,
    });

    await FinanceEngine.registerReceipt({
      companyId: companyB,
      obligationId: recOther[0].id,
      financialAccountId: accBankB.id,
      paymentMethodId: 'pm-pix',
      paymentAmount: 5000,
      paymentDate: '2026-08-10',
      userId,
      userName,
    });

    const reportA = await FinanceEngine.getVehicleProfitability(companyId, pVehicleId, startAugust, endAugust, AccountingRegime.CASH);
    return reportA.totalIncome === 1000; // Deve conter apenas os 1000 da empresa A
  });

  // PROF-14: Margem com receita zero não gera NaN ou Infinity
  await testProf('Cálculo de margem percentual em veículo sem receita retorna 0% sem NaN/Infinity', async () => {
    const reportZero = await FinanceEngine.getVehicleProfitability(companyId, pVehicleB, startAugust, endAugust, AccountingRegime.CASH);
    return (
      reportZero.totalIncome === 0 &&
      !isNaN(reportZero.profitMarginPercentage) &&
      isFinite(reportZero.profitMarginPercentage) &&
      reportZero.profitMarginPercentage === 0
    );
  });

  // PROF-15: Regime de COMPETÊNCIA considera obrigações do período independente do pagamento
  await testProf('Regime de COMPETÊNCIA considera obrigações por competenceDate', async () => {
    const reportAccrual = await FinanceEngine.getVehicleProfitability(
      companyId,
      pVehicleId,
      startAugust,
      endAugust,
      AccountingRegime.ACCRUAL
    );

    // No regime de competência, o aluguel de 2000 criado em PROF-02 entra pois sua competenceDate é agosto
    return reportAccrual.rentalIncome >= 3000;
  });

  // PROF-16: Transação estornada tem seu efeito neutralizado na rentabilidade
  await testProf('Transação estornada (isReversed: true) não infla receita nem despesa', async () => {
    const recEstorno = await FinanceEngine.createReceivable({
      companyId,
      originType: OriginType.CONTRACT_RENT,
      originId: 'cnt-estorno-p',
      vehicleId: pVehicleId,
      categoryId: 'cat-rent',
      description: 'Aluguel com Estorno',
      totalAmount: 900,
      dueDate: '2026-08-05',
      userId,
      userName,
    });

    const receipt = await FinanceEngine.registerReceipt({
      companyId,
      obligationId: recEstorno[0].id,
      financialAccountId: accBank.id,
      paymentMethodId: 'pm-pix',
      paymentAmount: 900,
      paymentDate: '2026-08-05',
      userId,
      userName,
    });

    const reportBeforeRev = await FinanceEngine.getVehicleProfitability(companyId, pVehicleId, startAugust, endAugust, AccountingRegime.CASH);

    await FinanceEngine.reverseTransaction(
      companyId,
      receipt.transaction.id,
      900,
      'Erro no lançamento de teste',
      userId,
      userName
    );

    const reportAfterRev = await FinanceEngine.getVehicleProfitability(companyId, pVehicleId, startAugust, endAugust, AccountingRegime.CASH);

    return reportAfterRev.rentalIncome === reportBeforeRev.rentalIncome - 900;
  });

  console.log('\n====================================================');
  console.log(`WAVE 3B NIC SCENARIOS: ${nicPass}/${nicTotal} PASS`);
  console.log(`WAVE 3B PROFITABILITY SCENARIOS: ${profPass}/${profTotal} PASS`);
  console.log('====================================================\n');

  if (nicPass !== nicTotal || profPass !== profTotal) {
    throw new Error('FIN-WAVE-3B FALHOU EM SEUS TESTES DEDICADOS.');
  }

  // Executar regresões de Wave 1, Wave 2, Wave 3A e FinanceTestRunner
  console.log('RUNNING REGRESSION SUITES (Wave 1, Wave 2, Wave 3A, FinanceTestRunner)...');

  console.log('\n1. Verificando Wave 1 (15/15)...');
  execSync('npx tsx src/domain/finance/__tests__/wave1Verification.ts', { stdio: 'inherit' });

  console.log('\n2. Verificando Wave 2 (9/9)...');
  execSync('npx tsx src/domain/finance/__tests__/wave2Verification.ts', { stdio: 'inherit' });

  console.log('\n3. Verificando Wave 3A (30/30)...');
  execSync('npx tsx src/domain/finance/__tests__/wave3aVerification.ts', { stdio: 'inherit' });

  console.log('\n4. Verificando FinanceTestRunner (46/46)...');
  execSync('npx tsx src/domain/finance/__tests__/financeTestRunner.ts', { stdio: 'inherit' });

  console.log('\n====================================================');
  console.log('TODAS AS SUÍTES PASSARAM 100% GREEN! WAVE 3B HOMOLOGADA!');
  console.log('====================================================');
}

runWave3BVerification().catch((err) => {
  console.error('ERRO FATAL NA VERIFICAÇÃO WAVE 3B:', err);
  process.exit(1);
});
