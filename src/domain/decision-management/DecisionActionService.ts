// AutoERP Decision Action Service (Phase 3.59)

import {
  ExecutiveDecision,
  DecisionActionConvertParams,
  UserContext359,
  DecisionActionType
} from './types';
import { TaskService } from '../workflow/TaskService';
import { AuditLogRepository } from '../../persistence/repositories/localRepositories';
import { AuditAction } from '../../types/enums';

export class DecisionActionService {
  private static LOCKS: Set<string> = new Set();
  private static IDEMPOTENCY_KEYS: Set<string> = new Set();
  private static auditRepo = new AuditLogRepository();

  private static validateTenant(companyId: string, context?: UserContext359): void {
    if (!companyId || typeof companyId !== 'string' || companyId.trim() === '') {
      throw new Error('companyId é obrigatório para isolamento multi-tenant');
    }
    if (context && context.companyId && context.companyId !== companyId) {
      throw new Error(`Acesso negado: Tentativa de ação cross-tenant (${context.companyId} !== ${companyId})`);
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
        throw new Error('Operação financeira não permitida na camada de decisões');
      }
    }
  }

  /**
   * Converts an approved Executive Decision into an actionable entity (Task, Activity, Workflow, PendingAction)
   * Natural Key Idempotency: companyId + decisionId + actionType
   */
  public static async convertDecisionToAction(
    decision: ExecutiveDecision,
    params: DecisionActionConvertParams,
    context: UserContext359
  ): Promise<{ actionId: string; actionType: DecisionActionType; idempotencyKey: string; actionObject: any }> {
    this.validateTenant(params.companyId, context);
    if (decision.companyId !== params.companyId) {
      throw new Error('Divergência de tenant entre a decisão e os parâmetros');
    }
    this.validateFinancialProtection(params.title + ' ' + params.description);

    const idempotencyKey = `${params.companyId}:${params.decisionId}:${params.actionType}`;
    const lockKey = `action-lock-${idempotencyKey}`;

    if (this.LOCKS.has(lockKey)) {
      throw new Error('Operação de conversão em andamento para esta decisão');
    }

    this.LOCKS.add(lockKey);

    try {
      if (this.IDEMPOTENCY_KEYS.has(idempotencyKey)) {
        return {
          actionId: decision.linkedTaskIds[0] || decision.linkedPendingActionIds[0] || `action-${idempotencyKey}`,
          actionType: params.actionType,
          idempotencyKey,
          actionObject: { idempotencyKey, duplicateIgnored: true }
        };
      }

      const correlationId = decision.correlationId || `action-corr-${Date.now()}`;
      let createdActionId = '';
      let actionObject: any = null;

      const userCtx = {
        userId: context.userId,
        userName: context.userName || context.userId,
        userRole: context.userRole,
        role: context.userRole,
        companyId: context.companyId,
      };

      const createTaskParams = {
        companyId: params.companyId,
        title: `[DECISÃO ${decision.decisionNumber}] ${params.title}`,
        description: params.description,
        category: 'OPERATIONAL_GENERAL' as any,
        priority: params.priority || decision.priority,
        severity: decision.severity,
        sourceType: 'MANUAL' as any,
        sourceId: decision.id,
        entityType: 'SYSTEM' as any,
        entityId: decision.id,
        assignedUserId: params.assignedUserId || decision.responsibleUserId,
        dueAt: params.dueAt || decision.dueAt,
        correlationId,
      };

      const createdTask = await TaskService.createTask(createTaskParams, userCtx);
      createdActionId = createdTask.id;
      actionObject = createdTask;

      if (params.actionType === 'PENDING_ACTION') {
        if (!decision.linkedPendingActionIds.includes(createdActionId)) {
          decision.linkedPendingActionIds.push(createdActionId);
        }
      } else {
        if (!decision.linkedTaskIds.includes(createdActionId)) {
          decision.linkedTaskIds.push(createdActionId);
        }
      }

      this.IDEMPOTENCY_KEYS.add(idempotencyKey);

      // Audit Log
      await this.auditRepo.create({
        id: `audit-action-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        companyId: params.companyId,
        entityName: 'ExecutiveDecisionAction',
        entityId: decision.id,
        action: AuditAction.CREATE,
        userId: context.userId,
        userName: context.userName || 'User',
        timestamp: new Date().toISOString(),
        newState: JSON.stringify({
          actionType: params.actionType,
          actionId: createdActionId,
          idempotencyKey,
          correlationId,
        }),
      });

      return {
        actionId: createdActionId,
        actionType: params.actionType,
        idempotencyKey,
        actionObject,
      };
    } finally {
      this.LOCKS.delete(lockKey);
    }
  }
}
