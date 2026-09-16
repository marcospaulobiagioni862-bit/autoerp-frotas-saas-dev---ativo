import { ManagementGoalsService } from './ManagementGoalsService';
import { OperationalTask } from '../tasks/OperationalTaskService';

export interface GoalsTestResult {
  id: string;
  name: string;
  passed: boolean;
  message: string;
}

export class ManagementGoalsTestRunner {
  public static async runAllTests(): Promise<{
    total: number;
    passed: number;
    failed: number;
    results: GoalsTestResult[];
  }> {
    const results: GoalsTestResult[] = [];

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

    test('GOAL01', 'Evaluate goals with empty input safely without NaN', () => {
      const summary = ManagementGoalsService.evaluateGoals({ companyId: companyA });
      if (summary.goals.some(g => isNaN(g.realizedValue || 0) || isNaN(g.achievementPercentage || 0))) {
        throw new Error('NaN detected in goals evaluation');
      }
    });

    test('GOAL02', 'Multi-tenant isolation for goals', () => {
      const summaryA = ManagementGoalsService.evaluateGoals({ companyId: companyA });
      const summaryB = ManagementGoalsService.evaluateGoals({ companyId: companyB });
      if (summaryA.companyId !== companyA || summaryB.companyId !== companyB) {
        throw new Error('Multi-tenant companyId mismatch in goals evaluation');
      }
    });

    test('GOAL03', 'Critical goal status & P0 Alert generation', () => {
      const overdueTask: OperationalTask = {
        id: 't-overdue',
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

      const evaluation = ManagementGoalsService.evaluateGoals({
        companyId: companyA,
        tasks: [overdueTask],
      });

      const overdueGoal = evaluation.goals.find(g => g.indicatorCode === 'OVERDUE_TASKS');
      if (!overdueGoal || overdueGoal.status !== 'CRITICAL') {
        throw new Error('Expected OVERDUE_TASKS goal to be CRITICAL when overdue tasks exist');
      }
      if (evaluation.alerts.length === 0) {
        throw new Error('Expected managerial alerts to be generated for critical/warning goals');
      }
    });

    const total = results.length;
    const passed = results.filter(r => r.passed).length;
    const failed = total - passed;

    return { total, passed, failed, results };
  }
}
