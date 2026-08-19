import { sql } from 'drizzle-orm';
import type { NotificationStatus, PersistentNotification } from '../../types/entities';
import type {
  ITransactionNotificationRepository,
  TransactionNotificationFilters,
} from '../../domain/finance/ITransactionContext';

function rowsOf(result: any): any[] {
  return Array.isArray(result?.rows) ? result.rows : [];
}

function optionalText(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  return String(value);
}

function iso(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  return value instanceof Date ? value.toISOString() : String(value);
}

export class PostgresNotificationRepository implements ITransactionNotificationRepository {
  constructor(private readonly tx: any) {}

  private map(row: any): PersistentNotification {
    return {
      id: String(row.id),
      companyId: String(row.company_id),
      recipientUserId: optionalText(row.recipient_user_id),
      sourceType: String(row.source_type),
      sourceId: String(row.source_id),
      sourceVersion: optionalText(row.source_version),
      alertStage: String(row.alert_stage),
      title: String(row.title),
      message: String(row.message),
      severity: String(row.severity) as PersistentNotification['severity'],
      dueDate: optionalText(row.due_date),
      destinationTab: optionalText(row.destination_tab),
      idempotencyKey: String(row.idempotency_key),
      status: String(row.status) as NotificationStatus,
      readAt: iso(row.read_at),
      dismissedAt: iso(row.dismissed_at),
      createdAt: iso(row.created_at) || '',
      updatedAt: iso(row.updated_at) || '',
    };
  }

  async findByIdForCompany(companyId: string, id: string): Promise<PersistentNotification | null> {
    const result = await this.tx.execute(sql`
      SELECT * FROM notifications
      WHERE company_id = ${companyId} AND id = ${id}
      LIMIT 1
    `);
    const row = rowsOf(result)[0];
    return row ? this.map(row) : null;
  }

  async findByIdempotencyKey(companyId: string, key: string): Promise<PersistentNotification | null> {
    const result = await this.tx.execute(sql`
      SELECT * FROM notifications
      WHERE company_id = ${companyId} AND idempotency_key = ${key}
      LIMIT 1
    `);
    const row = rowsOf(result)[0];
    return row ? this.map(row) : null;
  }

  async findAllByCompany(
    companyId: string,
    filters?: TransactionNotificationFilters
  ): Promise<PersistentNotification[]> {
    const result = await this.tx.execute(sql`
      SELECT * FROM notifications
      WHERE company_id = ${companyId}
      ORDER BY created_at DESC, id DESC
    `);
    let items = rowsOf(result).map((row) => this.map(row));
    if (filters?.status) items = items.filter((item) => item.status === filters.status);
    if (!filters?.includeArchived) items = items.filter((item) => item.status !== 'ARCHIVED');
    if (filters?.recipientUserId) {
      items = items.filter((item) => !item.recipientUserId || item.recipientUserId === filters.recipientUserId);
    }
    const limit = Math.min(Math.max(filters?.limit ?? 50, 1), 200);
    return items.slice(0, limit);
  }

  async countUnread(companyId: string, recipientUserId?: string): Promise<number> {
    const result = recipientUserId
      ? await this.tx.execute(sql`
          SELECT COUNT(*)::int AS count
          FROM notifications
          WHERE company_id = ${companyId}
            AND status = 'UNREAD'
            AND (recipient_user_id IS NULL OR recipient_user_id = ${recipientUserId})
        `)
      : await this.tx.execute(sql`
          SELECT COUNT(*)::int AS count
          FROM notifications
          WHERE company_id = ${companyId} AND status = 'UNREAD'
        `);
    return Number(rowsOf(result)[0]?.count || 0);
  }

  async create(item: PersistentNotification): Promise<PersistentNotification> {
    await this.tx.execute(sql`
      INSERT INTO notifications (
        id, company_id, recipient_user_id, source_type, source_id, source_version,
        alert_stage, title, message, severity, due_date, destination_tab,
        idempotency_key, status, read_at, dismissed_at, created_at, updated_at
      ) VALUES (
        ${item.id}, ${item.companyId}, ${item.recipientUserId || null}, ${item.sourceType}, ${item.sourceId},
        ${item.sourceVersion || null}, ${item.alertStage}, ${item.title}, ${item.message}, ${item.severity},
        ${item.dueDate || null}, ${item.destinationTab || null}, ${item.idempotencyKey}, ${item.status},
        ${item.readAt || null}, ${item.dismissedAt || null}, ${item.createdAt}, ${item.updatedAt}
      )
    `);
    const created = await this.findByIdForCompany(item.companyId, item.id);
    if (!created) throw new Error('Notification create failed');
    return created;
  }

  async createIfAbsent(
    item: PersistentNotification
  ): Promise<{ item: PersistentNotification; created: boolean }> {
    const result = await this.tx.execute(sql`
      INSERT INTO notifications (
        id, company_id, recipient_user_id, source_type, source_id, source_version,
        alert_stage, title, message, severity, due_date, destination_tab,
        idempotency_key, status, read_at, dismissed_at, created_at, updated_at
      ) VALUES (
        ${item.id}, ${item.companyId}, ${item.recipientUserId || null}, ${item.sourceType}, ${item.sourceId},
        ${item.sourceVersion || null}, ${item.alertStage}, ${item.title}, ${item.message}, ${item.severity},
        ${item.dueDate || null}, ${item.destinationTab || null}, ${item.idempotencyKey}, ${item.status},
        ${item.readAt || null}, ${item.dismissedAt || null}, ${item.createdAt}, ${item.updatedAt}
      )
      ON CONFLICT (company_id, idempotency_key) DO NOTHING
      RETURNING id
    `);
    const created = Boolean(rowsOf(result)[0]);
    const persisted = await this.findByIdempotencyKey(item.companyId, item.idempotencyKey);
    if (!persisted) throw new Error('Notification idempotent create failed');
    return { item: persisted, created };
  }

  async updateStatusForCompany(
    companyId: string,
    id: string,
    status: NotificationStatus,
    now: string
  ): Promise<PersistentNotification | null> {
    const result = await this.tx.execute(sql`
      UPDATE notifications SET
        status = ${status},
        read_at = CASE
          WHEN ${status} = 'READ' AND read_at IS NULL THEN ${now}
          ELSE read_at
        END,
        dismissed_at = CASE
          WHEN ${status} = 'DISMISSED' AND dismissed_at IS NULL THEN ${now}
          ELSE dismissed_at
        END,
        updated_at = ${now}
      WHERE company_id = ${companyId} AND id = ${id}
      RETURNING id
    `);
    if (!rowsOf(result)[0]) return null;
    return await this.findByIdForCompany(companyId, id);
  }

  async markAllRead(companyId: string, recipientUserId: string | undefined, now: string): Promise<number> {
    const result = recipientUserId
      ? await this.tx.execute(sql`
          UPDATE notifications SET status = 'READ', read_at = COALESCE(read_at, ${now}), updated_at = ${now}
          WHERE company_id = ${companyId}
            AND status = 'UNREAD'
            AND (recipient_user_id IS NULL OR recipient_user_id = ${recipientUserId})
          RETURNING id
        `)
      : await this.tx.execute(sql`
          UPDATE notifications SET status = 'READ', read_at = COALESCE(read_at, ${now}), updated_at = ${now}
          WHERE company_id = ${companyId} AND status = 'UNREAD'
          RETURNING id
        `);
    return rowsOf(result).length;
  }
}
