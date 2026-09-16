// AutoERP Pending Actions Service (Phase 3.56)

import {
  PendingAction,
  Task,
  TaskSourceType,
  TaskCategory,
  TaskPriority,
  TaskSeverity,
  TaskEntityType,
  UserContext
} from './types';
import {
  VehicleDocumentRepository,
  DriverDocumentRepository,
  InsuranceRepository,
  TrackerRepository,
  MaintenanceRepository,
  TrafficTicketRepository,
  ContractRepository
} from '../../persistence/repositories/localRepositories';
import { EnterpriseConsolidationService } from '../consolidation/EnterpriseConsolidationService';
import { IncidentManagementService } from '../incident-management/IncidentManagementService';
import { TaskService } from './TaskService';
import { AuditLogRepository } from '../../persistence/repositories/localRepositories';
import { MaintenanceStatus, AuditAction } from '../../types/enums';

export class PendingActionService {
  private static STORAGE_KEY_PREFIX = '__autoerp_pending_actions_v1_';
  private static auditRepo = new AuditLogRepository();

  private static vDocRepo = new VehicleDocumentRepository();
  private static dDocRepo = new DriverDocumentRepository();
  private static insuranceRepo = new InsuranceRepository();
  private static trackerRepo = new TrackerRepository();
  private static maintenanceRepo = new MaintenanceRepository();
  private static ticketRepo = new TrafficTicketRepository();
  private static contractRepo = new ContractRepository();
  private static consolidationService = new EnterpriseConsolidationService();

  private static validateTenant(companyId: string): void {
    if (!companyId || typeof companyId !== 'string' || companyId.trim() === '') {
      throw new Error('CompanyId is required for multi-tenant isolation');
    }
  }

  private static getStorageKey(companyId: string): string {
    return `${this.STORAGE_KEY_PREFIX}${companyId}`;
  }

  public static async getPendingActions(companyId: string): Promise<PendingAction[]> {
    this.validateTenant(companyId);
    try {
      const raw = localStorage.getItem(this.getStorageKey(companyId));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((p: PendingAction) => p && p.companyId === companyId);
    } catch {
      return [];
    }
  }

  private static async savePendingActions(companyId: string, actions: PendingAction[]): Promise<void> {
    this.validateTenant(companyId);
    const tenantActions = actions.filter(p => p.companyId === companyId);
    localStorage.setItem(this.getStorageKey(companyId), JSON.stringify(tenantActions));
  }

  /**
   * Scan system repositories and consolidate all pending actions
   */
  public static async consolidatePendingActions(companyId: string): Promise<PendingAction[]> {
    this.validateTenant(companyId);

    const existing = await this.getPendingActions(companyId);
    const existingMap = new Map<string, PendingAction>();
    for (const p of existing) {
      existingMap.set(p.idempotencyKey, p);
    }

    const newPendingList: PendingAction[] = [];
    const now = new Date();
    const correlationId = `pending-scan-${Date.now()}`;

    const addPending = (
      title: string,
      description: string,
      category: TaskCategory,
      priority: TaskPriority,
      severity: TaskSeverity,
      sourceType: TaskSourceType,
      sourceId: string,
      entityType: TaskEntityType,
      entityId: string,
      dueAt?: string
    ) => {
      const idempotencyKey = `${companyId}:${sourceType}:${sourceId}:${category}`;
      const found = existingMap.get(idempotencyKey);

      if (found) {
        newPendingList.push(found);
      } else {
        const action: PendingAction = {
          id: `pend-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          companyId,
          title,
          description,
          category,
          priority,
          severity,
          sourceType,
          sourceId,
          entityType,
          entityId,
          dueAt,
          status: 'OPEN',
          createdAt: now.toISOString(),
          correlationId,
          idempotencyKey
        };
        newPendingList.push(action);
        existingMap.set(idempotencyKey, action);
      }
    };

    // 1. Vehicle Documents Vencidos / Vencendo
    try {
      const vDocs = (await this.vDocRepo.findAll()).filter(d => d.companyId === companyId);
      for (const doc of vDocs) {
        if (doc.expirationDate) {
          const exp = new Date(doc.expirationDate);
          const diffDays = Math.round((exp.getTime() - now.getTime()) / (1000 * 3600 * 24));
          if (diffDays < 0) {
            addPending(
              `Documento de Veículo Vencido: ${doc.documentType || 'CRLV'}`,
              `Documento do veículo ${doc.vehicleId} venceu em ${doc.expirationDate}`,
              'DOCUMENT',
              'P1',
              'HIGH',
              'VEHICLE_DOCUMENT',
              doc.id,
              'VEHICLE',
              doc.vehicleId,
              doc.expirationDate
            );
          } else if (diffDays <= 30) {
            addPending(
              `Documento de Veículo Vencendo: ${doc.documentType || 'CRLV'}`,
              `Documento do veículo ${doc.vehicleId} vence em ${diffDays} dias (${doc.expirationDate})`,
              'DOCUMENT',
              'P2',
              'MEDIUM',
              'VEHICLE_DOCUMENT',
              doc.id,
              'VEHICLE',
              doc.vehicleId,
              doc.expirationDate
            );
          }
        }
      }
    } catch {
      // safe fallback
    }

    // 2. Driver CNH Vencida / Vencendo
    try {
      const dDocs = (await this.dDocRepo.findAll()).filter(d => d.companyId === companyId);
      for (const doc of dDocs) {
        if (doc.expirationDate) {
          const exp = new Date(doc.expirationDate);
          const diffDays = Math.round((exp.getTime() - now.getTime()) / (1000 * 3600 * 24));
          if (diffDays < 0) {
            addPending(
              `CNH de Motorista Vencida`,
              `Documento do motorista ${doc.driverId} venceu em ${doc.expirationDate}`,
              'DOCUMENT',
              'P1',
              'HIGH',
              'DRIVER_DOCUMENT',
              doc.id,
              'DRIVER',
              doc.driverId,
              doc.expirationDate
            );
          } else if (diffDays <= 30) {
            addPending(
              `CNH de Motorista Vencendo`,
              `Documento do motorista ${doc.driverId} vence em ${diffDays} dias (${doc.expirationDate})`,
              'DOCUMENT',
              'P2',
              'MEDIUM',
              'DRIVER_DOCUMENT',
              doc.id,
              'DRIVER',
              doc.driverId,
              doc.expirationDate
            );
          }
        }
      }
    } catch {
      // safe fallback
    }

    // 3. Manutenções Atrasadas ou Pendentes
    try {
      const maints = (await this.maintenanceRepo.findAll()).filter(m => m.companyId === companyId);
      for (const m of maints) {
        if (m.status === MaintenanceStatus.SCHEDULED && m.startDate) {
          const sched = new Date(m.startDate);
          if (sched < now) {
            addPending(
              `Manutenção Atrasada: ${m.type || 'PREVENTIVA'}`,
              `Manutenção do veículo ${m.vehicleId} agendada para ${m.startDate} está em atraso`,
              'MAINTENANCE',
              'P1',
              'HIGH',
              'MAINTENANCE',
              m.id,
              'VEHICLE',
              m.vehicleId,
              m.startDate
            );
          }
        }
      }
    } catch {
      // safe fallback
    }

    // 4. Incidentes de Produção
    try {
      const incidents = await IncidentManagementService.getIncidents(companyId);
      for (const inc of incidents) {
        if (inc.status === 'DETECTED' || inc.status === 'TRIAGED' || inc.status === 'ESCALATED') {
          addPending(
            `Incidente Crítico de Produção: ${inc.title}`,
            `Incidente ${inc.id} [${inc.severity}] requer ação corretiva imediata`,
            'INCIDENT',
            inc.severity === 'SEV0' ? 'P0' : inc.severity === 'SEV1' ? 'P1' : 'P2',
            inc.severity === 'SEV0' ? 'CRITICAL' : 'HIGH',
            'INCIDENT',
            inc.id,
            'INCIDENT',
            inc.id
          );
        }
      }
    } catch {
      // safe fallback
    }

    // 5. Data Quality Issues
    try {
      const dqReport = await this.consolidationService.runDataQualityAudit(companyId);
      for (const issue of dqReport.issues) {
        addPending(
          `Qualidade de Dados: ${issue.category}`,
          issue.description + `. Recomendação: ${issue.recommendation}`,
          'DATA_QUALITY',
          issue.severity === 'P1' ? 'P1' : issue.severity === 'P2' ? 'P2' : 'P3',
          issue.severity === 'P1' ? 'HIGH' : 'MEDIUM',
          'DATA_QUALITY_ISSUE',
          issue.id,
          'DATA_QUALITY',
          issue.entityId
        );
      }
    } catch {
      // safe fallback
    }

    await this.savePendingActions(companyId, newPendingList);
    return newPendingList;
  }

  /**
   * Convert pending action to an active Task
   */
  public static async convertPendingToTask(
    pendingId: string,
    companyId: string,
    assignedUserId?: string,
    userContext?: UserContext
  ): Promise<Task> {
    this.validateTenant(companyId);

    const pendingList = await this.getPendingActions(companyId);
    const index = pendingList.findIndex(p => p.id === pendingId);
    if (index === -1) {
      throw new Error(`Pending Action ${pendingId} not found`);
    }

    const pending = pendingList[index];
    if (pending.status === 'CONVERTED' && pending.convertedTaskId) {
      const existingTask = await TaskService.getTaskById(pending.convertedTaskId, companyId);
      if (existingTask) return existingTask;
    }

    const ctx: UserContext = userContext || {
      userId: 'SYSTEM',
      userName: 'AutoERP Pendency Engine',
      role: 'ADMIN'
    };

    const newTask = await TaskService.createTask(
      {
        companyId,
        title: pending.title,
        description: pending.description,
        category: pending.category,
        priority: pending.priority,
        severity: pending.severity,
        sourceType: pending.sourceType,
        sourceId: pending.sourceId,
        entityType: pending.entityType,
        entityId: pending.entityId,
        assignedUserId,
        dueAt: pending.dueAt,
        correlationId: pending.correlationId
      },
      ctx
    );

    pending.status = 'CONVERTED';
    pending.convertedTaskId = newTask.id;
    pendingList[index] = pending;

    await this.savePendingActions(companyId, pendingList);

    await this.auditRepo.create({
      id: `audit-${Date.now()}`,
      companyId,
      entityName: 'PendingAction',
      entityId: pending.id,
      action: AuditAction.UPDATE,
      newState: JSON.stringify({ status: 'CONVERTED', convertedTaskId: newTask.id }),
      userId: ctx.userId,
      userName: ctx.userName || 'User',
      timestamp: new Date().toISOString()
    });

    return newTask;
  }

  public static async dismissPendingAction(
    pendingId: string,
    companyId: string,
    userContext?: UserContext
  ): Promise<PendingAction | null> {
    this.validateTenant(companyId);

    const pendingList = await this.getPendingActions(companyId);
    const index = pendingList.findIndex(p => p.id === pendingId);
    if (index === -1) return null;

    const pending = pendingList[index];
    pending.status = 'DISMISSED';
    pendingList[index] = pending;

    await this.savePendingActions(companyId, pendingList);
    return pending;
  }
}
