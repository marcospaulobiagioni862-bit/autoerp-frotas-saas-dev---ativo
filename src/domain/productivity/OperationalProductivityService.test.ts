import { OperationalProductivityService, OperationalProductivityService as ProdService } from './OperationalProductivityService';
import { OperationalTask } from '../tasks/OperationalTaskService';

export interface ProductivityTestResult {
  id: string;
  name: string;
  passed: boolean;
  message: string;
}

export class OperationalProductivityTestRunner {
  public static async runAllTests(): Promise<{
    total: number;
    passed: number;
    failed: number;
    results: ProductivityTestResult[];
  }> {
    const results: ProductivityTestResult[] = [];

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

    test('PRD01', 'Empty input safety & NaN/Infinity protection', () => {
      const metrics = OperationalProductivityService.calculateMetrics({ companyId: companyA });
      if (isNaN(metrics.tasks.total) || isNaN(metrics.tasks.completionRate) || isNaN(metrics.sla.complianceRate)) {
        throw new Error('NaN or Infinity detected in productivity metrics');
      }
    });

    test('PRD02', 'Multi-Tenancy Isolation', () => {
      const taskA: OperationalTask = {
        id: 't-A1',
        companyId: companyA,
        title: 'Task A',
        description: 'Desc A',
        type: 'ADMINISTRATIVE',
        priority: 'P1',
        status: 'PENDING',
        createdBy: 'Admin',
        createdAt: '2026-08-01',
        dueDate: '2026-08-10',
        evidences: [],
        followUps: [],
        deadlineStatus: 'ATRASADA',
        correlationId: 'corr-A',
        updatedAt: '2026-08-01',
      };

      const taskB: OperationalTask = {
        id: 't-B1',
        companyId: companyB,
        title: 'Task B',
        description: 'Desc B',
        type: 'ADMINISTRATIVE',
        priority: 'P0',
        status: 'PENDING',
        createdBy: 'Admin',
        createdAt: '2026-08-01',
        dueDate: '2026-08-10',
        evidences: [],
        followUps: [],
        deadlineStatus: 'ATRASADA',
        correlationId: 'corr-B',
        updatedAt: '2026-08-01',
      };

      const metricsA = OperationalProductivityService.calculateMetrics({
        companyId: companyA,
        tasks: [taskA, taskB],
      });

      if (metricsA.tasks.total !== 1) {
        throw new Error(`Multi-Tenancy isolation failed: expected 1 task for company A, found ${metricsA.tasks.total}`);
      }
    });

    test('PRD03', 'Read-Only Immutability Verification', () => {
      const taskOriginal: OperationalTask = {
        id: 't-immut',
        companyId: companyA,
        title: 'Immutability Task',
        description: 'Test',
        type: 'ADMINISTRATIVE',
        priority: 'P2',
        status: 'PENDING',
        createdBy: 'Admin',
        createdAt: '2026-08-01',
        dueDate: '2026-08-20',
        evidences: [],
        followUps: [],
        deadlineStatus: 'NO_PRAZO',
        correlationId: 'corr-immut',
        updatedAt: '2026-08-01',
      };

      const jsonBefore = JSON.stringify(taskOriginal);
      OperationalProductivityService.calculateMetrics({
        companyId: companyA,
        tasks: [taskOriginal],
      });
      const jsonAfter = JSON.stringify(taskOriginal);

      if (jsonBefore !== jsonAfter) {
        throw new Error('Immutability violation: Productivity service mutated input tasks');
      }
    });

    test('PRD04', 'SLA Compliance Rate Calculation', () => {
      const task1: OperationalTask = {
        id: 't-sla1',
        companyId: companyA,
        title: 'Task 1',
        description: 'OK',
        type: 'ADMINISTRATIVE',
        priority: 'P1',
        status: 'COMPLETED',
        createdBy: 'Admin',
        createdAt: '2026-08-01',
        dueDate: '2026-08-10',
        evidences: [],
        followUps: [],
        deadlineStatus: 'CONCLUÍDA',
        correlationId: 'c1',
        updatedAt: '2026-08-02',
      };

      const task2: OperationalTask = {
        id: 't-sla2',
        companyId: companyA,
        title: 'Task 2',
        description: 'Overdue',
        type: 'ADMINISTRATIVE',
        priority: 'P0',
        status: 'PENDING',
        createdBy: 'Admin',
        createdAt: '2026-08-01',
        dueDate: '2026-08-02',
        evidences: [],
        followUps: [],
        deadlineStatus: 'ATRASADA',
        correlationId: 'c2',
        updatedAt: '2026-08-02',
      };

      const metrics = OperationalProductivityService.calculateMetrics({
        companyId: companyA,
        tasks: [task1, task2],
      });

      if (metrics.sla.violated !== 1 || metrics.sla.p0Violated !== 1) {
        throw new Error('SLA violation tracking failed');
      }
    });

    const total = results.length;
    const passed = results.filter(r => r.passed).length;
    const failed = total - passed;

    return { total, passed, failed, results };
  }
}
