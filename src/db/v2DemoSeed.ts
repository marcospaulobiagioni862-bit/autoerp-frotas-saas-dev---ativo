import { and, eq, inArray, sql } from 'drizzle-orm';

import { db } from './index';
import {
  accountPayables,
  accountReceivables,
  companies,
  contracts,
  drivers,
  financialAccounts,
  financialCategories,
  financialTransactions,
  maintenance,
  paymentMethods,
  securityDepositMovements,
  securityDeposits,
  trackers,
  trafficTickets,
  users,
  vehicleInspections,
  vehicleKmRecords,
  vehicles,
  documents,
  fileAttachments,
} from './schema';
import { userCredentials } from './authSchema';
import { hashPassword } from '../server/password';

const DEMO_TARGETS = new Set(['development', 'test', 'preview']);
const FORBIDDEN_BRANCHES = new Set(['main', 'staging-app']);
const REQUIRED_ARM_VALUE = 'YES_V2_NON_PRODUCTION_ONLY';

function assertSeedSafety() {
  const target = String(process.env.V2_DEMO_SEED_TARGET || '').trim().toLowerCase();
  const armed = String(process.env.ALLOW_V2_DEMO_SEED || '').trim();
  const branch = String(
    process.env.RENDER_GIT_BRANCH ||
    process.env.GIT_BRANCH ||
    process.env.BRANCH ||
    ''
  ).trim();

  if (!DEMO_TARGETS.has(target)) {
    throw new Error('V2_DEMO_SEED_TARGET must be development, test, or preview.');
  }

  if (armed !== REQUIRED_ARM_VALUE) {
    throw new Error('V2 demo seed is disarmed. Set ALLOW_V2_DEMO_SEED=' + REQUIRED_ARM_VALUE + '.');
  }

  if (branch && FORBIDDEN_BRANCHES.has(branch)) {
    throw new Error('V2 demo seed refused on protected branch: ' + branch);
  }

  if (target === 'preview' && branch && branch !== 'v2/core-simplified' && !branch.startsWith('refs/pull/')) {
    throw new Error('Preview seed refused outside v2/core-simplified: ' + branch);
  }
}

function companyKey(companyId: string) {
  const normalized = companyId.toLowerCase().replace(/[^a-z0-9]/g, '');
  return normalized.slice(-12) || 'tenant';
}

function money(value: number) {
  return value.toFixed(2);
}

function addDays(base: Date, days: number) {
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function isoTimestamp(value: Date) {
  const copy = new Date(value);
  copy.setUTCHours(12, 0, 0, 0);
  return copy.toISOString();
}

function cpfFromSequence(index: number) {
  const firstNine = String(700000000 + index).padStart(9, '0').slice(-9);
  const digits = firstNine.split('').map(Number);

  const digit = (source: number[], factorStart: number) => {
    const sum = source.reduce((acc, value, offset) => acc + value * (factorStart - offset), 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  const d1 = digit(digits, 10);
  const d2 = digit([...digits, d1], 11);
  const raw = firstNine + String(d1) + String(d2);
  return raw.slice(0, 3) + '.' + raw.slice(3, 6) + '.' + raw.slice(6, 9) + '-' + raw.slice(9);
}

function parseContractSequence(value: string | null | undefined) {
  const match = /^CNT-(\d{6})$/.exec(String(value || '').trim());
  return match ? Number(match[1]) : 0;
}

export async function runV2DemoSeed() {
  assertSeedSafety();

  const database: any = db;
  let companyId = String(process.env.V2_DEMO_COMPANY_ID || '').trim();

  if (!companyId && String(process.env.V2_DEMO_AUTO_SELECT_SINGLE_COMPANY || '').trim() === 'YES') {
    const candidates = await database
      .select({ id: companies.id })
      .from(companies)
      .limit(2);

    if (candidates.length !== 1) {
      throw new Error(
        'V2 demo auto-selection requires exactly one company in the isolated database; found ' +
          candidates.length +
          '.'
      );
    }

    companyId = candidates[0].id;
  }

  if (!companyId) {
    throw new Error(
      'V2_DEMO_COMPANY_ID is required unless V2_DEMO_AUTO_SELECT_SINGLE_COMPANY=YES on an isolated database.'
    );
  }

  const now = new Date();
  const prefix = 'v2demo-' + companyKey(companyId);

  const company = await database
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  if (!company.length) {
    throw new Error('Company not found for V2_DEMO_COMPANY_ID=' + companyId);
  }

  const activeUser = await database
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.companyId, companyId), eq(users.active, true)))
    .limit(1);

  if (!activeUser.length) {
    throw new Error('V2 demo seed requires one existing active user in the selected company.');
  }

  const createdById = activeUser[0].id;

  const accountIds = {
    cash: prefix + '-account-cash',
    bank: prefix + '-account-bank',
    card: prefix + '-account-card',
  };

  const methodIds = {
    pix: prefix + '-method-pix',
    cash: prefix + '-method-cash',
    transfer: prefix + '-method-transfer',
    card: prefix + '-method-card',
  };

  const categoryIds = {
    rent: prefix + '-cat-rent',
    deposit: prefix + '-cat-deposit',
    maintenance: prefix + '-cat-maintenance',
    insurance: prefix + '-cat-insurance',
    documentation: prefix + '-cat-documentation',
    tracker: prefix + '-cat-tracker',
    trafficFineIncome: prefix + '-cat-traffic-fine-income',
    trafficFineExpense: prefix + '-cat-traffic-fine-expense',
  };

  const demoUsers = [
    {
      id: prefix + '-user-admin',
      name: 'Admin Demo V2',
      email: 'demo.admin.' + companyKey(companyId) + '@example.invalid',
      role: 'ADMIN',
      permissions: ['*'],
    },
    {
      id: prefix + '-user-manager',
      name: 'Gestor Demo V2',
      email: 'demo.manager.' + companyKey(companyId) + '@example.invalid',
      role: 'MANAGER',
      permissions: [
        'VIEW_VEHICLE',
        'EDIT_VEHICLE',
        'VIEW_DRIVER',
        'EDIT_DRIVER',
        'VIEW_CONTRACT',
        'EDIT_CONTRACT',
        'VIEW_FINANCIAL',
        'EDIT_FINANCIAL',
      ],
    },
    {
      id: prefix + '-user-operational',
      name: 'Operador Demo V2',
      email: 'demo.operational.' + companyKey(companyId) + '@example.invalid',
      role: 'OPERATIONAL',
      permissions: [
        'VIEW_VEHICLE',
        'VIEW_DRIVER',
        'VIEW_CONTRACT',
        'CHANGE_VEHICLE_STATUS',
        'OPERATIONS_WRITE',
      ],
    },
    {
      id: prefix + '-user-financial',
      name: 'Financeiro Demo V2',
      email: 'demo.financial.' + companyKey(companyId) + '@example.invalid',
      role: 'FINANCIAL',
      permissions: ['VIEW_FINANCIAL', 'EDIT_FINANCIAL'],
    },
    {
      id: prefix + '-user-readonly',
      name: 'Leitura Demo V2',
      email: 'demo.readonly.' + companyKey(companyId) + '@example.invalid',
      role: 'READONLY',
      permissions: ['VIEW_VEHICLE', 'VIEW_DRIVER', 'VIEW_CONTRACT', 'VIEW_FINANCIAL'],
    },
  ];

  const demoPassword = 'DemoSenha@123456';
  const demoPasswordHash = await hashPassword(demoPassword);

  const vehicleSpecs = [
    ['DMO1A01', 'Chevrolet', 'Onix 1.0', 2024, 32840, 850, 'RENTED'],
    ['DMO1B02', 'Hyundai', 'HB20 1.0', 2024, 41120, 820, 'RENTED'],
    ['DMO1C03', 'Fiat', 'Cronos 1.3', 2024, 27650, 900, 'RENTED'],
    ['DMO1D04', 'Renault', 'Kwid 1.0', 2023, 55300, 750, 'RENTED'],
    ['DMO1E05', 'Volkswagen', 'Polo 1.0', 2024, 18440, 880, 'AVAILABLE'],
    ['DMO1F06', 'Nissan', 'Versa 1.6', 2023, 62410, 950, 'RENTED'],
    ['DMO1G07', 'Toyota', 'Yaris Sedan', 2024, 36880, 990, 'MAINTENANCE'],
    ['DMO1H08', 'Chevrolet', 'Onix Plus', 2023, 71620, 920, 'BLOCKED'],
    ['DMO1M09', 'Honda', 'CG 160 Fan', 2024, 12400, 350, 'AVAILABLE'],
    ['DMO1T10', 'Triumph', 'Tiger 1200', 2024, 8500, 1100, 'AVAILABLE'],
  ] as const;

  const vehicleRows = vehicleSpecs.map((spec, index) => {
    let category = 'Hatch / Sedan Compacto';
    if (spec[0] === 'DMO1M09' || spec[0] === 'DMO1T10') {
      category = 'Moto';
    } else if (index === 2 || index === 5) {
      category = 'Sedan Médio';
    }

    let notes = 'Dado fictício V2 para homologação.';
    if (spec[0] === 'DMO1A01') {
      notes = 'Proprietário: TRIFLEX LOCADORA LTDA (CNPJ: 12.345.678/0001-90). Dado fictício V2 para homologação.';
    } else if (spec[0] === 'DMO1B02') {
      notes = 'Proprietário: Marcos Vinicius (CPF: 123.456.789-00). Dado fictício V2 para homologação.';
    } else if (spec[0] === 'DMO1M09') {
      notes = 'Motocicleta Honda CG 160 Fan para homologação de categoria Moto (AUTOERP-20). Proprietário: MOVEFLEX LOCADORA LTDA (CNPJ: 12.345.678/0001-90).';
    } else if (spec[0] === 'DMO1T10') {
      notes = 'Motocicleta Triumph Tiger 1200 para homologação de categoria Moto (AUTOERP-20). Proprietário: Marcos Vinicius (CPF: 123.456.789-00).';
    }

    return {
      id: prefix + '-vehicle-' + String(index + 1).padStart(2, '0'),
      companyId,
      plate: spec[0],
      renavam: String(98000000000 + index + 1),
      brand: spec[1],
      model: spec[2],
      version: 'Demo V2',
      yearFabrication: spec[3] - 1,
      yearModel: spec[3],
      color: index % 2 === 0 ? 'Branco' : 'Prata',
      chassis: '9BDV2DEMO000' + String(index + 1).padStart(5, '0'),
      currentKm: spec[4],
      nextMaintenanceKm: spec[4] + 10000,
      fuelType: spec[0] === 'DMO1T10' ? 'Gasolina' : 'Flex',
      category,
      acquisitionValue: money(69000 + index * 3500),
      currentValue: money(63000 + index * 3200),
      rentalValueBase: money(spec[5]),
      status: spec[6],
      notes,
      isArchived: false,
    };
  });

  const driverNames = [
    'Ana Souza Demo',
    'Bruno Martins Demo',
    'Carla Oliveira Demo',
    'Diego Santos Demo',
    'Elaine Costa Demo',
    'Fernando Lima Demo',
    'Gabriela Alves Demo',
    'Henrique Rocha Demo',
    'Isabela Mendes Demo',
    'João Ribeiro Demo',
  ];

  const driverRows = driverNames.map((name, index) => ({
    id: prefix + '-driver-' + String(index + 1).padStart(2, '0'),
    companyId,
    name,
    cpf: cpfFromSequence(index + 1),
    cnh: String(91000000000 + index + 1),
    phone: index === 0 ? '11999887766' : '119888800' + String(index + 1).padStart(2, '0'),
    whatsapp: index === 0 ? '11999887766' : '119888800' + String(index + 1).padStart(2, '0'),
    maritalStatus: index % 2 === 0 ? 'SOLTEIRO' : 'CASADO',
    profession: 'Motorista de aplicativo',
    pixKey: 'demo.motorista.' + String(index + 1) + '@example.invalid',
    active: index < 8,
  }));

  const contractIds = [1, 2, 3, 4, 5, 6].map(
    (index) => prefix + '-contract-' + String(index).padStart(2, '0')
  );

  await database.transaction(async (tx: any) => {
    const userInsertRows = demoUsers.map((u) => ({
      id: u.id,
      companyId,
      name: u.name,
      email: u.email,
      role: u.role,
      active: true,
      permissions: u.permissions,
    }));

    await tx.insert(users).values(userInsertRows).onConflictDoNothing();

    for (const u of userInsertRows) {
      await tx
        .update(users)
        .set({
          name: u.name,
          role: u.role,
          active: true,
          permissions: u.permissions,
        })
        .where(and(eq(users.id, u.id), eq(users.companyId, companyId)));
    }

    const credentialRows = demoUsers.map((u) => ({
      companyId,
      userId: u.id,
      passwordHash: demoPasswordHash,
      passwordUpdatedAt: isoTimestamp(now),
    }));

    await tx.insert(userCredentials).values(credentialRows).onConflictDoNothing();

    for (const cred of credentialRows) {
      await tx
        .update(userCredentials)
        .set({
          passwordHash: cred.passwordHash,
          passwordUpdatedAt: cred.passwordUpdatedAt,
        })
        .where(
          and(
            eq(userCredentials.companyId, companyId),
            eq(userCredentials.userId, cred.userId)
          )
        );
    }

    const existingDemoContracts = await tx
      .select({ id: contracts.id, contractNumber: contracts.contractNumber })
      .from(contracts)
      .where(and(eq(contracts.companyId, companyId), inArray(contracts.id, contractIds)));

    const existingNumberById = new Map(
      existingDemoContracts.map((row: any) => [row.id, row.contractNumber])
    );

    const companyContractNumbers = await tx
      .select({ contractNumber: contracts.contractNumber })
      .from(contracts)
      .where(eq(contracts.companyId, companyId));

    let nextSequence = companyContractNumbers.reduce(
      (max: number, row: any) => Math.max(max, parseContractSequence(row.contractNumber)),
      0
    );

    const contractNumbers = contractIds.map((id) => {
      const existing = existingNumberById.get(id);
      if (existing) return existing;
      nextSequence += 1;
      return 'CNT-' + String(nextSequence).padStart(6, '0');
    });

    const contractRows = contractIds.map((id, index) => {
      if (index === 4) {
        return {
          id,
          companyId,
          driverId: driverRows[index].id,
          vehicleId: vehicleRows[index].id,
          status: 'DRAFT',
          contractNumber: contractNumbers[index],
          startDate: isoDate(addDays(now, 2)),
          endDate: null,
          rentalAmount: vehicleRows[index].rentalValueBase,
          billingPeriodicity: 'WEEKLY',
          billingDueDayOfWeek: 1,
          billingDueDayOfMonth: 1,
          securityDepositAmount: money(1000),
          securityDepositId: prefix + '-deposit-' + String(index + 1).padStart(2, '0'),
          franchiseKm: 1500,
          excessKmRate: money(0.75),
          paymentMethodId: methodIds.pix,
          signatureRequired: true,
          notes: 'Contrato em rascunho (DRAFT) para homologação do ciclo de ativação e versionamento (AUTOERP-53).',
          isArchived: false,
        };
      }

      if (index === 5) {
        return {
          id,
          companyId,
          driverId: driverRows[index].id,
          vehicleId: vehicleRows[index].id,
          status: 'ACTIVE',
          contractNumber: contractNumbers[index],
          startDate: isoDate(addDays(now, -60)),
          endDate: isoDate(now),
          rentalAmount: vehicleRows[index].rentalValueBase,
          billingPeriodicity: 'WEEKLY',
          billingDueDayOfWeek: 1,
          billingDueDayOfMonth: 1,
          securityDepositAmount: money(1200),
          securityDepositId: prefix + '-deposit-' + String(index + 1).padStart(2, '0'),
          franchiseKm: 1500,
          excessKmRate: money(0.75),
          paymentMethodId: methodIds.pix,
          signatureRequired: false,
          notes: 'Contrato ativo pronto para encerramento sem leitura de KM final de check-in (AUTOERP-09).',
          isArchived: false,
        };
      }

      return {
        id,
        companyId,
        driverId: driverRows[index].id,
        vehicleId: vehicleRows[index].id,
        status: 'ACTIVE',
        contractNumber: contractNumbers[index],
        startDate: isoDate(addDays(now, -45 - index * 7)),
        endDate: null,
        rentalAmount: vehicleRows[index].rentalValueBase,
        billingPeriodicity: 'WEEKLY',
        billingDueDayOfWeek: 1,
        billingDueDayOfMonth: 1,
        securityDepositAmount: money([1000, 1200, 1500, 1000][index]),
        securityDepositId: prefix + '-deposit-' + String(index + 1).padStart(2, '0'),
        franchiseKm: 1500,
        excessKmRate: money(0.75),
        paymentMethodId: methodIds.pix,
        signatureRequired: false,
        notes: 'Contrato fictício V2 para homologação.',
        isArchived: false,
      };
    });

    vehicleRows.slice(0, 4).forEach((vehicle, index) => {
      (vehicle as any).currentDriverId = driverRows[index].id;
      (vehicle as any).currentContractId = contractRows[index].id;
    });

    (vehicleRows[5] as any).currentDriverId = driverRows[5].id;
    (vehicleRows[5] as any).currentContractId = contractRows[5].id;
    (vehicleRows[5] as any).status = 'RENTED';

    await tx.insert(financialAccounts).values([
      {
        id: accountIds.cash,
        companyId,
        name: 'Caixa Demo V2',
        type: 'CASH',
        initialBalance: money(2500),
        currentBalance: money(2500),
        status: 'ACTIVE',
      },
      {
        id: accountIds.bank,
        companyId,
        name: 'Banco Demo V2',
        type: 'BANK',
        institution: 'Banco Fictício',
        accountNumber: '000123-4',
        agency: '0001',
        pixKey: 'financeiro.demo.v2@example.invalid',
        initialBalance: money(20000),
        currentBalance: money(23000),
        status: 'ACTIVE',
      },
      {
        id: accountIds.card,
        companyId,
        name: 'Cartão Empresarial Demo V2',
        type: 'CREDIT_CARD',
        institution: 'Cartão Fictício',
        initialBalance: money(0),
        currentBalance: money(0),
        status: 'ACTIVE',
      },
    ]).onConflictDoNothing();

    const accountUpdates = [
      { id: accountIds.cash, currentBalance: money(2500) },
      { id: accountIds.bank, currentBalance: money(23000) },
      { id: accountIds.card, currentBalance: money(0) },
    ];

    for (const account of accountUpdates) {
      await tx
        .update(financialAccounts)
        .set({ currentBalance: account.currentBalance, status: 'ACTIVE' })
        .where(and(eq(financialAccounts.id, account.id), eq(financialAccounts.companyId, companyId)));
    }

    await tx.insert(paymentMethods).values([
      { id: methodIds.pix, companyId, name: 'PIX Demo V2', type: 'PIX', feePercentage: money(0), active: true },
      { id: methodIds.cash, companyId, name: 'Dinheiro Demo V2', type: 'CASH', feePercentage: money(0), active: true },
      { id: methodIds.transfer, companyId, name: 'Transferência Demo V2', type: 'BANK_TRANSFER', feePercentage: money(0), active: true },
      { id: methodIds.card, companyId, name: 'Cartão Demo V2', type: 'CREDIT_CARD', feePercentage: money(2.5), active: true },
    ]).onConflictDoNothing();

    for (const methodId of Object.values(methodIds)) {
      await tx
        .update(paymentMethods)
        .set({ active: true })
        .where(and(eq(paymentMethods.id, methodId), eq(paymentMethods.companyId, companyId)));
    }

    await tx.insert(financialCategories).values([
      { id: categoryIds.rent, companyId, name: 'Locação Demo V2', type: 'INCOME', active: true },
      { id: categoryIds.deposit, companyId, name: 'Caução Demo V2', type: 'INCOME', active: true },
      { id: categoryIds.maintenance, companyId, name: 'Manutenção Demo V2', type: 'EXPENSE', active: true },
      { id: categoryIds.insurance, companyId, name: 'Seguro Demo V2', type: 'EXPENSE', active: true },
      { id: categoryIds.documentation, companyId, name: 'Documentação Demo V2', type: 'EXPENSE', active: true },
      { id: categoryIds.tracker, companyId, name: 'Rastreador Demo V2', type: 'EXPENSE', active: true },
      { id: categoryIds.trafficFineIncome, companyId, name: 'Multas cobradas de motoristas Demo V2', type: 'INCOME', active: true },
      { id: categoryIds.trafficFineExpense, companyId, name: 'Multas de trânsito Demo V2', type: 'EXPENSE', active: true },
    ]).onConflictDoNothing();

    for (const categoryId of Object.values(categoryIds)) {
      await tx
        .update(financialCategories)
        .set({ active: true })
        .where(and(eq(financialCategories.id, categoryId), eq(financialCategories.companyId, companyId)));
    }

    await tx.insert(drivers).values(driverRows).onConflictDoNothing();

    for (const driver of driverRows) {
      await tx
        .update(drivers)
        .set({
          name: driver.name,
          cpf: driver.cpf,
          cnh: driver.cnh,
          maritalStatus: driver.maritalStatus,
          profession: driver.profession,
          pixKey: driver.pixKey,
          active: driver.active,
        })
        .where(and(eq(drivers.id, driver.id), eq(drivers.companyId, companyId)));

      await tx.execute(
        sql`UPDATE drivers SET phone = ${driver.phone}, whatsapp = ${driver.whatsapp} WHERE id = ${driver.id} AND company_id = ${companyId}`
      );
    }

    await tx.insert(vehicles).values(vehicleRows).onConflictDoNothing();

    for (const vehicle of vehicleRows) {
      await tx
        .update(vehicles)
        .set({
          plate: vehicle.plate,
          renavam: vehicle.renavam,
          brand: vehicle.brand,
          model: vehicle.model,
          version: vehicle.version,
          yearFabrication: vehicle.yearFabrication,
          yearModel: vehicle.yearModel,
          color: vehicle.color,
          chassis: vehicle.chassis,
          currentKm: vehicle.currentKm,
          nextMaintenanceKm: vehicle.nextMaintenanceKm,
          fuelType: vehicle.fuelType,
          category: vehicle.category,
          acquisitionValue: vehicle.acquisitionValue,
          currentValue: vehicle.currentValue,
          rentalValueBase: vehicle.rentalValueBase,
          status: vehicle.status,
          notes: vehicle.notes,
          currentDriverId: (vehicle as any).currentDriverId || null,
          currentContractId: (vehicle as any).currentContractId || null,
          isArchived: false,
        })
        .where(and(eq(vehicles.id, vehicle.id), eq(vehicles.companyId, companyId)));
    }

    await tx.insert(contracts).values(contractRows).onConflictDoNothing();

    for (const contract of contractRows) {
      await tx
        .update(contracts)
        .set({
          driverId: contract.driverId,
          vehicleId: contract.vehicleId,
          status: contract.status,
          startDate: contract.startDate,
          endDate: contract.endDate || null,
          rentalAmount: contract.rentalAmount,
          billingPeriodicity: contract.billingPeriodicity,
          billingDueDayOfWeek: contract.billingDueDayOfWeek,
          securityDepositAmount: contract.securityDepositAmount,
          securityDepositId: contract.securityDepositId,
          franchiseKm: contract.franchiseKm,
          excessKmRate: contract.excessKmRate,
          paymentMethodId: contract.paymentMethodId,
          signatureRequired: contract.signatureRequired,
          notes: contract.notes,
          isArchived: false,
        })
        .where(and(eq(contracts.id, contract.id), eq(contracts.companyId, companyId)));
    }

    const depositAmounts = [1000, 1200, 1500, 1000, 1000, 1200];
    const depositReceived = [1000, 1200, 500, 0, 0, 1200];

    const depositRows = contractRows.map((contract, index) => ({
      id: prefix + '-deposit-' + String(index + 1).padStart(2, '0'),
      companyId,
      contractId: contract.id,
      driverId: contract.driverId,
      vehicleId: contract.vehicleId,
      amount: money(depositAmounts[index]),
      originalAmount: money(depositAmounts[index]),
      receivedAmount: money(depositReceived[index]),
      usedAmount: money(0),
      returnedAmount: money(0),
      status: depositReceived[index] === depositAmounts[index] ? 'RECEIVED' : 'PENDING',
      receivedAt: depositReceived[index] > 0 ? isoTimestamp(addDays(now, -30 + index)) : null,
      notes: 'Caução fictícia V2 para homologação.',
    }));

    await tx.insert(securityDeposits).values(depositRows).onConflictDoNothing();

    for (const deposit of depositRows) {
      await tx
        .update(securityDeposits)
        .set({
          amount: deposit.amount,
          originalAmount: deposit.originalAmount,
          receivedAmount: deposit.receivedAmount,
          usedAmount: deposit.usedAmount,
          returnedAmount: deposit.returnedAmount,
          status: deposit.status,
          receivedAt: deposit.receivedAt,
          notes: deposit.notes,
        })
        .where(and(eq(securityDeposits.id, deposit.id), eq(securityDeposits.companyId, companyId)));
    }

    const rentReceivables = [
      {
        id: prefix + '-receivable-rent-01',
        contract: contractRows[0],
        original: 850,
        fine: 0,
        interest: 0,
        additional: 0,
        paid: 0,
        dueOffset: 3,
        status: 'PENDING',
        installmentNumber: 1,
        totalInstallments: 1,
        installmentGroupId: prefix + '-rent-group-01',
      },
      {
        id: prefix + '-receivable-rent-02',
        contract: contractRows[1],
        original: 820,
        fine: 20,
        interest: 10,
        additional: 0,
        paid: 0,
        dueOffset: -6,
        status: 'OVERDUE',
        installmentNumber: 1,
        totalInstallments: 1,
        installmentGroupId: prefix + '-rent-group-02',
      },
      {
        id: prefix + '-receivable-rent-03',
        contract: contractRows[2],
        original: 900,
        fine: 0,
        interest: 0,
        additional: 0,
        paid: 300,
        dueOffset: 1,
        status: 'PARTIALLY_PAID',
        installmentNumber: 1,
        totalInstallments: 1,
        installmentGroupId: prefix + '-rent-group-03',
      },
      {
        id: prefix + '-receivable-rent-04',
        contract: contractRows[3],
        original: 750,
        fine: 0,
        interest: 0,
        additional: 0,
        paid: 750,
        dueOffset: -7,
        status: 'PAID',
        installmentNumber: 1,
        totalInstallments: 2,
        installmentGroupId: prefix + '-rent-group-04',
      },
      {
        id: prefix + '-receivable-rent-04-p2',
        contract: contractRows[3],
        original: 750,
        fine: 0,
        interest: 0,
        additional: 0,
        paid: 0,
        dueOffset: 5,
        status: 'PENDING',
        installmentNumber: 2,
        totalInstallments: 2,
        installmentGroupId: prefix + '-rent-group-04',
      },
      {
        id: prefix + '-receivable-rent-06',
        contract: contractRows[5],
        original: 950,
        fine: 0,
        interest: 0,
        additional: 0,
        paid: 950,
        dueOffset: -14,
        status: 'PAID',
        installmentNumber: 1,
        totalInstallments: 1,
        installmentGroupId: prefix + '-rent-group-06',
      },
    ];

    const receivableRows: any[] = rentReceivables.map((item, index) => {
      const updated = item.original + item.fine + item.interest + item.additional;
      const installmentNumber = item.installmentNumber || 1;
      const totalInstallments = item.totalInstallments || 1;
      const installmentSuffix = totalInstallments > 1 ? ' (' + installmentNumber + '/' + totalInstallments + ')' : '';

      return {
        id: item.id,
        companyId,
        originType: 'CONTRACT_RENT',
        originId: item.contract.id,
        vehicleId: item.contract.vehicleId,
        driverId: item.contract.driverId,
        contractId: item.contract.id,
        categoryId: categoryIds.rent,
        description: 'Aluguel semanal ' + item.contract.contractNumber + ' - Demo V2' + installmentSuffix,
        originalAmount: money(item.original),
        discountAmount: money(0),
        fineAmount: money(item.fine),
        interestAmount: money(item.interest),
        additionalAmount: money(item.additional),
        updatedAmount: money(updated),
        paidAmount: money(item.paid),
        balanceAmount: money(updated - item.paid),
        dueDate: isoTimestamp(addDays(now, item.dueOffset)),
        competenceDate: isoTimestamp(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))),
        status: item.status,
        installmentGroupId: item.installmentGroupId || prefix + '-rent-group-' + String(index + 1),
        installmentNumber,
        totalInstallments,
        periodRef: isoDate(now).slice(0, 7) + '-demo-' + String(index + 1),
        idempotencyKey: prefix + ':rent:' + item.id,
        notes: 'Título fictício para homologação do fluxo CR -> Recebimento.',
      };
    });

    const depositReceivableRows: any[] = contractRows.map((contract, index) => {
      const original = depositAmounts[index];
      const paid = depositReceived[index];
      return {
        id: prefix + '-receivable-deposit-' + String(index + 1).padStart(2, '0'),
        companyId,
        originType: 'SECURITY_DEPOSIT',
        originId: contract.id,
        vehicleId: contract.vehicleId,
        driverId: contract.driverId,
        contractId: contract.id,
        categoryId: categoryIds.deposit,
        description: 'Caução ' + contract.contractNumber + ' - Demo V2',
        originalAmount: money(original),
        discountAmount: money(0),
        fineAmount: money(0),
        interestAmount: money(0),
        additionalAmount: money(0),
        updatedAmount: money(original),
        paidAmount: money(paid),
        balanceAmount: money(original - paid),
        dueDate: isoTimestamp(addDays(now, -20 + index)),
        competenceDate: isoTimestamp(addDays(now, -30)),
        status: paid === original ? 'PAID' : paid > 0 ? 'PARTIALLY_PAID' : 'PENDING',
        installmentGroupId: prefix + '-deposit-group-' + String(index + 1),
        installmentNumber: 1,
        totalInstallments: 1,
        periodRef: 'deposit-demo-' + String(index + 1),
        idempotencyKey: prefix + ':deposit:' + String(index + 1),
        notes: 'Caução fictícia para homologação.',
      };
    });

    await tx.insert(accountReceivables).values([...receivableRows, ...depositReceivableRows]).onConflictDoUpdate({
      target: accountReceivables.id,
      set: { notes: 'Dado fictício V2 atualizado pelo seed.' },
    });

    for (const row of [...receivableRows, ...depositReceivableRows]) {
      await tx
        .update(accountReceivables)
        .set(row)
        .where(and(eq(accountReceivables.id, row.id), eq(accountReceivables.companyId, companyId)));
    }

    const payableRows: any[] = [
      {
        id: prefix + '-payable-maintenance',
        companyId,
        originType: 'MAINTENANCE',
        originId: prefix + '-maintenance-01',
        vehicleId: vehicleRows[6].id,
        categoryId: categoryIds.maintenance,
        description: 'Revisão preventiva veículo ' + vehicleRows[6].plate + ' - Demo V2',
        originalAmount: money(650),
        discountAmount: money(0),
        fineAmount: money(0),
        interestAmount: money(0),
        additionalAmount: money(0),
        updatedAmount: money(650),
        paidAmount: money(650),
        balanceAmount: money(0),
        dueDate: isoTimestamp(addDays(now, -8)),
        competenceDate: isoTimestamp(addDays(now, -12)),
        status: 'PAID',
        supplierId: prefix + '-supplier-workshop',
        installmentGroupId: prefix + '-payable-maintenance-group',
        installmentNumber: 1,
        totalInstallments: 1,
        periodRef: 'maintenance-demo',
        idempotencyKey: prefix + ':payable:maintenance',
        notes: 'Despesa fictícia paga.',
      },
      {
        id: prefix + '-payable-insurance',
        companyId,
        originType: 'INSURANCE',
        originId: prefix + '-insurance-01',
        categoryId: categoryIds.insurance,
        description: 'Seguro da frota - Demo V2',
        originalAmount: money(1800),
        discountAmount: money(0),
        fineAmount: money(0),
        interestAmount: money(0),
        additionalAmount: money(0),
        updatedAmount: money(1800),
        paidAmount: money(0),
        balanceAmount: money(1800),
        dueDate: isoTimestamp(addDays(now, 5)),
        competenceDate: isoTimestamp(now),
        status: 'PENDING',
        supplierId: prefix + '-supplier-insurance',
        installmentGroupId: prefix + '-payable-insurance-group',
        installmentNumber: 1,
        totalInstallments: 1,
        periodRef: isoDate(now).slice(0, 7) + '-insurance-demo',
        idempotencyKey: prefix + ':payable:insurance',
        notes: 'Despesa fictícia em aberto.',
      },
      {
        id: prefix + '-payable-documentation',
        companyId,
        originType: 'DOCUMENTATION',
        originId: prefix + '-documentation-01',
        vehicleId: vehicleRows[7].id,
        categoryId: categoryIds.documentation,
        description: 'Licenciamento veículo ' + vehicleRows[7].plate + ' - Demo V2',
        originalAmount: money(420),
        discountAmount: money(0),
        fineAmount: money(12),
        interestAmount: money(4),
        additionalAmount: money(0),
        updatedAmount: money(436),
        paidAmount: money(0),
        balanceAmount: money(436),
        dueDate: isoTimestamp(addDays(now, -10)),
        competenceDate: isoTimestamp(addDays(now, -20)),
        status: 'OVERDUE',
        supplierId: prefix + '-supplier-documentation',
        installmentGroupId: prefix + '-payable-documentation-group',
        installmentNumber: 1,
        totalInstallments: 1,
        periodRef: isoDate(now).slice(0, 7) + '-documentation-demo',
        idempotencyKey: prefix + ':payable:documentation',
        notes: 'Despesa fictícia vencida com ajustes.',
      },
      {
        id: prefix + '-payable-tracker',
        companyId,
        originType: 'TRACKER',
        originId: prefix + '-tracker-01',
        vehicleId: vehicleRows[0].id,
        categoryId: categoryIds.tracker,
        description: 'Rastreador mensal veículo ' + vehicleRows[0].plate + ' - Demo V2',
        originalAmount: money(180),
        discountAmount: money(0),
        fineAmount: money(0),
        interestAmount: money(0),
        additionalAmount: money(20),
        updatedAmount: money(200),
        paidAmount: money(100),
        balanceAmount: money(100),
        dueDate: isoTimestamp(addDays(now, 2)),
        competenceDate: isoTimestamp(now),
        status: 'PARTIALLY_PAID',
        supplierId: prefix + '-supplier-tracker',
        installmentGroupId: prefix + '-payable-tracker-group',
        installmentNumber: 1,
        totalInstallments: 1,
        periodRef: isoDate(now).slice(0, 7) + '-tracker-demo',
        idempotencyKey: prefix + ':payable:tracker',
        notes: 'Despesa fictícia parcial com acréscimo.',
      },
    ];

    await tx.insert(accountPayables).values(payableRows).onConflictDoUpdate({
      target: accountPayables.id,
      set: { notes: 'Dado fictício V2 atualizado pelo seed.' },
    });

    for (const row of payableRows) {
      await tx
        .update(accountPayables)
        .set(row)
        .where(and(eq(accountPayables.id, row.id), eq(accountPayables.companyId, companyId)));
    }

    const transactionRows = [
      {
        id: prefix + '-tx-rent-partial',
        companyId,
        financialAccountId: accountIds.bank,
        receivableId: prefix + '-receivable-rent-03',
        type: 'INCOME',
        amount: money(300),
        paymentMethodId: methodIds.pix,
        transactionDate: isoTimestamp(addDays(now, -1)),
        competenceDate: isoTimestamp(now),
        description: 'Recebimento parcial aluguel Demo V2',
        isReversed: false,
        vehicleId: contractRows[2].vehicleId,
        driverId: contractRows[2].driverId,
        createdById,
        idempotencyKey: prefix + ':tx:rent-partial',
      },
      {
        id: prefix + '-tx-rent-paid',
        companyId,
        financialAccountId: accountIds.bank,
        receivableId: prefix + '-receivable-rent-04',
        type: 'INCOME',
        amount: money(750),
        paymentMethodId: methodIds.pix,
        transactionDate: isoTimestamp(addDays(now, -2)),
        competenceDate: isoTimestamp(now),
        description: 'Recebimento integral aluguel Demo V2',
        isReversed: false,
        vehicleId: contractRows[3].vehicleId,
        driverId: contractRows[3].driverId,
        createdById,
        idempotencyKey: prefix + ':tx:rent-paid',
      },
      {
        id: prefix + '-tx-rent-paid-06',
        companyId,
        financialAccountId: accountIds.bank,
        receivableId: prefix + '-receivable-rent-06',
        type: 'INCOME',
        amount: money(950),
        paymentMethodId: methodIds.pix,
        transactionDate: isoTimestamp(addDays(now, -14)),
        competenceDate: isoTimestamp(now),
        description: 'Recebimento integral aluguel Contrato 6 Demo V2',
        isReversed: false,
        vehicleId: contractRows[5].vehicleId,
        driverId: contractRows[5].driverId,
        createdById,
        idempotencyKey: prefix + ':tx:rent-paid:06',
      },
      ...depositReceived
        .map((amount, index) => ({ amount, index }))
        .filter((item) => item.amount > 0)
        .map((item) => ({
          id: prefix + '-tx-deposit-' + String(item.index + 1).padStart(2, '0'),
          companyId,
          financialAccountId: accountIds.bank,
          receivableId: prefix + '-receivable-deposit-' + String(item.index + 1).padStart(2, '0'),
          type: 'INCOME',
          amount: money(item.amount),
          paymentMethodId: methodIds.pix,
          transactionDate: isoTimestamp(addDays(now, -25 + item.index)),
          competenceDate: isoTimestamp(addDays(now, -30)),
          description: 'Recebimento de caução Demo V2',
          isReversed: false,
          vehicleId: contractRows[item.index].vehicleId,
          driverId: contractRows[item.index].driverId,
          createdById,
          idempotencyKey: prefix + ':tx:deposit:' + String(item.index + 1),
        })),
      {
        id: prefix + '-tx-maintenance-paid',
        companyId,
        financialAccountId: accountIds.bank,
        payableId: prefix + '-payable-maintenance',
        type: 'EXPENSE',
        amount: money(650),
        paymentMethodId: methodIds.pix,
        transactionDate: isoTimestamp(addDays(now, -8)),
        competenceDate: isoTimestamp(addDays(now, -12)),
        description: 'Pagamento manutenção Demo V2',
        isReversed: false,
        vehicleId: vehicleRows[6].id,
        supplierId: prefix + '-supplier-workshop',
        createdById,
        idempotencyKey: prefix + ':tx:maintenance-paid',
      },
      {
        id: prefix + '-tx-tracker-partial',
        companyId,
        financialAccountId: accountIds.bank,
        payableId: prefix + '-payable-tracker',
        type: 'EXPENSE',
        amount: money(100),
        paymentMethodId: methodIds.pix,
        transactionDate: isoTimestamp(addDays(now, -1)),
        competenceDate: isoTimestamp(now),
        description: 'Pagamento parcial rastreador Demo V2',
        isReversed: false,
        vehicleId: vehicleRows[0].id,
        supplierId: prefix + '-supplier-tracker',
        createdById,
        idempotencyKey: prefix + ':tx:tracker-partial',
      },
    ];

    await tx.insert(financialTransactions).values(transactionRows).onConflictDoNothing();

    const depositMovementRows = depositReceived
      .map((amount, index) => ({ amount, index }))
      .filter((item) => item.amount > 0)
      .map((item) => ({
        id: prefix + '-deposit-movement-' + String(item.index + 1).padStart(2, '0'),
        companyId,
        depositId: prefix + '-deposit-' + String(item.index + 1).padStart(2, '0'),
        type: 'RECEIPT',
        amount: money(item.amount),
        date: isoTimestamp(addDays(now, -25 + item.index)),
        financialTransactionId: prefix + '-tx-deposit-' + String(item.index + 1).padStart(2, '0'),
        receivableId: prefix + '-receivable-deposit-' + String(item.index + 1).padStart(2, '0'),
        description: 'Recebimento de caução Demo V2',
        createdById,
      }));

    await tx.insert(securityDepositMovements).values(depositMovementRows).onConflictDoNothing();

    for (const movement of depositMovementRows) {
      await tx
        .update(securityDepositMovements)
        .set({
          depositId: movement.depositId,
          type: movement.type,
          amount: movement.amount,
          date: movement.date,
          financialTransactionId: movement.financialTransactionId,
          receivableId: movement.receivableId,
          description: movement.description,
          createdById,
        })
        .where(and(eq(securityDepositMovements.id, movement.id), eq(securityDepositMovements.companyId, companyId)));
    }

    for (const transaction of transactionRows) {
      await tx
        .update(financialTransactions)
        .set({
          financialAccountId: transaction.financialAccountId,
          receivableId: (transaction as any).receivableId || null,
          payableId: (transaction as any).payableId || null,
          type: transaction.type,
          amount: transaction.amount,
          paymentMethodId: transaction.paymentMethodId,
          transactionDate: transaction.transactionDate,
          competenceDate: transaction.competenceDate,
          description: transaction.description,
          isReversed: false,
          vehicleId: transaction.vehicleId || null,
          driverId: (transaction as any).driverId || null,
          supplierId: (transaction as any).supplierId || null,
          createdById,
          idempotencyKey: transaction.idempotencyKey,
        })
        .where(and(eq(financialTransactions.id, transaction.id), eq(financialTransactions.companyId, companyId)));
    }

    const kmRows = vehicleRows.slice(0, 4).map((vehicle, index) => ({
      id: prefix + '-km-' + String(index + 1).padStart(2, '0'),
      companyId,
      vehicleId: vehicle.id,
      driverId: driverRows[index].id,
      contractId: contractRows[index].id,
      kmValue: vehicle.currentKm,
      recordDate: isoDate(now),
      readingType: 'PERIODIC',
      sourceType: 'MANUAL',
      notes: 'Conferência fictícia de KM oficial para homologação V2.',
    }));

    await tx.insert(vehicleKmRecords).values(kmRows).onConflictDoNothing();

    for (const km of kmRows) {
      await tx
        .update(vehicleKmRecords)
        .set({
          vehicleId: km.vehicleId,
          driverId: km.driverId,
          contractId: km.contractId,
          kmValue: km.kmValue,
          recordDate: km.recordDate,
          readingType: km.readingType,
          notes: km.notes,
        })
        .where(and(eq(vehicleKmRecords.id, km.id), eq(vehicleKmRecords.companyId, companyId)));
    }

    const maintenanceRows = [
      {
        id: prefix + '-maintenance-01',
        companyId,
        vehicleId: vehicleRows[6].id,
        type: 'PREVENTIVE',
        status: 'IN_PROGRESS',
        cost: money(650),
        date: isoTimestamp(addDays(now, -2)),
        description: 'Revisão preventiva 40.000 km - óleo, filtros e inspeção geral.',
      },
      {
        id: prefix + '-maintenance-02',
        companyId,
        vehicleId: vehicleRows[4].id,
        type: 'CORRECTIVE',
        status: 'COMPLETED',
        cost: money(380),
        date: isoTimestamp(addDays(now, -18)),
        description: 'Troca de pastilhas de freio dianteiras - Demo V2.',
      },
      {
        id: prefix + '-maintenance-03',
        companyId,
        vehicleId: vehicleRows[5].id,
        type: 'PREVENTIVE',
        status: 'SCHEDULED',
        cost: money(520),
        date: isoTimestamp(addDays(now, 7)),
        description: 'Revisão programada 70.000 km - Demo V2.',
      },
    ];

    await tx.insert(maintenance).values(maintenanceRows).onConflictDoNothing();
    for (const row of maintenanceRows) {
      await tx
        .update(maintenance)
        .set({
          vehicleId: row.vehicleId,
          type: row.type,
          status: row.status,
          cost: row.cost,
          date: row.date,
          description: row.description,
        })
        .where(and(eq(maintenance.id, row.id), eq(maintenance.companyId, companyId)));
    }

    const trackerRows = vehicleRows.slice(0, 6).map((vehicle, index) => ({
      id: prefix + '-tracker-' + String(index + 1).padStart(2, '0'),
      companyId,
      vehicleId: vehicle.id,
      serialNumber: 'TRK-DEMO-' + String(index + 1).padStart(4, '0'),
      equipmentModel: 'Tracker V2',
      imei: '3599999900000' + String(index + 1).padStart(2, '0'),
      chipCarrier: index % 2 === 0 ? 'Vivo' : 'Claro',
      chipNumber: '1199000' + String(1000 + index),
      monthlyCost: money(89.9 + index * 5),
      installationDate: isoDate(addDays(now, -120 + index * 5)),
      supplierId: prefix + '-supplier-tracker',
      providerName: 'Rastreamento Demo V2',
      providerContact: '(11) 4000-0000',
      portalUrl: 'https://example.invalid/rastreamento-v2',
      status: index === 5 ? 'INACTIVE' : 'ACTIVE',
      notes: 'Rastreador fictício para homologação.',
      lastPing: index === 5 ? null : isoTimestamp(addDays(now, 0)),
      createdBy: createdById,
    }));

    await tx.insert(trackers).values(trackerRows).onConflictDoNothing();
    for (const row of trackerRows) {
      await tx
        .update(trackers)
        .set({
          vehicleId: row.vehicleId,
          serialNumber: row.serialNumber,
          equipmentModel: row.equipmentModel,
          imei: row.imei,
          chipCarrier: row.chipCarrier,
          chipNumber: row.chipNumber,
          monthlyCost: row.monthlyCost,
          installationDate: row.installationDate,
          supplierId: row.supplierId,
          providerName: row.providerName,
          providerContact: row.providerContact,
          portalUrl: row.portalUrl,
          status: row.status,
          notes: row.notes,
          lastPing: row.lastPing,
          createdBy: createdById,
        })
        .where(and(eq(trackers.id, row.id), eq(trackers.companyId, companyId)));
    }

    const inspectionRows = [
      {
        id: prefix + '-inspection-checkout-01',
        companyId,
        vehicleId: vehicleRows[0].id,
        driverId: driverRows[0].id,
        contractId: contractRows[0].id,
        inspectionType: 'EXIT',
        inspectionDate: isoTimestamp(addDays(now, -45)),
        odometer: vehicleRows[0].currentKm - 3200,
        fuelLevel: 100,
        checklist: {
          tires: { condition: 'OK', brand: 'Goodyear', model: 'EfficientGrip' },
          battery: { condition: 'OK', brand: 'Moura', model: 'M60GD' },
          body: 'OK',
          lights: 'OK',
        },
        notes: 'Vistoria fictícia de saída do contrato.',
        createdBy: createdById,
      },
      {
        id: prefix + '-inspection-checkin-02',
        companyId,
        vehicleId: vehicleRows[1].id,
        driverId: driverRows[1].id,
        contractId: contractRows[1].id,
        inspectionType: 'ENTRY',
        inspectionDate: isoTimestamp(addDays(now, -3)),
        odometer: vehicleRows[1].currentKm,
        fuelLevel: 50,
        checklist: {
          tires: { condition: 'ATTENTION', brand: 'Pirelli', model: 'Cinturato P1' },
          battery: { condition: 'OK', brand: 'Heliar', model: 'HG60DD' },
          body: 'PEQUENO_RISCO_PORTA_DIREITA',
          lights: 'OK',
        },
        notes: 'Vistoria fictícia de retorno com item para acompanhamento.',
        createdBy: createdById,
      },
    ];

    await tx.insert(vehicleInspections).values(inspectionRows).onConflictDoNothing();
    for (const row of inspectionRows) {
      await tx
        .update(vehicleInspections)
        .set({
          vehicleId: row.vehicleId,
          driverId: row.driverId,
          contractId: row.contractId,
          inspectionType: row.inspectionType,
          inspectionDate: row.inspectionDate,
          odometer: row.odometer,
          fuelLevel: row.fuelLevel,
          checklist: row.checklist,
          notes: row.notes,
          createdBy: createdById,
        })
        .where(and(eq(vehicleInspections.id, row.id), eq(vehicleInspections.companyId, companyId)));
    }

    const attachmentRows = [
      {
        id: prefix + '-attachment-legacy-r2-01',
        companyId,
        entityType: 'Vehicle',
        entityName: 'Vehicle',
        entityId: vehicleRows[0].id,
        documentType: 'CRLV',
        fileName: 'crlv_2024_dmo1a01_r2_legacy.pdf',
        mimeType: 'application/pdf',
        url: 'https://r2.example.invalid/crlv_2024_dmo1a01.pdf',
        size: 154200,
        fileSize: 154200,
        storageProvider: 'R2',
        storageKey: 'tenants/' + companyKey(companyId) + '/vehicles/' + vehicleRows[0].id + '/crlv_legacy.pdf',
        checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        description: 'Anexo de CRLV gravado no provedor R2 antes da migração para SERVER_FS (AUTOERP-07).',
        issueDate: isoDate(addDays(now, -180)),
        expirationDate: isoDate(addDays(now, 120)),
        createdBy: createdById,
        isArchived: false,
        contentState: 'AVAILABLE',
      },
    ];

    await tx.insert(fileAttachments).values(attachmentRows).onConflictDoNothing();
    for (const att of attachmentRows) {
      await tx
        .update(fileAttachments)
        .set({
          fileName: att.fileName,
          mimeType: att.mimeType,
          url: att.url,
          size: att.size,
          fileSize: att.fileSize,
          storageProvider: att.storageProvider,
          storageKey: att.storageKey,
          checksum: att.checksum,
          description: att.description,
          issueDate: att.issueDate,
          expirationDate: att.expirationDate,
          contentState: att.contentState,
          isArchived: false,
        })
        .where(and(eq(fileAttachments.id, att.id), eq(fileAttachments.companyId, companyId)));
    }

    const documentRows = [
      {
        id: prefix + '-document-crlv-01',
        companyId,
        subjectType: 'VEHICLE',
        subjectId: vehicleRows[0].id,
        documentType: 'CRLV',
        documentNumber: 'CRLV-DEMO-001',
        referenceYear: now.getUTCFullYear(),
        issueDate: isoDate(addDays(now, -180)),
        expirationDate: isoDate(addDays(now, 120)),
        attachmentId: prefix + '-attachment-legacy-r2-01',
        versionNumber: 1,
        isCurrent: true,
        isArchived: false,
        cost: money(0),
        notes: 'CRLV fictício válido para homologação com anexo legado em R2 (AUTOERP-07).',
        createdBy: createdById,
      },
      {
        id: prefix + '-document-crlv-alert-02',
        companyId,
        subjectType: 'VEHICLE',
        subjectId: vehicleRows[1].id,
        documentType: 'CRLV',
        documentNumber: 'CRLV-DEMO-002',
        referenceYear: now.getUTCFullYear(),
        issueDate: isoDate(addDays(now, -330)),
        expirationDate: isoDate(addDays(now, 12)),
        attachmentId: null,
        versionNumber: 1,
        isCurrent: true,
        isArchived: false,
        cost: money(0),
        notes: 'CRLV fictício próximo do vencimento.',
        createdBy: createdById,
      },
      {
        id: prefix + '-document-cnh-01',
        companyId,
        subjectType: 'DRIVER',
        subjectId: driverRows[0].id,
        documentType: 'CNH',
        documentNumber: driverRows[0].cnh,
        referenceYear: now.getUTCFullYear(),
        issueDate: isoDate(addDays(now, -900)),
        expirationDate: isoDate(addDays(now, 6)),
        attachmentId: null,
        versionNumber: 1,
        isCurrent: true,
        isArchived: false,
        cost: money(0),
        notes: 'CNH fictícia em faixa crítica de vencimento.',
        createdBy: createdById,
      },
      {
        id: prefix + '-document-exp-07d',
        companyId,
        subjectType: 'VEHICLE',
        subjectId: vehicleRows[2].id,
        documentType: 'CRLV',
        documentNumber: 'CRLV-DEMO-003',
        referenceYear: now.getUTCFullYear(),
        issueDate: isoDate(addDays(now, -358)),
        expirationDate: isoDate(addDays(now, 7)),
        attachmentId: null,
        versionNumber: 1,
        isCurrent: true,
        isArchived: false,
        cost: money(0),
        notes: 'Documento CRLV vencendo em 7 dias (limiar crítico vermelho).',
        createdBy: createdById,
      },
      {
        id: prefix + '-document-exp-15d',
        companyId,
        subjectType: 'DRIVER',
        subjectId: driverRows[1].id,
        documentType: 'CNH',
        documentNumber: driverRows[1].cnh,
        referenceYear: now.getUTCFullYear(),
        issueDate: isoDate(addDays(now, -900)),
        expirationDate: isoDate(addDays(now, 15)),
        attachmentId: null,
        versionNumber: 1,
        isCurrent: true,
        isArchived: false,
        cost: money(0),
        notes: 'Documento CNH vencendo em 15 dias (limiar de atenção amarelo).',
        createdBy: createdById,
      },
      {
        id: prefix + '-document-exp-30d',
        companyId,
        subjectType: 'VEHICLE',
        subjectId: vehicleRows[3].id,
        documentType: 'CRLV',
        documentNumber: 'CRLV-DEMO-004',
        referenceYear: now.getUTCFullYear(),
        issueDate: isoDate(addDays(now, -335)),
        expirationDate: isoDate(addDays(now, 30)),
        attachmentId: null,
        versionNumber: 1,
        isCurrent: true,
        isArchived: false,
        cost: money(0),
        notes: 'Documento CRLV vencendo em 30 dias (limiar informativo).',
        createdBy: createdById,
      },
      {
        id: prefix + '-document-exp-22h-brt',
        companyId,
        subjectType: 'VEHICLE',
        subjectId: vehicleRows[4].id,
        documentType: 'CRLV',
        documentNumber: 'CRLV-DEMO-005',
        referenceYear: now.getUTCFullYear(),
        issueDate: isoDate(addDays(now, -360)),
        expirationDate: isoDate(addDays(now, 1)),
        attachmentId: null,
        versionNumber: 1,
        isCurrent: true,
        isArchived: false,
        cost: money(0),
        notes: 'Documento CRLV vencendo em 1 dia (estágio D1 para alerta imediato).',
        createdBy: createdById,
      },
    ];

    await tx.insert(documents).values(documentRows).onConflictDoNothing();
    for (const row of documentRows) {
      await tx
        .update(documents)
        .set({
          subjectType: row.subjectType,
          subjectId: row.subjectId,
          documentType: row.documentType,
          documentNumber: row.documentNumber,
          referenceYear: row.referenceYear,
          issueDate: row.issueDate,
          expirationDate: row.expirationDate,
          attachmentId: (row as any).attachmentId || null,
          versionNumber: row.versionNumber,
          isCurrent: row.isCurrent,
          isArchived: row.isArchived,
          cost: row.cost,
          notes: row.notes,
          createdBy: createdById,
        })
        .where(and(eq(documents.id, row.id), eq(documents.companyId, companyId)));
    }

    const ticketRow = {
      id: prefix + '-traffic-ticket-01',
      companyId,
      vehicleId: vehicleRows[0].id,
      vehiclePlate: vehicleRows[0].plate,
      driverId: driverRows[0].id,
      autoNumber: 'AIT-DEMO-' + companyKey(companyId).toUpperCase(),
      amount: money(195.23),
      issueDate: isoTimestamp(addDays(now, -11)),
      status: 'OPEN',
    };

    await tx.insert(trafficTickets).values(ticketRow).onConflictDoNothing();
    await tx
      .update(trafficTickets)
      .set(ticketRow)
      .where(and(eq(trafficTickets.id, ticketRow.id), eq(trafficTickets.companyId, companyId)));

    const ticketReceivable = {
      id: prefix + '-receivable-traffic-ticket-01',
      companyId,
      originType: 'TRAFFIC_TICKET',
      originId: ticketRow.id,
      vehicleId: ticketRow.vehicleId,
      driverId: ticketRow.driverId,
      contractId: contractRows[0].id,
      categoryId: categoryIds.trafficFineIncome,
      description: 'Multa de trânsito AIT ' + ticketRow.autoNumber + ' - valor nominal',
      originalAmount: ticketRow.amount,
      discountAmount: money(0),
      fineAmount: money(0),
      interestAmount: money(0),
      additionalAmount: money(0),
      updatedAmount: ticketRow.amount,
      paidAmount: money(0),
      balanceAmount: ticketRow.amount,
      dueDate: isoTimestamp(addDays(now, 15)),
      competenceDate: ticketRow.issueDate,
      status: 'PENDING',
      installmentGroupId: prefix + '-traffic-ticket-cr-group',
      installmentNumber: 1,
      totalInstallments: 1,
      periodRef: 'traffic-ticket-' + ticketRow.autoNumber,
      idempotencyKey: prefix + ':traffic-ticket:cr:01',
      notes: 'CR fictício do motorista pelo valor nominal da multa.',
    };

    await tx.insert(accountReceivables).values(ticketReceivable).onConflictDoNothing();
    await tx
      .update(accountReceivables)
      .set(ticketReceivable)
      .where(and(eq(accountReceivables.id, ticketReceivable.id), eq(accountReceivables.companyId, companyId)));

    const ticketPayable = {
      id: prefix + '-payable-traffic-ticket-01',
      companyId,
      originType: 'TRAFFIC_TICKET',
      originId: ticketRow.id,
      vehicleId: ticketRow.vehicleId,
      driverId: ticketRow.driverId,
      contractId: contractRows[0].id,
      categoryId: categoryIds.trafficFineExpense,
      description: 'Pagamento ao órgão - multa AIT ' + ticketRow.autoNumber,
      originalAmount: ticketRow.amount,
      discountAmount: money(0),
      fineAmount: money(0),
      interestAmount: money(0),
      additionalAmount: money(0),
      updatedAmount: ticketRow.amount,
      paidAmount: money(0),
      balanceAmount: ticketRow.amount,
      dueDate: isoTimestamp(addDays(now, 10)),
      competenceDate: ticketRow.issueDate,
      status: 'PENDING',
      supplierId: prefix + '-supplier-traffic-authority',
      installmentGroupId: prefix + '-traffic-ticket-cp-group',
      installmentNumber: 1,
      totalInstallments: 1,
      periodRef: 'traffic-ticket-' + ticketRow.autoNumber,
      idempotencyKey: prefix + ':traffic-ticket:cp:01',
      notes: 'CP fictício do órgão de trânsito pelo valor nominal da multa.',
    };

    await tx.insert(accountPayables).values(ticketPayable).onConflictDoNothing();
    await tx
      .update(accountPayables)
      .set(ticketPayable)
      .where(and(eq(accountPayables.id, ticketPayable.id), eq(accountPayables.companyId, companyId)));
  });

  console.log(JSON.stringify({
    ok: true,
    companyId,
    dataset: 'v2-demo-core',
    vehicles: vehicleRows.length,
    drivers: driverRows.length,
    contracts: contractIds.length,
    receivables: 13,
    payables: 5,
    maintenance: 3,
    trackers: 6,
    inspections: 2,
    documents: 7,
    attachments: 1,
    demoUsers: 5,
    trafficTickets: 1,
    target: process.env.V2_DEMO_SEED_TARGET,
  }, null, 2));
}

