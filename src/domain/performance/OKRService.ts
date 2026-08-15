// AutoERP OKR Service (Phase 3.60)

import {
  Objective,
  KeyResult,
  CreateObjectiveParams,
  CreateKeyResultParams,
  UserContext360,
  OKRStatus
} from './types';
import { AuditLogRepository } from '../../persistence/repositories/localRepositories';
import { AuditAction } from '../../types/enums';

export class OKRService {
  private static OBJ_KEY_PREFIX = '__autoerp_objectives_v1_';
  private static KR_KEY_PREFIX = '__autoerp_key_results_v1_';
  private static LOCKS: Set<string> = new Set();
  private static auditRepo = new AuditLogRepository();

  private static validateTenant(companyId: string, context?: UserContext360): void {
    if (!companyId || typeof companyId !== 'string' || companyId.trim() === '') {
      throw new Error('companyId é obrigatório para isolamento multi-tenant');
    }
    if (context && context.companyId && context.companyId !== companyId) {
      throw new Error(`Acesso negado: Tentativa de operação de OKR cross-tenant (${context.companyId} !== ${companyId})`);
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
        throw new Error('Operação financeira não permitida no núcleo de OKRs');
      }
    }
  }

  private static safeScore(val: number): number {
    if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round(val)));
  }

  public static async getObjectives(companyId: string, context?: UserContext360): Promise<Objective[]> {
    this.validateTenant(companyId, context);
    try {
      const raw = localStorage.getItem(`${this.OBJ_KEY_PREFIX}${companyId}`);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((o: Objective) => o && o.companyId === companyId);
    } catch {
      return [];
    }
  }

  public static async getKeyResults(companyId: string, context?: UserContext360): Promise<KeyResult[]> {
    this.validateTenant(companyId, context);
    try {
      const raw = localStorage.getItem(`${this.KR_KEY_PREFIX}${companyId}`);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((k: KeyResult) => k && k.companyId === companyId);
    } catch {
      return [];
    }
  }

  private static async saveObjectives(companyId: string, objectives: Objective[]): Promise<void> {
    this.validateTenant(companyId);
    const tenantObj = objectives.filter((o) => o && o.companyId === companyId);
    localStorage.setItem(`${this.OBJ_KEY_PREFIX}${companyId}`, JSON.stringify(tenantObj));
  }

  private static async saveKeyResults(companyId: string, krs: KeyResult[]): Promise<void> {
    this.validateTenant(companyId);
    const tenantKR = krs.filter((k) => k && k.companyId === companyId);
    localStorage.setItem(`${this.KR_KEY_PREFIX}${companyId}`, JSON.stringify(tenantKR));
  }

  public static async createObjective(params: CreateObjectiveParams, context: UserContext360): Promise<Objective> {
    this.validateTenant(params.companyId, context);
    this.validateFinancialProtection(params.title + ' ' + params.description);

    const now = new Date().toISOString();
    const correlationId = `obj-corr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const existing = await this.getObjectives(params.companyId, context);

    const obj: Objective = {
      id: `obj-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      companyId: params.companyId,
      title: params.title,
      description: params.description,
      ownerId: params.ownerId || context.userId,
      ownerName: context.userName || 'Líder',
      period: params.period || '2026-Q1',
      status: 'IN_PROGRESS',
      progressPercentage: 0,
      correlationId,
      createdAt: now,
      updatedAt: now,
    };

    existing.push(obj);
    await this.saveObjectives(params.companyId, existing);

    // Audit Log
    await this.auditRepo.create({
      id: `audit-obj-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      companyId: params.companyId,
      entityName: 'Objective',
      entityId: obj.id,
      action: AuditAction.CREATE,
      userId: context.userId,
      userName: context.userName || 'User',
      timestamp: now,
      newState: JSON.stringify({ title: obj.title, period: obj.period, correlationId }),
    });

    return obj;
  }

  public static async createKeyResult(params: CreateKeyResultParams, context: UserContext360): Promise<KeyResult> {
    this.validateTenant(params.companyId, context);
    this.validateFinancialProtection(params.title);

    const now = new Date().toISOString();
    const correlationId = `kr-corr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const existingKRs = await this.getKeyResults(params.companyId, context);

    let prog = 0;
    if (params.target !== params.baseline) {
      prog = this.safeScore(((params.baseline - params.baseline) / (params.target - params.baseline)) * 100);
    }

    const kr: KeyResult = {
      id: `kr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      companyId: params.companyId,
      objectiveId: params.objectiveId,
      title: params.title,
      metric: params.metric,
      baseline: params.baseline,
      target: params.target,
      currentValue: params.baseline,
      progressPercentage: prog,
      ownerId: params.ownerId || context.userId,
      ownerName: context.userName || 'Responsável',
      status: 'IN_PROGRESS',
      linkedKPIId: params.linkedKPIId,
      linkedGoalId: params.linkedGoalId,
      correlationId,
      createdAt: now,
      updatedAt: now,
    };

    existingKRs.push(kr);
    await this.saveKeyResults(params.companyId, existingKRs);

    // Recalculate parent objective progress
    await this.recalculateObjectiveProgress(params.objectiveId, params.companyId, context);

    return kr;
  }

  public static async updateKeyResultProgress(
    keyResultId: string,
    companyId: string,
    newValue: number,
    context: UserContext360
  ): Promise<KeyResult> {
    this.validateTenant(companyId, context);

    const krs = await this.getKeyResults(companyId, context);
    const kr = krs.find((k) => k.id === keyResultId);
    if (!kr) throw new Error(`KeyResult ${keyResultId} não encontrado`);

    kr.currentValue = newValue;
    let prog = 0;
    if (kr.target !== kr.baseline) {
      prog = this.safeScore(((newValue - kr.baseline) / (kr.target - kr.baseline)) * 100);
    } else {
      prog = newValue >= kr.target ? 100 : 0;
    }

    kr.progressPercentage = prog;
    kr.status = prog >= 100 ? 'COMPLETED' : prog < 40 ? 'AT_RISK' : 'IN_PROGRESS';
    kr.updatedAt = new Date().toISOString();

    await this.saveKeyResults(companyId, krs);

    // Recalculate parent objective progress
    await this.recalculateObjectiveProgress(kr.objectiveId, companyId, context);

    return kr;
  }

  public static async recalculateObjectiveProgress(
    objectiveId: string,
    companyId: string,
    context?: UserContext360
  ): Promise<void> {
    const objectives = await this.getObjectives(companyId, context);
    const obj = objectives.find((o) => o.id === objectiveId);
    if (!obj) return;

    const allKRs = await this.getKeyResults(companyId, context);
    const linkedKRs = allKRs.filter((k) => k.objectiveId === objectiveId);

    if (linkedKRs.length === 0) return;

    const sumProg = linkedKRs.reduce((acc, curr) => acc + (curr.progressPercentage || 0), 0);
    const avgProg = this.safeScore(sumProg / linkedKRs.length);

    obj.progressPercentage = avgProg;
    obj.status = avgProg >= 100 ? 'COMPLETED' : avgProg < 40 ? 'AT_RISK' : 'IN_PROGRESS';
    obj.updatedAt = new Date().toISOString();

    await this.saveObjectives(companyId, objectives);
  }
}
