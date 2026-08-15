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

import { seedAutoERPTestData } from '../../../persistence/seed/seedData';
import { StorageAdapter } from '../../../persistence/adapters/storageAdapter';
import { ContractService } from '../ContractService';
import { TrafficTicketService } from '../TrafficTicketService';
import {
  VehicleRepository,
  DriverRepository,
  ContractRepository,
  TrafficTicketRepository,
  AccountReceivableRepository,
  AccountPayableRepository,
} from '../../../persistence/repositories/localRepositories';
import {
  ContractStatus,
  TicketResponsibility,
  TicketStatus,
  VehicleStatus,
  DriverStatus,
  RecurringFrequency,
  ObligationStatus,
  DocumentStatus,
  OriginType,
} from '../../../types/enums';
import { generateUUID } from '../../../shared/utils/uuid';

async function runCrossTenantWave2B2Verification() {
  console.log('=== INICIANDO VERIFICAÇÃO FORENSE CROSS-TENANT (WAVE-2B2) ===');
  await seedAutoERPTestData(true);

  const contractService = new ContractService();
  const ticketService = new TrafficTicketService();
  const vehicleRepo = new VehicleRepository();
  const driverRepo = new DriverRepository();
  const contractRepo = new ContractRepository();
  const ticketRepo = new TrafficTicketRepository();
  const receivableRepo = new AccountReceivableRepository();
  const payableRepo = new AccountPayableRepository();

  const companyA = 'company-main-uuid';
  const companyB = 'company-other-uuid';
  const userIdA = 'user-admin-1';
  const userNameA = 'Gestor da Frota';
  const userIdB = 'user-admin-b';
  const userNameB = 'Gestor Empresa B';

  // Cadastrar Usuário e Empresa B
  const storage = StorageAdapter.getInstance();
  await storage.saveItem('companies', {
    id: companyB,
    name: 'Outra Locadora Ltda',
    cnpj: '99.999.999/0001-99',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  await storage.saveItem('users', {
    id: userIdB,
    companyId: companyB,
    name: userNameB,
    email: 'admin@outraempresa.com.br',
    role: 'ADMIN',
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Configurar entidades de teste para Empresa A e Empresa B
  const vehA = await vehicleRepo.create({
    id: 'veh-cross-a',
    companyId: companyA,
    plate: 'AAA-1111',
    brand: 'Fiat',
    model: 'Mobi',
    yearFabrication: 2024,
    yearModel: 2024,
    year: 2024,
    color: 'Branco',
    renavam: '12345678901',
    chassis: 'CHASSI11111111111',
    currentKm: 10000,
    fuelType: 'FLEX',
    category: 'Hatch',
    acquisitionValue: 60000,
    currentValue: 55000,
    rentalValueBase: 700,
    status: VehicleStatus.AVAILABLE,
    isArchived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const vehB = await vehicleRepo.create({
    id: 'veh-cross-b',
    companyId: companyB,
    plate: 'BBB-2222',
    brand: 'Chevrolet',
    model: 'Onix',
    yearFabrication: 2024,
    yearModel: 2024,
    year: 2024,
    color: 'Preto',
    renavam: '12345678902',
    chassis: 'CHASSI22222222222',
    currentKm: 10000,
    fuelType: 'FLEX',
    category: 'Hatch',
    acquisitionValue: 70000,
    currentValue: 65000,
    rentalValueBase: 800,
    status: VehicleStatus.AVAILABLE,
    isArchived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const drvA = await driverRepo.create({
    id: 'drv-cross-a',
    companyId: companyA,
    fullName: 'Motorista Empresa A',
    cpf: '111.111.111-11',
    birthDate: '1990-01-01',
    email: 'motorista.a@teste.com',
    phone: '11999990001',
    whatsapp: '11999990001',
    address: {
      street: 'Rua A',
      number: '10',
      neighborhood: 'Centro',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01000-000',
    },
    cnhNumber: '11111111111',
    cnhCategory: 'B',
    cnhExpiration: '2028-12-31',
    cnhStatus: DocumentStatus.VALID,
    appPlatforms: ['Uber'],
    status: DriverStatus.ACTIVE,
    isArchived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const drvB = await driverRepo.create({
    id: 'drv-cross-b',
    companyId: companyB,
    fullName: 'Motorista Empresa B',
    cpf: '222.222.222-22',
    birthDate: '1990-01-01',
    email: 'motorista.b@teste.com',
    phone: '11999990002',
    whatsapp: '11999990002',
    address: {
      street: 'Rua B',
      number: '20',
      neighborhood: 'Centro',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01000-000',
    },
    cnhNumber: '22222222222',
    cnhCategory: 'B',
    cnhExpiration: '2028-12-31',
    cnhStatus: DocumentStatus.VALID,
    appPlatforms: ['Uber'],
    status: DriverStatus.ACTIVE,
    isArchived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  let passed = 0;
  let failed = 0;

  async function assertThrows(name: string, fn: () => Promise<any>, expectedSubstr?: string) {
    try {
      await fn();
      console.error(`❌ [FALHA] ${name}: esperava erro, mas a operação foi concluída.`);
      failed++;
    } catch (err: any) {
      if (expectedSubstr && !err.message.includes(expectedSubstr)) {
        console.error(`❌ [FALHA] ${name}: erro lançado "${err.message}" não continha substring "${expectedSubstr}".`);
        failed++;
      } else {
        console.log(`✅ [PASSOU] ${name} -> ${err.message}`);
        passed++;
      }
    }
  }

  async function assertSuccess(name: string, fn: () => Promise<any>) {
    try {
      await fn();
      console.log(`✅ [PASSOU] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`❌ [FALHA] ${name}: ${err.message}`);
      failed++;
    }
  }

  console.log('\n--- 1. CONTRATOS CROSS-TENANT ---');
  // CT-X01: Empresa A tenta criar contrato com veículo da Empresa B
  await assertThrows(
    'CT-X01: Empresa A tenta criar contrato com veículo da Empresa B',
    () =>
      contractService.createContract({
        companyId: companyA,
        vehicleId: vehB.id,
        driverId: drvA.id,
        startDate: '2026-10-01',
        rentalAmount: 700,
        billingPeriodicity: RecurringFrequency.WEEKLY,
        securityDepositAmount: 1000,
        userId: userIdA,
        userName: userNameA,
      }),
    'Veículo não pertence à empresa da operação'
  );

  // CT-X02: Empresa A tenta criar contrato com motorista da Empresa B
  await assertThrows(
    'CT-X02: Empresa A tenta criar contrato com motorista da Empresa B',
    () =>
      contractService.createContract({
        companyId: companyA,
        vehicleId: vehA.id,
        driverId: drvB.id,
        startDate: '2026-10-01',
        rentalAmount: 700,
        billingPeriodicity: RecurringFrequency.WEEKLY,
        securityDepositAmount: 1000,
        userId: userIdA,
        userName: userNameA,
      }),
    'Motorista não pertence à empresa da operação'
  );

  // CT-X03: Contrato DRAFT forçado na Empresa A com veículo B -> Ativação bloqueada
  const forcedDraftVehicle = await contractRepo.create({
    id: generateUUID(),
    companyId: companyA,
    contractNumber: 'CNT-FORCED-VEH-B',
    vehicleId: vehB.id,
    driverId: drvA.id,
    startDate: '2026-10-01',
    status: ContractStatus.DRAFT,
    rentalAmount: 800,
    billingPeriodicity: RecurringFrequency.WEEKLY,
    securityDepositAmount: 1000,
    franchiseKm: 1500,
    excessKmRate: 0.5,
    isArchived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  await assertThrows(
    'CT-X03: Ativar contrato da Empresa A com veículo da Empresa B',
    () =>
      contractService.activateContract({
        companyId: companyA,
        contractId: forcedDraftVehicle.id,
        userId: userIdA,
        userName: userNameA,
      }),
    'Veículo não pertence à empresa da operação'
  );

  // CT-X04: Contrato DRAFT forçado na Empresa A com motorista B -> Ativação bloqueada
  const forcedDraftDriver = await contractRepo.create({
    id: generateUUID(),
    companyId: companyA,
    contractNumber: 'CNT-FORCED-DRV-B',
    vehicleId: vehA.id,
    driverId: drvB.id,
    startDate: '2026-10-01',
    status: ContractStatus.DRAFT,
    rentalAmount: 800,
    billingPeriodicity: RecurringFrequency.WEEKLY,
    securityDepositAmount: 1000,
    franchiseKm: 1500,
    excessKmRate: 0.5,
    isArchived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  await assertThrows(
    'CT-X04: Ativar contrato da Empresa A com motorista da Empresa B',
    () =>
      contractService.activateContract({
        companyId: companyA,
        contractId: forcedDraftDriver.id,
        userId: userIdA,
        userName: userNameA,
      }),
    'Motorista não pertence à empresa da operação'
  );

  // CT-X05: Ativação com companyId divergente
  const validDraftA = await contractService.createContract({
    companyId: companyA,
    vehicleId: vehA.id,
    driverId: drvA.id,
    startDate: '2026-10-01',
    rentalAmount: 700,
    billingPeriodicity: RecurringFrequency.WEEKLY,
    securityDepositAmount: 1000,
    userId: userIdA,
    userName: userNameA,
  });
  await assertThrows(
    'CT-X05: Empresa B tenta ativar contrato pertencente à Empresa A',
    () =>
      contractService.activateContract({
        companyId: companyB,
        contractId: validDraftA.id,
        userId: userIdB,
        userName: userNameB,
      }),
    'Contrato não pertence à empresa da operação'
  );

  // CT-X06: Encerramento com companyId divergente
  await assertThrows(
    'CT-X06: Empresa B tenta encerrar contrato pertencente à Empresa A',
    () =>
      contractService.closeContract({
        companyId: companyB,
        contractId: validDraftA.id,
        userId: userIdB,
        userName: userNameB,
      }),
    'Contrato não pertence à empresa da operação'
  );

  // CT-X07: Renovação com companyId divergente
  await assertThrows(
    'CT-X07: Empresa B tenta renovar contrato pertencente à Empresa A',
    () =>
      contractService.renewContract({
        companyId: companyB,
        oldContractId: validDraftA.id,
        newStartDate: '2026-11-01',
        userId: userIdB,
        userName: userNameB,
      }),
    'Contrato não pertence à empresa da operação'
  );

  console.log('\n--- 2. MULTAS DE TRÂNSITO CROSS-TENANT ---');
  // TT-X01: Empresa A tenta criar multa com veículo da Empresa B
  await assertThrows(
    'TT-X01: Empresa A tenta cadastrar multa com veículo da Empresa B',
    () =>
      ticketService.createTicket(
        {
          companyId: companyA,
          vehicleId: vehB.id,
          autoNumber: 'AUTO-CROSS-01',
          infractionCode: '745-5',
          description: 'Excesso de velocidade',
          infractionDate: '2026-10-05',
          dueDate: '2026-11-05',
          originalAmount: 130.16,
          responsibility: TicketResponsibility.COMPANY,
        },
        userIdA,
        userNameA
      ),
    'Veículo não pertence à empresa da operação'
  );

  // TT-X02: Empresa A tenta criar multa com motorista da Empresa B
  await assertThrows(
    'TT-X02: Empresa A tenta cadastrar multa com motorista da Empresa B',
    () =>
      ticketService.createTicket(
        {
          companyId: companyA,
          vehicleId: vehA.id,
          driverId: drvB.id,
          autoNumber: 'AUTO-CROSS-02',
          infractionCode: '745-5',
          description: 'Excesso de velocidade',
          infractionDate: '2026-10-05',
          dueDate: '2026-11-05',
          originalAmount: 130.16,
          responsibility: TicketResponsibility.DRIVER,
        },
        userIdA,
        userNameA
      ),
    'Motorista não pertence à empresa da operação'
  );

  // TT-X03: Unicidade de Auto de Infração escopada por tenant (mesmo auto em empresas diferentes permitido)
  await assertSuccess(
    'TT-X03a: Cadastrar auto SAME-AUTO-123 na Empresa A',
    () =>
      ticketService.createTicket(
        {
          companyId: companyA,
          vehicleId: vehA.id,
          autoNumber: 'SAME-AUTO-123',
          infractionCode: '500-2',
          description: 'Multa A',
          infractionDate: '2026-10-05',
          dueDate: '2026-11-05',
          originalAmount: 195.23,
          responsibility: TicketResponsibility.COMPANY,
        },
        userIdA,
        userNameA
      )
  );

  await assertSuccess(
    'TT-X03b: Cadastrar mesmo auto SAME-AUTO-123 na Empresa B (isolamento tenant)',
    () =>
      ticketService.createTicket(
        {
          companyId: companyB,
          vehicleId: vehB.id,
          autoNumber: 'SAME-AUTO-123',
          infractionCode: '500-2',
          description: 'Multa B',
          infractionDate: '2026-10-05',
          dueDate: '2026-11-05',
          originalAmount: 195.23,
          responsibility: TicketResponsibility.COMPANY,
        },
        userIdB,
        userNameB
      )
  );

  await assertThrows(
    'TT-X03c: Duplicar auto SAME-AUTO-123 dentro da mesma Empresa A deve ser bloqueado',
    () =>
      ticketService.createTicket(
        {
          companyId: companyA,
          vehicleId: vehA.id,
          autoNumber: 'SAME-AUTO-123',
          infractionCode: '500-2',
          description: 'Multa A Duplicada',
          infractionDate: '2026-10-05',
          dueDate: '2026-11-05',
          originalAmount: 195.23,
          responsibility: TicketResponsibility.COMPANY,
        },
        userIdA,
        userNameA
      ),
    'já cadastrado no sistema'
  );

  // TT-X04: Alterar responsabilidade para motorista da Empresa B
  const validTicketA = await ticketService.createTicket(
    {
      companyId: companyA,
      vehicleId: vehA.id,
      autoNumber: 'AUTO-VALID-A1',
      infractionCode: '745-5',
      description: 'Multa Empresa A',
      infractionDate: '2026-10-05',
      dueDate: '2026-11-05',
      originalAmount: 130.16,
      responsibility: TicketResponsibility.COMPANY,
    },
    userIdA,
    userNameA
  );

  await assertThrows(
    'TT-X04: Atribuir responsabilidade na multa de Empresa A para motorista da Empresa B',
    () =>
      ticketService.assignDriverAndResponsibility(
        validTicketA.id,
        drvB.id,
        TicketResponsibility.DRIVER,
        userIdA,
        userNameA
      ),
    'Motorista não pertence à empresa da operação'
  );

  console.log('\n--- 3. BUSCA HISTÓRICA DE CONTRATOS CROSS-TENANT ---');
  // Criar contrato ativo na Empresa A
  const activeContractA = await contractService.createContract({
    companyId: companyA,
    vehicleId: vehA.id,
    driverId: drvA.id,
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    rentalAmount: 700,
    billingPeriodicity: RecurringFrequency.WEEKLY,
    securityDepositAmount: 1000,
    status: ContractStatus.ACTIVE,
    userId: userIdA,
    userName: userNameA,
  });

  // Criar multa na Empresa A sem motorista explícito na data do contrato
  const autoIdentifiedTicket = await ticketService.createTicket(
    {
      companyId: companyA,
      vehicleId: vehA.id,
      autoNumber: 'AUTO-AUTO-IDENT',
      infractionCode: '745-5',
      description: 'Identificação automática de condutor',
      infractionDate: '2026-10-15',
      dueDate: '2026-11-15',
      originalAmount: 130.16,
      responsibility: TicketResponsibility.DRIVER,
    },
    userIdA,
    userNameA
  );

  if (
    autoIdentifiedTicket.contractId === activeContractA.id &&
    autoIdentifiedTicket.driverId === drvA.id
  ) {
    console.log('✅ [PASSOU] TT-X05: Identificação automática vinculou contrato e motorista corretos da Empresa A.');
    passed++;
  } else {
    console.error('❌ [FALHA] TT-X05: Falha na identificação automática vinculada ao mesmo tenant.');
    failed++;
  }

  console.log('\n--- 4. INTEGRIDADE FINANCEIRA E PRE-VALIDAÇÃO ANTES DE MUTAÇÕES ---');
  // Forçar manipulação com receivable cross-tenant vinculado para testar atomicidade
  const ticketForced = await ticketRepo.create({
    id: generateUUID(),
    companyId: companyA,
    vehicleId: vehA.id,
    driverId: drvA.id,
    autoNumber: 'FORCED-CROSS-REC',
    organName: 'DETRAN',
    infractionCode: '745-5',
    description: 'Multa com recebível forçado cross-tenant',
    infractionDate: '2026-10-10',
    dueDate: '2026-11-10',
    originalAmount: 150,
    points: 4,
    responsibility: TicketResponsibility.DRIVER,
    status: TicketStatus.CHARGED_DRIVER,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Criar recebível pertencente à Empresa B
  const recB = await receivableRepo.create({
    id: generateUUID(),
    companyId: companyB,
    originType: OriginType.TRAFFIC_TICKET_DRIVER,
    originId: ticketForced.id,
    categoryId: 'cat-multas',
    description: 'Recebível empresa B',
    originalAmount: 150,
    discountAmount: 0,
    fineAmount: 0,
    interestAmount: 0,
    updatedAmount: 150,
    totalAmount: 150,
    paidAmount: 0,
    balanceAmount: 150,
    dueDate: '2026-11-10',
    competenceDate: '2026-10-10',
    status: ObligationStatus.PENDING,
    idempotencyKey: `TRAFFIC_TICKET_DRIVER_${ticketForced.id}_1`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  ticketForced.receivableId = recB.id;
  await ticketRepo.update(ticketForced.id, ticketForced);

  await assertThrows(
    'TT-X06: Rejeitar alteração de responsabilidade se receivable vinculado for de outro tenant',
    () =>
      ticketService.assignDriverAndResponsibility(
        ticketForced.id,
        drvA.id,
        TicketResponsibility.COMPANY,
        userIdA,
        userNameA
      ),
    'Conta a receber vinculada pertence a outra empresa'
  );

  // Verificar que o recebível da Empresa B NÃO foi cancelado (atomicidade garantida)
  const recBCheck = await receivableRepo.findById(recB.id);
  if (recBCheck && recBCheck.status === ObligationStatus.PENDING) {
    console.log('✅ [PASSOU] TT-X07: Recebível da Empresa B preservado intacto sem efeito colateral.');
    passed++;
  } else {
    console.error('❌ [FALHA] TT-X07: Recebível da Empresa B sofreu mutação indevida!');
    failed++;
  }

  console.log(`\n========================================`);
  console.log(`RESULTADO DA VERIFICAÇÃO: ${passed} PASSARAM, ${failed} FALHARAM`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runCrossTenantWave2B2Verification().catch((err) => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
