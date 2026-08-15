// AutoERP Communication Service (Phase 3.57)

import { CommunicationEntry, CommunicationAttachment, UserContext357 } from './types';
import { AuditLogRepository } from '../../persistence/repositories/localRepositories';
import { AuditAction } from '../../types/enums';

export class CommunicationService {
  private static STORAGE_KEY_PREFIX = '__autoerp_communication_v1_';
  private static auditRepo = new AuditLogRepository();
  private static activeLocks: Set<string> = new Set();

  private static getStorageKey(companyId: string): string {
    return `${this.STORAGE_KEY_PREFIX}${companyId}`;
  }

  private static validateContext(companyId: string, context: UserContext357): void {
    if (!companyId || typeof companyId !== 'string' || companyId.trim() === '') {
      throw new Error('Tenant ID (companyId) é obrigatório');
    }
    if (!context || !context.userId) {
      throw new Error('Contexto de usuário é obrigatório');
    }
    if (context.companyId !== companyId) {
      throw new Error(`Acesso negado: Tentativa de acesso cross-tenant (${context.companyId} !== ${companyId})`);
    }
  }

  public static async getEntries(
    companyId: string,
    entityType?: 'TASK' | 'ACTIVITY' | 'INCIDENT' | 'CONTRACT' | 'MAINTENANCE' | 'GENERAL',
    entityId?: string,
    context?: UserContext357
  ): Promise<CommunicationEntry[]> {
    if (context) this.validateContext(companyId, context);
    if (!companyId) throw new Error('Tenant ID (companyId) é obrigatório');

    const dataStr = localStorage.getItem(this.getStorageKey(companyId));
    let entries: CommunicationEntry[] = dataStr ? JSON.parse(dataStr) : [];

    if (entityType) {
      entries = entries.filter((e) => e.entityType === entityType);
    }
    if (entityId) {
      entries = entries.filter((e) => e.entityId === entityId);
    }

    return entries.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  public static async addEntry(
    companyId: string,
    payload: {
      entityType: 'TASK' | 'ACTIVITY' | 'INCIDENT' | 'CONTRACT' | 'MAINTENANCE' | 'GENERAL';
      entityId: string;
      message: string;
      mentions?: string[];
      attachments?: CommunicationAttachment[];
      correlationId?: string;
    },
    context: UserContext357
  ): Promise<CommunicationEntry> {
    this.validateContext(companyId, context);

    if (!payload.entityId || typeof payload.entityId !== 'string') {
      throw new Error('ID da entidade é obrigatório');
    }
    if (!payload.message || typeof payload.message !== 'string' || payload.message.trim() === '') {
      throw new Error('Mensagem não pode ser vazia');
    }

    const dataStr = localStorage.getItem(this.getStorageKey(companyId));
    const entries: CommunicationEntry[] = dataStr ? JSON.parse(dataStr) : [];

    const now = new Date().toISOString();
    const entry: CommunicationEntry = {
      id: `comm-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      companyId,
      entityType: payload.entityType,
      entityId: payload.entityId,
      authorId: context.userId,
      authorName: context.userName || context.userId,
      message: payload.message.trim(),
      mentions: payload.mentions || [],
      attachments: payload.attachments || [],
      createdAt: now,
      correlationId: payload.correlationId || `comm-${Date.now()}`,
    };

    // Append-only
    entries.push(entry);
    localStorage.setItem(this.getStorageKey(companyId), JSON.stringify(entries));

    await this.auditRepo.create({
      id: `audit-${Date.now()}`,
      companyId,
      entityName: 'CommunicationEntry',
      entityId: entry.id,
      action: AuditAction.CREATE,
      newState: JSON.stringify({ entityType: entry.entityType, entityId: entry.entityId, author: entry.authorName }),
      userId: context.userId,
      userName: context.userName || context.userId,
      timestamp: new Date().toISOString(),
    });

    return entry;
  }
}
