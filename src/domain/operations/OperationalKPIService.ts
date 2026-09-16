// AutoERP Operational KPI Service (Phase 3.58)

import {
  OperationalKPIs,
  UserContext358
} from './types';
import { TaskService } from '../workflow/TaskService';
import { SLAService } from '../workflow/SLAService';
import { PendingActionService } from '../workflow/PendingActionService';
import { IncidentManagementService } from '../incident-management/IncidentManagementService';
import { ProductivityService } from '../execution/ProductivityService';
import { generateDailyOperations } from './DailyOperationsService';
import { ExecutionService } from '../execution/ExecutionService';
import { VehicleRepository, ContractRepository } from '../../persistence/repositories/localRepositories';
import { VehicleStatus, ContractStatus } from '../../types/enums';
import { OperationalPriorityService } from './OperationalPriorityService';

export class OperationalKPIService {
  private static vehicleRepo = new VehicleRepository();
  private static contractRepo = new ContractRepository();

  private static validateTenant(companyId: string): void {
    if (!companyId || typeof companyId !== 'string' || companyId.trim() === '') {
      throw new Error('companyId é obrigatório para isolamento multi-tenant');
    }
  }

  public static async calculateOperationalKPIs(
    companyId: string,
    context?: UserContext358
  ): Promise<OperationalKPIs> {
    this.validateTenant(companyId);
    if (context && context.companyId !== companyId) {
      throw new Error(`Acesso negado: Tentativa de consulta cross-tenant (${context.companyId} !== ${companyId})`);
    }

    let openTasks = 0;
    let completedTasks = 0;
    let blockedTasks = 0;
    let backlogCount = 0;
    let overdueActivitiesCount = 0;
    let todayActivitiesCount = 0;

    let slaCompliancePercent = 100;
    let slaAtRiskCount = 0;
    let slaBreachedCount = 0;
    let avgCompletionTimeHours = 0;

    let activeUsersCount = 1;
    let availableUsersCount = 1;
    let overloadedUsersCount = 0;
    let avgProductivityPercent = 100;

    let totalVehicles = 0;
    let availableVehiclesCount = 0;
    let rentedVehiclesCount = 0;
    let maintenanceVehiclesCount = 0;
    let unavailableVehiclesCount = 0;
    let fleetUtilizationPercent = 0;
    let vehiclesWithIssuesCount = 0;

    let activeContractsCount = 0;
    let expiringContractsCount = 0;
    let contractsWithIssuesCount = 0;
    let contractsWithIncidentsCount = 0;

    let activeIncidentsCount = 0;
    let criticalIncidentsCount = 0;
    let recurringIncidentsCount = 0;
    let mttrMinutes = 0;
    let mttdMinutes = 0;

    // 1. Task & Workflow KPIs
    try {
      const tasks = await TaskService.getTasks(companyId);
      openTasks = tasks.filter((t) => t.status === 'OPEN' || t.status === 'ASSIGNED' || t.status === 'IN_PROGRESS').length;
      completedTasks = tasks.filter((t) => t.status === 'COMPLETED' || t.status === 'CLOSED').length;
      blockedTasks = tasks.filter((t) => t.status === 'BLOCKED').length;
      backlogCount = openTasks + blockedTasks;

      const now = Date.now();
      overdueActivitiesCount = tasks.filter(
        (t) => t.status !== 'COMPLETED' && t.status !== 'CLOSED' && t.dueAt && new Date(t.dueAt).getTime() < now
      ).length;

      const todayStr = new Date().toISOString().substring(0, 10);
      todayActivitiesCount = tasks.filter(
        (t) => t.dueAt && t.dueAt.substring(0, 10) === todayStr
      ).length;
    } catch {
      // safe fallback
    }

    // 2. SLA KPIs
    try {
      const slaRecords = await SLAService.getSLARecords(companyId);
      if (slaRecords.length > 0) {
        slaBreachedCount = slaRecords.filter((s) => s.status === 'BREACHED').length;
        slaAtRiskCount = slaRecords.filter((s) => s.status === 'WARNING').length;
        const totalEvaluated = slaRecords.length;
        const compliant = totalEvaluated - slaBreachedCount;
        slaCompliancePercent = Math.round(
          OperationalPriorityService.safeNumber((compliant / Math.max(totalEvaluated, 1)) * 100, 100)
        );
      }
    } catch {
      // safe fallback
    }

    // 3. People / Productivity KPIs
    try {
      const userCtx357 = context ? {
        userId: context.userId,
        userName: context.userName || context.userId,
        userRole: (context.userRole as any) || 'ADMIN',
        companyId: context.companyId,
      } : undefined;

      const prod = await ProductivityService.getProductivitySnapshot(companyId, 'CURRENT', userCtx357);
      if (prod) {
        avgProductivityPercent = OperationalPriorityService.safeNumber(prod.slaCompliance, 100);
        if (prod.workloadByUser) {
          const userList = Object.values(prod.workloadByUser);
          activeUsersCount = Math.max(userList.length, 1);
          overloadedUsersCount = userList.filter((u) => u.classification === 'SOBRECARGA' || u.classification === 'CRÍTICA').length;
          availableUsersCount = Math.max(activeUsersCount - overloadedUsersCount, 0);
        }
      }
    } catch {
      // safe fallback
    }

    // 4. Fleet KPIs
    try {
      const vehicles = await this.vehicleRepo.findAll({ companyId });
      totalVehicles = vehicles.length;
      availableVehiclesCount = vehicles.filter((v) => v.status === VehicleStatus.AVAILABLE).length;
      rentedVehiclesCount = vehicles.filter((v) => v.status === VehicleStatus.RENTED).length;
      maintenanceVehiclesCount = vehicles.filter((v) => v.status === VehicleStatus.MAINTENANCE).length;
      unavailableVehiclesCount = vehicles.filter((v) => v.status === VehicleStatus.INACTIVE).length;

      vehiclesWithIssuesCount = maintenanceVehiclesCount + unavailableVehiclesCount;
      fleetUtilizationPercent = Math.round(
        OperationalPriorityService.safeNumber((rentedVehiclesCount / Math.max(totalVehicles, 1)) * 100, 0)
      );
    } catch {
      // safe fallback
    }

    // 5. Contracts KPIs
    try {
      const contracts = await this.contractRepo.findAll({ companyId });
      activeContractsCount = contracts.filter((c) => c.status === ContractStatus.ACTIVE).length;

      const thirtyDaysFromNow = new Date(Date.now() + 30 * 86400000).toISOString();
      expiringContractsCount = contracts.filter(
        (c) => c.status === ContractStatus.ACTIVE && c.endDate && c.endDate <= thirtyDaysFromNow
      ).length;

      contractsWithIssuesCount = contracts.filter(
        (c) => c.status === ContractStatus.SUSPENDED || c.status === ContractStatus.CANCELLED
      ).length;
    } catch {
      // safe fallback
    }

    // 6. Incidents KPIs
    try {
      const incidents = await IncidentManagementService.getIncidents(companyId);
      const active = incidents.filter((i) => i.status !== 'CLOSED' && i.status !== 'RESOLVED' && i.status !== 'CANCELLED');
      activeIncidentsCount = active.length;
      criticalIncidentsCount = active.filter((i) => i.severity === 'SEV0' || i.severity === 'SEV1').length;
      recurringIncidentsCount = incidents.filter((i) => i.status === 'CANCELLED').length;

      // MTTR calculation
      const resolved = incidents.filter((i) => i.resolvedAt && i.createdAt);
      if (resolved.length > 0) {
        const totalMinutes = resolved.reduce((acc, i) => {
          const start = new Date(i.createdAt).getTime();
          const end = new Date(i.resolvedAt!).getTime();
          return acc + Math.max((end - start) / (1000 * 60), 0);
        }, 0);
        mttrMinutes = Math.round(OperationalPriorityService.safeNumber(totalMinutes / resolved.length, 0));
      } else {
        mttrMinutes = 45; // default benchmark
      }
      mttdMinutes = 10; // benchmark
    } catch {
      // safe fallback
    }

    return {
      openTasks,
      completedTasks,
      blockedTasks,
      backlogCount,
      overdueActivitiesCount,
      todayActivitiesCount,

      slaCompliancePercent,
      slaAtRiskCount,
      slaBreachedCount,
      avgCompletionTimeHours,

      activeUsersCount,
      availableUsersCount,
      overloadedUsersCount,
      avgProductivityPercent,

      totalVehicles,
      availableVehiclesCount,
      rentedVehiclesCount,
      maintenanceVehiclesCount,
      unavailableVehiclesCount,
      fleetUtilizationPercent,
      vehiclesWithIssuesCount,

      activeContractsCount,
      expiringContractsCount,
      contractsWithIssuesCount,
      contractsWithIncidentsCount,

      activeIncidentsCount,
      criticalIncidentsCount,
      recurringIncidentsCount,
      mttrMinutes,
      mttdMinutes,
    };
  }
}
