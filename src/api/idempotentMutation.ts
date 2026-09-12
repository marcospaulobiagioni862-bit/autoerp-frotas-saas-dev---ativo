const IDEMPOTENCY_WINDOW_MS = 30_000;

type Entry<T> = {
  token: string;
  expiresAt: number;
  inFlight?: Promise<T>;
  value?: T;
  hasValue: boolean;
};

const entries = new Map<string, Entry<unknown>>();

function freshToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function cleanup(now: number): void {
  for (const [key, entry] of entries) {
    if (entry.expiresAt <= now && !entry.inFlight) entries.delete(key);
  }
}

export function runIdempotentMutation<T>(operationKey: string, execute: (token: string) => Promise<T>): Promise<T> {
  const now = Date.now();
  cleanup(now);
  let entry = entries.get(operationKey) as Entry<T> | undefined;
  if (!entry || entry.expiresAt <= now) {
    entry = { token: freshToken(), expiresAt: now + IDEMPOTENCY_WINDOW_MS, hasValue: false };
    entries.set(operationKey, entry as Entry<unknown>);
  }
  if (entry.inFlight) return entry.inFlight;
  if (entry.hasValue) return Promise.resolve(entry.value as T);

  const promise = execute(entry.token)
    .then((value) => {
      entry!.value = value;
      entry!.hasValue = true;
      entry!.inFlight = undefined;
      entry!.expiresAt = Date.now() + IDEMPOTENCY_WINDOW_MS;
      return value;
    })
    .catch((error) => {
      entry!.inFlight = undefined;
      entry!.expiresAt = Date.now() + IDEMPOTENCY_WINDOW_MS;
      throw error;
    });
  entry.inFlight = promise;
  return promise;
}
