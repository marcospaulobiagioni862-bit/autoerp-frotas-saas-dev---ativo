const PREFIX = 'autoerp:v2:draft:';
const MAX_AGE = 14 * 86_400_000;
export interface DraftStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void; }

function matchesShape(value: unknown, sample: unknown): boolean {
  if (sample === null) return value === null;
  if (Array.isArray(sample)) return Array.isArray(value);
  if (typeof sample === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return Object.entries(sample as Record<string, unknown>).every(([key, item]) => matchesShape(record[key], item));
  }
  return typeof value === typeof sample;
}
export function draftKey(company: string, user: string, form: string): string {
  return PREFIX + [company, user, form].map(encodeURIComponent).join(':');
}
export function readFormDraft<T>(storage: DraftStorage, key: string, sample: T, now = Date.now()): T | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const item = JSON.parse(raw);
    if (item.version !== 1 || !Number.isFinite(item.savedAt) || now - item.savedAt > MAX_AGE || item.savedAt > now + 60_000 || !matchesShape(item.value, sample)) return null;
    return item.value as T;
  } catch { return null; }
}
export function writeFormDraft<T>(storage: DraftStorage, key: string, value: T, now = Date.now()): void {
  storage.setItem(key, JSON.stringify({ version: 1, savedAt: now, value }));
}
