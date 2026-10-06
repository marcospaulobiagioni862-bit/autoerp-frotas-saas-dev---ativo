import { isFinancialDreGroup, isDreGroupCompatible, type FinancialDreGroup } from '../shared/utils/financialDreGroups';
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { financialAccounts, financialCategories, paymentMethods } from '../db/schema';
import { AuditAction, FinancialAccountType, FinancialCategoryType } from '../types/enums';
import { FinancialAuthorizationService } from '../domain/finance/FinancialAuthorizationService';

export interface FinanceMasterDataActor {
  companyId: string;
  userId: string;
  name: string;
}

export interface CreateFinancialAccountInput {
  name: string;
  type: FinancialAccountType;
  institution?: string;
  accountNumber?: string;
  agency?: string;
  pixKey?: string;
  initialBalance: number;
  status?: 'ACTIVE' | 'INACTIVE';
}

export interface UpdateFinancialAccountInput {
  name?: string;
  type?: FinancialAccountType;
  institution?: string | null;
  accountNumber?: string | null;
  agency?: string | null;
  pixKey?: string | null;
  status?: 'ACTIVE' | 'INACTIVE';
}

export interface CreatePaymentMethodInput {
  name: string;
  type: string;
  active?: boolean;
}

export interface UpdatePaymentMethodInput {
  name?: string;
  type?: string;
  active?: boolean;
}

export interface CreateFinancialCategoryInput {
  dreGroup?: FinancialDreGroup;
  name: string;
  type: FinancialCategoryType;
  parentId?: string;
  active?: boolean;
}

export interface UpdateFinancialCategoryInput {
  dreGroup?: FinancialDreGroup | null;
  name?: string;
  type?: FinancialCategoryType;
  parentId?: string | null;
  active?: boolean;
}

function normalizeMoney(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) throw new Error('Valor financeiro inválido');
  return Math.round(amount * 100) / 100;
}

function accountRow(row: any) {
  return {
    ...row,
    initialBalance: Number(row.initialBalance || 0),
    currentBalance: Number(row.currentBalance || 0),
  };
}

function paymentMethodRow(row: any) {
  return { ...row, feePercentage: Number(row.feePercentage || 0) };
}

async function audit(txContext: any, actor: FinanceMasterDataActor, entityName: string, entityId: string, action: AuditAction, previousState: unknown, newState: unknown) {
  await txContext.getAuditLogRepo().create({
    id: randomUUID(),
    companyId: actor.companyId,
    entityName,
    entityId,
    action,
    userId: actor.userId,
    userName: actor.name,
    previousState: previousState == null ? undefined : JSON.stringify(previousState),
    newState: newState == null ? undefined : JSON.stringify(newState),
    timestamp: new Date().toISOString(),
  });
}

async function lockLogicalName(tx: any, companyId: string, kind: string, name: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(abs(hashtext(${`${companyId}:${kind}:${name.toLowerCase()}`})))`);
}

async function assertUniqueName(tx: any, table: any, companyId: string, kind: string, name: string, excludeId?: string): Promise<void> {
  await lockLogicalName(tx, companyId, kind, name);
  const rows = await tx.select({ id: table.id }).from(table)
    .where(and(eq(table.companyId, companyId), sql`lower(${table.name}) = lower(${name})`));
  if (rows.some((row: any) => row.id !== excludeId)) throw new Error('Nome financeiro já existe');
}

async function getCategory(tx: any, companyId: string, id: string) {
  const rows = await tx.select().from(financialCategories)
    .where(and(eq(financialCategories.companyId, companyId), eq(financialCategories.id, id)))
    .limit(1);
  return rows[0] || null;
}

function assertParentType(parent: any, childType: FinancialCategoryType): void {
  if (!parent.active) throw new Error('Categoria pai inativa');
  if (parent.type !== FinancialCategoryType.BOTH && parent.type !== childType) {
    throw new Error('Categoria pai incompatível');
  }
}

async function assertNoCategoryCycle(tx: any, companyId: string, categoryId: string, parentId: string): Promise<void> {
  if (categoryId === parentId) throw new Error('Categoria não pode ser pai de si mesma');
  let cursor: string | null = parentId;
  const visited = new Set<string>();
  while (cursor) {
    if (cursor === categoryId) throw new Error('Hierarquia de categoria cíclica');
    if (visited.has(cursor)) throw new Error('Hierarquia de categoria inválida');
    visited.add(cursor);
    const parent = await getCategory(tx, companyId, cursor);
    if (!parent) throw new Error('Categoria pai não encontrada');
    cursor = parent.parentId || null;
  }
}

export class FinanceMasterDataAuthority {
  static async list(actor: FinanceMasterDataActor) {
    return UnitOfWork.run(actor.companyId, async (txContext: any) => {
      await FinancialAuthorizationService.authorize(actor.userId, actor.companyId, 'VIEW_FINANCIAL', txContext);
      const tx = txContext.getRawTransaction();
      const accounts = await tx.select().from(financialAccounts).where(eq(financialAccounts.companyId, actor.companyId));
      const methods = await tx.select().from(paymentMethods).where(eq(paymentMethods.companyId, actor.companyId));
      const categories = await tx.select().from(financialCategories).where(eq(financialCategories.companyId, actor.companyId));
      return {
        accounts: accounts.map(accountRow),
        paymentMethods: methods.map(paymentMethodRow),
        categories,
      };
    });
  }

  static async createAccount(actor: FinanceMasterDataActor, input: CreateFinancialAccountInput) {
    return UnitOfWork.run(actor.companyId, async (txContext: any) => {
      await FinancialAuthorizationService.authorize(actor.userId, actor.companyId, 'FINANCIAL_MASTER_DATA_MANAGE', txContext);
      const tx = txContext.getRawTransaction();
      await assertUniqueName(tx, financialAccounts, actor.companyId, 'account', input.name);
      const now = new Date().toISOString();
      const openingBalance = normalizeMoney(input.initialBalance);
      const rows = await tx.insert(financialAccounts).values({
        id: randomUUID(), companyId: actor.companyId, name: input.name, type: input.type,
        institution: input.institution || null, accountNumber: input.accountNumber || null,
        agency: input.agency || null, pixKey: input.pixKey || null,
        initialBalance: String(openingBalance), currentBalance: String(openingBalance),
        status: input.status || 'ACTIVE', createdAt: now, updatedAt: now,
      }).returning();
      const item = accountRow(rows[0]);
      await audit(txContext, actor, 'FinancialAccount', item.id, AuditAction.CREATE, null, {
        ...item, openingBalancePolicy: 'INITIAL_EQUALS_CURRENT_AT_CREATION',
      });
      return item;
    });
  }

  static async updateAccount(actor: FinanceMasterDataActor, id: string, input: UpdateFinancialAccountInput) {
    return UnitOfWork.run(actor.companyId, async (txContext: any) => {
      await FinancialAuthorizationService.authorize(actor.userId, actor.companyId, 'FINANCIAL_MASTER_DATA_MANAGE', txContext);
      const tx = txContext.getRawTransaction();
      const existingRows = await tx.select().from(financialAccounts)
        .where(and(eq(financialAccounts.companyId, actor.companyId), eq(financialAccounts.id, id)))
        .for('update').limit(1);
      const existing = existingRows[0];
      if (!existing) throw new Error('Conta financeira não encontrada');
      if (input.name !== undefined) await assertUniqueName(tx, financialAccounts, actor.companyId, 'account', input.name, id);
      const rows = await tx.update(financialAccounts).set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.institution !== undefined ? { institution: input.institution } : {}),
        ...(input.accountNumber !== undefined ? { accountNumber: input.accountNumber } : {}),
        ...(input.agency !== undefined ? { agency: input.agency } : {}),
        ...(input.pixKey !== undefined ? { pixKey: input.pixKey } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        updatedAt: new Date().toISOString(),
      }).where(and(eq(financialAccounts.companyId, actor.companyId), eq(financialAccounts.id, id))).returning();
      const item = accountRow(rows[0]);
      await audit(txContext, actor, 'FinancialAccount', id, AuditAction.UPDATE, accountRow(existing), item);
      return item;
    });
  }

  static async createPaymentMethod(actor: FinanceMasterDataActor, input: CreatePaymentMethodInput) {
    return UnitOfWork.run(actor.companyId, async (txContext: any) => {
      await FinancialAuthorizationService.authorize(actor.userId, actor.companyId, 'FINANCIAL_MASTER_DATA_MANAGE', txContext);
      const tx = txContext.getRawTransaction();
      await assertUniqueName(tx, paymentMethods, actor.companyId, 'payment-method', input.name);
      const rows = await tx.insert(paymentMethods).values({
        id: randomUUID(), companyId: actor.companyId, name: input.name, type: input.type,
        active: input.active ?? true,
      }).returning();
      const item = paymentMethodRow(rows[0]);
      await audit(txContext, actor, 'PaymentMethod', item.id, AuditAction.CREATE, null, item);
      return item;
    });
  }

  static async updatePaymentMethod(actor: FinanceMasterDataActor, id: string, input: UpdatePaymentMethodInput) {
    return UnitOfWork.run(actor.companyId, async (txContext: any) => {
      await FinancialAuthorizationService.authorize(actor.userId, actor.companyId, 'FINANCIAL_MASTER_DATA_MANAGE', txContext);
      const tx = txContext.getRawTransaction();
      const existingRows = await tx.select().from(paymentMethods)
        .where(and(eq(paymentMethods.companyId, actor.companyId), eq(paymentMethods.id, id)))
        .for('update').limit(1);
      const existing = existingRows[0];
      if (!existing) throw new Error('Forma de pagamento não encontrada');
      if (input.name !== undefined) await assertUniqueName(tx, paymentMethods, actor.companyId, 'payment-method', input.name, id);
      const rows = await tx.update(paymentMethods).set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      }).where(and(eq(paymentMethods.companyId, actor.companyId), eq(paymentMethods.id, id))).returning();
      const item = paymentMethodRow(rows[0]);
      await audit(txContext, actor, 'PaymentMethod', id, AuditAction.UPDATE, paymentMethodRow(existing), item);
      return item;
    });
  }

  static async createCategory(actor: FinanceMasterDataActor, input: CreateFinancialCategoryInput) {
    return UnitOfWork.run(actor.companyId, async (txContext: any) => {
      await FinancialAuthorizationService.authorize(actor.userId, actor.companyId, 'FINANCIAL_MASTER_DATA_MANAGE', txContext);
      const tx = txContext.getRawTransaction();
      if (input.dreGroup != null && (!isFinancialDreGroup(input.dreGroup) || !isDreGroupCompatible(input.type, input.dreGroup))) throw new Error('Grupo DRE incompatível');
      await assertUniqueName(tx, financialCategories, actor.companyId, `category:${input.type}`, input.name);
      if (input.parentId) {
        const parent = await getCategory(tx, actor.companyId, input.parentId);
        if (!parent) throw new Error('Categoria pai não encontrada');
        assertParentType(parent, input.type);
      }
      const now = new Date().toISOString();
      const rows = await tx.insert(financialCategories).values({
        id: randomUUID(), companyId: actor.companyId, name: input.name, type: input.type,
        dreGroup: input.dreGroup || null, parentId: input.parentId || null, active: input.active ?? true, createdAt: now, updatedAt: now,
      }).returning();
      const item = rows[0];
      await audit(txContext, actor, 'FinancialCategory', item.id, AuditAction.CREATE, null, item);
      return item;
    });
  }

  static async updateCategory(actor: FinanceMasterDataActor, id: string, input: UpdateFinancialCategoryInput) {
    return UnitOfWork.run(actor.companyId, async (txContext: any) => {
      await FinancialAuthorizationService.authorize(actor.userId, actor.companyId, 'FINANCIAL_MASTER_DATA_MANAGE', txContext);
      const tx = txContext.getRawTransaction();
      const existingRows = await tx.select().from(financialCategories)
        .where(and(eq(financialCategories.companyId, actor.companyId), eq(financialCategories.id, id)))
        .for('update').limit(1);
      const existing = existingRows[0];
      if (!existing) throw new Error('Categoria financeira não encontrada');
      const nextType = input.type || existing.type as FinancialCategoryType;
      const nextGroup = input.dreGroup === undefined ? existing.dreGroup : input.dreGroup;
      if (nextGroup != null && (!isFinancialDreGroup(nextGroup) || !isDreGroupCompatible(nextType, nextGroup))) throw new Error('Grupo DRE incompatível');
      const nextName = input.name || existing.name;
      await assertUniqueName(tx, financialCategories, actor.companyId, `category:${nextType}`, nextName, id);
      const nextParentId = input.parentId === undefined ? existing.parentId : input.parentId;
      if (nextParentId) {
        await assertNoCategoryCycle(tx, actor.companyId, id, nextParentId);
        const parent = await getCategory(tx, actor.companyId, nextParentId);
        if (!parent) throw new Error('Categoria pai não encontrada');
        assertParentType(parent, nextType);
      }
      const rows = await tx.update(financialCategories).set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        ...(input.dreGroup !== undefined ? { dreGroup: input.dreGroup } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        updatedAt: new Date().toISOString(),
      }).where(and(eq(financialCategories.companyId, actor.companyId), eq(financialCategories.id, id))).returning();
      const item = rows[0];
      await audit(txContext, actor, 'FinancialCategory', id, AuditAction.UPDATE, existing, item);
      return item;
    });
  }
}
