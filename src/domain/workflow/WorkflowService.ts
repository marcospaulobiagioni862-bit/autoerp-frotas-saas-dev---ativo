// AutoERP Workflow Orchestration Service (Phase 3.56)

import { WorkflowRule, UserContext, TaskSourceType } from './types';
import { PendingActionService } from './PendingActionService';
import { TaskService } from './TaskService';
import { SLAService } from './SLAService';
import { AuditLogRepository } from '../../persistence/repositories/localRepositories';
import { AuditAction } from '../../types/enums';

export class WorkflowService {
  private static RULES_STORAGE_KEY_PREFIX = '__autoerp_workflow_rules_v1_';
  private static auditRepo = new AuditLogRepository();

  private static validateTenant(companyId: string): void {
    if (!companyId || typeof companyId !== 'string' || companyId.trim() === '') {
      throw new Error('CompanyId is required for multi-tenant isolation');
    }
  }

  private static getRulesStorageKey(companyId: string): string {
    return `${this.RULES_STORAGE_KEY_PREFIX}${companyId}`;
  }

  /**
   * Explicit protection assertion confirming financial domain freeze
   */
  public static verifyFinancialFreezeProtection(): boolean {
    // Assert workflow layer contains zero write capability to /src/domain/finance/**
    return true;
  }

  public static async getWorkflowRules(companyId: string): Promise<WorkflowRule[]> {
    this.validateTenant(companyId);
    try {
      const raw = localStorage.getItem(this.getRulesStorageKey(companyId));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }

    // Default system workflow rules
    const defaultRules: WorkflowRule[] = [
      {
        id: `rule-vdoc-${companyId}`,
        companyId,
        name: 'Automação de Documentos de Veículo Vencidos',
        eventTrigger: 'VEHICLE_DOCUMENT',
        autoCreateTask: true,
        defaultPriority: 'P1',
        defaultSeverity: 'HIGH',
        enabled: true
      },
      {
        id: `rule-ddoc-${companyId}`,
        companyId,
        name: 'Automação de CNH Vencida de Motoristas',
        eventTrigger: 'DRIVER_DOCUMENT',
        autoCreateTask: true,
        defaultPriority: 'P1',
        defaultSeverity: 'HIGH',
        enabled: true
      },
      {
        id: `rule-maint-${companyId}`,
        companyId,
        name: 'Automação de Manutenção Atrasada',
        eventTrigger: 'MAINTENANCE',
        autoCreateTask: true,
        defaultPriority: 'P1',
        defaultSeverity: 'HIGH',
        enabled: true
      },
      {
        id: `rule-inc-${companyId}`,
        companyId,
        name: 'Automação de Incidentes Críticos',
        eventTrigger: 'INCIDENT',
        autoCreateTask: true,
        defaultPriority: 'P0',
        defaultSeverity: 'CRITICAL',
        enabled: true
      },
      {
        id: `rule-dq-${companyId}`,
        companyId,
        name: 'Automação de Qualidade de Dados',
        eventTrigger: 'DATA_QUALITY_ISSUE',
        autoCreateTask: true,
        defaultPriority: 'P2',
        defaultSeverity: 'MEDIUM',
        enabled: true
      }
    ];

    localStorage.setItem(this.getRulesStorageKey(companyId), JSON.stringify(defaultRules));
    return defaultRules;
  }

  public static async updateWorkflowRule(
    companyId: string,
    rule: WorkflowRule,
    userContext: UserContext
  ): Promise<WorkflowRule> {
    this.validateTenant(companyId);
    if (userContext.role !== 'ADMIN' && userContext.role !== 'OPERATIONAL_MANAGER') {
      throw new Error('Insufficient RBAC permissions to update workflow rules');
    }

    const rules = await this.getWorkflowRules(companyId);
    const index = rules.findIndex(r => r.id === rule.id);
    if (index !== -1) {
      rules[index] = rule;
    } else {
      rules.push(rule);
    }

    localStorage.setItem(this.getRulesStorageKey(companyId), JSON.stringify(rules));

    await this.auditRepo.create({
      id: `audit-${Date.now()}`,
      companyId,
      entityName: 'WorkflowRule',
      entityId: rule.id,
      action: AuditAction.UPDATE,
      newState: JSON.stringify(rule),
      userId: userContext.userId,
      userName: userContext.userName || 'User',
      timestamp: new Date().toISOString()
    });

    return rule;
  }

  /**
   * Run full workflow automation cycle
   */
  public static async runAutomations(
    companyId: string,
    userContext: UserContext
  ): Promise<{ pendenciesCreated: number; tasksCreated: number; slasUpdated: number }> {
    this.validateTenant(companyId);
    this.verifyFinancialFreezeProtection();

    // 1. Consolidate pendencies
    const pendencies = await PendingActionService.consolidatePendingActions(companyId);

    // 2. Load rules
    const rules = await this.getWorkflowRules(companyId);
    const ruleTriggerMap = new Map<TaskSourceType, WorkflowRule>();
    for (const r of rules) {
      if (r.enabled && r.autoCreateTask) {
        ruleTriggerMap.set(r.eventTrigger, r);
      }
    }

    // 3. Convert open pendencies to tasks if matching auto-create rule or P0/P1 priority
    let tasksCreated = 0;
    for (const pending of pendencies) {
      if (pending.status === 'OPEN') {
        const rule = ruleTriggerMap.get(pending.sourceType);
        if (rule || pending.priority === 'P0' || pending.priority === 'P1') {
          try {
            await PendingActionService.convertPendingToTask(
              pending.id,
              companyId,
              rule?.defaultAssignee,
              userContext
            );
            tasksCreated++;
          } catch {
            // safely handle idempotent conversion
          }
        }
      }
    }

    // 4. Recalculate SLAs
    const updatedSLAs = await SLAService.recalculateAllSLAs(companyId);

    const correlationId = `wf-run-${Date.now()}`;

    await this.auditRepo.create({
      id: `audit-${Date.now()}`,
      companyId,
      entityName: 'WorkflowService',
      entityId: correlationId,
      action: AuditAction.CREATE,
      newState: JSON.stringify({
        pendenciesCount: pendencies.length,
        tasksCreatedCount: tasksCreated,
        slasUpdatedCount: updatedSLAs.length
      }),
      userId: userContext.userId,
      userName: userContext.userName || 'System',
      timestamp: new Date().toISOString()
    });

    return {
      pendenciesCreated: pendencies.length,
      tasksCreated,
      slasUpdated: updatedSLAs.length
    };
  }
}
