import type {
  AccountPayable,
  AccountReceivable,
  Contract,
  DocumentRecord,
  Driver,
} from '../../../types/entities';
import {
  ContractStatus,
  DocumentStatus,
  ObligationStatus,
  OriginType,
  RecurringFrequency,
} from '../../../types/enums';
import {
  evaluateContractAlert,
  evaluateDocumentAlert,
  evaluateDriverCnhAlert,
  evaluatePayableAlert,
  evaluateReceivableAlert,
  stageForDueDate,
} from '../alertEvaluation';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const NOW = new Date('2026-08-19T12:00:00.000Z');

function isoDateOffset(days: number): string {
  const date = new Date(Date.UTC(2026, 7, 19));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function document(expirationDate: string, overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id: 'doc-1',
    companyId: 'company-a',
    subjectType: 'VEHICLE',
    subjectId: 'vehicle-1',
    documentType: 'CRLV',
    expirationDate,
    versionNumber: 1,
    isCurrent: true,
    isArchived: false,
    cost: 0,
    createdBy: 'user-1',
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    complianceStatus: DocumentStatus.VALID,
    alertStage: 'NONE',
    ...overrides,
  };
}

function driver(expirationDate: string, overrides: Partial<Driver> = {}): Driver {
  return {
    id: 'driver-1',
    companyId: 'company-a',
    fullName: 'Motorista Teste',
    cpf: '11144477735',
    birthDate: '1990-01-01',
    phone: '11999999999',
    whatsapp: '11999999999',
    address: {
      street: 'Rua A', number: '1', neighborhood: 'Centro', city: 'São Paulo', state: 'SP', zipCode: '01001000',
    },
    cnhNumber: '02650306461',
    cnhCategory: 'B',
    cnhExpiration: expirationDate,
    cnhStatus: DocumentStatus.VALID,
    appPlatforms: ['Uber'],
    status: 'ACTIVE' as Driver['status'],
    isArchived: false,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

function contract(endDate: string | undefined, overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'contract-1',
    companyId: 'company-a',
    contractNumber: 'CTR-001',
    driverId: 'driver-1',
    vehicleId: 'vehicle-1',
    startDate: '2026-01-01',
    endDate,
    status: ContractStatus.ACTIVE,
    rentalAmount: 800,
    billingPeriodicity: RecurringFrequency.WEEKLY,
    securityDepositAmount: 1000,
    franchiseKm: 1500,
    excessKmRate: 0.6,
    isArchived: false,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

function receivable(dueDate: string, overrides: Partial<AccountReceivable> = {}): AccountReceivable {
  return {
    id: 'rec-1',
    companyId: 'company-a',
    originType: OriginType.CONTRACT_RENT,
    originId: 'contract-1',
    contractId: 'contract-1',
    categoryId: 'cat-income',
    description: 'Aluguel semanal',
    originalAmount: 800,
    discountAmount: 0,
    fineAmount: 0,
    interestAmount: 0,
    updatedAmount: 800,
    paidAmount: 0,
    balanceAmount: 800,
    dueDate,
    competenceDate: dueDate,
    status: ObligationStatus.PENDING,
    idempotencyKey: 'rec-key-1',
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

function payable(dueDate: string, overrides: Partial<AccountPayable> = {}): AccountPayable {
  return {
    id: 'pay-1',
    companyId: 'company-a',
    originType: OriginType.DOCUMENTATION,
    originId: 'doc-1',
    categoryId: 'cat-expense',
    description: 'Licenciamento',
    originalAmount: 200,
    discountAmount: 0,
    fineAmount: 0,
    interestAmount: 0,
    updatedAmount: 200,
    paidAmount: 0,
    balanceAmount: 200,
    dueDate,
    competenceDate: dueDate,
    status: ObligationStatus.PENDING,
    idempotencyKey: 'pay-key-1',
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

export class AlertEvaluationTestRunner {
  static async runAllTests(): Promise<void> {
    const stageCases: Array<[number, ReturnType<typeof stageForDueDate>]> = [
      [91, 'NONE'], [90, 'D90'], [60, 'D60'], [30, 'D30'], [15, 'D15'], [7, 'D7'], [0, 'DUE_TODAY'], [-1, 'POST_DUE'],
    ];
    for (const [days, expected] of stageCases) {
      const actual = stageForDueDate(isoDateOffset(days), NOW);
      assert(actual === expected, `stage ${days} expected ${expected}, got ${actual}`);
    }

    for (const [days, expected] of stageCases.filter(([, stage]) => stage !== 'NONE')) {
      const candidate = evaluateDocumentAlert(document(isoDateOffset(days)), NOW);
      assert(candidate?.alertStage === expected, `document stage ${days} mismatch`);
      assert(candidate?.idempotencyKey === `DOCUMENT:doc-1:v1:${expected}`, `document idempotency key ${days} mismatch`);
    }
    assert(evaluateDocumentAlert(document(isoDateOffset(120)), NOW) === null, 'document >90 days should not alert');
    assert(evaluateDocumentAlert(document(isoDateOffset(7), { isCurrent: false }), NOW) === null, 'superseded document should not alert');
    assert(evaluateDocumentAlert(document(isoDateOffset(7), { isArchived: true }), NOW) === null, 'archived document should not alert');

    const driverAlert = evaluateDriverCnhAlert(driver(isoDateOffset(15)), NOW);
    assert(driverAlert?.alertStage === 'D15', 'CNH D15 missing');
    assert(driverAlert?.idempotencyKey === `DRIVER_CNH:driver-1:${isoDateOffset(15)}:D15`, 'CNH idempotency mismatch');
    assert(evaluateDriverCnhAlert(driver(isoDateOffset(15), { isArchived: true }), NOW) === null, 'archived driver should not alert');

    assert(evaluateContractAlert(contract(isoDateOffset(7)), NOW)?.alertStage === 'D7', 'contract D7 missing');
    assert(evaluateContractAlert(contract(isoDateOffset(15)), NOW) === null, 'contract D15 must be out of I5A first cut');
    assert(evaluateContractAlert(contract(undefined), NOW) === null, 'open-ended contract should not alert');
    assert(evaluateContractAlert(contract(isoDateOffset(7), { status: ContractStatus.CLOSED }), NOW) === null, 'closed contract should not alert');

    assert(evaluateReceivableAlert(receivable(isoDateOffset(7)), NOW)?.alertStage === 'D7', 'receivable D7 missing');
    assert(evaluateReceivableAlert(receivable(isoDateOffset(0)), NOW)?.alertStage === 'DUE_TODAY', 'receivable due today missing');
    assert(evaluateReceivableAlert(receivable(isoDateOffset(-1)), NOW)?.alertStage === 'POST_DUE', 'receivable post due missing');
    assert(evaluateReceivableAlert(receivable(isoDateOffset(15)), NOW) === null, 'receivable D15 must be out of first cut');
    assert(evaluateReceivableAlert(receivable(isoDateOffset(7), { balanceAmount: 0, paidAmount: 800, status: ObligationStatus.PAID })) === null, 'paid receivable should not alert');
    assert(evaluateReceivableAlert(receivable(isoDateOffset(7), { status: ObligationStatus.CANCELLED })) === null, 'cancelled receivable should not alert');

    assert(evaluatePayableAlert(payable(isoDateOffset(7)), NOW)?.alertStage === 'D7', 'payable D7 missing');
    assert(evaluatePayableAlert(payable(isoDateOffset(0)), NOW)?.alertStage === 'DUE_TODAY', 'payable due today missing');
    assert(evaluatePayableAlert(payable(isoDateOffset(-1)), NOW)?.alertStage === 'POST_DUE', 'payable post due missing');
    assert(evaluatePayableAlert(payable(isoDateOffset(7), { status: ObligationStatus.WRITTEN_OFF })) === null, 'written-off payable should not alert');

    console.log('SECURITY-2I5A alert evaluation policy PASS');
  }
}
