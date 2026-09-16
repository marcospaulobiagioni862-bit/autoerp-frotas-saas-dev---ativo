// AutoERP Action Plan Service (Phase 3.60)

import {
  ActionPlan,
  CreateActionPlanParams,
  UserContext360,
  ActionPlanStatus
} from './types';
import { TaskService } from '../workflow/TaskService';
import { AuditLogRepository } from '../../persistence/repositories/localRepositories';
import { AuditAction } from '../../types/enums';

export class ActionPlanService {
  private static STORAGE_KEY_PREFIX = '__autoerp_action_plans_v1_';
  private static LOCKS: Set<string> = new Set();
  private static auditRepo = new AuditLogRepository();

  private static validateTenant(companyId: string, context?: UserContext360): void {
    if (!companyId || typeof companyId !== 'string' || companyId.trim() === '') {
      throw new Error('companyId é obrigatório para isolamento multi-tenant');
    }
    if (context && context.companyId && context.companyId !== companyId) {
      throw new Error(`Acesso negado: Tentativa de operação de Plano de Ação cross-tenant (${context.companyId} !== ${companyId})`);
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
        throw new Error('Operação financeira não permitida no núcleo de planos de ação');
      }
    }
  }

  private static getStorageKey(companyId: string): string {
    return `${this.STORAGE_KEY_PREFIX}${companyId}`;
  }

  public static async getActionPlans(companyId: string, context?: UserContext360): Promise<ActionPlan[]> {
    this.validateTenant(companyId, context);
    try {
      const raw = localStorage.getItem(this.getStorageKey(companyId));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((p: ActionPlan) => p && p.companyId === companyId);
    } catch {
      return [];
    }
  }

  public static async getActionPlanById(planId: string, companyId: string, context?: UserContext360): Promise<ActionPlan | null> {
    this.validateTenant(companyId, context);
    const plans = await this.getActionPlans(companyId, context);
    return plans.find((p) => p.id === planId) || null;
  }

  private static async saveActionPlans(companyId: string, plans: ActionPlan[]): Promise<void> {
    this.validateTenant(companyId);
    const tenantPlans = plans.filter((p) => p && p.companyId === companyId);
    localStorage.setItem(this.getStorageKey(companyId), JSON.stringify(tenantPlans));
  }

  public static async createActionPlan(params: CreateActionPlanParams, context: UserContext360): Promise<ActionPlan> {
    this.validateTenant(params.companyId, context);
    this.validateFinancialProtection(params.title + ' ' + params.description);

    const lockKey = `action-plan-create-${params.companyId}-${params.title.substring(0, 15)}`;
    if (this.LOCKS.has(lockKey)) {
      throw new Error('Criação de plano de ação em andamento');
    }

    this.LOCKS.add(lockKey);

    try {
      const now = new Date().toISOString();
      const correlationId = `aplan-corr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const existingPlans = await this.getActionPlans(params.companyId, context);

      const plan: ActionPlan = {
        id: `aplan-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        companyId: params.companyId,
        goalId: params.goalId,
        objectiveId: params.objectiveId,
        decisionId: params.decisionId,
        title: params.title,
        description: params.description,
        ownerId: params.ownerId || context.userId,
        ownerName: context.userName || 'Coordenador',
        priority: params.priority || 'P2',
        startDate: params.startDate,
        dueDate: params.dueDate,
        status: 'ACTIVE',
        progressPercentage: 0,
        risk: params.risk || 'LOW',
        expectedResult: params.expectedResult,
        linkedTaskIds: [],
        correlationId,
        createdAt: now,
        updatedAt: now,
      };

      // Create linked Task in TaskService idempotently
      try {
        const userCtx = {
          userId: context.userId,
          userName: context.userName || context.userId,
          userRole: context.userRole,
          role: context.userRole,
          companyId: context.companyId,
        };

        const task = await TaskService.createTask(
          {
            companyId: params.companyId,
            title: `[PLANO DE AÇÃO] ${params.title}`,
            description: params.description,
            category: 'OPERATIONAL_GENERAL' as any,
            priority: params.priority || 'P2',
            severity: 'MEDIUM' as any,
            sourceType: 'MANUAL' as any,
            sourceId: plan.id,
            entityType: 'SYSTEM' as any,
            entityId: plan.id,
            assignedUserId: plan.ownerId,
            dueAt: params.dueDate,
            correlationId,
          },
          userCtx
        );
        plan.linkedTaskIds.push(task.id);
      } catch (e) {
        // Continue even if task service integration throws non-blocking error
      }

      existingPlans.push(plan);
      await this.saveActionPlans(params.companyId, existingPlans);

      // Audit Log
      await this.auditRepo.create({
        id: `audit-aplan-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        companyId: params.companyId,
        entityName: 'ActionPlan',
        entityId: plan.id,
        action: AuditAction.CREATE,
        userId: context.userId,
        userName: context.userName || 'User',
        timestamp: now,
        newState: JSON.stringify({ title: plan.title, dueDate: plan.dueDate, correlationId }),
      });

      return plan;
    } finally {
      this.LOCKS.delete(lockKey);
    }
  }

  public static async updatePlanProgress(
    planId: string,
    companyId: string,
    progressPercentage: number,
    status?: ActionPlanStatus,
    actualResult?: string,
    context?: UserContext360
  ): Promise<ActionPlan> {
    if (context) this.validateTenant(companyId, context);

    const plans = await this.getActionPlans(companyId, context);
    const plan = plans.find((p) => p.id === planId);
    if (!plan) throw new Error(`Plano de Ação ${planId} não encontrado`);

    const safeProg = Math.max(0, Math.min(100, Math.round(progressPercentage)));
    plan.progressPercentage = safeProg;
    if (status) plan.status = status;
    else if (safeProg >= 100) plan.status = 'COMPLETED';
    if (actualResult) plan.actualResult = actualResult;

    plan.updatedAt = new Date().toISOString();
    await this.saveActionPlans(companyId, plans);

    return plan;
  }
}
