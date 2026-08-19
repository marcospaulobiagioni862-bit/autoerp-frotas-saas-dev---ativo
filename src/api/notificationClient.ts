export type NotificationSeverity = 'INFO' | 'WARNING' | 'DANGER' | 'SUCCESS';

export interface NotificationItem {
  id: string;
  companyId: string;
  userId: string;
  eventType: string;
  dedupKey: string;
  title: string;
  message: string;
  severity: NotificationSeverity;
  entityType?: string;
  entityId?: string;
  alertStage?: string;
  createdAt: string;
  readAt?: string;
  createdBy: string;
}

export class NotificationApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'NotificationApiError';
  }
}

type JsonRecord = Record<string, unknown>;
function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid notification payload');
  return value as JsonRecord;
}
function validateNotification(value: unknown): NotificationItem {
  const item = asRecord(value);
  const severities = new Set(['INFO', 'WARNING', 'DANGER', 'SUCCESS']);
  for (const key of ['id','companyId','userId','eventType','dedupKey','title','message','severity','createdAt','createdBy'] as const) {
    if (typeof item[key] !== 'string') throw new Error('Invalid notification payload');
  }
  if (!severities.has(item.severity as string)) throw new Error('Invalid notification payload');
  for (const key of ['entityType','entityId','alertStage','readAt'] as const) {
    if (item[key] !== undefined && typeof item[key] !== 'string') throw new Error('Invalid notification payload');
  }
  return item as unknown as NotificationItem;
}
async function request(path: string, init?: RequestInit): Promise<JsonRecord> {
  const response = await fetch(path, { credentials: 'include', ...init });
  if (!response.ok) {
    let message = `Notification request failed (${response.status})`;
    try { const payload = asRecord(await response.json()); if (typeof payload.error === 'string') message = payload.error; } catch {}
    throw new NotificationApiError(response.status, message);
  }
  return asRecord(await response.json());
}

export class NotificationClient {
  static async list(limit = 50): Promise<NotificationItem[]> {
    const payload = await request(`/api/notifications?limit=${encodeURIComponent(String(limit))}`);
    if (!Array.isArray(payload.items)) throw new Error('Invalid notification list payload');
    return payload.items.map(validateNotification);
  }
  static async unreadCount(): Promise<number> {
    const payload = await request('/api/notifications/unread-count');
    if (typeof payload.count !== 'number' || !Number.isInteger(payload.count) || payload.count < 0) throw new Error('Invalid unread count payload');
    return payload.count;
  }
  static async markRead(id: string): Promise<NotificationItem> {
    const payload = await request(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    return validateNotification(payload.item);
  }
  static async markAllRead(): Promise<number> {
    const payload = await request('/api/notifications/read-all', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    if (typeof payload.updated !== 'number' || !Number.isInteger(payload.updated) || payload.updated < 0) throw new Error('Invalid notification update payload');
    return payload.updated;
  }
}
