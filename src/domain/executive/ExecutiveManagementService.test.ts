import { ExecutiveManagementService } from './ExecutiveManagementService';
import { OperationalTask } from '../tasks/OperationalTaskService';
import { OperationalIncident } from '../incidents/OperationalIncidentService';
import { OperationalPendingItem } from '../operations/OperationalPendingService';

export interface ExecutiveTestResult {
  id: string;
  name: string;
  passed: boolean;
  message: string;
}

export class ExecutiveManagementTestRunner {
  public static async runAllTests(): Promise<{
    total: number;
    passed: number;
    failed: number;
    results: ExecutiveTestResult[];
  }> {
    const results: ExecutiveTestResult[] = [];

    const test = (id: string, name: string, fn: () => void) => {
      try {
        fn();
        results.push({ id, name, passed: true, message: 'Sucesso' });
      } catch (err: any) {
        results.push({ id, name, passed: false, message: err.message || String(err) });
      }
    };

    const companyA = 'company-A';
    const companyB = 'company-B';

    test('EXEC01', 'Generate executive report safely with empty/default input without NaN', () => {
      const report = ExecutiveManagementService.generateExecutiveReport({ companyId: companyA });
      if (isNaN(report.healthScore.score) || !isFinite(report.healthScore.score)) {
        throw new Error('NaN or Infinity detected in health score calculation');
      }
      if (report.companyId !== companyA) {
        throw new Error('Company ID mismatch in report');
      }
    });

    test('EXEC02', 'Multi-tenant isolation for executive reports', () => {
      const reportA = ExecutiveManagementService.generateExecutiveReport({ companyId: companyA });
      const reportB = ExecutiveManagementService.generateExecutiveReport({ companyId: companyB });
      if (reportA.companyId !== companyA || reportB.companyId !== companyB) {
        throw new Error('Multi-tenant isolation failure');
      }
    });

    test('EXEC03', 'Critical risks and P0 recommendations when overdue tasks and P0 incidents exist', () => {
      const p0Incident: OperationalIncident = {
        id: 'inc-p0',
        companyId: companyA,
        title: 'Accident P0',
        description: 'Critical accident',
        type: 'ACCIDENT',
        category: 'VEHICLE',
        priority: 'P0',
        status: 'OPEN',
        vehicleId: 'v1',
        createdAt: '2026-08-01',
        updatedAt: '2026-08-01',
        recurrenceCount: 0,
        isRecurring: false,
        slaStatus: 'ON_TIME',
        actions: [],
      };

      const overdueTask: OperationalTask = {
        id: 'task-overdue',
        companyId: companyA,
        title: 'Overdue Task',
        description: 'Test',
        type: 'ADMINISTRATIVE',
        priority: 'P0',
        status: 'PENDING',
        createdBy: 'Admin',
        createdAt: '2026-08-01',
        dueDate: '2026-08-02',
        evidences: [],
        followUps: [],
        deadlineStatus: 'ATRASADA',
        correlationId: 'corr-1',
        updatedAt: '2026-08-01',
      };

      const report = ExecutiveManagementService.generateExecutiveReport({
        companyId: companyA,
        tasks: [overdueTask],
        incidents: [p0Incident],
      });

      if (report.kpis.operations.openIncidentsP0 !== 1 || report.kpis.operations.overdueTasks !== 1) {
        throw new Error('Expected 1 P0 incident and 1 overdue task in KPIs');
      }

      if (report.risks.length === 0 || report.recommendations.length === 0) {
        throw new Error('Expected risks and recommendations to be generated for critical items');
      }
    });

    test('EXEC04', 'Adversarial input with nulls, NaN, and negative numbers does not crash', () => {
      const report = ExecutiveManagementService.generateExecutiveReport({
        companyId: companyA,
        vehiclesCount: NaN as any,
        availableVehiclesCount: -5,
        tasks: [null as any, undefined as any],
      });

      if (isNaN(report.healthScore.score) || report.healthScore.score < 0) {
        throw new Error('Health score calculation failed on adversarial input');
      }
    });

    const total = results.length;
    const passed = results.filter(r => r.passed).length;
    const failed = total - passed;

    return { total, passed, failed, results };
  }
}
