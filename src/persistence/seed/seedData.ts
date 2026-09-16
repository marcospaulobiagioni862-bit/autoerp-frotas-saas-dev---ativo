// AutoERP Test Seed Data Generator

import { StorageAdapter } from '../adapters/storageAdapter';
import {
  Vehicle,
  Driver,
  Contract,
  FinancialAccount,
  PaymentMethod,
  FinancialCategory,
  AccountReceivable,
  AccountPayable,
  FinancialTransaction,
  Maintenance,
  Insurance,
  Tracker,
  TrafficTicket,
  SecurityDeposit,
  Supplier,
  User,
  Company,
} from '../../types/entities';

import {
  VehicleStatus,
  DriverStatus,
  ContractStatus,
  FinancialAccountType,
  FinancialCategoryType,
  ObligationStatus,
  TransactionType,
  OriginType,
  RecurringFrequency,
  MaintenanceType,
  MaintenanceStatus,
  TicketResponsibility,
  TicketStatus,
  SecurityDepositStatus,
  UserRole,
} from '../../types/enums';

import { generateUUID } from '../../shared/utils/uuid';

export async function seedAutoERPTestData(forceReset: boolean = false): Promise<{ message: string; seededCount: number }> {
  const storage = StorageAdapter.getInstance();

  const existingVehicles = await storage.getCollection<Vehicle>('vehicles');
  if (existingVehicles.length > 0 && !forceReset) {
    return { message: 'Database already contains data.', seededCount: existingVehicles.length };
  }

  if (forceReset) {
    const stores = [
      'vehicles',
      'drivers',
      'contracts',
      'financialAccounts',
      'paymentMethods',
      'financialCategories',
      'accountsReceivable',
      'accountsPayable',
      'financialTransactions',
      'maintenances',
      'insurances',
      'trackers',
      'trafficTickets',
      'securityDeposits',
      'suppliers',
      'users',
      'companies',
    ];
    for (const store of stores) {
      await storage.clearCollection(store);
    }
  }

  const companyId = 'company-main-uuid';

  // 1. Company & Admin User
  const company: Company = {
    id: companyId,
    name: 'AutoERP Locadora de Veículos Ltda',
    tradingName: 'AutoERP Fleet Management',
    cnpj: '45.123.890/0001-12',
    email: 'contato@autoerp.com.br',
    phone: '(11) 3456-7890',
    address: {
      street: 'Av. Paulista',
      number: '1000',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01310-100',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await storage.saveItem('companies', company);

  const adminUser: User = {
    id: 'user-admin-1',
    companyId,
    name: 'Gestor da Frota',
    email: 'admin@autoerp.com.br',
    role: UserRole.ADMIN,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await storage.saveItem('users', adminUser);

  // 2. Financial Accounts
  const accounts: FinancialAccount[] = [
    {
      id: 'acc-cash-1',
      companyId,
      name: 'Caixa Físico / Espécie',
      type: FinancialAccountType.CASH,
      initialBalance: 2500,
      currentBalance: 3200,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'acc-nubank-1',
      companyId,
      name: 'Banco Nubank PJ',
      type: FinancialAccountType.DIGITAL_ACCOUNT,
      institution: 'Nubank',
      accountNumber: '1234567-8',
      agency: '0001',
      pixKey: 'financeiro@autoerp.com.br',
      initialBalance: 35000,
      currentBalance: 48950,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'acc-itau-1',
      companyId,
      name: 'Banco Itaú Empresas',
      type: FinancialAccountType.BANK,
      institution: 'Itaú Unibanco',
      accountNumber: '98765-4',
      agency: '1234',
      initialBalance: 50000,
      currentBalance: 72400,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'acc-card-master',
      companyId,
      name: 'Cartão de Crédito Empresarial Master',
      type: FinancialAccountType.CREDIT_CARD,
      institution: 'Nubank / Mastercard',
      initialBalance: 0,
      currentBalance: 0,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  await storage.saveBatch('financialAccounts', accounts);

  // 3. Payment Methods
  const paymentMethods: PaymentMethod[] = [
    { id: 'pm-pix', companyId, name: 'PIX', code: 'PIX', active: true, requiresFinancialAccount: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'pm-boleto', companyId, name: 'Boleto Bancário', code: 'BOLETO', active: true, requiresFinancialAccount: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'pm-card', companyId, name: 'Cartão de Crédito', code: 'CREDIT_CARD', active: true, requiresFinancialAccount: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'pm-cash', companyId, name: 'Dinheiro', code: 'CASH', active: true, requiresFinancialAccount: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  ];
  await storage.saveBatch('paymentMethods', paymentMethods);

  // 4. Financial Categories
  const categories: FinancialCategory[] = [
    { id: 'cat-rent-inc', companyId, name: 'Aluguel de Veículos', type: FinancialCategoryType.INCOME, active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'cat-km-inc', companyId, name: 'KM Excedente', type: FinancialCategoryType.INCOME, active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'cat-ticket-inc', companyId, name: 'Ressarcimento de Multa', type: FinancialCategoryType.INCOME, active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'cat-maint-exp', companyId, name: 'Manutenção de Veículos', type: FinancialCategoryType.EXPENSE, active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'cat-ins-exp', companyId, name: 'Seguro de Veículos', type: FinancialCategoryType.EXPENSE, active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'cat-track-exp', companyId, name: 'Rastreadores', type: FinancialCategoryType.EXPENSE, active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'cat-doc-exp', companyId, name: 'IPVA e Licenciamento', type: FinancialCategoryType.EXPENSE, active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  ];
  await storage.saveBatch('financialCategories', categories);

  // 5. Suppliers
  const suppliers: Supplier[] = [
    { id: 'sup-1', companyId, name: 'Auto Center Paulista', document: '12.345.678/0001-90', phone: '(11) 98888-1111', category: 'Oficina Mecânica', status: 'ACTIVE', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'sup-2', companyId, name: 'Papeis & Pneus Ltda', document: '98.765.432/0001-10', phone: '(11) 97777-2222', category: 'Autopeças', status: 'ACTIVE', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'sup-3', companyId, name: 'Porto Seguro Cia', document: '61.198.164/0001-60', phone: '(11) 3003-9303', category: 'Seguradora', status: 'ACTIVE', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  ];
  await storage.saveBatch('suppliers', suppliers);

  // 6. Generate 20 Vehicles
  const carModels = [
    { brand: 'Chevrolet', model: 'Onix 1.0 Flex', value: 68000, rent: 750 },
    { brand: 'Hyundai', model: 'HB20 1.0 Sense', value: 70000, rent: 780 },
    { brand: 'Fiat', model: 'Cronos 1.3 Drive', value: 75000, rent: 820 },
    { brand: 'Renault', model: 'Kwid 1.0 Zen', value: 58000, rent: 650 },
    { brand: 'Nissan', model: 'Versa 1.6 Sense', value: 82000, rent: 900 },
    { brand: 'Toyota', model: 'Yaris Sedan XL', value: 88000, rent: 950 },
    { brand: 'Volkswagen', model: 'Polo 1.0 MPI', value: 72000, rent: 800 },
  ];

  const vehicles: Vehicle[] = [];
  for (let i = 1; i <= 20; i++) {
    const base = carModels[(i - 1) % carModels.length];
    const plateLetters = ['ABC', 'GHI', 'JKL', 'MNO', 'PQR', 'STU', 'VWX'][i % 7];
    const plateNum = 1000 + i;
    const plate = `${plateLetters}${plateNum}`;

    let status = VehicleStatus.RENTED;
    if (i === 18 || i === 19) status = VehicleStatus.AVAILABLE;
    if (i === 20) status = VehicleStatus.MAINTENANCE;

    vehicles.push({
      id: `veh-${i}`,
      companyId,
      plate,
      brand: base.brand,
      model: base.model,
      yearFabrication: 2023,
      yearModel: 2024,
      color: i % 2 === 0 ? 'Branco' : 'Prata',
      renavam: `123456789${i < 10 ? '0' + i : i}`,
      chassis: `9BWCA1110000000${i < 10 ? '0' + i : i}`,
      currentKm: 15000 + i * 2400,
      fuelType: 'Flex',
      category: 'Hatch / Sedan Compacto',
      acquisitionValue: base.value,
      currentValue: base.value - 4000,
      rentalValueBase: base.rent,
      status,
      isArchived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
  await storage.saveBatch('vehicles', vehicles);

  // 7. Generate 30 Drivers
  const drivers: Driver[] = [];
  for (let i = 1; i <= 30; i++) {
    drivers.push({
      id: `drv-${i}`,
      companyId,
      fullName: `Motorista Exemplo ${i}`,
      cpf: `123.456.789-${i < 10 ? '0' + i : i}`,
      rg: `12.345.678-${i}`,
      birthDate: '1990-05-15',
      phone: `(11) 98000-${1000 + i}`,
      whatsapp: `(11) 98000-${1000 + i}`,
      email: `motorista${i}@email.com`,
      address: {
        street: 'Rua das Flores',
        number: `${10 + i}`,
        neighborhood: 'Centro',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '01000-000',
      },
      cnhNumber: `998877665${i < 10 ? '0' + i : i}`,
      cnhCategory: 'AB',
      cnhExpiration: '2027-12-31',
      cnhStatus: VehicleStatus.AVAILABLE as any,
      appPlatforms: ['Uber', '99'],
      status: i <= 20 ? DriverStatus.ACTIVE : DriverStatus.INACTIVE,
      isArchived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
  await storage.saveBatch('drivers', drivers);

  // 8. Contracts for Rented Vehicles (1-17)
  const contracts: Contract[] = [];
  const receivables: AccountReceivable[] = [];
  const deposits: SecurityDeposit[] = [];

  for (let i = 1; i <= 17; i++) {
    const vehicle = vehicles[i - 1];
    const driver = drivers[i - 1];

    // Assign link
    vehicle.currentDriverId = driver.id;
    vehicle.currentContractId = `ctr-${i}`;
    driver.currentVehicleId = vehicle.id;
    driver.currentContractId = `ctr-${i}`;

    const contract: Contract = {
      id: `ctr-${i}`,
      companyId,
      contractNumber: `CTR-2026-00${i}`,
      driverId: driver.id,
      vehicleId: vehicle.id,
      startDate: '2026-01-01',
      status: ContractStatus.ACTIVE,
      rentalAmount: vehicle.rentalValueBase,
      billingPeriodicity: RecurringFrequency.WEEKLY,
      billingDueDayOfWeek: 1, // Segunda-feira
      securityDepositAmount: 1500,
      securityDepositId: `dep-${i}`,
      franchiseKm: 1500,
      excessKmRate: 0.5,
      isArchived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    contracts.push(contract);

    // Security deposit record
    deposits.push({
      id: `dep-${i}`,
      companyId,
      contractId: contract.id,
      driverId: driver.id,
      vehicleId: vehicle.id,
      originalAmount: 1500,
      receivedAmount: 1500,
      usedAmount: 0,
      returnedAmount: 0,
      status: SecurityDepositStatus.RECEIVED,
      receivedAt: '2026-01-01',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Sample Receivable
    const isOverdue = i % 4 === 0;
    receivables.push({
      id: `rec-rent-${i}`,
      companyId,
      originType: OriginType.CONTRACT_RENT,
      originId: contract.id,
      vehicleId: vehicle.id,
      driverId: driver.id,
      contractId: contract.id,
      categoryId: 'cat-rent-inc',
      description: `Aluguel Semanal ${contract.contractNumber}`,
      originalAmount: vehicle.rentalValueBase,
      discountAmount: 0,
      fineAmount: isOverdue ? 15 : 0,
      interestAmount: isOverdue ? 5 : 0,
      updatedAmount: vehicle.rentalValueBase + (isOverdue ? 20 : 0),
      paidAmount: isOverdue ? 0 : vehicle.rentalValueBase,
      balanceAmount: isOverdue ? vehicle.rentalValueBase + 20 : 0,
      dueDate: isOverdue ? '2026-08-01' : '2026-08-15',
      competenceDate: '2026-08-01',
      status: isOverdue ? ObligationStatus.OVERDUE : ObligationStatus.PAID,
      idempotencyKey: `CONTRACT_RENT_${contract.id}_inst_1`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  await storage.saveBatch('vehicles', vehicles);
  await storage.saveBatch('drivers', drivers);
  await storage.saveBatch('contracts', contracts);
  await storage.saveBatch('securityDeposits', deposits);
  await storage.saveBatch('accountsReceivable', receivables);

  // 9. Sample Accounts Payable (Maintenance, Insurance, IPVA)
  const payables: AccountPayable[] = [
    {
      id: 'pay-maint-1',
      companyId,
      originType: OriginType.MAINTENANCE,
      originId: 'maint-1',
      vehicleId: 'veh-20',
      supplierId: 'sup-1',
      categoryId: 'cat-maint-exp',
      description: 'Troca de pastilhas de freio e óleo',
      originalAmount: 850,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 850,
      paidAmount: 850,
      balanceAmount: 0,
      dueDate: '2026-08-05',
      competenceDate: '2026-08-05',
      status: ObligationStatus.PAID,
      idempotencyKey: 'MAINTENANCE_maint-1_inst_1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'pay-ins-1',
      companyId,
      originType: OriginType.INSURANCE,
      originId: 'ins-fleet-2026',
      supplierId: 'sup-3',
      categoryId: 'cat-ins-exp',
      description: 'Parcela Seguro Frota Agosto',
      originalAmount: 4200,
      discountAmount: 0,
      fineAmount: 0,
      interestAmount: 0,
      updatedAmount: 4200,
      paidAmount: 0,
      balanceAmount: 4200,
      dueDate: '2026-08-20',
      competenceDate: '2026-08-01',
      status: ObligationStatus.PENDING,
      idempotencyKey: 'INSURANCE_ins-fleet-2026_inst_8',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  await storage.saveBatch('accountsPayable', payables);

  // 10. Sample Maintenance Record
  const maintenances: Maintenance[] = [
    {
      id: 'maint-1',
      companyId,
      vehicleId: 'veh-20',
      supplierId: 'sup-1',
      type: MaintenanceType.REVISION,
      description: 'Revisão de 60.000 KM complete',
      kmAtMaintenance: 60100,
      nextMaintenanceKm: 70000,
      partsCost: 500,
      laborCost: 350,
      totalCost: 850,
      status: MaintenanceStatus.COMPLETED,
      startDate: '2026-08-05',
      completionDate: '2026-08-05',
      accountPayableId: 'pay-maint-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  await storage.saveBatch('maintenances', maintenances);

  return { message: 'AutoERP test database seeded successfully!', seededCount: 20 };
}
