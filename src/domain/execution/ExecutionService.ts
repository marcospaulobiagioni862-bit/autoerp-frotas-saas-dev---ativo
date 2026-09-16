// AutoERP Integrated Operational Execution Service (Phase 3.57)

import {
  ExecutionActivity,
  ExecutionActivityStatus,
  ExecutionActivityPriority,
  ActivityType,
  UserContext357,
} from './types';
import { TaskService } from '../workflow/TaskService';
import { Task } from '../workflow/types';
import { PendingActionService } from '../workflow/PendingActionService';
import { IncidentManagementService } from '../incident-management/IncidentManagementService';
import { AuditLogRepository } from '../../persistence/repositories/localRepositories';
import { AuditAction } from '../../types/enums';

export class ExecutionService {
  private static STORAGE_KEY_PREFIX = '__autoerp_execution_activities_v1_';
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

  private static async acquireLock(lockKey: string): Promise<boolean> {
    if (this.activeLocks.has(lockKey)) {
      return false;
    }
    this.activeLocks.add(lockKey);
    return true;
  }

  private static releaseLock(lockKey: string): void {
    this.activeLocks.delete(lockKey);
  }

  public static async getActivities(
    companyId: string,
    filters?: {
      status?: ExecutionActivityStatus;
      priority?: ExecutionActivityPriority;
      assignedTo?: string;
      type?: ActivityType;
      vehicleId?: string;
      driverId?: string;
      contractId?: string;
    },
    context?: UserContext357
  ): Promise<ExecutionActivity[]> {
    if (context) {
      this.validateContext(companyId, context);
    } else if (!companyId) {
      throw new Error('Tenant ID (companyId) é obrigatório');
    }

    const key = this.getStorageKey(companyId);
    const dataStr = localStorage.getItem(key);
    let activities: ExecutionActivity[] = dataStr ? JSON.parse(dataStr) : [];

    if (filters) {
      if (filters.status) activities = activities.filter((a) => a.status === filters.status);
      if (filters.priority) activities = activities.filter((a) => a.priority === filters.priority);
      if (filters.assignedTo) activities = activities.filter((a) => a.assignedTo === filters.assignedTo);
      if (filters.type) activities = activities.filter((a) => a.type === filters.type);
      if (filters.vehicleId) activities = activities.filter((a) => a.vehicleId === filters.vehicleId);
      if (filters.driverId) activities = activities.filter((a) => a.driverId === filters.driverId);
      if (filters.contractId) activities = activities.filter((a) => a.contractId === filters.contractId);
    }

    return activities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public static async getActivityById(
    companyId: string,
    activityId: string,
    context?: UserContext357
  ): Promise<ExecutionActivity | null> {
    if (context) this.validateContext(companyId, context);
    if (!companyId || !activityId) return null;

    const activities = await this.getActivities(companyId, undefined, context);
    return activities.find((a) => a.id === activityId) || null;
  }

  public static async createActivity(
    companyId: string,
    payload: Partial<ExecutionActivity>,
    context: UserContext357
  ): Promise<ExecutionActivity> {
    this.validateContext(companyId, context);

    if (!payload.title || typeof payload.title !== 'string' || payload.title.trim() === '') {
      throw new Error('Título da atividade é obrigatório');
    }

    const lockKey = `create-activity-${companyId}-${payload.title}`;
    const acquired = await this.acquireLock(lockKey);
    if (!acquired) {
      throw new Error('Operação concorrente em andamento para esta atividade');
    }

    try {
      const activities = await this.getActivities(companyId, undefined, context);

      // Check idempotency if explicit source or title exists
      if (payload.source && payload.title) {
        const existing = activities.find(
          (a) => a.source === payload.source && a.title === payload.title && a.status !== 'CANCELLED'
        );
        if (existing) {
          return existing;
        }
      }

      const now = new Date().toISOString();
      const activity: ExecutionActivity = {
        id: payload.id || `act-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        companyId,
        title: payload.title.trim(),
        description: payload.description || '',
        type: payload.type || 'TASK',
        priority: payload.priority || 'P2',
        status: payload.status || 'PLANNED',
        taskId: payload.taskId,
        assignedTo: payload.assignedTo || context.userId,
        createdBy: context.userId,
        scheduledStart: payload.scheduledStart || now,
        scheduledEnd: payload.scheduledEnd || new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        completedAt: payload.completedAt,
        vehicleId: payload.vehicleId,
        driverId: payload.driverId,
        contractId: payload.contractId,
        incidentId: payload.incidentId,
        source: payload.source || 'MANUAL',
        recurrence: payload.recurrence,
        createdAt: now,
        updatedAt: now,
        correlationId: payload.correlationId || `execution-${Date.now()}`,
      };

      activities.push(activity);
      localStorage.setItem(this.getStorageKey(companyId), JSON.stringify(activities));

      await this.auditRepo.create({
        id: `audit-${Date.now()}`,
        companyId,
        entityName: 'ExecutionActivity',
        entityId: activity.id,
        action: AuditAction.CREATE,
        newState: JSON.stringify({ title: activity.title, type: activity.type, priority: activity.priority }),
        userId: context.userId,
        userName: context.userName || context.userId,
        timestamp: new Date().toISOString(),
      });

      return activity;
    } finally {
      this.releaseLock(lockKey);
    }
  }

  public static async updateActivityStatus(
    companyId: string,
    activityId: string,
    status: ExecutionActivityStatus,
    context: UserContext357,
    reason?: string
  ): Promise<ExecutionActivity> {
    this.validateContext(companyId, context);

    const lockKey = `update-activity-${companyId}-${activityId}`;
    const acquired = await this.acquireLock(lockKey);
    if (!acquired) {
      throw new Error('Operação concorrente na atividade em andamento');
    }

    try {
      const activities = await this.getActivities(companyId, undefined, context);
      const index = activities.findIndex((a) => a.id === activityId);
      if (index === -1) {
        throw new Error(`Atividade ${activityId} não encontrada no tenant ${companyId}`);
      }

      const activity = activities[index];
      const prevStatus = activity.status;
      activity.status = status;
      activity.updatedAt = new Date().toISOString();

      if (status === 'COMPLETED') {
        activity.completedAt = new Date().toISOString();
      }

      activities[index] = activity;
      localStorage.setItem(this.getStorageKey(companyId), JSON.stringify(activities));

      await this.auditRepo.create({
        id: `audit-${Date.now()}`,
        companyId,
        entityName: 'ExecutionActivity',
        entityId: activityId,
        action: AuditAction.UPDATE,
        newState: JSON.stringify({ prevStatus, newStatus: status, reason }),
        userId: context.userId,
        userName: context.userName || context.userId,
        timestamp: new Date().toISOString(),
      });

      return activity;
    } finally {
      this.releaseLock(lockKey);
    }
  }

  public static async convertPendingActionToTask(
    companyId: string,
    pendingActionId: string,
    assignedUserId: string,
    dueDays: number = 2,
    context: UserContext357
  ): Promise<Task> {
    this.validateContext(companyId, context);

    // Get pending action
    const pendingActions = await PendingActionService.getPendingActions(companyId);
    const pending = pendingActions.find((p) => p.id === pendingActionId);
    if (!pending) {
      throw new Error(`Pendência ${pendingActionId} não encontrada`);
    }

    // Check if task already exists for this pending action (Idempotency)
    const existingTasks = await TaskService.getTasks(companyId);
    const existingTask = existingTasks.find(
      (t) => t.sourceId === pendingActionId && t.status !== 'CANCELLED' && t.status !== 'CLOSED'
    );
    if (existingTask) {
      return existingTask;
    }

    // Create task via TaskService
    const task = await TaskService.createTask(
      {
        companyId,
        title: `[PENDÊNCIA] ${pending.title}`,
        description: pending.description,
        category: pending.category as any,
        priority: pending.priority as any,
        severity: pending.severity as any,
        sourceType: pending.category as any,
        sourceId: pending.id,
        entityType: (pending.entityType || 'SYSTEM') as any,
        entityId: pending.entityId || pending.id,
        assignedUserId: assignedUserId || context.userId,
        dueAt: new Date(Date.now() + (dueDays || 1) * 86400000).toISOString(),
      },
      {
        userId: context.userId,
        userName: context.userName,
        role: context.userRole,
        companyId,
      }
    );

    // Auto create ExecutionActivity linked to Task
    await this.createActivity(
      companyId,
      {
        title: task.title,
        description: task.description,
        type: 'TASK',
        priority: task.priority as any,
        status: 'PLANNED',
        taskId: task.id,
        assignedTo: assignedUserId || context.userId,
        source: 'PENDING_ACTION',
        vehicleId: pending.entityType === 'VEHICLE' ? pending.entityId : undefined,
        driverId: pending.entityType === 'DRIVER' ? pending.entityId : undefined,
        contractId: pending.entityType === 'CONTRACT' ? pending.entityId : undefined,
      },
      context
    );

    return task;
  }

  public static async convertIncidentToActivity(
    companyId: string,
    incidentId: string,
    assignedTo: string,
    context: UserContext357
  ): Promise<ExecutionActivity> {
    this.validateContext(companyId, context);

    const incidents = await IncidentManagementService.getIncidents(companyId);
    const incident = incidents.find((i) => i.id === incidentId);
    if (!incident) {
      throw new Error(`Incidente ${incidentId} não encontrado`);
    }

    return this.createActivity(
      companyId,
      {
        title: `[INCIDENTE ${incident.severity}] ${incident.title}`,
        description: incident.description,
        type: 'INCIDENT',
        priority: incident.severity === 'SEV0' || incident.severity === 'SEV1' ? 'P0' : 'P1',
        status: 'PLANNED',
        assignedTo,
        incidentId: incident.id,
        source: 'INCIDENT_MANAGEMENT',
        correlationId: incident.correlationId || `incident-${incident.id}`,
      },
      context
    );
  }
}
