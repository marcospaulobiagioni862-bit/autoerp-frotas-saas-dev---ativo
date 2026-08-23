import type { Express, Request, Response } from 'express';
import type { AuthenticatedPrincipal } from './auth';
import { OriginType, RecurringFrequency } from '../types/enums';
import {
  RecurringAuthorityService,
  startRecurringScheduler,
  type CreateRecurringRuleInput,
  type UpdateRecurringRuleInput,
} from './recurringAuthority';
import { registerMaintenanceRoutes } from './maintenanceRoutes';
import { registerTrackerRoutes } from './trackerRoutes';
import { registerInsuranceRoutes } from './insuranceRoutes';
import { registerTrafficTicketRoutes } from './trafficTicketRoutes';
import { registerOperationalRoutes } from './operationalRoutes';
import { registerDetailAuthorityRoutes } from './detailAuthorityRoutes';
import { registerFinanceOverdueRoutes } from './financeOverdueRoutes';
import { registerBankReconciliationRoutes } from './bankReconciliationRoutes';
import { registerSecurityDepositLifecycleRoutes } from './securityDepositLifecycleRoutes';
import { registerFinancePayableRenegotiationRoutes } from './financePayableRenegotiationRoutes';

type RecurringAction = 'VIEW_RECURRING' | 'MUTATE_RECURRING' | 'VIEW_NOTIFICATIONS' | 'READ_NOTIFICATIONS';
const READ_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'FINANCIAL', 'FINANCIAL_MANAGER', 'OPERATIONAL', 'READONLY']);
const MUTATION_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'FINANCIAL', 'FINANCIAL_MANAGER']);

class RecurringValidationError extends Error {}
class RecurringNotFoundError extends Error {}
class RecurringForbiddenError extends Error {}
function principal(req: Request): AuthenticatedPrincipal | undefined { return (req as Request & { principal?: AuthenticatedPrincipal }).principal; }
function requirePrincipal(req: Request, res: Response, action: RecurringAction): AuthenticatedPrincipal | null {
  const item = principal(req);
  if (!item) { res.status(401).json({ error: 'Unauthorized: Authentication required' }); return null; }
  const role = String(item.role || '').toUpperCase();
  const permissions = Array.isArray(item.permissions) ? item.permissions : [];
  const explicit = permissions.includes('*') || permissions.includes(action);
  const allowed = action === 'MUTATE_RECURRING' ? MUTATION_ROLES.has(role) : READ_ROLES.has(role);
  if (!explicit && !allowed) { res.status(403).json({ error: 'Forbidden' }); return null; }
  return item;
}
function requiredText(value: unknown, max = 400): string { const text = typeof value === 'string' ? value.trim() : ''; if (!text || text.length > max) throw new RecurringValidationError(); return text; }
function optionalText(value: unknown, max = 200): string | undefined { if (value === undefined || value === null || value === '') return undefined; const text = String(value).trim(); if (!text || text.length > max) throw new RecurringValidationError(); return text; }
function positiveAmount(value: unknown): number { const amount = Number(value); if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999.99) throw new RecurringValidationError(); return Math.round(amount * 100) / 100; }
function isoDate(value: unknown, required = false): string | undefined {
  if (value === undefined || value === null || value === '') { if (required) throw new RecurringValidationError(); return undefined; }
  const text = String(value).trim(); if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new RecurringValidationError();
  const parsed = new Date(`${text}T00:00:00Z`); if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) throw new RecurringValidationError(); return text;
}
function frequency(value: unknown): RecurringFrequency { const item = String(value || '') as RecurringFrequency; if (!Object.values(RecurringFrequency).includes(item)) throw new RecurringValidationError(); return item; }
function originType(value: unknown): OriginType { const item = String(value || '') as OriginType; if (![OriginType.CONTRACT_RENT, OriginType.TRACKER].includes(item)) throw new RecurringValidationError(); return item; }
function nullableText(value: unknown): string | null | undefined { if (value === undefined) return undefined; if (value === null || value === '') return null; return optionalText(value); }
function isUniqueViolation(error: unknown): boolean { let current: unknown = error; for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth++) { if ('code' in current && (current as { code?: unknown }).code === '23505') return true; current = 'cause' in current ? (current as { cause?: unknown }).cause : undefined; } return false; }
function sendError(res: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : '';
  if (error instanceof RecurringValidationError) { res.status(400).json({ error: 'Invalid recurring request' }); return; }
  if (error instanceof RecurringForbiddenError || message.startsWith('Acesso negado:')) { res.status(403).json({ error: 'Forbidden' }); return; }
  if (error instanceof RecurringNotFoundError || message.includes('não encontrada') || message.includes('não encontrado')) { res.status(404).json({ error: 'Not found' }); return; }
  if (isUniqueViolation(error) || message.includes('não pode') || message.includes('incompleta') || message.includes('divergentes') || message.includes('incompatível') || message.includes('divergente')) { res.status(409).json({ error: 'Recurring rule conflict' }); return; }
  console.error('AUTOERP_RECURRING_API_FAILURE', error); res.status(500).json({ error: 'Recurring operation failed' });
}
export function registerRecurringRoutes(app: Express): void {
  startRecurringScheduler();
  registerMaintenanceRoutes(app); registerTrackerRoutes(app); registerInsuranceRoutes(app); registerTrafficTicketRoutes(app);
  registerOperationalRoutes(app); registerDetailAuthorityRoutes(app); registerFinanceOverdueRoutes(app); registerBankReconciliationRoutes(app);
  registerSecurityDepositLifecycleRoutes(app); registerFinancePayableRenegotiationRoutes(app);

  app.get('/api/recurring-rules', async (req, res) => { const actor = requirePrincipal(req, res, 'VIEW_RECURRING'); if (!actor) return; try { res.json({ items: await RecurringAuthorityService.listRules(actor.companyId) }); } catch (error) { sendError(res, error); } });
  app.get('/api/recurring-rules/:id', async (req, res) => { const actor = requirePrincipal(req, res, 'VIEW_RECURRING'); if (!actor) return; try { const item = await RecurringAuthorityService.getRule(actor.companyId, req.params.id); if (!item) throw new RecurringNotFoundError(); res.json({ item }); } catch (error) { sendError(res, error); } });
  app.get('/api/recurring-rules/:id/runs', async (req, res) => { const actor = requirePrincipal(req, res, 'VIEW_RECURRING'); if (!actor) return; try { res.json({ items: await RecurringAuthorityService.listRuns(actor.companyId, req.params.id) }); } catch (error) { sendError(res, error); } });
  app.post('/api/recurring-rules', async (req, res) => {
    const actor = requirePrincipal(req, res, 'MUTATE_RECURRING'); if (!actor) return;
    try {
      const startDate = isoDate(req.body?.startDate, true)!; const endDate = isoDate(req.body?.endDate); const nextGenerationDate = isoDate(req.body?.nextGenerationDate) || startDate;
      if (endDate && endDate < startDate) throw new RecurringValidationError(); if (nextGenerationDate < startDate || (endDate && nextGenerationDate > endDate)) throw new RecurringValidationError();
      const input: CreateRecurringRuleInput = { originType: originType(req.body?.originType), originId: optionalText(req.body?.originId), description: requiredText(req.body?.description), amount: positiveAmount(req.body?.amount), frequency: frequency(req.body?.frequency), startDate, endDate, nextGenerationDate, categoryId: requiredText(req.body?.categoryId, 200), vehicleId: optionalText(req.body?.vehicleId), driverId: optionalText(req.body?.driverId), supplierId: optionalText(req.body?.supplierId), paymentMethodId: optionalText(req.body?.paymentMethodId) };
      res.status(201).json({ item: await RecurringAuthorityService.createRule(actor, input) });
    } catch (error) { sendError(res, error); }
  });
  app.patch('/api/recurring-rules/:id', async (req, res) => {
    const actor = requirePrincipal(req, res, 'MUTATE_RECURRING'); if (!actor) return;
    try {
      const input: UpdateRecurringRuleInput = {};
      if (req.body?.description !== undefined) input.description = requiredText(req.body.description); if (req.body?.amount !== undefined) input.amount = positiveAmount(req.body.amount); if (req.body?.frequency !== undefined) input.frequency = frequency(req.body.frequency); if (req.body?.startDate !== undefined) input.startDate = isoDate(req.body.startDate, true); if (req.body?.endDate !== undefined) input.endDate = req.body.endDate === null || req.body.endDate === '' ? null : isoDate(req.body.endDate, true)!; if (req.body?.nextGenerationDate !== undefined) input.nextGenerationDate = isoDate(req.body.nextGenerationDate, true); if (req.body?.categoryId !== undefined) input.categoryId = requiredText(req.body.categoryId, 200); if (req.body?.vehicleId !== undefined) input.vehicleId = nullableText(req.body.vehicleId); if (req.body?.driverId !== undefined) input.driverId = nullableText(req.body.driverId); if (req.body?.supplierId !== undefined) input.supplierId = nullableText(req.body.supplierId); if (req.body?.paymentMethodId !== undefined) input.paymentMethodId = nullableText(req.body.paymentMethodId); if (Object.keys(input).length === 0) throw new RecurringValidationError();
      res.json({ item: await RecurringAuthorityService.updateRule(actor, req.params.id, input) });
    } catch (error) { sendError(res, error); }
  });
  for (const action of ['pause', 'resume', 'cancel'] as const) app.post(`/api/recurring-rules/:id/${action}`, async (req: Request, res: Response) => { const actor = requirePrincipal(req, res, 'MUTATE_RECURRING'); if (!actor) return; try { res.json({ item: await RecurringAuthorityService.setLifecycle(actor, req.params.id, action) }); } catch (error) { sendError(res, error); } });
  app.get('/api/notifications', async (req, res) => { const actor = requirePrincipal(req, res, 'VIEW_NOTIFICATIONS'); if (!actor) return; try { const limit = req.query.limit === undefined ? 50 : Number(req.query.limit); if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RecurringValidationError(); res.json({ items: await RecurringAuthorityService.listNotifications(actor.companyId, actor.userId, limit) }); } catch (error) { sendError(res, error); } });
  app.get('/api/notifications/unread-count', async (req, res) => { const actor = requirePrincipal(req, res, 'VIEW_NOTIFICATIONS'); if (!actor) return; try { res.json({ count: await RecurringAuthorityService.unreadCount(actor.companyId, actor.userId) }); } catch (error) { sendError(res, error); } });
  app.post('/api/notifications/:id/read', async (req, res) => { const actor = requirePrincipal(req, res, 'READ_NOTIFICATIONS'); if (!actor) return; try { const item = await RecurringAuthorityService.markNotificationRead(actor.companyId, actor.userId, req.params.id); if (!item) throw new RecurringNotFoundError(); res.json({ item }); } catch (error) { sendError(res, error); } });
  app.post('/api/notifications/read-all', async (req, res) => { const actor = requirePrincipal(req, res, 'READ_NOTIFICATIONS'); if (!actor) return; try { res.json({ updated: await RecurringAuthorityService.markAllNotificationsRead(actor.companyId, actor.userId) }); } catch (error) { sendError(res, error); } });
}
