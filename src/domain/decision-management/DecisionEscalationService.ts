// AutoERP Decision Escalation Service (Phase 3.59)

import {
  ExecutiveDecision,
  DecisionEscalationLevel,
  DecisionEscalationRecord,
  UserContext359
} from './types';
import { AuditLogRepository } from '../../persistence/repositories/localRepositories';
import { AuditAction } from '../../types/enums';

export class DecisionEscalationService {
  private static LOCKS: Set<string> = new Set();
  private static auditRepo = new AuditLogRepository();

  private static validateTenant(companyId: string, context?: UserContext359): void {
    if (!companyId || typeof companyId !== 'string' || companyId.trim() === '') {
      throw new Error('companyId é obrigatório para isolamento multi-tenant');
    }
    if (context && context.companyId && context.companyId !== companyId) {
      throw new Error(`Acesso negado: Tentativa de escalonamento cross-tenant (${context.companyId} !== ${companyId})`);
    }
  }

  public static shouldEscalate(decision: ExecutiveDecision): { should: boolean; nextLevel: DecisionEscalationLevel; reason: string } {
    const activeStatuses = ['PROPOSED', 'UNDER_ANALYSIS', 'APPROVED', 'IN_EXECUTION', 'WAITING_RESULT', 'VALIDATING', 'ESCALATED', 'REOPENED'];
    if (!activeStatuses.includes(decision.status)) {
      return { should: false, nextLevel: decision.escalationLevel, reason: 'Decisão inativa' };
    }

    const now = Date.now();
    let reason = '';
    let escalate = false;

    if ((decision.priority === 'P0' || decision.priority === 'P1') && !decision.responsibleUserId) {
      escalate = true;
      reason = `Decisão ${decision.priority} sem responsável atribuído.`;
    } else if (decision.dueAt && new Date(decision.dueAt).getTime() < now) {
      const overdueHours = Math.round((now - new Date(decision.dueAt).getTime()) / 3600000);
      escalate = true;
      reason = `Prazo estourado em ${overdueHours}h sem conclusão.`;
    } else if (decision.priority === 'P0' && (decision.status === 'PROPOSED' || decision.status === 'UNDER_ANALYSIS')) {
      const pendingHours = Math.round((now - new Date(decision.createdAt).getTime()) / 3600000);
      if (pendingHours >= 4) {
        escalate = true;
        reason = `Decisão P0 paralisada há ${pendingHours}h sem aprovação.`;
      }
    }

    if (!escalate) {
      return { should: false, nextLevel: decision.escalationLevel, reason: 'Nenhum gatilho ativado' };
    }

    let nextLevel: DecisionEscalationLevel = 'LEVEL_1';
    if (decision.escalationLevel === 'LEVEL_0') nextLevel = 'LEVEL_1';
    else if (decision.escalationLevel === 'LEVEL_1') nextLevel = 'LEVEL_2';
    else if (decision.escalationLevel === 'LEVEL_2') nextLevel = 'LEVEL_3';
    else nextLevel = 'LEVEL_3';

    return { should: true, nextLevel, reason };
  }

  public static async escalateDecision(
    decision: ExecutiveDecision,
    newResponsibleUserId: string,
    reason: string,
    context: UserContext359,
    targetLevel?: DecisionEscalationLevel
  ): Promise<ExecutiveDecision> {
    this.validateTenant(decision.companyId, context);

    const lockKey = `escalate-${decision.companyId}-${decision.id}`;
    if (this.LOCKS.has(lockKey)) {
      throw new Error('Escalonamento em andamento para esta decisão');
    }

    this.LOCKS.add(lockKey);

    try {
      const previousLevel = decision.escalationLevel;
      const previousResponsibleId = decision.responsibleUserId;

      let nextLevel: DecisionEscalationLevel = targetLevel || 'LEVEL_1';
      if (!targetLevel) {
        if (previousLevel === 'LEVEL_0') nextLevel = 'LEVEL_1';
        else if (previousLevel === 'LEVEL_1') nextLevel = 'LEVEL_2';
        else nextLevel = 'LEVEL_3';
      }

      const correlationId = `escalation-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const timestamp = new Date().toISOString();

      const escalationRecord: DecisionEscalationRecord = {
        id: `esc-rec-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        decisionId: decision.id,
        companyId: decision.companyId,
        level: nextLevel,
        previousResponsibleId,
        newResponsibleId: newResponsibleUserId,
        reason,
        escalatedAt: timestamp,
        correlationId,
      };

      decision.escalationLevel = nextLevel;
      decision.responsibleUserId = newResponsibleUserId;
      decision.status = 'ESCALATED';
      decision.escalationHistory = decision.escalationHistory || [];
      decision.escalationHistory.push(escalationRecord);

      // Audit Log
      await this.auditRepo.create({
        id: `audit-esc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        companyId: decision.companyId,
        entityName: 'ExecutiveDecisionEscalation',
        entityId: decision.id,
        action: AuditAction.UPDATE,
        userId: context.userId,
        userName: context.userName || 'User',
        timestamp,
        newState: JSON.stringify({
          previousLevel,
          nextLevel,
          previousResponsibleId,
          newResponsibleUserId,
          reason,
          correlationId,
        }),
      });

      return decision;
    } finally {
      this.LOCKS.delete(lockKey);
    }
  }

  public static async processAutomaticEscalations(
    decisions: ExecutiveDecision[],
    defaultExecutiveUserMap: Record<string, string>,
    context: UserContext359
  ): Promise<{ escalatedCount: number; updatedDecisions: ExecutiveDecision[] }> {
    this.validateTenant(context.companyId, context);
    let escalatedCount = 0;
    const updatedDecisions: ExecutiveDecision[] = [];

    for (const d of decisions) {
      if (d.companyId !== context.companyId) continue;
      const evalRes = this.shouldEscalate(d);
      if (evalRes.should) {
        const nextUser = defaultExecutiveUserMap[evalRes.nextLevel] || d.responsibleUserId || context.userId;
        const updated = await this.escalateDecision(
          d,
          nextUser,
          `Automático: ${evalRes.reason}`,
          context,
          evalRes.nextLevel
        );
        updatedDecisions.push(updated);
        escalatedCount++;
      }
    }

    return { escalatedCount, updatedDecisions };
  }
}
