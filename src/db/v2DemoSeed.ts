import { and, eq, inArray } from 'drizzle-orm';

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
  paymentMethods,
  securityDeposits,
  users,
  vehicleKmRecords,
  vehicles,
} from './schema';

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

async function runV2DemoSeed() {
  assertSeedSafety();

  const companyId = String(process.env.V2_DEMO_COMPANY_ID || '').trim();
  if (!companyId) {
    throw new Error('V2_DEMO_COMPANY_ID is required. The seed never creates or guesses a tenant.');
  }

  const database: any = db;
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
  };

  const vehicleSpecs = [
    ['DMO1A01', 'Chevrolet', 'Onix 1.0', 2024, 32840, 850, 'RENTED'],
    ['DMO1B02', 'Hyundai', 'HB20 1.0', 2024, 41120, 820, 'RENTED'],
    ['DMO1C03', 'Fiat', 'Cronos 1.3', 2024, 27650, 900, 'RENTED'],
    ['DMO1D04', 'Renault', 'Kwid 1.0', 2023, 55300, 750, 'RENTED'],
    ['DMO1E05', 'Volkswagen', 'Polo 1.0', 2024, 18440, 880, 'AVAILABLE'],
    ['DMO1F06', 'Nissan', 'Versa 1.6', 2023, 62410, 950, 'AVAILABLE'],
    ['DMO1G07', 'Toyota', 'Yaris Sedan', 2024, 36880, 990, 'MAINTENANCE'],
    ['DMO1H08', 'Chevrolet', 'Onix Plus', 2023, 71620, 920, 'BLOCKED'],
  ] as const;

  const vehicleRows = vehicleSpecs.map((spec, index) => ({
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
    fuelType: 'Flex',
    category: index === 2 || index === 5 ? 'Sedan Médio' : 'Hatch / Sedan Compacto',
    acquisitionValue: money(69000 + index * 3500),
    currentValue: money(63000 + index * 3200),
    rentalValueBase: money(spec[5]),
    status: spec[6],
    notes: 'Dado fictício V2 para homologação.',
    isArchived: false,
  }));

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
    maritalStatus: index % 2 === 0 ? 'SOLTEIRO' : 'CASADO',
    profession: 'Motorista de aplicativo',
    pixKey: 'demo.motorista.' + String(index + 1) + '@example.invalid',
    active: index < 8,
  }));

  const contractIds = [1, 2, 3, 4].map(
    (index) => prefix + '-contract-' + String(index).padStart(2, '0')
  );

  await database.transaction(async (tx: any) => {
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

    const contractRows = contractIds.map((id, index) => ({
      id,
      companyId,
      driverId: driverRows[index].id,
      vehicleId: vehicleRows[index].id,
      status: 'ACTIVE',
      contractNumber: contractNumbers[index],
      startDate: isoDate(addDays(now, -45 - index * 7)),
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
    }));

    vehicleRows.slice(0, 4).forEach((vehicle, index) => {
      (vehicle as any).currentDriverId = driverRows[index].id;
      (vehicle as any).currentContractId = contractRows[index].id;
    });

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
    ]).onConflictDoUpdate({
      target: financialAccounts.id,
      set: {
        currentBalance: money(23000),
        status: 'ACTIVE',
      },
    });

    await tx.insert(paymentMethods).values([
      { id: methodIds.pix, companyId, name: 'PIX Demo V2', type: 'PIX', feePercentage: money(0), active: true },
      { id: methodIds.cash, companyId, name: 'Dinheiro Demo V2', type: 'CASH', feePercentage: money(0), active: true },
      { id: methodIds.transfer, companyId, name: 'Transferência Demo V2', type: 'BANK_TRANSFER', feePercentage: money(0), active: true },
      { id: methodIds.card, companyId, name: 'Cartão Demo V2', type: 'CREDIT_CARD', feePercentage: money(2.5), active: true },
    ]).onConflictDoUpdate({
      target: paymentMethods.id,
      set: { active: true },
    });

    await tx.insert(financialCategories).values([
      { id: categoryIds.rent, companyId, name: 'Locação Demo V2', type: 'INCOME', active: true },
      { id: categoryIds.deposit, companyId, name: 'Caução Demo V2', type: 'INCOME', active: true },
      { id: categoryIds.maintenance, companyId, name: 'Manutenção Demo V2', type: 'EXPENSE', active: true },
      { id: categoryIds.insurance, companyId, name: 'Seguro Demo V2', type: 'EXPENSE', active: true },
      { id: categoryIds.documentation, companyId, name: 'Documentação Demo V2', type: 'EXPENSE', active: true },
      { id: categoryIds.tracker, companyId, name: 'Rastreador Demo V2', type: 'EXPENSE', active: true },
    ]).onConflictDoUpdate({
      target: financialCategories.id,
      set: { active: true },
    });

    await tx.insert(drivers).values(driverRows).onConflictDoUpdate({
      target: drivers.id,
      set: {
        name: drivers.name,
      },
    });

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
    }

    await tx.insert(vehicles).values(vehicleRows).onConflictDoUpdate({
      target: vehicles.id,
      set: {
        status: vehicles.status,
      },
    });

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

    await tx.insert(contracts).values(contractRows).onConflictDoUpdate({
      target: contracts.id,
      set: {
        status: 'ACTIVE',
      },
    });

    for (const contract of contractRows) {
      await tx
        .update(contracts)
        .set({
          driverId: contract.driverId,
          vehicleId: contract.vehicleId,
          status: contract.status,
          startDate: contract.startDate,
          rentalAmount: contract.rentalAmount,
          billingPeriodicity: contract.billingPeriodicity,
          billingDueDayOfWeek: contract.billingDueDayOfWeek,
          securityDepositAmount: contract.securityDepositAmount,
          securityDepositId: contract.securityDepositId,
          franchiseKm: contract.franchiseKm,
          excessKmRate: contract.excessKmRate,
          paymentMethodId: contract.paymentMethodId,
          signatureRequired: false,
          notes: contract.notes,
          isArchived: false,
        })
        .where(and(eq(contracts.id, contract.id), eq(contracts.companyId, companyId)));
    }

    const depositAmounts = [1000, 1200, 1500, 1000];
    const depositReceived = [1000, 1200, 500, 0];

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
      status: depositReceived[index] === depositAmounts[index]
        ? 'RECEIVED'
        : depositReceived[index] > 0
          ? 'PARTIALLY_USED'
          : 'PENDING',
      receivedAt: depositReceived[index] > 0 ? isoTimestamp(addDays(now, -30 + index)) : null,
      notes: 'Caução fictícia V2 para homologação.',
    }));

    await tx.insert(securityDeposits).values(depositRows).onConflictDoUpdate({
      target: securityDeposits.id,
      set: { notes: 'Caução fictícia V2 para homologação.' },
    });

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
      },
      {
        id: prefix + '-receivable-rent-04',
        contract: contractRows[3],
        original: 750,
        fine: 0,
        interest: 0,
        additional: 0,
        paid: 750,
        dueOffset: -2,
        status: 'PAID',
      },
    ];

    const receivableRows: any[] = rentReceivables.map((item, index) => {
      const updated = item.original + item.fine + item.interest + item.additional;
      return {
        id: item.id,
        companyId,
        originType: 'CONTRACT_RENT',
        originId: item.contract.id,
        vehicleId: item.contract.vehicleId,
        driverId: item.contract.driverId,
        contractId: item.contract.id,
        categoryId: categoryIds.rent,
        description: 'Aluguel semanal ' + item.contract.contractNumber + ' - Demo V2',
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
        installmentGroupId: prefix + '-rent-group-' + String(index + 1),
        installmentNumber: 1,
        totalInstallments: 1,
        periodRef: isoDate(now).slice(0, 7) + '-demo-' + String(index + 1),
        idempotencyKey: prefix + ':rent:' + String(index + 1),
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

    const kmRows = vehicleRows.slice(0, 4).map((vehicle, index) => ({
      id: prefix + '-km-' + String(index + 1).padStart(2, '0'),
      companyId,
      vehicleId: vehicle.id,
      driverId: driverRows[index].id,
      contractId: contractRows[index].id,
      kmValue: vehicle.currentKm,
      recordDate: isoDate(now),
      readingType: 'MANUAL',
      notes: 'Conferência fictícia de KM oficial para homologação V2.',
    }));

    await tx.insert(vehicleKmRecords).values(kmRows).onConflictDoNothing();
  });

  console.log(JSON.stringify({
    ok: true,
    companyId,
    dataset: 'v2-demo-core',
    vehicles: vehicleRows.length,
    drivers: driverRows.length,
    contracts: contractIds.length,
    receivables: 8,
    payables: 4,
    target: process.env.V2_DEMO_SEED_TARGET,
  }, null, 2));
}

runV2DemoSeed().catch((error) => {
  console.error('[v2-demo-seed] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
