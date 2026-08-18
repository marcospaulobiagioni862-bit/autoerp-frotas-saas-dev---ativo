from pathlib import Path
import json


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)

# 1) Migration: complete only fields already present in domain types.
Path('drizzle/0006_security_deposit_authority.sql').write_text("""-- SECURITY-2G8: align security deposit persistence with the existing domain model.
-- No new business fields are introduced; existing tenant RLS/FORCE RLS from 0002 remains authoritative.

ALTER TABLE security_deposits ADD COLUMN IF NOT EXISTS vehicle_id text;
ALTER TABLE security_deposits ADD COLUMN IF NOT EXISTS original_amount numeric(12,2);
ALTER TABLE security_deposits ADD COLUMN IF NOT EXISTS received_amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE security_deposits ADD COLUMN IF NOT EXISTS used_amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE security_deposits ADD COLUMN IF NOT EXISTS returned_amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE security_deposits ADD COLUMN IF NOT EXISTS received_at timestamp;
ALTER TABLE security_deposits ADD COLUMN IF NOT EXISTS returned_at timestamp;
ALTER TABLE security_deposits ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE security_deposits ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT now();

UPDATE security_deposits
SET original_amount = amount
WHERE original_amount IS NULL;

ALTER TABLE security_deposits ALTER COLUMN original_amount SET NOT NULL;

ALTER TABLE security_deposit_movements ADD COLUMN IF NOT EXISTS financial_transaction_id text;
ALTER TABLE security_deposit_movements ADD COLUMN IF NOT EXISTS receivable_id text;
ALTER TABLE security_deposit_movements ADD COLUMN IF NOT EXISTS created_by_id text;
ALTER TABLE security_deposit_movements ADD COLUMN IF NOT EXISTS created_at timestamp NOT NULL DEFAULT now();
""")

# 2) Journal registration.
p = Path('drizzle/meta/_journal.json')
data = json.loads(p.read_text())
if not any(e.get('tag') == '0006_security_deposit_authority' for e in data['entries']):
    data['entries'].append({
        'idx': 6,
        'version': '7',
        'when': 1787094000000,
        'tag': '0006_security_deposit_authority',
        'breakpoints': True,
    })
p.write_text(json.dumps(data, indent=2) + '\n')

# 3) Drizzle schema mapping.
p = Path('src/db/schema.ts')
text = p.read_text()
old = """export const securityDeposits = pgTable('security_deposits', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  contractId: text('contract_id').notNull(),
  driverId: text('driver_id').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  status: text('status').notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
});

export const securityDepositMovements = pgTable('security_deposit_movements', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  depositId: text('deposit_id').notNull(),
  type: text('type').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  date: timestamp('date', { mode: 'string' }).notNull(),
  description: text('description'),
});
"""
new = """export const securityDeposits = pgTable('security_deposits', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  contractId: text('contract_id').notNull(),
  driverId: text('driver_id').notNull(),
  vehicleId: text('vehicle_id'),
  // Legacy amount is retained for backward-compatible persistence; new writes
  // keep it equal to originalAmount.
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  originalAmount: numeric('original_amount', { precision: 12, scale: 2 }).notNull(),
  receivedAmount: numeric('received_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  usedAmount: numeric('used_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  returnedAmount: numeric('returned_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  status: text('status').notNull(),
  receivedAt: timestamp('received_at', { mode: 'string' }),
  returnedAt: timestamp('returned_at', { mode: 'string' }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
});

export const securityDepositMovements = pgTable('security_deposit_movements', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  depositId: text('deposit_id').notNull(),
  type: text('type').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  date: timestamp('date', { mode: 'string' }).notNull(),
  financialTransactionId: text('financial_transaction_id'),
  receivableId: text('receivable_id'),
  description: text('description'),
  createdById: text('created_by_id'),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
});
"""
text = replace_once(text, old, new, 'security deposit schema')
p.write_text(text)

# 4) Transaction context: deposits + contract lookup.
p = Path('src/domain/finance/ITransactionContext.ts')
text = p.read_text()
text = replace_once(
    text,
    "  FinancialPeriod,\n} from '../../types/entities';",
    "  FinancialPeriod,\n  SecurityDeposit,\n  SecurityDepositMovement,\n} from '../../types/entities';",
    'transaction context imports',
)
insert_after = """export interface ITransactionFinancialPeriodRepository {
  findAll(filters?: TransactionFinancialPeriodFilterOptions): Promise<FinancialPeriod[]>;
  findById(id: string): Promise<FinancialPeriod | null>;
  create(item: FinancialPeriod): Promise<FinancialPeriod>;
  update(id: string, item: Partial<FinancialPeriod>): Promise<FinancialPeriod>;
}
"""
addition = insert_after + """
export interface ITransactionSecurityDepositRepository {
  lockContract(companyId: string, contractId: string): Promise<void>;
  findById(id: string): Promise<SecurityDeposit | null>;
  findByContractId(contractId: string): Promise<SecurityDeposit | null>;
  create(item: SecurityDeposit): Promise<SecurityDeposit>;
  update(id: string, item: Partial<SecurityDeposit>): Promise<SecurityDeposit>;
}

export interface ITransactionSecurityDepositMovementRepository {
  create(item: SecurityDepositMovement): Promise<SecurityDepositMovement>;
}

export interface ITransactionContractRepository {
  findById(id: string): Promise<{
    id: string;
    companyId: string;
    driverId: string;
    vehicleId: string;
  } | null>;
}
"""
text = replace_once(text, insert_after, addition, 'transaction context deposit interfaces')
text = replace_once(
    text,
    "  getFinancialPeriodRepo(): ITransactionFinancialPeriodRepository;\n}",
    "  getFinancialPeriodRepo(): ITransactionFinancialPeriodRepository;\n  getSecurityDepositRepo(): ITransactionSecurityDepositRepository;\n  getSecurityDepositMovementRepo(): ITransactionSecurityDepositMovementRepository;\n  getContractRepo(): ITransactionContractRepository;\n}",
    'transaction context getters',
)
p.write_text(text)

# 5) PostgreSQL repository adapters.
p = Path('src/db/repositories/postgresRepositories.ts')
text = p.read_text()
text = replace_once(
    text,
    "  financialTransactions, financialAccounts, paymentMethods, auditLogs, contracts, financialPeriods\n} from '../schema';",
    "  financialTransactions, financialAccounts, paymentMethods, auditLogs, contracts, financialPeriods,\n  securityDeposits, securityDepositMovements\n} from '../schema';",
    'postgres table imports',
)
text = replace_once(
    text,
    "import { AuditLog } from '../../types/entities';",
    "import { AuditLog, SecurityDeposit, SecurityDepositMovement } from '../../types/entities';",
    'postgres entity imports',
)
append_marker = """export class PostgresFinancialPeriodRepository extends PostgresBaseRepository<any> {
  constructor(tx?: any) { super(financialPeriods, tx); }
}
"""
append = append_marker + """

export class PostgresSecurityDepositRepository {
  private tx: any;
  constructor(tx?: any) { this.tx = tx || db; }

  private map(row: any): SecurityDeposit {
    return {
      id: row.id,
      companyId: row.companyId,
      contractId: row.contractId,
      driverId: row.driverId,
      vehicleId: row.vehicleId || '',
      originalAmount: Number(row.originalAmount ?? row.amount ?? 0),
      receivedAmount: Number(row.receivedAmount ?? 0),
      usedAmount: Number(row.usedAmount ?? 0),
      returnedAmount: Number(row.returnedAmount ?? 0),
      status: row.status,
      receivedAt: row.receivedAt || undefined,
      returnedAt: row.returnedAt || undefined,
      notes: row.notes || undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt || row.createdAt,
    } as SecurityDeposit;
  }

  async lockContract(companyId: string, contractId: string): Promise<void> {
    const key = `${companyId}:${contractId}`;
    await this.tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key})::bigint)`);
  }

  async findById(id: string): Promise<SecurityDeposit | null> {
    const rows = await this.tx.select().from(securityDeposits).where(eq(securityDeposits.id, id)).limit(1);
    return rows[0] ? this.map(rows[0]) : null;
  }

  async findByContractId(contractId: string): Promise<SecurityDeposit | null> {
    const rows = await this.tx.select().from(securityDeposits).where(eq(securityDeposits.contractId, contractId)).limit(1);
    return rows[0] ? this.map(rows[0]) : null;
  }

  async create(item: SecurityDeposit): Promise<SecurityDeposit> {
    const rows = await this.tx.insert(securityDeposits).values({
      id: item.id,
      companyId: item.companyId,
      contractId: item.contractId,
      driverId: item.driverId,
      vehicleId: item.vehicleId || null,
      amount: item.originalAmount,
      originalAmount: item.originalAmount,
      receivedAmount: item.receivedAmount,
      usedAmount: item.usedAmount,
      returnedAmount: item.returnedAmount,
      status: item.status,
      receivedAt: item.receivedAt || null,
      returnedAt: item.returnedAt || null,
      notes: item.notes || null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }).returning();
    return this.map(rows[0]);
  }

  async update(id: string, item: Partial<SecurityDeposit>): Promise<SecurityDeposit> {
    const values: any = {};
    if (item.contractId !== undefined) values.contractId = item.contractId;
    if (item.driverId !== undefined) values.driverId = item.driverId;
    if (item.vehicleId !== undefined) values.vehicleId = item.vehicleId || null;
    if (item.originalAmount !== undefined) {
      values.originalAmount = item.originalAmount;
      values.amount = item.originalAmount;
    }
    if (item.receivedAmount !== undefined) values.receivedAmount = item.receivedAmount;
    if (item.usedAmount !== undefined) values.usedAmount = item.usedAmount;
    if (item.returnedAmount !== undefined) values.returnedAmount = item.returnedAmount;
    if (item.status !== undefined) values.status = item.status;
    if (item.receivedAt !== undefined) values.receivedAt = item.receivedAt || null;
    if (item.returnedAt !== undefined) values.returnedAt = item.returnedAt || null;
    if (item.notes !== undefined) values.notes = item.notes || null;
    if (item.updatedAt !== undefined) values.updatedAt = item.updatedAt;
    const rows = await this.tx.update(securityDeposits).set(values).where(eq(securityDeposits.id, id)).returning();
    if (!rows[0]) throw new Error('Caução não encontrada');
    return this.map(rows[0]);
  }
}

export class PostgresSecurityDepositMovementRepository {
  private tx: any;
  constructor(tx?: any) { this.tx = tx || db; }

  private map(row: any): SecurityDepositMovement {
    return {
      id: row.id,
      securityDepositId: row.depositId,
      companyId: row.companyId,
      type: row.type,
      amount: Number(row.amount || 0),
      date: row.date,
      financialTransactionId: row.financialTransactionId || undefined,
      receivableId: row.receivableId || undefined,
      description: row.description || '',
      createdById: row.createdById || '',
      createdAt: row.createdAt,
    } as SecurityDepositMovement;
  }

  async create(item: SecurityDepositMovement): Promise<SecurityDepositMovement> {
    const rows = await this.tx.insert(securityDepositMovements).values({
      id: item.id,
      companyId: item.companyId,
      depositId: item.securityDepositId,
      type: item.type,
      amount: item.amount,
      date: item.date,
      financialTransactionId: item.financialTransactionId || null,
      receivableId: item.receivableId || null,
      description: item.description || null,
      createdById: item.createdById,
      createdAt: item.createdAt,
    }).returning();
    return this.map(rows[0]);
  }
}
"""
text = replace_once(text, append_marker, append, 'postgres deposit adapters')
p.write_text(text)

# 6) UnitOfWork exposes contract/deposit repositories.
p = Path('src/db/uow.ts')
text = p.read_text()
text = replace_once(
    text,
    "  PostgresUserRepository,\n  PostgresFinancialPeriodRepository\n} from './repositories/postgresRepositories';",
    "  PostgresUserRepository,\n  PostgresFinancialPeriodRepository,\n  PostgresContractRepository,\n  PostgresSecurityDepositRepository,\n  PostgresSecurityDepositMovementRepository\n} from './repositories/postgresRepositories';",
    'uow imports',
)
text = replace_once(
    text,
    "        getUserRepo: () => new PostgresUserRepository(tx),\n        getFinancialPeriodRepo: () => new PostgresFinancialPeriodRepository(tx)\n      };",
    "        getUserRepo: () => new PostgresUserRepository(tx),\n        getFinancialPeriodRepo: () => new PostgresFinancialPeriodRepository(tx),\n        getContractRepo: () => new PostgresContractRepository(tx),\n        getSecurityDepositRepo: () => new PostgresSecurityDepositRepository(tx),\n        getSecurityDepositMovementRepo: () => new PostgresSecurityDepositMovementRepository(tx)\n      };",
    'uow getters',
)
p.write_text(text)

# 7) DepositService: transactional read + receive, local fallback retained for test/DEV.
p = Path('src/domain/finance/DepositService.ts')
text = p.read_text()
if "import { ITransactionContext } from './ITransactionContext';" not in text:
    text = text.replace(
        "import { AuditLogger } from '../../shared/utils/auditLogger';",
        "import { AuditLogger } from '../../shared/utils/auditLogger';\nimport { FinancialAuthorizationService } from './FinancialAuthorizationService';\nimport { ITransactionContext } from './ITransactionContext';"
    )
old_sig = """    userId: string,
    userName: string
  ): Promise<{ deposit: SecurityDeposit; movement: SecurityDepositMovement }> {
    let deposit = await this.depositRepo.findByContractIdForCompany(companyId, contractId);
"""
new_sig = """    userId: string,
    userName: string,
    txContext?: ITransactionContext
  ): Promise<{ deposit: SecurityDeposit; movement: SecurityDepositMovement }> {
    if (txContext) {
      return this.receiveSecurityDepositTransactional(
        companyId,
        contractId,
        driverId,
        vehicleId,
        amount,
        financialAccountId,
        paymentMethodId,
        userId,
        userName,
        txContext
      );
    }

    let deposit = await this.depositRepo.findByContractIdForCompany(companyId, contractId);
"""
text = replace_once(text, old_sig, new_sig, 'deposit receive signature')
marker = """  public static async returnSecurityDeposit(
"""
transactional = """  public static async getSecurityDepositByContract(
    companyId: string,
    contractId: string,
    userId: string,
    txContext?: ITransactionContext
  ): Promise<SecurityDeposit | null> {
    await FinancialAuthorizationService.authorize(
      userId,
      companyId,
      'VIEW_FINANCIAL',
      txContext
    );

    if (txContext) {
      return await txContext.getSecurityDepositRepo().findByContractId(contractId);
    }
    return await this.depositRepo.findByContractIdForCompany(companyId, contractId);
  }

  private static async receiveSecurityDepositTransactional(
    companyId: string,
    contractId: string,
    driverId: string,
    vehicleId: string,
    amount: number,
    financialAccountId: string,
    paymentMethodId: string,
    userId: string,
    userName: string,
    txContext: ITransactionContext
  ): Promise<{ deposit: SecurityDeposit; movement: SecurityDepositMovement }> {
    await FinancialAuthorizationService.authorize(
      userId,
      companyId,
      'RECEIPT_REGISTER',
      txContext
    );

    const depositRepo = txContext.getSecurityDepositRepo();
    const movementRepo = txContext.getSecurityDepositMovementRepo();
    const transactionRepo = txContext.getTransactionRepo();
    const accountRepo = txContext.getAccountRepo();
    const paymentMethodRepo = txContext.getPaymentMethodRepo?.();
    const auditRepo = txContext.getAuditLogRepo();

    await depositRepo.lockContract(companyId, contractId);

    let deposit = await depositRepo.findByContractId(contractId);
    const now = new Date().toISOString();
    const today = now.split('T')[0];

    if (!deposit) {
      deposit = await depositRepo.create({
        id: generateUUID(),
        companyId,
        contractId,
        driverId,
        vehicleId,
        originalAmount: amount,
        receivedAmount: 0,
        usedAmount: 0,
        returnedAmount: 0,
        status: SecurityDepositStatus.PENDING,
        createdAt: now,
        updatedAt: now,
      });
    }

    const previousState = { ...deposit };

    const account = await accountRepo.findById(financialAccountId);
    if (!account) {
      throw new Error('Conta financeira não encontrada ou pertence a outra empresa');
    }

    if (paymentMethodRepo) {
      const paymentMethod = await paymentMethodRepo.findById(paymentMethodId);
      if (!paymentMethod) {
        throw new Error('Forma de pagamento não encontrada ou pertence a outra empresa');
      }
    }

    const tx: FinancialTransaction = {
      id: generateUUID(),
      companyId,
      financialAccountId,
      type: TransactionType.INCOME,
      amount,
      paymentMethodId,
      transactionDate: today,
      competenceDate: today,
      description: `Recebimento de Caução (Contrato: ${contractId})`,
      isReversed: false,
      vehicleId,
      driverId,
      createdById: userId,
      createdAt: now,
      updatedAt: now,
    };

    const savedTx = await transactionRepo.create(tx);
    await accountRepo.updateBalance(financialAccountId, amount);

    const newReceived = roundCurrency(deposit.receivedAmount + amount);
    const newStatus = newReceived >= deposit.originalAmount
      ? SecurityDepositStatus.RECEIVED
      : SecurityDepositStatus.PENDING;

    const updatedDeposit = await depositRepo.update(deposit.id, {
      receivedAmount: newReceived,
      status: newStatus,
      receivedAt: now,
      updatedAt: now,
    });

    const movement = await movementRepo.create({
      id: generateUUID(),
      securityDepositId: deposit.id,
      companyId,
      type: SecurityDepositMovementType.RECEIPT,
      amount,
      date: now,
      financialTransactionId: savedTx.id,
      description: 'Recebimento inicial de caução',
      createdById: userId,
      createdAt: now,
    });

    await auditRepo.create({
      id: generateUUID(),
      companyId,
      entityName: 'SecurityDeposit',
      entityId: deposit.id,
      action: AuditAction.RECEIVE,
      userId,
      userName,
      timestamp: now,
      previousState: JSON.stringify(previousState),
      newState: JSON.stringify(updatedDeposit),
    });

    return { deposit: updatedDeposit, movement };
  }

""" + marker
text = replace_once(text, marker, transactional, 'deposit transactional helper')
p.write_text(text)

# 8) Server endpoints. Identity/tenant/driver/vehicle derived server-side.
p = Path('server.ts')
text = p.read_text()
if "import { DepositService } from './src/domain/finance/DepositService';" not in text:
    text = replace_once(
        text,
        "import { ProfitabilityService } from './src/domain/finance/ProfitabilityService';",
        "import { ProfitabilityService } from './src/domain/finance/ProfitabilityService';\nimport { DepositService } from './src/domain/finance/DepositService';",
        'server deposit import',
    )
marker = "  // SECURITY-2G6: receivable renegotiation is server-authoritative."
endpoints = """  // SECURITY-2G8: security-deposit read/receipt are server-authoritative.\n  app.get('/api/finance/security-deposits/by-contract/:contractId', async (req: Request, res: Response) => {\n    const principal = requireFinancePrincipal(req, res);\n    if (!principal) return;\n    const contractId = typeof req.params.contractId === 'string' ? req.params.contractId.trim() : '';\n    if (!contractId) {\n      res.status(400).json({ error: 'Invalid security deposit request' });\n      return;\n    }\n\n    try {\n      const deposit = await UnitOfWork.run(principal.companyId, async (txContext) =>\n        await DepositService.getSecurityDepositByContract(\n          principal.companyId,\n          contractId,\n          principal.userId,\n          txContext\n        )\n      );\n      res.json({ deposit });\n    } catch (error) {\n      sendFinanceCommandError(res, error);\n    }\n  });\n\n  app.post('/api/finance/security-deposits/receive', async (req: Request, res: Response) => {\n    const principal = requireFinancePrincipal(req, res);\n    if (!principal) return;\n\n    const contractId = typeof req.body?.contractId === 'string' ? req.body.contractId.trim() : '';\n    const amount = Number(req.body?.amount);\n    const financialAccountId = typeof req.body?.financialAccountId === 'string' ? req.body.financialAccountId.trim() : '';\n    const paymentMethodId = typeof req.body?.paymentMethodId === 'string' ? req.body.paymentMethodId.trim() : '';\n\n    if (!contractId || !Number.isFinite(amount) || amount <= 0 || !financialAccountId || !paymentMethodId) {\n      res.status(400).json({ error: 'Invalid security deposit request' });\n      return;\n    }\n\n    try {\n      const result = await UnitOfWork.run(principal.companyId, async (txContext) => {\n        const contract = await txContext.getContractRepo().findById(contractId);\n        if (!contract) throw new Error('Contrato não encontrado');\n\n        return await DepositService.receiveSecurityDeposit(\n          principal.companyId,\n          contract.id,\n          contract.driverId,\n          contract.vehicleId,\n          amount,\n          financialAccountId,\n          paymentMethodId,\n          principal.userId,\n          principal.name,\n          txContext\n        );\n      });\n      res.status(201).json(result);\n    } catch (error) {\n      sendFinanceCommandError(res, error);\n    }\n  });\n\n"""
if "app.post('/api/finance/security-deposits/receive'" not in text:
    text = replace_once(text, marker, endpoints + marker, 'server deposit endpoints')
p.write_text(text)

# 9) Browser client: operational fields only; never principal/tenant/driver/vehicle.
Path('src/api/financeDepositClient.ts').write_text("""import { SecurityDeposit, SecurityDepositMovement } from '../types/entities';\n\nexport class FinanceDepositApiError extends Error {\n  constructor(public readonly status: number, message: string) {\n    super(message);\n    this.name = 'FinanceDepositApiError';\n  }\n}\n\ntype JsonRecord = Record<string, unknown>;\n\nfunction asRecord(value: unknown): JsonRecord {\n  if (!value || typeof value !== 'object' || Array.isArray(value)) {\n    throw new Error('Invalid security deposit response');\n  }\n  return value as JsonRecord;\n}\n\nfunction validateDeposit(value: unknown): SecurityDeposit {\n  const item = asRecord(value);\n  if (\n    typeof item.id !== 'string' ||\n    typeof item.contractId !== 'string' ||\n    typeof item.status !== 'string' ||\n    !Number.isFinite(Number(item.originalAmount)) ||\n    !Number.isFinite(Number(item.receivedAmount)) ||\n    !Number.isFinite(Number(item.usedAmount)) ||\n    !Number.isFinite(Number(item.returnedAmount))\n  ) throw new Error('Invalid security deposit payload');\n  return item as unknown as SecurityDeposit;\n}\n\nfunction validateMovement(value: unknown): SecurityDepositMovement {\n  const item = asRecord(value);\n  if (\n    typeof item.id !== 'string' ||\n    typeof item.securityDepositId !== 'string' ||\n    typeof item.type !== 'string' ||\n    !Number.isFinite(Number(item.amount))\n  ) throw new Error('Invalid security deposit movement payload');\n  return item as unknown as SecurityDepositMovement;\n}\n\nasync function apiError(response: Response): Promise<FinanceDepositApiError> {\n  let message = `Security deposit request failed (${response.status})`;\n  try {\n    const payload = asRecord(await response.json());\n    if (typeof payload.error === 'string' && payload.error) message = payload.error;\n  } catch {\n    // Fail closed: never fall back to IndexedDB/localStorage.\n  }\n  return new FinanceDepositApiError(response.status, message);\n}\n\nexport interface ReceiveSecurityDepositInput {\n  contractId: string;\n  amount: number;\n  financialAccountId: string;\n  paymentMethodId: string;\n}\n\nexport class FinanceDepositClient {\n  static async getByContract(contractId: string): Promise<SecurityDeposit | null> {\n    const response = await fetch(`/api/finance/security-deposits/by-contract/${encodeURIComponent(contractId)}`, {\n      method: 'GET',\n      credentials: 'include',\n    });\n    if (!response.ok) throw await apiError(response);\n    const payload = asRecord(await response.json());\n    return payload.deposit == null ? null : validateDeposit(payload.deposit);\n  }\n\n  static async receive(input: ReceiveSecurityDepositInput): Promise<{ deposit: SecurityDeposit; movement: SecurityDepositMovement }> {\n    const response = await fetch('/api/finance/security-deposits/receive', {\n      method: 'POST',\n      credentials: 'include',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify(input),\n    });\n    if (!response.ok) throw await apiError(response);\n    const payload = asRecord(await response.json());\n    return {\n      deposit: validateDeposit(payload.deposit),\n      movement: validateMovement(payload.movement),\n    };\n  }\n}\n""")

# 10) Browser transport tests.
Path('src/api/__tests__/financeDepositClientTestRunner.ts').write_text("""import { FinanceDepositApiError, FinanceDepositClient } from '../financeDepositClient';\n\nconst deposit = { id:'dep-1', companyId:'company-a', contractId:'contract-a', driverId:'driver-a', vehicleId:'veh-a', originalAmount:1000, receivedAmount:400, usedAmount:0, returnedAmount:0, status:'PENDING', createdAt:'2026-08-18T00:00:00Z', updatedAt:'2026-08-18T00:00:00Z' };\nconst movement = { id:'mov-1', securityDepositId:'dep-1', companyId:'company-a', type:'RECEIPT', amount:400, date:'2026-08-18T00:00:00Z', description:'receipt', createdById:'user-a', createdAt:'2026-08-18T00:00:00Z' };\n\nexport class FinanceDepositClientTestRunner {\n  static async runAllTests() {\n    const originalFetch = globalThis.fetch;\n    let passed = 0;\n    const tests: Array<() => Promise<void>> = [];\n\n    tests.push(async () => {\n      let url=''; let credentials: RequestCredentials|undefined;\n      globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{url=String(input);credentials=init?.credentials;return new Response(JSON.stringify({deposit}),{status:200})}) as typeof fetch;\n      const result=await FinanceDepositClient.getByContract('contract-a');\n      if(!url.includes('/api/finance/security-deposits/by-contract/contract-a')||credentials!=='include'||result?.id!=='dep-1')throw Error('deposit read transport');\n    });\n\n    tests.push(async () => {\n      globalThis.fetch=(async()=>new Response(JSON.stringify({deposit:null}),{status:200})) as typeof fetch;\n      if(await FinanceDepositClient.getByContract('contract-a')!==null)throw Error('null deposit must be preserved');\n    });\n\n    tests.push(async () => {\n      let url='';let credentials:RequestCredentials|undefined;let body:any;\n      globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{url=String(input);credentials=init?.credentials;body=JSON.parse(String(init?.body));return new Response(JSON.stringify({deposit,movement}),{status:201})}) as typeof fetch;\n      const result=await FinanceDepositClient.receive({contractId:'contract-a',amount:400,financialAccountId:'acc-a',paymentMethodId:'pm-pix'});\n      if(url!=='/api/finance/security-deposits/receive'||credentials!=='include'||result.deposit.id!=='dep-1'||result.movement.id!=='mov-1')throw Error('deposit receive transport');\n      for(const key of ['companyId','userId','userName','driverId','vehicleId'])if(key in body)throw Error(`browser authority leaked: ${key}`);\n    });\n\n    tests.push(async () => {\n      globalThis.fetch=(async()=>new Response(JSON.stringify({error:'Unauthorized'}),{status:401})) as typeof fetch;\n      let thrown:unknown;try{await FinanceDepositClient.receive({contractId:'c',amount:1,financialAccountId:'a',paymentMethodId:'p'})}catch(e){thrown=e}\n      if(!(thrown instanceof FinanceDepositApiError)||thrown.status!==401)throw Error('receive must fail closed on 401');\n    });\n\n    tests.push(async () => {\n      globalThis.fetch=(async()=>new Response(JSON.stringify({deposit:{id:'bad'},movement:{}}),{status:201})) as typeof fetch;\n      let failed=false;try{await FinanceDepositClient.receive({contractId:'c',amount:1,financialAccountId:'a',paymentMethodId:'p'})}catch{failed=true}\n      if(!failed)throw Error('malformed receive must fail closed');\n    });\n\n    tests.push(async () => {\n      globalThis.fetch=(async()=>new Response('not-json',{status:500})) as typeof fetch;\n      let thrown:unknown;try{await FinanceDepositClient.getByContract('c')}catch(e){thrown=e}\n      if(!(thrown instanceof FinanceDepositApiError)||thrown.status!==500)throw Error('read must fail closed');\n    });\n\n    try{for(const test of tests){await test();passed+=1}}finally{globalThis.fetch=originalFetch}\n    const result={passed,failed:tests.length-passed,total:tests.length};\n    console.log(`FinanceDepositClient ${result.passed}/${result.total} PASS`);\n    return result;\n  }\n}\n\nif(process.argv[1]?.includes('financeDepositClientTestRunner')){FinanceDepositClientTestRunner.runAllTests().then(r=>{if(r.failed)process.exit(1)}).catch(e=>{console.error(e);process.exit(1)})}\n""")

# 11) Contract modal: read + receive deposit through API. Other contract paths remain untouched.
p = Path('src/components/contracts/ContractDetailsModal.tsx')
text = p.read_text()
text = text.replace("  SecurityDepositRepository,\n", '')
text = text.replace("import { FinanceEngine } from '../../domain/finance/FinanceEngine';\n", "import { FinanceDepositClient } from '../../api/financeDepositClient';\n")
text = replace_once(text, "      const depositRepo = new SecurityDepositRepository();\n", '', 'modal local deposit repo')
text = replace_once(
    text,
    "        depositRepo.findByContractIdForCompany(\n          companyIdSnapshot,\n          c.id\n        ),",
    "        FinanceDepositClient.getByContract(c.id),",
    'modal deposit read',
)
old_receive = """      await FinanceEngine.receiveSecurityDeposit(
        actionCompanyId!, contract.id,
        driver.id,
        vehicle.id,
        amount,
        'acc-nubank-1',
        'pm-pix',
        'usr-admin',
        'Administrador'
      );
"""
new_receive = """      await FinanceDepositClient.receive({
        contractId: contract.id,
        amount,
        financialAccountId: 'acc-nubank-1',
        paymentMethodId: 'pm-pix',
      });
"""
text = replace_once(text, old_receive, new_receive, 'modal deposit receive')
p.write_text(text)

print('SECURITY-2G8 patch applied')
