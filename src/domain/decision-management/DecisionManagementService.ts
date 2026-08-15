// AutoERP Executive Decision Management Service (Phase 3.59)

import {
  ExecutiveDecision,
  DecisionStatus,
  CreateDecisionParams,
  UserContext359,
  DecisionPriority,
  DecisionSeverity,
  DecisionCategory,
  DecisionSourceType
} from './types';
import { AuditLogRepository } from '../../persistence/repositories/localRepositories';
import { AuditAction } from '../../types/enums';
import { DecisionActionService } from './DecisionActionService';
import { DecisionEscalationService } from './DecisionEscalationService';
import { DecisionEffectivenessService } from './DecisionEffectivenessService';

export class DecisionManagementService {
  private static STORAGE_KEY_PREFIX = '__autoerp_executive_decisions_v1_';
  private static LOCKS: Set<string> = new Set();
  private static IDEMPOTENCY_KEYS: Set<string> = new Set();
  private static auditRepo = new AuditLogRepository();

  private static validateTenant(companyId: string, context?: UserContext359): void {
    if (!companyId || typeof companyId !== 'string' || companyId.trim() === '') {
      throw new Error('companyId é obrigatório para isolamento multi-tenant');
    }
    if (context && context.companyId && context.companyId !== companyId) {
      throw new Error(`Acesso negado: Tentativa de operação cross-tenant (${context.companyId} !== ${companyId})`);
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
        throw new Error('Operação financeira não permitida no núcleo de decisões');
      }
    }
  }

  private static checkRBAC(context: UserContext359, action: string): void {
    const role = (context.userRole || '').toUpperCase();
    if (role === 'ADMIN') return;

    if (role === 'OPERATIONAL_MANAGER') {
      if (action === 'REOPEN_ADMIN_ONLY') {
        throw new Error(`Acesso negado: Papel ${role} não possui autorização para a ação ${action}`);
      }
      return;
    }

    if (role === 'FINANCIAL') {
      if (action === 'APPROVE' || action === 'REJECT' || action === 'CLOSE' || action === 'REOPEN') {
        throw new Error(`Acesso negado: Papel ${role} possui acesso apenas de leitura e escopo reduzido`);
      }
      return;
    }

    if (role === 'ATTENDANT') {
      if (action !== 'EXECUTE' && action !== 'VIEW') {
        throw new Error(`Acesso negado: Papel ${role} possui permissão restrita a execução e visualização`);
      }
      return;
    }

    throw new Error(`Permissão RBAC insuficiente para o papel ${role}`);
  }

  private static getStorageKey(companyId: string): string {
    return `${this.STORAGE_KEY_PREFIX}${companyId}`;
  }

  public static async getDecisions(companyId: string, context?: UserContext359): Promise<ExecutiveDecision[]> {
    this.validateTenant(companyId, context);
    try {
      const raw = localStorage.getItem(this.getStorageKey(companyId));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((d: ExecutiveDecision) => d && d.companyId === companyId);
    } catch {
      return [];
    }
  }

  public static async getDecisionById(
    decisionId: string,
    companyId: string,
    context?: UserContext359
  ): Promise<ExecutiveDecision | null> {
    this.validateTenant(companyId, context);
    const decisions = await this.getDecisions(companyId, context);
    return decisions.find((d) => d.id === decisionId) || null;
  }

  private static async saveDecisions(companyId: string, decisions: ExecutiveDecision[]): Promise<void> {
    this.validateTenant(companyId);
    const tenantDecisions = decisions.filter((d) => d && d.companyId === companyId);
    localStorage.setItem(this.getStorageKey(companyId), JSON.stringify(tenantDecisions));
  }

  private static validateStateTransition(current: DecisionStatus, next: DecisionStatus): void {
    if (current === next) return;

    const allowedMap: Record<DecisionStatus, DecisionStatus[]> = {
      PROPOSED: ['UNDER_ANALYSIS', 'APPROVED', 'REJECTED', 'CANCELLED'],
      UNDER_ANALYSIS: ['APPROVED', 'REJECTED', 'CANCELLED'],
      APPROVED: ['IN_EXECUTION', 'ESCALATED', 'CANCELLED'],
      IN_EXECUTION: ['WAITING_RESULT', 'ESCALATED', 'CANCELLED'],
      WAITING_RESULT: ['VALIDATING', 'IN_EXECUTION', 'CANCELLED'],
      VALIDATING: ['COMPLETED', 'IN_EXECUTION', 'CANCELLED'],
      COMPLETED: ['CLOSED', 'REOPENED'],
      CLOSED: ['REOPENED'],
      REJECTED: ['REOPENED'],
      CANCELLED: ['REOPENED'],
      ESCALATED: ['IN_EXECUTION', 'APPROVED', 'CANCELLED', 'CLOSED'],
      REOPENED: ['UNDER_ANALYSIS', 'APPROVED', 'IN_EXECUTION'],
    };

    const allowed = allowedMap[current] || [];
    if (!allowed.includes(next)) {
      throw new Error(`Transição de estado inválida de ${current} para ${next}`);
    }
  }

  public static async createDecision(
    params: CreateDecisionParams,
    context: UserContext359
  ): Promise<ExecutiveDecision> {
    this.validateTenant(params.companyId, context);
    this.checkRBAC(context, 'CREATE');
    this.validateFinancialProtection(params.title + ' ' + params.description + ' ' + params.expectedResult);

    const lockKey = `create-dec-${params.companyId}-${params.title.substring(0, 15)}`;
    if (this.LOCKS.has(lockKey)) {
      throw new Error('Criação de decisão em andamento');
    }

    this.LOCKS.add(lockKey);

    try {
      const now = new Date().toISOString();
      const correlationId = `decision-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const existingDecisions = await this.getDecisions(params.companyId, context);
      const decisionNumber = `DEC-${new Date().getFullYear()}-${String(existingDecisions.length + 1).padStart(4, '0')}`;

      let priority: DecisionPriority = params.priority || 'P2';
      let severity: DecisionSeverity = params.severity || 'MEDIUM';

      let dueAt = params.dueAt;
      if (!dueAt) {
        const hoursToAdd = priority === 'P0' ? 4 : priority === 'P1' ? 24 : priority === 'P2' ? 72 : 168;
        dueAt = new Date(Date.now() + hoursToAdd * 3600000).toISOString();
      }

      if ((priority === 'P0' || priority === 'P1') && !params.responsibleUserId && !context.userId) {
        throw new Error('Responsável obrigatório para decisões com prioridade P0 ou P1');
      }

      const responsibleUserId = params.responsibleUserId || context.userId;

      const newDecision: ExecutiveDecision = {
        id: `dec-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        companyId: params.companyId,
        correlationId,
        decisionNumber,
        title: params.title,
        description: params.description,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        category: params.category || 'OPERATIONAL',
        priority,
        severity,
        status: 'PROPOSED',
        decisionMakerId: context.userId,
        responsibleUserId,
        createdAt: now,
        dueAt,
        expectedResult: params.expectedResult,
        successCriteria: params.successCriteria,
        evidenceIds: params.evidenceIds || [],
        linkedTaskIds: [],
        linkedIncidentIds: params.linkedIncidentIds || [],
        linkedPendingActionIds: params.linkedPendingActionIds || [],
        escalationLevel: 'LEVEL_0',
        escalationHistory: [],
      };

      existingDecisions.push(newDecision);
      await this.saveDecisions(params.companyId, existingDecisions);

      // Audit Log
      await this.auditRepo.create({
        id: `audit-dec-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        companyId: params.companyId,
        entityName: 'ExecutiveDecision',
        entityId: newDecision.id,
        action: AuditAction.CREATE,
        userId: context.userId,
        userName: context.userName || 'User',
        timestamp: now,
        newState: JSON.stringify({
          decisionNumber,
          title: newDecision.title,
          priority: newDecision.priority,
          correlationId,
        }),
      });

      return newDecision;
    } finally {
      this.LOCKS.delete(lockKey);
    }
  }

  public static async approveDecision(
    decisionId: string,
    companyId: string,
    context: UserContext359
  ): Promise<ExecutiveDecision> {
    this.validateTenant(companyId, context);
    this.checkRBAC(context, 'APPROVE');

    const decisions = await this.getDecisions(companyId, context);
    const decision = decisions.find((d) => d.id === decisionId);
    if (!decision) throw new Error(`Decisão ${decisionId} não encontrada`);

    this.validateStateTransition(decision.status, 'APPROVED');

    const now = new Date().toISOString();
    decision.status = 'APPROVED';
    decision.decidedAt = now;
    decision.decisionMakerId = context.userId;

    await this.saveDecisions(companyId, decisions);

    // Audit Log
    await this.auditRepo.create({
      id: `audit-appr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      companyId,
      entityName: 'ExecutiveDecisionApproval',
      entityId: decision.id,
      action: AuditAction.UPDATE,
      userId: context.userId,
      userName: context.userName || 'User',
      timestamp: now,
      newState: JSON.stringify({
        status: 'APPROVED',
        correlationId: decision.correlationId,
      }),
    });

    return decision;
  }

  public static async startExecution(
    decisionId: string,
    companyId: string,
    context: UserContext359,
    convertToTask: boolean = true
  ): Promise<ExecutiveDecision> {
    this.validateTenant(companyId, context);
    this.checkRBAC(context, 'EXECUTE');

    const decisions = await this.getDecisions(companyId, context);
    const decision = decisions.find((d) => d.id === decisionId);
    if (!decision) throw new Error(`Decisão ${decisionId} não encontrada`);

    this.validateStateTransition(decision.status, 'IN_EXECUTION');

    decision.status = 'IN_EXECUTION';

    if (convertToTask) {
      await DecisionActionService.convertDecisionToAction(
        decision,
        {
          companyId,
          decisionId: decision.id,
          actionType: 'TASK',
          title: decision.title,
          description: decision.description,
          assignedUserId: decision.responsibleUserId,
          priority: decision.priority,
          dueAt: decision.dueAt,
        },
        context
      );
    }

    await this.saveDecisions(companyId, decisions);
    return decision;
  }

  public static async submitResultForValidation(
    decisionId: string,
    companyId: string,
    actualResult: string,
    evidenceIds: string[],
    context: UserContext359
  ): Promise<ExecutiveDecision> {
    this.validateTenant(companyId, context);
    this.checkRBAC(context, 'EXECUTE');

    const decisions = await this.getDecisions(companyId, context);
    const decision = decisions.find((d) => d.id === decisionId);
    if (!decision) throw new Error(`Decisão ${decisionId} não encontrada`);

    this.validateStateTransition(decision.status, 'VALIDATING');

    await DecisionEffectivenessService.validateDecisionEffectiveness(
      decision,
      actualResult,
      evidenceIds,
      context
    );

    await this.saveDecisions(companyId, decisions);
    return decision;
  }

  public static async completeDecision(
    decisionId: string,
    companyId: string,
    actualResult: string,
    context: UserContext359
  ): Promise<ExecutiveDecision> {
    this.validateTenant(companyId, context);
    this.checkRBAC(context, 'EXECUTE');

    const decisions = await this.getDecisions(companyId, context);
    const decision = decisions.find((d) => d.id === decisionId);
    if (!decision) throw new Error(`Decisão ${decisionId} não encontrada`);

    this.validateStateTransition(decision.status, 'COMPLETED');

    const now = new Date().toISOString();
    decision.status = 'COMPLETED';
    decision.completedAt = now;
    decision.actualResult = actualResult || decision.actualResult || 'Resultado atingido conforme critérios';

    const evalRes = DecisionEffectivenessService.calculateEffectiveness(decision, decision.actualResult);
    decision.effectivenessScore = evalRes.score;
    decision.effectivenessClassification = evalRes.classification;

    await this.saveDecisions(companyId, decisions);

    // Audit Log
    await this.auditRepo.create({
      id: `audit-comp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      companyId,
      entityName: 'ExecutiveDecisionCompletion',
      entityId: decision.id,
      action: AuditAction.UPDATE,
      userId: context.userId,
      userName: context.userName || 'User',
      timestamp: now,
      newState: JSON.stringify({
        status: 'COMPLETED',
        effectivenessScore: decision.effectivenessScore,
        correlationId: decision.correlationId,
      }),
    });

    return decision;
  }

  public static async closeDecision(
    decisionId: string,
    companyId: string,
    context: UserContext359
  ): Promise<ExecutiveDecision> {
    this.validateTenant(companyId, context);
    this.checkRBAC(context, 'CLOSE');

    const decisions = await this.getDecisions(companyId, context);
    const decision = decisions.find((d) => d.id === decisionId);
    if (!decision) throw new Error(`Decisão ${decisionId} não encontrada`);

    this.validateStateTransition(decision.status, 'CLOSED');

    const now = new Date().toISOString();
    decision.status = 'CLOSED';
    decision.closedAt = now;

    await this.saveDecisions(companyId, decisions);

    // Audit Log
    await this.auditRepo.create({
      id: `audit-close-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      companyId,
      entityName: 'ExecutiveDecisionClosure',
      entityId: decision.id,
      action: AuditAction.UPDATE,
      userId: context.userId,
      userName: context.userName || 'User',
      timestamp: now,
      newState: JSON.stringify({
        status: 'CLOSED',
        correlationId: decision.correlationId,
      }),
    });

    return decision;
  }

  public static async reopenDecision(
    decisionId: string,
    companyId: string,
    reopenReason: string,
    context: UserContext359
  ): Promise<ExecutiveDecision> {
    this.validateTenant(companyId, context);
    this.checkRBAC(context, 'REOPEN');

    if (!reopenReason || reopenReason.trim().length < 5) {
      throw new Error('Motivo de reabertura obrigatório (mínimo 5 caracteres)');
    }

    const decisions = await this.getDecisions(companyId, context);
    const decision = decisions.find((d) => d.id === decisionId);
    if (!decision) throw new Error(`Decisão ${decisionId} não encontrada`);

    this.validateStateTransition(decision.status, 'REOPENED');

    const now = new Date().toISOString();
    decision.status = 'REOPENED';
    decision.reopenedAt = now;
    decision.reopenReason = reopenReason;

    await this.saveDecisions(companyId, decisions);

    // Audit Log
    await this.auditRepo.create({
      id: `audit-reopen-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      companyId,
      entityName: 'ExecutiveDecisionReopen',
      entityId: decision.id,
      action: AuditAction.UPDATE,
      userId: context.userId,
      userName: context.userName || 'User',
      timestamp: now,
      newState: JSON.stringify({
        status: 'REOPENED',
        reopenReason,
        correlationId: decision.correlationId,
      }),
    });

    return decision;
  }

  public static async createDecisionFromRecommendation(
    recommendation: {
      id: string;
      title: string;
      reasoning: string;
      priority: 'P0' | 'P1' | 'P2' | 'P3';
      category: string;
      expectedOutcome?: string;
      responsibleUserId?: string;
      companyId: string;
    },
    context: UserContext359
  ): Promise<ExecutiveDecision> {
    return this.createDecision(
      {
        companyId: recommendation.companyId,
        title: recommendation.title,
        description: recommendation.reasoning,
        sourceType: 'RECOMMENDATION',
        sourceId: recommendation.id,
        category: (recommendation.category as any) || 'OPERATIONAL',
        priority: recommendation.priority,
        responsibleUserId: recommendation.responsibleUserId || context.userId,
        expectedResult: recommendation.expectedOutcome || 'Eliminar risco/gargalo identificado na recomendação executiva',
        successCriteria: 'Indicadores operacionais estabilizados dentro da meta estipulada',
      },
      context
    );
  }
}
