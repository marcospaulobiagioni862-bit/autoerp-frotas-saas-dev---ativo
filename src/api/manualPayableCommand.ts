import { FinanceObligationClient, type CreatePayableRequest } from './financeObligationClient';

// Keep ambiguous commands across retries and view remounts, without a time expiry.
const pending = new Map<string, { token: string; inFlight?: ReturnType<typeof FinanceObligationClient.createPayable> }>();
export async function createManualPayable(companyId: string, input: Omit<CreatePayableRequest, 'originType' | 'originId' | 'idempotencyKey'>) {
  if (!companyId) throw new Error('Tenant obrigatório para criação manual');
  const fingerprint = JSON.stringify([companyId, input]);
  const storageKey = `manual-payable:${fingerprint}`;
  let entry = pending.get(fingerprint);
  if (!entry) {
    const token = sessionStorage.getItem(storageKey) || crypto.randomUUID();
    sessionStorage.setItem(storageKey, token);
    entry = { token };
    pending.set(fingerprint, entry);
  }
  if (entry.inFlight) return entry.inFlight;
  const command = entry;
  command.inFlight = FinanceObligationClient.createPayable({ ...input, originType: 'MANUAL', originId: `manual-${command.token}`, idempotencyKey: command.token });
  try {
    const result = await command.inFlight;
    sessionStorage.removeItem(storageKey);
    pending.delete(fingerprint);
    return result;
  } finally {
    command.inFlight = undefined;
  }
}
