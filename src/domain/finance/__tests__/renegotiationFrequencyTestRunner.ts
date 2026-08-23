import { RenegotiationService } from '../RenegotiationService';
import type { ITransactionContext } from '../ITransactionContext';
import { ObligationStatus } from '../../../types/enums';

type MutableObligation = Record<string, any>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected=${String(expected)} actual=${String(actual)}`);
  }
}

function makeContext(kind: 'RECEIVABLE' | 'PAYABLE') {
  const companyId = 'company-a';
  const original: MutableObligation = {
    id: kind === 'RECEIVABLE' ? 'ar-original' : 'ap-original',
    companyId,
    status: ObligationStatus.PENDING,
    categoryId: 'cat-finance',
    originalAmount: 100,
    updatedAmount: 100,
    paidAmount: 0,
    balanceAmount: 100,
    dueDate: '2026-08-31',
    competenceDate: '2026-08-31',
  };
  const created: MutableObligation[] = [];
  const audits: MutableObligation[] = [];

  const repository = {
    async findById(id: string) {
      return id === original.id ? original : null;
    },
    async findByIdempotencyKey(key: string) {
      return created.find((item) => item.idempotencyKey === key) ?? null;
    },
    async create(item: MutableObligation) {
      created.push({ ...item });
      return item;
    },
    async update(id: string, patch: MutableObligation) {
      if (id !== original.id) throw new Error('unexpected update id');
      Object.assign(original, patch);
      return original;
    },
  };

  const unusedRepository = {
    async findById() { return null; },
    async findByIdempotencyKey() { return null; },
    async create() { throw new Error('unexpected repository create'); },
    async update() { throw new Error('unexpected repository update'); },
  };

  const context = {
    getUserRepo: () => ({
      async findById(id: string) {
        return id === 'user-admin'
          ? {
              id,
              companyId,
              name: 'Admin',
              email: 'admin@example.invalid',
              role: 'ADMIN',
              active: true,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            }
          : null;
      },
    }),
    getFinancialPeriodRepo: () => ({
      async findAll() { return []; },
      async findById() { return null; },
      async create(item: MutableObligation) { return item; },
      async update(_id: string, item: MutableObligation) { return item; },
    }),
    getReceivableRepo: () => kind === 'RECEIVABLE' ? repository : unusedRepository,
    getPayableRepo: () => kind === 'PAYABLE' ? repository : unusedRepository,
    getRawTransaction: () => ({
      async execute() { return { rows: [] }; },
    }),
    findPayableByIdWithLock: async (id: string) => kind === 'PAYABLE' && id === original.id ? original : null,
    getAuditLogRepo: () => ({
      async create(item: MutableObligation) {
        audits.push({ ...item });
        return item;
      },
    }),
  } as unknown as ITransactionContext;

  return { companyId, original, created, audits, context };
}

async function renegotiate(
  kind: 'RECEIVABLE' | 'PAYABLE',
  frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | undefined,
  firstDueDate: string,
  installmentsCount = 3,
  newTotalAmount = 100.01
) {
  const fixture = makeContext(kind);
  const items = await RenegotiationService.renegociate(
    {
      companyId: fixture.companyId,
      obligationIds: [fixture.original.id],
      type: kind,
      newTotalAmount,
      installmentsCount,
      firstDueDate,
      installmentFrequency: frequency,
      categoryId: 'cat-finance',
      description: 'Acordo teste',
      idempotencyKey: kind === 'PAYABLE' ? `r1-frequency-${frequency ?? 'monthly'}-${firstDueDate}` : undefined,
      userId: 'user-admin',
      userName: 'Admin',
    },
    fixture.context
  );
  return { ...fixture, items };
}

async function run() {
  const weekly = await renegotiate('RECEIVABLE', 'WEEKLY', '2026-09-15');
  assertEqual(weekly.items.map((item: any) => item.dueDate).join(','), '2026-09-15,2026-09-22,2026-09-29', 'weekly receivable dates');
  assertEqual(Math.round(weekly.items.reduce((sum: number, item: any) => sum + item.originalAmount, 0) * 100), 10001, 'weekly receivable exact cents');
  assertEqual(weekly.original.status, ObligationStatus.CANCELLED, 'weekly original receivable cancelled');
  assertEqual(weekly.audits.length, 1, 'weekly renegotiation audited once');

  const biweekly = await renegotiate('RECEIVABLE', 'BIWEEKLY', '2026-09-15');
  assertEqual(biweekly.items.map((item: any) => item.dueDate).join(','), '2026-09-15,2026-09-29,2026-10-13', 'biweekly receivable dates');

  const monthlyPayable = await renegotiate('PAYABLE', 'MONTHLY', '2026-01-31', 3, 100);
  assertEqual(monthlyPayable.items.map((item: any) => item.dueDate).join(','), '2026-01-31,2026-02-28,2026-03-31', 'monthly payable end-of-month clamp');
  assertEqual(monthlyPayable.original.status, ObligationStatus.CANCELLED, 'monthly original payable cancelled');

  const backwardCompatible = await renegotiate('RECEIVABLE', undefined, '2028-01-31', 2, 80);
  assertEqual(backwardCompatible.items.map((item: any) => item.dueDate).join(','), '2028-01-31,2028-02-29', 'missing frequency defaults to monthly');

  const invalid = makeContext('RECEIVABLE');
  let invalidFailed = false;
  try {
    await RenegotiationService.renegociate(
      {
        companyId: invalid.companyId,
        obligationIds: [invalid.original.id],
        type: 'RECEIVABLE',
        newTotalAmount: 100,
        installmentsCount: 2,
        firstDueDate: '2026-09-15',
        installmentFrequency: 'INVALID' as never,
        categoryId: 'cat-finance',
        description: 'Inválida',
        userId: 'user-admin',
        userName: 'Admin',
      },
      invalid.context
    );
  } catch {
    invalidFailed = true;
  }
  assert(invalidFailed, 'invalid frequency must fail closed');
  assertEqual(invalid.original.status, ObligationStatus.PENDING, 'invalid frequency must not cancel original');
  assertEqual(invalid.created.length, 0, 'invalid frequency must create no replacement obligations');
  assertEqual(invalid.audits.length, 0, 'invalid frequency must create no audit mutation');

  console.log('FINANCE-R1 renegotiation domain frequency: PASS');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});