import type { NotificationStatus, PersistentNotification } from '../types/entities';

export class NotificationApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'NotificationApiError';
  }
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid notification response');
  }
  return value as JsonRecord;
}

const STATUSES = new Set<NotificationStatus>(['UNREAD', 'READ', 'DISMISSED', 'ARCHIVED']);
const SEVERITIES = new Set(['INFO', 'WARNING', 'DANGER', 'SUCCESS']);

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new Error('Invalid notification payload');
  return value;
}

function validateNotification(value: unknown): PersistentNotification {
  const item = asRecord(value);
  if (
    typeof item.id !== 'string' ||
    typeof item.companyId !== 'string' ||
    typeof item.sourceType !== 'string' ||
    typeof item.sourceId !== 'string' ||
    typeof item.alertStage !== 'string' ||
    typeof item.title !== 'string' ||
    typeof item.message !== 'string' ||
    typeof item.severity !== 'string' || !SEVERITIES.has(item.severity) ||
    typeof item.idempotencyKey !== 'string' ||
    typeof item.status !== 'string' || !STATUSES.has(item.status as NotificationStatus) ||
    typeof item.createdAt !== 'string' ||
    typeof item.updatedAt !== 'string'
  ) throw new Error('Invalid notification payload');

  for (const key of ['recipientUserId', 'sourceVersion', 'dueDate', 'destinationTab', 'readAt', 'dismissedAt'] as const) {
    optionalString(item[key]);
  }
  return item as unknown as PersistentNotification;
}

async function apiError(response: Response): Promise<NotificationApiError> {
  let message = `Notification request failed (${response.status})`;
  try {
    const payload = asRecord(await response.json());
    if (typeof payload.error === 'string' && payload.error) message = payload.error;
  } catch {
    // Fail closed: malformed error bodies never cause a browser-local fallback.
  }
  return new NotificationApiError(response.status, message);
}

export interface NotificationListOptions {
  status?: NotificationStatus;
  limit?: number;
}

export class NotificationClient {
  static async list(options: NotificationListOptions = {}): Promise<PersistentNotification[]> {
    const params = new URLSearchParams();
    if (options.status) params.set('status', options.status);
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const response = await fetch(`/api/notifications${suffix}`, { credentials: 'include' });
    if (!response.ok) throw await apiError(response);
    const payload = asRecord(await response.json());
    if (!Array.isArray(payload.items)) throw new Error('Invalid notification list');
    return payload.items.map(validateNotification);
  }

  static async unreadCount(): Promise<number> {
    const response = await fetch('/api/notifications/unread-count', { credentials: 'include' });
    if (!response.ok) throw await apiError(response);
    const payload = asRecord(await response.json());
    if (!Number.isInteger(payload.count) || Number(payload.count) < 0) throw new Error('Invalid unread count');
    return Number(payload.count);
  }

  static async markRead(id: string): Promise<PersistentNotification> {
    const response = await fetch(`/api/notifications/${encodeURIComponent(id)}/read`, {
      method: 'POST', credentials: 'include',
    });
    if (!response.ok) throw await apiError(response);
    return validateNotification(asRecord(await response.json()).item);
  }

  static async dismiss(id: string): Promise<PersistentNotification> {
    const response = await fetch(`/api/notifications/${encodeURIComponent(id)}/dismiss`, {
      method: 'POST', credentials: 'include',
    });
    if (!response.ok) throw await apiError(response);
    return validateNotification(asRecord(await response.json()).item);
  }

  static async markAllRead(): Promise<number> {
    const response = await fetch('/api/notifications/read-all', {
      method: 'POST', credentials: 'include',
    });
    if (!response.ok) throw await apiError(response);
    const payload = asRecord(await response.json());
    if (!Number.isInteger(payload.updated) || Number(payload.updated) < 0) throw new Error('Invalid read-all response');
    return Number(payload.updated);
  }
}
