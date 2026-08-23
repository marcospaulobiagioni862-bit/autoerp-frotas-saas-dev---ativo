import type { Express, Request, Response } from 'express';
import { UnitOfWork } from '../db/uow';
import { RenegotiationService } from '../domain/finance/RenegotiationService';
import {
  isRenegotiationInstallmentFrequency,
  type RenegotiationInstallmentFrequency,
} from '../shared/utils/renegotiationSchedule';
import type { AuthenticatedPrincipal } from './auth';

class PayableRenegotiationValidationError extends Error {}

function principalFrom(req: Request): AuthenticatedPrincipal | undefined {
  return (req as Request & { principal?: AuthenticatedPrincipal }).principal;
}

function requiredText(value: unknown, max = 400): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > max) throw new PayableRenegotiationValidationError();
  return text;
}

function positiveMoney(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999.99) {
    throw new PayableRenegotiationValidationError();
  }
  return Math.round(amount * 100) / 100;
}

function installments(value: unknown): number {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > 120) {
    throw new PayableRenegotiationValidationError();
  }
  return count;
}

function isoDate(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new PayableRenegotiationValidationError();
  const parsed = new Date(`${text}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    throw new PayableRenegotiationValidationError();
  }
  return text;
}

function obligationIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 200) {
    throw new PayableRenegotiationValidationError();
  }
  const ids = value.map((item) => requiredText(item, 200));
  if (new Set(ids).size !== ids.length) throw new PayableRenegotiationValidationError();
  return ids;
}

function frequency(value: unknown): RenegotiationInstallmentFrequency {
  if (!isRenegotiationInstallmentFrequency(value)) {
    throw new PayableRenegotiationValidationError();
  }
  return value;
}

function sendError(res: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : '';
  if (error instanceof PayableRenegotiationValidationError) {
    res.status(400).json({ error: 'Invalid payable renegotiation request' });
    return;
  }
  if (message.startsWith('Acesso negado:')) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  if (message.includes('não encontrado') || message.includes('não encontrada')) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (
    message.includes('não aceita renegociação') ||
    message.includes('já foi renegociado') ||
    message.includes('já vinculado') ||
    message.includes('diverge do saldo devedor autoritativo') ||
    message.includes('Chave de idempotência reutilizada') ||
    message.includes('Renegociação anterior incompleta') ||
    message.includes('período financeiro') ||
    message.includes('Período')
  ) {
    res.status(409).json({ error: 'Payable renegotiation conflict' });
    return;
  }
  console.error('AUTOERP_PAYABLE_RENEGOTIATION_FAILURE', error);
  res.status(400).json({ error: 'Invalid payable renegotiation command' });
}

export function registerFinancePayableRenegotiationRoutes(app: Express): void {
  app.post('/api/finance/payables/renegotiate', async (req: Request, res: Response) => {
    const actor = principalFrom(req);
    if (!actor) {
      res.status(401).json({ error: 'Unauthorized: Authentication required' });
      return;
    }

    try {
      const ids = obligationIds(req.body?.obligationIds);
      const commandIdempotencyKey = requiredText(req.body?.idempotencyKey, 160);
      const categoryId = requiredText(req.body?.categoryId, 200);
      const description = requiredText(req.body?.description, 400);
      const firstDueDate = isoDate(req.body?.firstDueDate);
      const installmentFrequency = frequency(req.body?.installmentFrequency);
      const installmentsCount = installments(req.body?.installmentsCount);
      const requestedTotal = positiveMoney(req.body?.newTotalAmount);

      const items = await UnitOfWork.run(actor.companyId, async (txContext) =>
        await RenegotiationService.renegociate(
          {
            companyId: actor.companyId,
            obligationIds: ids,
            type: 'PAYABLE',
            newTotalAmount: requestedTotal,
            installmentsCount,
            firstDueDate,
            installmentFrequency,
            categoryId,
            description,
            idempotencyKey: commandIdempotencyKey,
            userId: actor.userId,
            userName: actor.name,
          },
          txContext
        )
      );

      res.status(201).json({ items });
    } catch (error) {
      sendError(res, error);
    }
  });
}
