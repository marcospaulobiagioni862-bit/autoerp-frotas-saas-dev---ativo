// AutoERP Continuous Improvement (PDCA) Service (Phase 3.60)

import {
  PDCARecord,
  CreatePDCAParams,
  UserContext360,
  PDCAPhase
} from './types';
import { AuditLogRepository } from '../../persistence/repositories/localRepositories';
import { AuditAction } from '../../types/enums';

export class ContinuousImprovementService {
  private static STORAGE_KEY_PREFIX = '__autoerp_pdca_v1_';
  private static LOCKS: Set<string> = new Set();
  private static auditRepo = new AuditLogRepository();

  private static validateTenant(companyId: string, context?: UserContext360): void {
    if (!companyId || typeof companyId !== 'string' || companyId.trim() === '') {
      throw new Error('companyId é obrigatório para isolamento multi-tenant');
    }
    if (context && context.companyId && context.companyId !== companyId) {
      throw new Error(`Acesso negado: Tentativa de operação PDCA cross-tenant (${context.companyId} !== ${companyId})`);
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
        throw new Error('Operação financeira não permitida no núcleo PDCA');
      }
    }
  }

  private static getStorageKey(companyId: string): string {
    return `${this.STORAGE_KEY_PREFIX}${companyId}`;
  }

  public static async getPDCARecords(companyId: string, context?: UserContext360): Promise<PDCARecord[]> {
    this.validateTenant(companyId, context);
    try {
      const raw = localStorage.getItem(this.getStorageKey(companyId));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((p: PDCARecord) => p && p.companyId === companyId);
    } catch {
      return [];
    }
  }

  public static async createPDCARecord(params: CreatePDCAParams, context: UserContext360): Promise<PDCARecord> {
    this.validateTenant(params.companyId, context);
    this.validateFinancialProtection(params.title + ' ' + (params.rootCause || ''));

    const lockKey = `pdca-create-${params.companyId}-${params.title.substring(0, 15)}`;
    if (this.LOCKS.has(lockKey)) {
      throw new Error('Criação de registro PDCA em andamento');
    }

    this.LOCKS.add(lockKey);

    try {
      const now = new Date().toISOString();
      const correlationId = `pdca-corr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const existing = await this.getPDCARecords(params.companyId, context);

      const pdca: PDCARecord = {
        id: `pdca-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        companyId: params.companyId,
        goalId: params.goalId,
        actionPlanId: params.actionPlanId,
        title: params.title,
        currentPhase: 'PLAN',
        rootCause: params.rootCause,
        impactDescription: params.impactDescription,
        correctiveAction: params.correctiveAction,
        preventiveAction: params.preventiveAction,
        ownerId: params.ownerId || context.userId,
        ownerName: context.userName || 'Analista de Qualidade',
        dueDate: params.dueDate,
        expectedOutcome: params.expectedOutcome,
        evidenceIds: [],
        linkedDecisionId: params.linkedDecisionId,
        status: 'OPEN',
        correlationId,
        createdAt: now,
        updatedAt: now,
      };

      existing.push(pdca);
      localStorage.setItem(this.getStorageKey(params.companyId), JSON.stringify(existing));

      // Audit Log
      await this.auditRepo.create({
        id: `audit-pdca-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        companyId: params.companyId,
        entityName: 'PDCARecord',
        entityId: pdca.id,
        action: AuditAction.CREATE,
        userId: context.userId,
        userName: context.userName || 'User',
        timestamp: now,
        newState: JSON.stringify({ title: pdca.title, currentPhase: pdca.currentPhase, correlationId }),
      });

      return pdca;
    } finally {
      this.LOCKS.delete(lockKey);
    }
  }

  public static async advancePDCAPhase(
    pdcaId: string,
    companyId: string,
    nextPhase: PDCAPhase,
    evidenceId?: string,
    actualOutcome?: string,
    context?: UserContext360
  ): Promise<PDCARecord> {
    if (context) this.validateTenant(companyId, context);

    const records = await this.getPDCARecords(companyId, context);
    const pdca = records.find((p) => p.id === pdcaId);
    if (!pdca) throw new Error(`Registro PDCA ${pdcaId} não encontrado`);

    pdca.currentPhase = nextPhase;
    if (evidenceId && !pdca.evidenceIds.includes(evidenceId)) {
      pdca.evidenceIds.push(evidenceId);
    }
    if (actualOutcome) pdca.actualOutcome = actualOutcome;

    if (nextPhase === 'ACT') {
      pdca.status = 'STANDARDIZED';
    } else {
      pdca.status = 'IN_PROGRESS';
    }

    pdca.updatedAt = new Date().toISOString();
    localStorage.setItem(this.getStorageKey(companyId), JSON.stringify(records));

    return pdca;
  }
}
