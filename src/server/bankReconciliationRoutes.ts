import type { Express, Request, Response } from 'express';
import type { AuthenticatedPrincipal } from './auth';
import {
  BankReconciliationAuthority,
  type ImportBankStatementInput,
  type ReconciliationActor,
} from './bankReconciliationAuthority';

class BankReconciliationValidationError extends Error {}

function principal(req: Request): AuthenticatedPrincipal | undefined {
  return (req as Request & { principal?: AuthenticatedPrincipal }).principal;
}

function requirePrincipal(req: Request, res: Response): AuthenticatedPrincipal | null {
  const actor = principal(req);
  if (!actor) {
    res.status(401).json({ error: 'Unauthorized: Authentication required' });
    return null;
  }
  return actor;
}

function actorFrom(item: AuthenticatedPrincipal): ReconciliationActor {
  return { companyId: item.companyId, userId: item.userId, name: item.name };
}

function hasOnlyKeys(value: unknown, allowed: Set<string>): boolean {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value as Record<string, unknown>).every((key) => allowed.has(key));
}

function requiredString(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new BankReconciliationValidationError();
  return text;
}

function optionalReason(body: unknown): string | undefined {
  const allowed = new Set(['reason']);
  if (!hasOnlyKeys(body ?? {}, allowed)) throw new BankReconciliationValidationError();
  if (!body || typeof body !== 'object') return undefined;
  const value = (body as Record<string, unknown>).reason;
  if (value === undefined || value === null || value === '') return undefined;
  return requiredString(value);
}

export function parseBankStatementImportRequest(body: unknown): ImportBankStatementInput {
  const allowed = new Set(['financialAccountId', 'entries']);
  if (!hasOnlyKeys(body, allowed)) throw new BankReconciliationValidationError();
  const input = body as Record<string, unknown>;
  if (!Array.isArray(input.entries)) throw new BankReconciliationValidationError();
  const entryKeys = new Set([
    'externalId', 'date', 'description', 'amount', 'direction', 'documentNumber', 'importSource',
  ]);
  for (const entry of input.entries) {
    if (!hasOnlyKeys(entry, entryKeys)) throw new BankReconciliationValidationError();
  }
  return {
    financialAccountId: requiredString(input.financialAccountId),
    entries: input.entries as ImportBankStatementInput['entries'],
  };
}

function parseMatchRequest(body: unknown): string {
  const allowed = new Set(['transactionId']);
  if (!hasOnlyKeys(body, allowed)) throw new BankReconciliationValidationError();
  return requiredString((body as Record<string, unknown>).transactionId);
}

function assertQueryKeys(req: Request, allowed: Set<string>): void {
  if (!Object.keys(req.query).every((key) => allowed.has(key))) throw new BankReconciliationValidationError();
}

function sendError(res: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : '';
  if (error instanceof BankReconciliationValidationError) {
    res.status(400).json({ error: 'Invalid bank reconciliation request' });
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
    message.includes('já está conciliada') ||
    message.includes('já conciliada') ||
    message.includes('Desconcilie') ||
    message.includes('revertida') ||
    message.includes('legada sem direção') ||
    message.includes('inativa') ||
    message.includes('incompatível') ||
    message.includes('diverge') ||
    message.includes('idempotência')
  ) {
    res.status(409).json({ error: 'Bank reconciliation conflict' });
    return;
  }
  if (message.includes('inválid') || message.includes('obrigatór') || message.includes('Quantidade')) {
    res.status(400).json({ error: 'Invalid bank reconciliation request' });
    return;
  }
  if (String((error as any)?.code || (error as any)?.cause?.code || '') === '23505') {
    res.status(409).json({ error: 'Bank reconciliation conflict' });
    return;
  }
  console.error('AUTOERP_BANK_RECONCILIATION_API_FAILURE', error);
  res.status(500).json({ error: 'Bank reconciliation operation failed' });
}

export function registerBankReconciliationRoutes(app: Express): void {
  app.post('/api/finance/bank-reconciliation/import', async (req, res) => {
    const principalItem = requirePrincipal(req, res); if (!principalItem) return;
    try {
      const input = parseBankStatementImportRequest(req.body);
      res.status(201).json(await BankReconciliationAuthority.importEntries(actorFrom(principalItem), input));
    } catch (error) { sendError(res, error); }
  });

  app.get('/api/finance/bank-reconciliation/entries', async (req, res) => {
    const principalItem = requirePrincipal(req, res); if (!principalItem) return;
    try {
      assertQueryKeys(req, new Set(['financialAccountId', 'status']));
      const accountId = req.query.financialAccountId === undefined ? undefined : requiredString(req.query.financialAccountId);
      const status = BankReconciliationAuthority.normalizeStatus(req.query.status);
      res.json({ items: await BankReconciliationAuthority.listEntries(actorFrom(principalItem), accountId, status) });
    } catch (error) { sendError(res, error); }
  });

  app.get('/api/finance/bank-reconciliation/suggestions', async (req, res) => {
    const principalItem = requirePrincipal(req, res); if (!principalItem) return;
    try {
      assertQueryKeys(req, new Set(['financialAccountId']));
      const accountId = requiredString(req.query.financialAccountId);
      res.json({ items: await BankReconciliationAuthority.suggestMatches(actorFrom(principalItem), accountId) });
    } catch (error) { sendError(res, error); }
  });

  app.post('/api/finance/bank-reconciliation/entries/:id/match', async (req, res) => {
    const principalItem = requirePrincipal(req, res); if (!principalItem) return;
    try {
      res.json({ item: await BankReconciliationAuthority.matchEntry(
        actorFrom(principalItem), req.params.id, parseMatchRequest(req.body),
      ) });
    } catch (error) { sendError(res, error); }
  });

  app.post('/api/finance/bank-reconciliation/entries/:id/unmatch', async (req, res) => {
    const principalItem = requirePrincipal(req, res); if (!principalItem) return;
    try {
      res.json({ item: await BankReconciliationAuthority.unmatchEntry(
        actorFrom(principalItem), req.params.id, optionalReason(req.body),
      ) });
    } catch (error) { sendError(res, error); }
  });

  app.post('/api/finance/bank-reconciliation/entries/:id/ignore', async (req, res) => {
    const principalItem = requirePrincipal(req, res); if (!principalItem) return;
    try {
      res.json({ item: await BankReconciliationAuthority.ignoreEntry(
        actorFrom(principalItem), req.params.id, optionalReason(req.body),
      ) });
    } catch (error) { sendError(res, error); }
  });
}
