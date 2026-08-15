// AutoERP Task Service (Phase 3.56)

import {
  Task,
  TaskStatus,
  TaskEvidence,
  CreateTaskParams,
  TaskFilterOptions,
  UserContext,
  SLAParameter
} from './types';
import { AuditLogRepository } from '../../persistence/repositories/localRepositories';
import { AuditAction } from '../../types/enums';
import { SLAService } from './SLAService';

export class TaskService {
  private static STORAGE_KEY_PREFIX = '__autoerp_tasks_v1_';
  private static LOCKS: Set<string> = new Set();
  private static auditRepo = new AuditLogRepository();

  private static acquireLock(lockKey: string): boolean {
    if (this.LOCKS.has(lockKey)) {
      return false;
    }
    this.LOCKS.add(lockKey);
    return true;
  }

  private static releaseLock(lockKey: string): void {
    this.LOCKS.delete(lockKey);
  }

  private static validateTenant(companyId: string): void {
    if (!companyId || typeof companyId !== 'string' || companyId.trim() === '') {
      throw new Error('CompanyId is required for multi-tenant isolation');
    }
  }

  private static validateFinancialProtection(text?: string): void {
    if (!text) return;
    const forbiddenKeywords = [
      'writefinance',
      'updatebalance',
      'updatefinancialtransaction',
      'modifypayment',
      'modifyreceipt',
      'modifycontapagar',
      'modifycontareceber'
    ];
    const lower = text.toLowerCase();
    for (const kw of forbiddenKeywords) {
      if (lower.includes(kw)) {
        throw new Error('Financial modification strictly forbidden in workflow layer');
      }
    }
  }

  private static getStorageKey(companyId: string): string {
    return `${this.STORAGE_KEY_PREFIX}${companyId}`;
  }

  public static async getAllTasks(companyId: string): Promise<Task[]> {
    this.validateTenant(companyId);
    try {
      const raw = localStorage.getItem(this.getStorageKey(companyId));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((t: Task) => t && t.companyId === companyId);
    } catch {
      return [];
    }
  }

  public static async getTasks(companyId: string): Promise<Task[]> {
    return this.getAllTasks(companyId);
  }

  public static async updateTaskStatus(
    taskId: string,
    companyId: string,
    status: TaskStatus,
    userContext: UserContext,
    reason?: string
  ): Promise<Task> {
    if (status === 'COMPLETED') return this.completeTask(taskId, companyId, reason || 'Concluído', userContext);
    if (status === 'CLOSED') return this.closeTask(taskId, companyId, userContext);
    if (status === 'REOPENED') return this.reopenTask(taskId, companyId, reason || 'Reaberto', userContext);
    if (status === 'BLOCKED') return this.blockTask(taskId, companyId, reason || 'Bloqueado', userContext);
    if (status === 'IN_PROGRESS') return this.startTask(taskId, companyId, userContext);
    return this.transitionStatus(taskId, companyId, status, userContext);
  }

  private static async saveAllTasks(companyId: string, tasks: Task[]): Promise<void> {
    this.validateTenant(companyId);
    const tenantTasks = tasks.filter(t => t.companyId === companyId);
    localStorage.setItem(this.getStorageKey(companyId), JSON.stringify(tenantTasks));
  }

  private static checkRBAC(role: string, action: string): void {
    const normRole = (role || '').toUpperCase();
    if (normRole === 'ADMIN' || normRole === 'OPERATIONAL_MANAGER' || normRole === 'MANAGER') {
      return;
    }
    if (normRole === 'ATTENDANT' || normRole === 'OPERATIONAL') {
      if (action === 'REOPEN' || action === 'CANCEL') {
        throw new Error(`Insufficient RBAC permissions for action ${action}`);
      }
      return;
    }
    throw new Error(`Insufficient RBAC permissions for action ${action}`);
  }

  /**
   * State Machine Allowed Transitions
   */
  private static ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
    OPEN: ['ASSIGNED', 'IN_PROGRESS', 'CANCELLED'],
    ASSIGNED: ['IN_PROGRESS', 'BLOCKED', 'CANCELLED', 'OPEN'],
    IN_PROGRESS: ['BLOCKED', 'WAITING_VALIDATION', 'COMPLETED', 'CANCELLED'],
    BLOCKED: ['IN_PROGRESS', 'CANCELLED'],
    WAITING_VALIDATION: ['COMPLETED', 'IN_PROGRESS', 'CANCELLED'],
    COMPLETED: ['CLOSED', 'REOPENED', 'CANCELLED'],
    CLOSED: ['REOPENED'],
    CANCELLED: ['REOPENED'],
    REOPENED: ['ASSIGNED', 'IN_PROGRESS', 'OPEN']
  };

  /**
   * Create a new task (or return existing task if idempotency key matches)
   */
  public static async createTask(
    params: CreateTaskParams,
    userContext: UserContext,
    customSLA?: SLAParameter
  ): Promise<Task> {
    this.validateTenant(params.companyId);
    this.checkRBAC(userContext.role, 'CREATE');
    this.validateFinancialProtection(params.title + ' ' + params.description);

    const lockKey = `create-task-${params.companyId}-${params.sourceType}-${params.sourceId}`;
    if (!this.acquireLock(lockKey)) {
      throw new Error('Task creation in progress for this source entity');
    }

    try {
      const idempotencyKey = `${params.companyId}:${params.sourceType}:${params.sourceId}:${params.category}`;
      const existingTasks = await this.getAllTasks(params.companyId);

      // Check for active existing task with same idempotency key
      const activeExisting = existingTasks.find(
        t => t.idempotencyKey === idempotencyKey && t.status !== 'CLOSED' && t.status !== 'CANCELLED'
      );

      if (activeExisting) {
        return activeExisting;
      }

      const now = new Date().toISOString();
      const correlationId = params.correlationId || `task-corr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      
      // Calculate dueAt based on priority if not supplied
      let dueAt = params.dueAt;
      if (!dueAt) {
        const hoursToAdd = params.priority === 'P0' ? 2 : params.priority === 'P1' ? 8 : params.priority === 'P2' ? 24 : 72;
        dueAt = new Date(Date.now() + hoursToAdd * 3600000).toISOString();
      }

      const newTask: Task = {
        id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        companyId: params.companyId,
        title: params.title,
        description: params.description,
        category: params.category,
        priority: params.priority,
        severity: params.severity,
        status: params.assignedUserId ? 'ASSIGNED' : 'OPEN',
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        entityType: params.entityType,
        entityId: params.entityId,
        assignedUserId: params.assignedUserId,
        assignedTeam: params.assignedTeam,
        createdBy: userContext.userId || 'SYSTEM',
        createdAt: now,
        dueAt,
        correlationId,
        evidences: [],
        updatedAt: now,
        idempotencyKey
      };

      // Create SLA Record
      const sla = await SLAService.createSLARecord(newTask, customSLA);
      newTask.slaId = sla.id;

      existingTasks.push(newTask);
      await this.saveAllTasks(params.companyId, existingTasks);

      // Log Audit
      await this.auditRepo.create({
        id: `audit-${Date.now()}`,
        companyId: params.companyId,
        entityName: 'Task',
        entityId: newTask.id,
        action: AuditAction.CREATE,
        newState: JSON.stringify(newTask),
        userId: userContext.userId,
        userName: userContext.userName || 'User',
        timestamp: now
      });

      return newTask;
    } finally {
      this.releaseLock(lockKey);
    }
  }

  public static async assignTask(
    taskId: string,
    companyId: string,
    assignedUserId: string,
    userContext: UserContext,
    team?: string
  ): Promise<Task> {
    this.validateTenant(companyId);
    this.checkRBAC(userContext.role, 'ASSIGN');

    const lockKey = `task-${taskId}`;
    if (!this.acquireLock(lockKey)) {
      throw new Error('Task modification currently locked');
    }

    try {
      const tasks = await this.getAllTasks(companyId);
      const taskIndex = tasks.findIndex(t => t.id === taskId);
      if (taskIndex === -1) {
        throw new Error(`Task with ID ${taskId} not found for company ${companyId}`);
      }

      const task = tasks[taskIndex];
      const prevState = JSON.stringify(task);

      task.assignedUserId = assignedUserId;
      if (team) task.assignedTeam = team;
      if (task.status === 'OPEN') {
        task.status = 'ASSIGNED';
      }
      task.updatedAt = new Date().toISOString();

      tasks[taskIndex] = task;
      await this.saveAllTasks(companyId, tasks);

      await this.auditRepo.create({
        id: `audit-${Date.now()}`,
        companyId,
        entityName: 'Task',
        entityId: task.id,
        action: AuditAction.UPDATE,
        previousState: prevState,
        newState: JSON.stringify(task),
        userId: userContext.userId,
        userName: userContext.userName || 'User',
        timestamp: task.updatedAt
      });

      return task;
    } finally {
      this.releaseLock(lockKey);
    }
  }

  public static async startTask(taskId: string, companyId: string, userContext: UserContext): Promise<Task> {
    return this.transitionStatus(taskId, companyId, 'IN_PROGRESS', userContext, {
      startedAt: new Date().toISOString()
    });
  }

  public static async blockTask(
    taskId: string,
    companyId: string,
    reason: string,
    userContext: UserContext
  ): Promise<Task> {
    this.validateFinancialProtection(reason);
    return this.transitionStatus(taskId, companyId, 'BLOCKED', userContext, {
      blockedReason: reason
    });
  }

  public static async unblockTask(taskId: string, companyId: string, userContext: UserContext): Promise<Task> {
    return this.transitionStatus(taskId, companyId, 'IN_PROGRESS', userContext, {
      blockedReason: undefined
    });
  }

  public static async requestValidation(taskId: string, companyId: string, userContext: UserContext): Promise<Task> {
    return this.transitionStatus(taskId, companyId, 'WAITING_VALIDATION', userContext);
  }

  public static async completeTask(
    taskId: string,
    companyId: string,
    resolution: string,
    userContext: UserContext
  ): Promise<Task> {
    this.validateFinancialProtection(resolution);
    const updated = await this.transitionStatus(taskId, companyId, 'COMPLETED', userContext, {
      completedAt: new Date().toISOString(),
      resolution
    });
    // Resolve SLA
    if (updated.slaId) {
      await SLAService.resolveSLA(updated.slaId, companyId);
    }
    return updated;
  }

  public static async closeTask(taskId: string, companyId: string, userContext: UserContext): Promise<Task> {
    return this.transitionStatus(taskId, companyId, 'CLOSED', userContext, {
      validatedAt: new Date().toISOString(),
      validatorUserId: userContext.userId
    });
  }

  public static async reopenTask(
    taskId: string,
    companyId: string,
    reason: string,
    userContext: UserContext
  ): Promise<Task> {
    this.checkRBAC(userContext.role, 'REOPEN');
    this.validateFinancialProtection(reason);
    return this.transitionStatus(taskId, companyId, 'REOPENED', userContext, {
      completedAt: undefined,
      validatedAt: undefined,
      blockedReason: undefined
    });
  }

  public static async cancelTask(
    taskId: string,
    companyId: string,
    reason: string,
    userContext: UserContext
  ): Promise<Task> {
    this.checkRBAC(userContext.role, 'CANCEL');
    this.validateFinancialProtection(reason);
    return this.transitionStatus(taskId, companyId, 'CANCELLED', userContext, {
      blockedReason: `CANCELLED: ${reason}`
    });
  }

  public static async addEvidence(
    taskId: string,
    companyId: string,
    evidence: Omit<TaskEvidence, 'id' | 'addedAt'>,
    userContext: UserContext
  ): Promise<Task> {
    this.validateTenant(companyId);
    this.checkRBAC(userContext.role, 'UPDATE');
    this.validateFinancialProtection(evidence.content);

    const lockKey = `task-${taskId}`;
    if (!this.acquireLock(lockKey)) {
      throw new Error('Task modification currently locked');
    }

    try {
      const tasks = await this.getAllTasks(companyId);
      const taskIndex = tasks.findIndex(t => t.id === taskId);
      if (taskIndex === -1) {
        throw new Error(`Task ${taskId} not found`);
      }

      const task = tasks[taskIndex];
      const newEv: TaskEvidence = {
        id: `ev-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        ...evidence,
        addedBy: userContext.userId || 'SYSTEM',
        addedAt: new Date().toISOString()
      };

      task.evidences.push(newEv);
      task.updatedAt = new Date().toISOString();

      tasks[taskIndex] = task;
      await this.saveAllTasks(companyId, tasks);

      return task;
    } finally {
      this.releaseLock(lockKey);
    }
  }

  private static async transitionStatus(
    taskId: string,
    companyId: string,
    targetStatus: TaskStatus,
    userContext: UserContext,
    extraFields: Partial<Task> = {}
  ): Promise<Task> {
    this.validateTenant(companyId);
    this.checkRBAC(userContext.role, targetStatus);

    const lockKey = `task-${taskId}`;
    if (!this.acquireLock(lockKey)) {
      throw new Error('Task modification currently locked');
    }

    try {
      const tasks = await this.getAllTasks(companyId);
      const taskIndex = tasks.findIndex(t => t.id === taskId);
      if (taskIndex === -1) {
        throw new Error(`Task with ID ${taskId} not found`);
      }

      const task = tasks[taskIndex];
      const allowed = this.ALLOWED_TRANSITIONS[task.status] || [];
      if (!allowed.includes(targetStatus)) {
        throw new Error(`Invalid task state transition from ${task.status} to ${targetStatus}`);
      }

      const prevState = JSON.stringify(task);
      task.status = targetStatus;
      Object.assign(task, extraFields);
      task.updatedAt = new Date().toISOString();

      tasks[taskIndex] = task;
      await this.saveAllTasks(companyId, tasks);

      await this.auditRepo.create({
        id: `audit-${Date.now()}`,
        companyId,
        entityName: 'Task',
        entityId: task.id,
        action: AuditAction.UPDATE,
        previousState: prevState,
        newState: JSON.stringify(task),
        userId: userContext.userId,
        userName: userContext.userName || 'User',
        timestamp: task.updatedAt
      });

      return task;
    } finally {
      this.releaseLock(lockKey);
    }
  }

  public static async getTasksByFilter(companyId: string, filters?: TaskFilterOptions): Promise<Task[]> {
    const all = await this.getAllTasks(companyId);
    if (!filters) return all;

    const now = new Date();
    return all.filter(t => {
      if (filters.status && t.status !== filters.status) return false;
      if (filters.category && t.category !== filters.category) return false;
      if (filters.priority && t.priority !== filters.priority) return false;
      if (filters.assignedUserId && t.assignedUserId !== filters.assignedUserId) return false;
      if (filters.isOverdue) {
        const isCompleted = t.status === 'COMPLETED' || t.status === 'CLOSED' || t.status === 'CANCELLED';
        const isPastDue = new Date(t.dueAt) < now;
        if (isCompleted || !isPastDue) return false;
      }
      if (filters.search) {
        const term = filters.search.toLowerCase();
        const matchTitle = t.title.toLowerCase().includes(term);
        const matchDesc = t.description.toLowerCase().includes(term);
        const matchEntity = t.entityId.toLowerCase().includes(term);
        if (!matchTitle && !matchDesc && !matchEntity) return false;
      }
      return true;
    });
  }

  public static async getTaskById(taskId: string, companyId: string): Promise<Task | null> {
    const tasks = await this.getAllTasks(companyId);
    return tasks.find(t => t.id === taskId) || null;
  }
}
