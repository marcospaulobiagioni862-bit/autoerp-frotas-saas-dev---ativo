// AutoERP KPI Management Service (Phase 3.60)

import {
  KPI,
  CreateKPIParams,
  UserContext360,
  KPIStatus,
  KPITrend
} from './types';
import { AuditLogRepository } from '../../persistence/repositories/localRepositories';
import { AuditAction } from '../../types/enums';

export class KPIManagementService {
  private static STORAGE_KEY_PREFIX = '__autoerp_kpis_v1_';
  private static LOCKS: Set<string> = new Set();
  private static auditRepo = new AuditLogRepository();

  private static validateTenant(companyId: string, context?: UserContext360): void {
    if (!companyId || typeof companyId !== 'string' || companyId.trim() === '') {
      throw new Error('companyId é obrigatório para isolamento multi-tenant');
    }
    if (context && context.companyId && context.companyId !== companyId) {
      throw new Error(`Acesso negado: Tentativa de operação de KPI cross-tenant (${context.companyId} !== ${companyId})`);
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
        throw new Error('Operação financeira não permitida no núcleo de KPIs');
      }
    }
  }

  private static getStorageKey(companyId: string): string {
    return `${this.STORAGE_KEY_PREFIX}${companyId}`;
  }

  public static async getKPIs(companyId: string, context?: UserContext360): Promise<KPI[]> {
    this.validateTenant(companyId, context);
    try {
      const raw = localStorage.getItem(this.getStorageKey(companyId));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((k: KPI) => k && k.companyId === companyId);
    } catch {
      return [];
    }
  }

  public static async getKPIById(kpiId: string, companyId: string, context?: UserContext360): Promise<KPI | null> {
    this.validateTenant(companyId, context);
    const kpis = await this.getKPIs(companyId, context);
    return kpis.find((k) => k.id === kpiId) || null;
  }

  private static async saveKPIs(companyId: string, kpis: KPI[]): Promise<void> {
    this.validateTenant(companyId);
    const tenantKPIs = kpis.filter((k) => k && k.companyId === companyId);
    localStorage.setItem(this.getStorageKey(companyId), JSON.stringify(tenantKPIs));
  }

  public static calculateStatusAndTrend(current: number, previous: number, target: number, critical: number): { status: KPIStatus; trend: KPITrend } {
    let trend: KPITrend = 'STABLE';
    if (current > previous) trend = 'IMPROVING';
    else if (current < previous) trend = 'DECLINING';

    let status: KPIStatus = 'NORMAL';
    if (target >= critical) {
      if (current < critical) status = 'CRITICAL';
      else if (current < target) status = 'WARNING';
    } else {
      if (current > critical) status = 'CRITICAL';
      else if (current > target) status = 'WARNING';
    }

    return { status, trend };
  }

  public static async createKPI(params: CreateKPIParams, context: UserContext360): Promise<KPI> {
    this.validateTenant(params.companyId, context);
    this.validateFinancialProtection(params.name + ' ' + params.description);

    const lockKey = `kpi-create-${params.companyId}-${params.name.substring(0, 15)}`;
    if (this.LOCKS.has(lockKey)) {
      throw new Error('Criação de KPI em andamento');
    }

    this.LOCKS.add(lockKey);

    try {
      const now = new Date().toISOString();
      const correlationId = `kpi-corr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const existingKPIs = await this.getKPIs(params.companyId, context);

      const val = params.currentValue ?? params.target;
      const evalRes = this.calculateStatusAndTrend(val, val, params.target, params.criticalThreshold);

      const kpi: KPI = {
        id: `kpi-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        companyId: params.companyId,
        name: params.name,
        description: params.description,
        category: params.category,
        unit: params.unit,
        calculationMethod: params.calculationMethod,
        target: params.target,
        warningThreshold: params.warningThreshold,
        criticalThreshold: params.criticalThreshold,
        currentValue: val,
        previousValue: val,
        trend: evalRes.trend,
        ownerId: params.ownerId || context.userId,
        ownerName: context.userName || 'Analista',
        frequency: params.frequency || 'MONTHLY',
        source: params.source || 'SISTEMA',
        status: evalRes.status,
        isReadOnlyFinancial: params.category === 'FINANCIAL_READ_ONLY' || params.isReadOnlyFinancial === true,
        correlationId,
        updatedAt: now,
      };

      existingKPIs.push(kpi);
      await this.saveKPIs(params.companyId, existingKPIs);

      // Audit Log
      await this.auditRepo.create({
        id: `audit-kpi-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        companyId: params.companyId,
        entityName: 'KPI',
        entityId: kpi.id,
        action: AuditAction.CREATE,
        userId: context.userId,
        userName: context.userName || 'User',
        timestamp: now,
        newState: JSON.stringify({ name: kpi.name, target: kpi.target, correlationId }),
      });

      return kpi;
    } finally {
      this.LOCKS.delete(lockKey);
    }
  }

  public static async updateKPIValue(
    kpiId: string,
    companyId: string,
    newValue: number,
    context: UserContext360
  ): Promise<KPI> {
    this.validateTenant(companyId, context);

    const kpis = await this.getKPIs(companyId, context);
    const kpi = kpis.find((k) => k.id === kpiId);
    if (!kpi) throw new Error(`KPI ${kpiId} não encontrado`);

    if (kpi.isReadOnlyFinancial) {
      // Read-only financial indicators cannot be updated via manual performance writes
      throw new Error('Indicadores financeiros são estritamente READ_ONLY');
    }

    const evalRes = this.calculateStatusAndTrend(newValue, kpi.currentValue, kpi.target, kpi.criticalThreshold);
    kpi.previousValue = kpi.currentValue;
    kpi.currentValue = newValue;
    kpi.trend = evalRes.trend;
    kpi.status = evalRes.status;
    kpi.updatedAt = new Date().toISOString();

    await this.saveKPIs(companyId, kpis);

    // Audit Log
    await this.auditRepo.create({
      id: `audit-kpiupd-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      companyId,
      entityName: 'KPIValueUpdate',
      entityId: kpi.id,
      action: AuditAction.UPDATE,
      userId: context.userId,
      userName: context.userName || 'User',
      timestamp: kpi.updatedAt,
      newState: JSON.stringify({ newValue, status: kpi.status, trend: kpi.trend, correlationId: kpi.correlationId }),
    });

    return kpi;
  }
}
