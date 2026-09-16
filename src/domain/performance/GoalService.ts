// AutoERP Goal Management Service (Phase 3.60)

import {
  Goal,
  CreateGoalParams,
  UserContext360,
  GoalStatus
} from './types';
import { AuditLogRepository } from '../../persistence/repositories/localRepositories';
import { AuditAction } from '../../types/enums';

export class GoalService {
  private static STORAGE_KEY_PREFIX = '__autoerp_goals_v1_';
  private static LOCKS: Set<string> = new Set();
  private static auditRepo = new AuditLogRepository();

  private static validateTenant(companyId: string, context?: UserContext360): void {
    if (!companyId || typeof companyId !== 'string' || companyId.trim() === '') {
      throw new Error('companyId é obrigatório para isolamento multi-tenant');
    }
    if (context && context.companyId && context.companyId !== companyId) {
      throw new Error(`Acesso negado: Tentativa de operação de metas cross-tenant (${context.companyId} !== ${companyId})`);
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
        throw new Error('Operação financeira não permitida no núcleo de metas');
      }
    }
  }

  private static safeScore(val: number): number {
    if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round(val)));
  }

  private static getStorageKey(companyId: string): string {
    return `${this.STORAGE_KEY_PREFIX}${companyId}`;
  }

  public static async getGoals(companyId: string, context?: UserContext360): Promise<Goal[]> {
    this.validateTenant(companyId, context);
    try {
      const raw = localStorage.getItem(this.getStorageKey(companyId));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((g: Goal) => g && g.companyId === companyId);
    } catch {
      return [];
    }
  }

  public static async getGoalById(goalId: string, companyId: string, context?: UserContext360): Promise<Goal | null> {
    this.validateTenant(companyId, context);
    const goals = await this.getGoals(companyId, context);
    return goals.find((g) => g.id === goalId) || null;
  }

  private static async saveGoals(companyId: string, goals: Goal[]): Promise<void> {
    this.validateTenant(companyId);
    const tenantGoals = goals.filter((g) => g && g.companyId === companyId);
    localStorage.setItem(this.getStorageKey(companyId), JSON.stringify(tenantGoals));
  }

  public static calculateProgress(baseline: number, current: number, target: number, direction: 'INCREASE' | 'DECREASE' | 'MAINTAIN'): number {
    if (target === baseline) return current >= target ? 100 : 0;
    let raw = 0;
    if (direction === 'DECREASE') {
      raw = ((baseline - current) / (baseline - target)) * 100;
    } else {
      raw = ((current - baseline) / (target - baseline)) * 100;
    }
    return this.safeScore(raw);
  }

  public static async createGoal(params: CreateGoalParams, context: UserContext360): Promise<Goal> {
    this.validateTenant(params.companyId, context);
    this.validateFinancialProtection(params.title + ' ' + params.description);

    const lockKey = `goal-create-${params.companyId}-${params.title.substring(0, 15)}`;
    if (this.LOCKS.has(lockKey)) {
      throw new Error('Criação de meta em andamento');
    }

    this.LOCKS.add(lockKey);

    try {
      const now = new Date().toISOString();
      const correlationId = `goal-corr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const existingGoals = await this.getGoals(params.companyId, context);

      const direction = params.direction || 'INCREASE';
      const progressPercentage = this.calculateProgress(
        params.baselineValue,
        params.baselineValue,
        params.targetValue,
        direction
      );

      const goal: Goal = {
        id: `goal-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        companyId: params.companyId,
        title: params.title,
        description: params.description,
        category: params.category,
        ownerId: params.ownerId || context.userId,
        ownerName: context.userName || 'Gestor',
        startDate: params.startDate,
        dueDate: params.dueDate,
        targetValue: params.targetValue,
        currentValue: params.baselineValue,
        baselineValue: params.baselineValue,
        unit: params.unit,
        direction,
        status: 'ACTIVE',
        priority: params.priority || 'P2',
        progressPercentage,
        linkedObjectiveId: params.linkedObjectiveId,
        linkedKPIId: params.linkedKPIId,
        correlationId,
        createdAt: now,
        updatedAt: now,
      };

      existingGoals.push(goal);
      await this.saveGoals(params.companyId, existingGoals);

      // Audit Log
      await this.auditRepo.create({
        id: `audit-goal-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        companyId: params.companyId,
        entityName: 'Goal',
        entityId: goal.id,
        action: AuditAction.CREATE,
        userId: context.userId,
        userName: context.userName || 'User',
        timestamp: now,
        newState: JSON.stringify({ title: goal.title, targetValue: goal.targetValue, correlationId }),
      });

      return goal;
    } finally {
      this.LOCKS.delete(lockKey);
    }
  }

  public static async updateGoalProgress(
    goalId: string,
    companyId: string,
    newValue: number,
    context: UserContext360
  ): Promise<Goal> {
    this.validateTenant(companyId, context);

    const goals = await this.getGoals(companyId, context);
    const goal = goals.find((g) => g.id === goalId);
    if (!goal) throw new Error(`Meta ${goalId} não encontrada`);

    const progressPercentage = this.calculateProgress(goal.baselineValue, newValue, goal.targetValue, goal.direction);
    goal.currentValue = newValue;
    goal.progressPercentage = progressPercentage;
    goal.updatedAt = new Date().toISOString();

    if (progressPercentage >= 100) {
      goal.status = 'ACHIEVED';
    } else {
      const isOverdue = new Date(goal.dueDate).getTime() < Date.now();
      if (isOverdue && progressPercentage < 80) {
        goal.status = 'AT_RISK';
      } else if (goal.status === 'DRAFT') {
        goal.status = 'ACTIVE';
      }
    }

    await this.saveGoals(companyId, goals);

    // Audit Log
    await this.auditRepo.create({
      id: `audit-goalupd-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      companyId,
      entityName: 'GoalProgressUpdate',
      entityId: goal.id,
      action: AuditAction.UPDATE,
      userId: context.userId,
      userName: context.userName || 'User',
      timestamp: goal.updatedAt,
      newState: JSON.stringify({ currentValue: newValue, progressPercentage, status: goal.status, correlationId: goal.correlationId }),
    });

    return goal;
  }
}
