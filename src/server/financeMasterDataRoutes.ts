import { isFinancialDreGroup, type FinancialDreGroup } from '../shared/utils/financialDreGroups';
import type { Express, Request, Response } from 'express';
import type { AuthenticatedPrincipal } from './auth';
import { FinancialAccountType, FinancialCategoryType } from '../types/enums';
import {
  FinanceMasterDataAuthority,
  type FinanceMasterDataActor,
} from './financeMasterDataAuthority';

class FinanceMasterDataValidationError extends Error {}

function principal(req: Request): AuthenticatedPrincipal | undefined {
  return (req as Request & { principal?: AuthenticatedPrincipal }).principal;
}

function requirePrincipal(req: Request, res: Response): AuthenticatedPrincipal | null {
  const item = principal(req);
  if (!item) {
    res.status(401).json({ error: 'Unauthorized: Authentication required' });
    return null;
  }
  return item;
}

function actorFrom(item: AuthenticatedPrincipal): FinanceMasterDataActor {
  return { companyId: item.companyId, userId: item.userId, name: item.name };
}

function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new FinanceMasterDataValidationError();
  return value as Record<string, unknown>;
}

function assertOnlyKeys(body: Record<string, unknown>, allowed: string[]): void {
  const set = new Set(allowed);
  if (!Object.keys(body).every((key) => set.has(key))) throw new FinanceMasterDataValidationError();
}

function requiredText(value: unknown, max = 200): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > max) throw new FinanceMasterDataValidationError();
  return text;
}

function optionalText(value: unknown, max = 200): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return requiredText(value, max);
}

function nullableText(value: unknown, max = 200): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return requiredText(value, max);
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new FinanceMasterDataValidationError();
  return value;
}

function accountType(value: unknown): FinancialAccountType {
  const item = String(value || '') as FinancialAccountType;
  if (!Object.values(FinancialAccountType).includes(item)) throw new FinanceMasterDataValidationError();
  return item;
}

function dreGroup(value: unknown): FinancialDreGroup | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!isFinancialDreGroup(value)) throw new FinanceMasterDataValidationError();
  return value;
}

function categoryType(value: unknown): FinancialCategoryType {
  const item = String(value || '') as FinancialCategoryType;
  if (!Object.values(FinancialCategoryType).includes(item)) throw new FinanceMasterDataValidationError();
  return item;
}

function accountStatus(value: unknown): 'ACTIVE' | 'INACTIVE' {
  if (value !== 'ACTIVE' && value !== 'INACTIVE') throw new FinanceMasterDataValidationError();
  return value;
}

function optionalAccountStatus(value: unknown): 'ACTIVE' | 'INACTIVE' | undefined {
  return value === undefined ? undefined : accountStatus(value);
}

function initialBalance(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || Math.abs(amount) > 999999999.99) throw new FinanceMasterDataValidationError();
  return Math.round(amount * 100) / 100;
}

function sendError(res: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : '';
  if (error instanceof FinanceMasterDataValidationError) {
    res.status(400).json({ error: 'Invalid finance master-data request' });
    return;
  }
  if (message.startsWith('Acesso negado:')) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  if (message.includes('não encontrada') || message.includes('não encontrado')) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (
    message.includes('já existe') || message.includes('inativa') || message.includes('incompatível') ||
    message.includes('cíclica') || message.includes('pai de si')
  ) {
    res.status(409).json({ error: 'Finance master-data conflict' });
    return;
  }
  console.error('AUTOERP_FINANCE_MASTER_DATA_API_FAILURE', error);
  res.status(500).json({ error: 'Finance master-data operation failed' });
}

export function registerFinanceMasterDataRoutes(app: Express): void {
  app.get('/api/finance/master-data', async (req, res) => {
    const p = requirePrincipal(req, res); if (!p) return;
    try { res.json(await FinanceMasterDataAuthority.list(actorFrom(p))); }
    catch (error) { sendError(res, error); }
  });

  app.post('/api/finance/master-data/accounts', async (req, res) => {
    const p = requirePrincipal(req, res); if (!p) return;
    try {
      const body = objectBody(req.body);
      assertOnlyKeys(body, ['name', 'type', 'institution', 'accountNumber', 'agency', 'pixKey', 'initialBalance', 'status']);
      res.status(201).json({ item: await FinanceMasterDataAuthority.createAccount(actorFrom(p), {
        name: requiredText(body.name), type: accountType(body.type),
        institution: optionalText(body.institution), accountNumber: optionalText(body.accountNumber),
        agency: optionalText(body.agency), pixKey: optionalText(body.pixKey),
        initialBalance: initialBalance(body.initialBalance ?? 0),
        status: body.status === undefined ? undefined : accountStatus(body.status),
      }) });
    } catch (error) { sendError(res, error); }
  });

  app.patch('/api/finance/master-data/accounts/:id', async (req, res) => {
    const p = requirePrincipal(req, res); if (!p) return;
    try {
      const body = objectBody(req.body);
      assertOnlyKeys(body, ['name', 'type', 'institution', 'accountNumber', 'agency', 'pixKey', 'status']);
      if (Object.keys(body).length === 0) throw new FinanceMasterDataValidationError();
      res.json({ item: await FinanceMasterDataAuthority.updateAccount(actorFrom(p), requiredText(req.params.id), {
        name: body.name === undefined ? undefined : requiredText(body.name),
        type: body.type === undefined ? undefined : accountType(body.type),
        institution: nullableText(body.institution), accountNumber: nullableText(body.accountNumber),
        agency: nullableText(body.agency), pixKey: nullableText(body.pixKey),
        status: optionalAccountStatus(body.status),
      }) });
    } catch (error) { sendError(res, error); }
  });

  app.post('/api/finance/master-data/payment-methods', async (req, res) => {
    const p = requirePrincipal(req, res); if (!p) return;
    try {
      const body = objectBody(req.body);
      assertOnlyKeys(body, ['name', 'type', 'active']);
      res.status(201).json({ item: await FinanceMasterDataAuthority.createPaymentMethod(actorFrom(p), {
        name: requiredText(body.name), type: requiredText(body.type, 100), active: optionalBoolean(body.active),
      }) });
    } catch (error) { sendError(res, error); }
  });

  app.patch('/api/finance/master-data/payment-methods/:id', async (req, res) => {
    const p = requirePrincipal(req, res); if (!p) return;
    try {
      const body = objectBody(req.body);
      assertOnlyKeys(body, ['name', 'type', 'active']);
      if (Object.keys(body).length === 0) throw new FinanceMasterDataValidationError();
      res.json({ item: await FinanceMasterDataAuthority.updatePaymentMethod(actorFrom(p), requiredText(req.params.id), {
        name: body.name === undefined ? undefined : requiredText(body.name),
        type: body.type === undefined ? undefined : requiredText(body.type, 100),
        active: optionalBoolean(body.active),
      }) });
    } catch (error) { sendError(res, error); }
  });

  app.post('/api/finance/master-data/categories', async (req, res) => {
    const p = requirePrincipal(req, res); if (!p) return;
    try {
      const body = objectBody(req.body);
      assertOnlyKeys(body, ['name', 'type', 'parentId', 'active', 'dreGroup']);
      res.status(201).json({ item: await FinanceMasterDataAuthority.createCategory(actorFrom(p), {
        name: requiredText(body.name), type: categoryType(body.type),
        parentId: optionalText(body.parentId), active: optionalBoolean(body.active), dreGroup: dreGroup(body.dreGroup) ?? undefined,
      }) });
    } catch (error) { sendError(res, error); }
  });

  app.patch('/api/finance/master-data/categories/:id', async (req, res) => {
    const p = requirePrincipal(req, res); if (!p) return;
    try {
      const body = objectBody(req.body);
      assertOnlyKeys(body, ['name', 'type', 'parentId', 'active', 'dreGroup']);
      if (Object.keys(body).length === 0) throw new FinanceMasterDataValidationError();
      res.json({ item: await FinanceMasterDataAuthority.updateCategory(actorFrom(p), requiredText(req.params.id), {
        name: body.name === undefined ? undefined : requiredText(body.name),
        type: body.type === undefined ? undefined : categoryType(body.type),
        parentId: nullableText(body.parentId), active: optionalBoolean(body.active), dreGroup: dreGroup(body.dreGroup),
      }) });
    } catch (error) { sendError(res, error); }
  });
}
