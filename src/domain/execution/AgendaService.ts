// AutoERP Agenda Service (Phase 3.57)

import { AgendaEvent, UserContext357, AgendaViewMode } from './types';
import { ExecutionService } from './ExecutionService';
import { TaskService } from '../workflow/TaskService';
import { MaintenanceRepository } from '../../persistence/repositories/localRepositories';
import { AuditLogRepository } from '../../persistence/repositories/localRepositories';
import { AuditAction } from '../../types/enums';

export class AgendaService {
  private static STORAGE_KEY_PREFIX = '__autoerp_agenda_events_v1_';
  private static auditRepo = new AuditLogRepository();
  private static maintRepo = new MaintenanceRepository();
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

  private static async acquireLock(lockKey: string): Promise<boolean> {
    if (this.activeLocks.has(lockKey)) return false;
    this.activeLocks.add(lockKey);
    return true;
  }

  private static releaseLock(lockKey: string): void {
    this.activeLocks.delete(lockKey);
  }

  public static async getEvents(
    companyId: string,
    startDate?: string,
    endDate?: string,
    filters?: {
      assignedTo?: string;
      sourceType?: string;
      priority?: string;
    },
    context?: UserContext357
  ): Promise<AgendaEvent[]> {
    if (context) this.validateContext(companyId, context);
    if (!companyId) throw new Error('Tenant ID (companyId) é obrigatório');

    // 1. Direct agenda events
    const dataStr = localStorage.getItem(this.getStorageKey(companyId));
    let directEvents: AgendaEvent[] = dataStr ? JSON.parse(dataStr) : [];

    // 2. Virtual events from Tasks (TaskService)
    const taskEvents: AgendaEvent[] = [];
    try {
      const tasks = await TaskService.getTasks(companyId);
      for (const t of tasks) {
        if (t.status !== 'CANCELLED' && t.dueAt) {
          taskEvents.push({
            id: `agenda-task-${t.id}`,
            companyId,
            title: t.title,
            description: t.description,
            startAt: t.dueAt,
            endAt: t.dueAt,
            allDay: false,
            status: t.status === 'COMPLETED' || t.status === 'CLOSED' ? 'COMPLETED' : 'SCHEDULED',
            priority: t.priority as any,
            assignedTo: t.assignedUserId || 'UNASSIGNED',
            participants: t.assignedUserId ? [t.assignedUserId] : [],
            sourceType: 'TASK',
            sourceId: t.id,
            reminderMinutes: 30,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
            correlationId: t.correlationId || `task-${t.id}`,
          });
        }
      }
    } catch {
      // Ignore fallback if tasks fail
    }

    // 3. Virtual events from Execution Activities (ExecutionService)
    const activityEvents: AgendaEvent[] = [];
    try {
      const activities = await ExecutionService.getActivities(companyId, undefined, context);
      for (const a of activities) {
        if (a.status !== 'CANCELLED' && a.scheduledStart) {
          activityEvents.push({
            id: `agenda-act-${a.id}`,
            companyId,
            title: a.title,
            description: a.description,
            startAt: a.scheduledStart,
            endAt: a.scheduledEnd || a.scheduledStart,
            allDay: false,
            status: a.status === 'COMPLETED' ? 'COMPLETED' : 'SCHEDULED',
            priority: a.priority as any,
            assignedTo: a.assignedTo,
            participants: [a.assignedTo],
            sourceType: 'ACTIVITY',
            sourceId: a.id,
            reminderMinutes: 15,
            createdAt: a.createdAt,
            updatedAt: a.updatedAt,
            correlationId: a.correlationId,
          });
        }
      }
    } catch {
      // Ignore fallback
    }

    // 4. Virtual events from Maintenances
    const maintenanceEvents: AgendaEvent[] = [];
    try {
      const maints = (await this.maintRepo.findAll()).filter((m) => m.companyId === companyId);
      for (const m of maints) {
        if (m.startDate) {
          maintenanceEvents.push({
            id: `agenda-maint-${m.id}`,
            companyId,
            title: `[MANUTENÇÃO] Veículo ${m.vehicleId}`,
            description: `Tipo: ${m.type || 'Geral'} | Descrição: ${m.description || 'N/A'}`,
            startAt: m.startDate,
            endAt: m.completionDate || m.startDate,
            allDay: true,
            status: m.status === 'COMPLETED' ? 'COMPLETED' : 'SCHEDULED',
            priority: 'P1',
            assignedTo: 'EQUIPE_MANUTENCAO',
            participants: [],
            sourceType: 'MAINTENANCE',
            sourceId: m.id,
            reminderMinutes: 60,
            createdAt: m.createdAt || m.startDate,
            updatedAt: m.updatedAt || m.startDate,
            correlationId: `maint-${m.id}`,
          });
        }
      }
    } catch {
      // Ignore
    }

    // Deduplicate and combine
    const map = new Map<string, AgendaEvent>();
    [...directEvents, ...taskEvents, ...activityEvents, ...maintenanceEvents].forEach((evt) => {
      map.set(evt.id, evt);
    });

    let all = Array.from(map.values());

    // Filter by dates if provided
    if (startDate) {
      const startMs = new Date(startDate).getTime();
      all = all.filter((e) => new Date(e.startAt).getTime() >= startMs);
    }
    if (endDate) {
      const endMs = new Date(endDate).getTime();
      all = all.filter((e) => new Date(e.startAt).getTime() <= endMs);
    }

    // Filter by options
    if (filters) {
      if (filters.assignedTo) all = all.filter((e) => e.assignedTo === filters.assignedTo);
      if (filters.sourceType) all = all.filter((e) => e.sourceType === filters.sourceType);
      if (filters.priority) all = all.filter((e) => e.priority === filters.priority);
    }

    return all.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  }

  public static async createEvent(
    companyId: string,
    payload: Partial<AgendaEvent>,
    context: UserContext357
  ): Promise<AgendaEvent> {
    this.validateContext(companyId, context);

    if (!payload.title || typeof payload.title !== 'string' || payload.title.trim() === '') {
      throw new Error('Título do evento é obrigatório');
    }
    if (!payload.startAt) {
      throw new Error('Data de início (startAt) é obrigatória');
    }

    const lockKey = `create-agenda-${companyId}-${payload.title}-${payload.startAt}`;
    const acquired = await this.acquireLock(lockKey);
    if (!acquired) {
      throw new Error('Operação de agendamento concorrente em andamento');
    }

    try {
      const dataStr = localStorage.getItem(this.getStorageKey(companyId));
      let events: AgendaEvent[] = dataStr ? JSON.parse(dataStr) : [];

      // Idempotency check: companyId + sourceType + sourceId + startAt
      if (payload.sourceType && payload.sourceId && payload.startAt) {
        const existing = events.find(
          (e) =>
            e.sourceType === payload.sourceType &&
            e.sourceId === payload.sourceId &&
            e.startAt === payload.startAt &&
            e.status !== 'CANCELLED'
        );
        if (existing) return existing;
      }

      const now = new Date().toISOString();
      const event: AgendaEvent = {
        id: payload.id || `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        companyId,
        title: payload.title.trim(),
        description: payload.description || '',
        startAt: payload.startAt,
        endAt: payload.endAt || payload.startAt,
        allDay: payload.allDay || false,
        status: payload.status || 'SCHEDULED',
        priority: payload.priority || 'P2',
        assignedTo: payload.assignedTo || context.userId,
        participants: payload.participants || [context.userId],
        sourceType: payload.sourceType || 'OTHER',
        sourceId: payload.sourceId || `manual-${Date.now()}`,
        recurrenceRule: payload.recurrenceRule,
        reminderMinutes: payload.reminderMinutes ?? 15,
        createdAt: now,
        updatedAt: now,
        correlationId: payload.correlationId || `agenda-${Date.now()}`,
      };

      events.push(event);
      localStorage.setItem(this.getStorageKey(companyId), JSON.stringify(events));

      await this.auditRepo.create({
        id: `audit-${Date.now()}`,
        companyId,
        entityName: 'AgendaEvent',
        entityId: event.id,
        action: AuditAction.CREATE,
        newState: JSON.stringify({ title: event.title, startAt: event.startAt }),
        userId: context.userId,
        userName: context.userName || context.userId,
        timestamp: new Date().toISOString(),
      });

      return event;
    } finally {
      this.releaseLock(lockKey);
    }
  }

  public static async generateRecurrenceOccurrences(
    companyId: string,
    eventId: string,
    horizonDays: number = 30,
    context: UserContext357
  ): Promise<AgendaEvent[]> {
    this.validateContext(companyId, context);

    const dataStr = localStorage.getItem(this.getStorageKey(companyId));
    let events: AgendaEvent[] = dataStr ? JSON.parse(dataStr) : [];
    const baseEvent = events.find((e) => e.id === eventId);

    if (!baseEvent || !baseEvent.recurrenceRule) {
      return [];
    }

    const generated: AgendaEvent[] = [];
    const baseDate = new Date(baseEvent.startAt);
    const limitDate = new Date(baseDate.getTime() + horizonDays * 24 * 3600 * 1000);

    let currentDate = new Date(baseDate.getTime() + 24 * 3600 * 1000); // Start next day
    let safetyCounter = 0;

    while (currentDate <= limitDate && safetyCounter < 100) {
      safetyCounter++;
      const isoDate = currentDate.toISOString();

      // Check if event for this date already exists (Idempotent)
      const exists = events.some(
        (e) => e.sourceId === baseEvent.id && e.startAt.substring(0, 10) === isoDate.substring(0, 10)
      );

      if (!exists) {
        const occEvent = await this.createEvent(
          companyId,
          {
            title: baseEvent.title,
            description: baseEvent.description,
            startAt: isoDate,
            endAt: isoDate,
            allDay: baseEvent.allDay,
            status: 'SCHEDULED',
            priority: baseEvent.priority,
            assignedTo: baseEvent.assignedTo,
            participants: baseEvent.participants,
            sourceType: baseEvent.sourceType,
            sourceId: baseEvent.id,
            reminderMinutes: baseEvent.reminderMinutes,
          },
          context
        );
        generated.push(occEvent);
      }

      // Default daily step for simulation
      currentDate = new Date(currentDate.getTime() + 24 * 3600 * 1000);
    }

    return generated;
  }
}
