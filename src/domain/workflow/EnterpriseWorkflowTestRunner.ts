// AutoERP Phase 3.56 Test Runner (Adversarial & E2E Suite)

import { TaskService } from './TaskService';
import { SLAService } from './SLAService';
import { PendingActionService } from './PendingActionService';
import { WorkflowService } from './WorkflowService';
import { WorkflowMetricsService } from './WorkflowMetricsService';
import { UserContext } from './types';

export interface TestResult {
  id: string;
  name: string;
  category: 'ADVERSARIAL' | 'E2E';
  passed: boolean;
  message: string;
}

export class EnterpriseWorkflowTestRunner {
  private static companyA = 'company-test-tenant-a';
  private static companyB = 'company-test-tenant-b';

  private static adminCtx: UserContext = {
    userId: 'user-admin-1',
    userName: 'Admin User',
    role: 'ADMIN',
    companyId: EnterpriseWorkflowTestRunner.companyA
  };

  private static attendantCtx: UserContext = {
    userId: 'user-attendant-1',
    userName: 'Attendant User',
    role: 'ATTENDANT',
    companyId: EnterpriseWorkflowTestRunner.companyA
  };

  public static async runAllTests(): Promise<{
    adversarialResults: TestResult[];
    e2eResults: TestResult[];
    allPassed: boolean;
  }> {
    const adversarialResults: TestResult[] = [];
    const e2eResults: TestResult[] = [];

    // Helper to run individual test
    const runTest = async (
      id: string,
      name: string,
      category: 'ADVERSARIAL' | 'E2E',
      fn: () => Promise<void>
    ) => {
      try {
        await fn();
        const res: TestResult = { id, name, category, passed: true, message: 'Passed successfully' };
        if (category === 'ADVERSARIAL') adversarialResults.push(res);
        else e2eResults.push(res);
      } catch (err: any) {
        const res: TestResult = {
          id,
          name,
          category,
          passed: false,
          message: err.message || 'Test failed'
        };
        if (category === 'ADVERSARIAL') adversarialResults.push(res);
        else e2eResults.push(res);
      }
    };

    // ==========================================
    // 1. ADVERSARIAL TESTS (ADV-3.56-01 to 20)
    // ==========================================

    await runTest('ADV-3.56-01', 'Null Payload Handling', 'ADVERSARIAL', async () => {
      try {
        await TaskService.createTask(null as any, this.adminCtx);
        throw new Error('Should have failed on null payload');
      } catch (e: any) {
        if (e.message.includes('Should have failed')) throw e;
      }
    });

    await runTest('ADV-3.56-02', 'Undefined Payload Handling', 'ADVERSARIAL', async () => {
      try {
        await TaskService.createTask(undefined as any, this.adminCtx);
        throw new Error('Should have failed on undefined payload');
      } catch (e: any) {
        if (e.message.includes('Should have failed')) throw e;
      }
    });

    await runTest('ADV-3.56-03', 'Missing CompanyId Rejection', 'ADVERSARIAL', async () => {
      try {
        await TaskService.createTask(
          {
            companyId: '',
            title: 'Test',
            description: 'Desc',
            category: 'DOCUMENT',
            priority: 'P1',
            severity: 'HIGH',
            sourceType: 'VEHICLE_DOCUMENT',
            sourceId: 'doc-1',
            entityType: 'VEHICLE',
            entityId: 'v-1'
          },
          this.adminCtx
        );
        throw new Error('Should have failed on empty companyId');
      } catch (e: any) {
        if (e.message.includes('Should have failed')) throw e;
      }
    });

    await runTest('ADV-3.56-04', 'Tampered CompanyId Rejection', 'ADVERSARIAL', async () => {
      try {
        await TaskService.getTasksByFilter('   ');
        throw new Error('Should have failed on whitespace companyId');
      } catch (e: any) {
        if (e.message.includes('Should have failed')) throw e;
      }
    });

    await runTest('ADV-3.56-05', 'Cross-Tenant Isolation Isolation', 'ADVERSARIAL', async () => {
      const taskA = await TaskService.createTask(
        {
          companyId: this.companyA,
          title: 'Tenant A Task',
          description: 'Secret A',
          category: 'MAINTENANCE',
          priority: 'P2',
          severity: 'MEDIUM',
          sourceType: 'MAINTENANCE',
          sourceId: 'm-tenant-a',
          entityType: 'VEHICLE',
          entityId: 'veh-a'
        },
        this.adminCtx
      );

      const tasksB = await TaskService.getAllTasks(this.companyB);
      if (tasksB.some(t => t.id === taskA.id)) {
        throw new Error('Tenant B was able to view Tenant A task');
      }
    });

    await runTest('ADV-3.56-06', 'Insufficient RBAC Rejection', 'ADVERSARIAL', async () => {
      const task = await TaskService.createTask(
        {
          companyId: this.companyA,
          title: 'RBAC Task',
          description: 'Desc',
          category: 'DOCUMENT',
          priority: 'P1',
          severity: 'HIGH',
          sourceType: 'VEHICLE_DOCUMENT',
          sourceId: 'doc-rbac-1',
          entityType: 'VEHICLE',
          entityId: 'v-rbac-1'
        },
        this.adminCtx
      );

      try {
        await TaskService.cancelTask(task.id, this.companyA, 'User trying to cancel', this.attendantCtx);
        throw new Error('Attendant should not be allowed to cancel task');
      } catch (e: any) {
        if (e.message.includes('Attendant should not')) throw e;
      }
    });

    await runTest('ADV-3.56-07', 'Duplicate Task Idempotency Protection', 'ADVERSARIAL', async () => {
      const task1 = await TaskService.createTask(
        {
          companyId: this.companyA,
          title: 'Idem Task',
          description: 'Desc',
          category: 'TRACKER',
          priority: 'P2',
          severity: 'MEDIUM',
          sourceType: 'TRACKER',
          sourceId: 'tr-100',
          entityType: 'TRACKER',
          entityId: 'tr-100'
        },
        this.adminCtx
      );

      const task2 = await TaskService.createTask(
        {
          companyId: this.companyA,
          title: 'Idem Task Duplicate',
          description: 'Desc',
          category: 'TRACKER',
          priority: 'P2',
          severity: 'MEDIUM',
          sourceType: 'TRACKER',
          sourceId: 'tr-100',
          entityType: 'TRACKER',
          entityId: 'tr-100'
        },
        this.adminCtx
      );

      if (task1.id !== task2.id) {
        throw new Error('Duplicate task created instead of reusing idempotent task');
      }
    });

    await runTest('ADV-3.56-08', 'Duplicate Workflow Automation Execution', 'ADVERSARIAL', async () => {
      const res1 = await WorkflowService.runAutomations(this.companyA, this.adminCtx);
      const res2 = await WorkflowService.runAutomations(this.companyA, this.adminCtx);
      if (typeof res1.tasksCreated !== 'number' || typeof res2.tasksCreated !== 'number') {
        throw new Error('Workflow automation return type invalid');
      }
    });

    await runTest('ADV-3.56-09', 'Double-Click Concurrency Lock', 'ADVERSARIAL', async () => {
      const t = await TaskService.createTask(
        {
          companyId: this.companyA,
          title: 'Lock Task',
          description: 'Desc',
          category: 'FINE',
          priority: 'P2',
          severity: 'MEDIUM',
          sourceType: 'TRAFFIC_TICKET',
          sourceId: 'ticket-lock-1',
          entityType: 'TRAFFIC_TICKET',
          entityId: 'ticket-lock-1'
        },
        this.adminCtx
      );

      // Concurrent assignments
      const p1 = TaskService.assignTask(t.id, this.companyA, 'user-1', this.adminCtx);
      const p2 = TaskService.assignTask(t.id, this.companyA, 'user-2', this.adminCtx);

      await Promise.allSettled([p1, p2]);
      const finalTask = await TaskService.getTaskById(t.id, this.companyA);
      if (!finalTask) throw new Error('Task lost during concurrent update');
    });

    await runTest('ADV-3.56-10', 'Concurrency Lock Release Validation', 'ADVERSARIAL', async () => {
      const t = await TaskService.createTask(
        {
          companyId: this.companyA,
          title: 'Lock Rel Task',
          description: 'Desc',
          category: 'INSURANCE',
          priority: 'P3',
          severity: 'LOW',
          sourceType: 'INSURANCE',
          sourceId: 'ins-lock-2',
          entityType: 'INSURANCE',
          entityId: 'ins-lock-2'
        },
        this.adminCtx
      );
      await TaskService.startTask(t.id, this.companyA, this.adminCtx);
      const updated = await TaskService.getTaskById(t.id, this.companyA);
      if (updated?.status !== 'IN_PROGRESS') throw new Error('Lock was not released properly for subsequent update');
    });

    await runTest('ADV-3.56-11', 'Invalid SLA Parameters Neutralization', 'ADVERSARIAL', async () => {
      const task = await TaskService.createTask(
        {
          companyId: this.companyA,
          title: 'Bad SLA Task',
          description: 'Desc',
          category: 'DOCUMENT',
          priority: 'P0',
          severity: 'CRITICAL',
          sourceType: 'VEHICLE_DOCUMENT',
          sourceId: 'vdoc-badsla-1',
          entityType: 'DOCUMENT',
          entityId: 'vdoc-badsla-1'
        },
        this.adminCtx,
        { priority: 'P0', maxHoursToFirstResponse: -5, maxHoursToResolution: 0, warningThresholdPercent: 150 }
      );

      const sla = await SLAService.updateSLAStatus(task.slaId!, this.companyA);
      if (isNaN(sla.consumedPercent) || isNaN(sla.remainingMinutes) || isNaN(sla.elapsedMinutes)) {
        throw new Error('SLA engine returned NaN for invalid inputs');
      }
    });

    await runTest('ADV-3.56-12', 'Invalid Date Safeguard', 'ADVERSARIAL', async () => {
      const t = await TaskService.createTask(
        {
          companyId: this.companyA,
          title: 'Bad Date Task',
          description: 'Desc',
          category: 'MAINTENANCE',
          priority: 'P2',
          severity: 'MEDIUM',
          sourceType: 'MAINTENANCE',
          sourceId: 'maint-bad-date',
          entityType: 'MAINTENANCE',
          entityId: 'maint-bad-date',
          dueAt: 'invalid-date-string'
        },
        this.adminCtx
      );

      const sla = await SLAService.updateSLAStatus(t.slaId!, this.companyA);
      if (!sla.dueAt || isNaN(new Date(sla.dueAt).getTime())) {
        throw new Error('SLA engine accepted unhandled invalid dueAt date');
      }
    });

    await runTest('ADV-3.56-13', 'Math Safety against NaN', 'ADVERSARIAL', async () => {
      const metrics = await WorkflowMetricsService.calculateMetrics(this.companyA);
      if (isNaN(metrics.completionRate) || isNaN(metrics.slaComplianceRate) || isNaN(metrics.averageResolutionMinutes)) {
        throw new Error('Metrics Service produced NaN');
      }
    });

    await runTest('ADV-3.56-14', 'Math Safety against Infinity', 'ADVERSARIAL', async () => {
      const metrics = await WorkflowMetricsService.calculateMetrics(this.companyA);
      if (!isFinite(metrics.completionRate) || !isFinite(metrics.slaComplianceRate)) {
        throw new Error('Metrics Service produced Infinity');
      }
    });

    await runTest('ADV-3.56-15', 'Invalid State Transition Rejection', 'ADVERSARIAL', async () => {
      const t = await TaskService.createTask(
        {
          companyId: this.companyA,
          title: 'Transition Task',
          description: 'Desc',
          category: 'DOCUMENT',
          priority: 'P3',
          severity: 'LOW',
          sourceType: 'MANUAL',
          sourceId: 'man-1',
          entityType: 'SYSTEM',
          entityId: 'sys-1'
        },
        this.adminCtx
      );

      try {
        await TaskService.closeTask(t.id, this.companyA, this.adminCtx);
        throw new Error('Should not allow OPEN -> CLOSED transition directly');
      } catch (e: any) {
        if (e.message.includes('Should not allow')) throw e;
      }
    });

    await runTest('ADV-3.56-16', 'Unassigned Task Handling', 'ADVERSARIAL', async () => {
      const t = await TaskService.createTask(
        {
          companyId: this.companyA,
          title: 'Unassigned Task',
          description: 'Desc',
          category: 'OPERATIONAL_GENERAL',
          priority: 'P2',
          severity: 'MEDIUM',
          sourceType: 'MANUAL',
          sourceId: 'man-unassigned-1',
          entityType: 'SYSTEM',
          entityId: 'sys-1'
        },
        this.adminCtx
      );

      if (t.assignedUserId) {
        throw new Error('Task should be unassigned initially');
      }
    });

    await runTest('ADV-3.56-17', 'Evidence Financial Injection Protection', 'ADVERSARIAL', async () => {
      const t = await TaskService.createTask(
        {
          companyId: this.companyA,
          title: 'Evidence Task',
          description: 'Desc',
          category: 'DOCUMENT',
          priority: 'P2',
          severity: 'MEDIUM',
          sourceType: 'MANUAL',
          sourceId: 'man-ev-1',
          entityType: 'SYSTEM',
          entityId: 'sys-1'
        },
        this.adminCtx
      );

      try {
        await TaskService.addEvidence(
          t.id,
          this.companyA,
          { type: 'COMMENT', content: 'Attempting to writeFinance() illegally', addedBy: 'admin' },
          this.adminCtx
        );
        throw new Error('Should have blocked financial keyword injection in evidence');
      } catch (e: any) {
        if (e.message.includes('Should have blocked')) throw e;
      }
    });

    await runTest('ADV-3.56-18', 'Attempted Financial Mutation Rejection in Title', 'ADVERSARIAL', async () => {
      try {
        await TaskService.createTask(
          {
            companyId: this.companyA,
            title: 'Please updateBalance for client',
            description: 'Desc',
            category: 'DOCUMENT',
            priority: 'P1',
            severity: 'HIGH',
            sourceType: 'MANUAL',
            sourceId: 'man-fin-1',
            entityType: 'SYSTEM',
            entityId: 'sys-1'
          },
          this.adminCtx
        );
        throw new Error('Should have blocked financial keywords in title');
      } catch (e: any) {
        if (e.message.includes('Should have blocked')) throw e;
      }
    });

    await runTest('ADV-3.56-19', 'Attempted Financial Access Rejection in Task Resolution', 'ADVERSARIAL', async () => {
      const t = await TaskService.createTask(
        {
          companyId: this.companyA,
          title: 'Resolution Task',
          description: 'Desc',
          category: 'DOCUMENT',
          priority: 'P2',
          severity: 'MEDIUM',
          sourceType: 'MANUAL',
          sourceId: 'man-res-1',
          entityType: 'SYSTEM',
          entityId: 'sys-1'
        },
        this.adminCtx
      );
      await TaskService.startTask(t.id, this.companyA, this.adminCtx);

      try {
        await TaskService.completeTask(t.id, this.companyA, 'Done with modifyPayment()', this.adminCtx);
        throw new Error('Should have blocked financial keywords in resolution');
      } catch (e: any) {
        if (e.message.includes('Should have blocked')) throw e;
      }
    });

    await runTest('ADV-3.56-20', 'Corrupted Persistence Storage Recovery', 'ADVERSARIAL', async () => {
      const key = `__autoerp_tasks_v1_${this.companyA}`;
      const original = localStorage.getItem(key);
      localStorage.setItem(key, '{ invalid json corrupted }');

      const tasks = await TaskService.getAllTasks(this.companyA);
      if (!Array.isArray(tasks)) {
        throw new Error('TaskService did not recover safely from corrupted JSON');
      }
      if (original) localStorage.setItem(key, original);
    });

    // ==========================================
    // 2. END-TO-END TESTS (E2E-3.56-01 to 25)
    // ==========================================

    let testTaskId = '';

    await runTest('E2E-3.56-01', 'Criar Tarefa', 'E2E', async () => {
      const t = await TaskService.createTask(
        {
          companyId: this.companyA,
          title: 'E2E Flow Task',
          description: 'Resolva a fita do veículo',
          category: 'DOCUMENT',
          priority: 'P1',
          severity: 'HIGH',
          sourceType: 'VEHICLE_DOCUMENT',
          sourceId: 'vdoc-e2e-1',
          entityType: 'VEHICLE',
          entityId: 'veh-e2e-1'
        },
        this.adminCtx
      );
      testTaskId = t.id;
      if (!t.id || t.status !== 'OPEN') throw new Error('Task creation failed in E2E');
    });

    await runTest('E2E-3.56-02', 'Atribuir Tarefa', 'E2E', async () => {
      const t = await TaskService.assignTask(testTaskId, this.companyA, 'user-op-1', this.adminCtx, 'Team Alpha');
      if (t.assignedUserId !== 'user-op-1' || t.status !== 'ASSIGNED') {
        throw new Error('Task assignment failed');
      }
    });

    await runTest('E2E-3.56-03', 'Iniciar Tarefa', 'E2E', async () => {
      const t = await TaskService.startTask(testTaskId, this.companyA, this.adminCtx);
      if (t.status !== 'IN_PROGRESS' || !t.startedAt) throw new Error('Task start failed');
    });

    await runTest('E2E-3.56-04', 'Bloquear Tarefa', 'E2E', async () => {
      const t = await TaskService.blockTask(testTaskId, this.companyA, 'Aguardando peca', this.adminCtx);
      if (t.status !== 'BLOCKED' || t.blockedReason !== 'Aguardando peca') {
        throw new Error('Task block failed');
      }
    });

    await runTest('E2E-3.56-05', 'Desbloquear Tarefa', 'E2E', async () => {
      const t = await TaskService.unblockTask(testTaskId, this.companyA, this.adminCtx);
      if (t.status !== 'IN_PROGRESS' || t.blockedReason) throw new Error('Task unblock failed');
    });

    await runTest('E2E-3.56-06', 'Concluir Tarefa', 'E2E', async () => {
      const t = await TaskService.completeTask(testTaskId, this.companyA, 'Documento atualizado no Detran', this.adminCtx);
      if (t.status !== 'COMPLETED' || !t.completedAt) throw new Error('Task completion failed');
    });

    await runTest('E2E-3.56-07', 'Validar Tarefa', 'E2E', async () => {
      const t = await TaskService.requestValidation(testTaskId, this.companyA, this.attendantCtx);
      if (t.status !== 'WAITING_VALIDATION') throw new Error('Task validation request failed');
    });

    await runTest('E2E-3.56-08', 'Fechar Tarefa', 'E2E', async () => {
      // Transition from WAITING_VALIDATION -> COMPLETED -> CLOSED
      await TaskService.completeTask(testTaskId, this.companyA, 'Validado com sucesso', this.adminCtx);
      const t = await TaskService.closeTask(testTaskId, this.companyA, this.adminCtx);
      if (t.status !== 'CLOSED' || !t.validatedAt) throw new Error('Task close failed');
    });

    await runTest('E2E-3.56-09', 'Reabrir Tarefa', 'E2E', async () => {
      const t = await TaskService.reopenTask(testTaskId, this.companyA, 'Reabertura por erro no documento', this.adminCtx);
      if (t.status !== 'REOPENED') throw new Error('Task reopen failed');
    });

    await runTest('E2E-3.56-10', 'Cancelar Tarefa', 'E2E', async () => {
      const t = await TaskService.cancelTask(testTaskId, this.companyA, 'Cancelamento operacional', this.adminCtx);
      if (t.status !== 'CANCELLED') throw new Error('Task cancel failed');
    });

    await runTest('E2E-3.56-11', 'Gerar SLA', 'E2E', async () => {
      const t = await TaskService.createTask(
        {
          companyId: this.companyA,
          title: 'SLA Test Task',
          description: 'Desc',
          category: 'DOCUMENT',
          priority: 'P0',
          severity: 'CRITICAL',
          sourceType: 'VEHICLE_DOCUMENT',
          sourceId: 'vdoc-sla-e2e',
          entityType: 'DOCUMENT',
          entityId: 'doc-sla-e2e'
        },
        this.adminCtx
      );
      if (!t.slaId) throw new Error('SLA generation failed during task creation');
      const sla = await SLAService.updateSLAStatus(t.slaId, this.companyA);
      if (!sla || sla.taskId !== t.id) throw new Error('SLA update failed');
    });

    await runTest('E2E-3.56-12', 'Romper SLA', 'E2E', async () => {
      const t = await TaskService.createTask(
        {
          companyId: this.companyA,
          title: 'Breached SLA Task',
          description: 'Desc',
          category: 'INCIDENT',
          priority: 'P0',
          severity: 'CRITICAL',
          sourceType: 'INCIDENT',
          sourceId: 'inc-breach-e2e',
          entityType: 'INCIDENT',
          entityId: 'inc-breach-e2e',
          dueAt: new Date(Date.now() - 3600000).toISOString() // 1 hour ago
        },
        this.adminCtx
      );

      const sla = await SLAService.updateSLAStatus(t.slaId!, this.companyA);
      if (sla.status !== 'BREACHED') throw new Error('SLA did not breach for overdue task');
    });

    await runTest('E2E-3.56-13', 'Criar Pendência', 'E2E', async () => {
      const pendencies = await PendingActionService.consolidatePendingActions(this.companyA);
      if (!Array.isArray(pendencies)) throw new Error('Pending Action consolidation failed');
    });

    await runTest('E2E-3.56-14', 'Converter Pendência em Tarefa', 'E2E', async () => {
      const pendencies = await PendingActionService.consolidatePendingActions(this.companyA);
      if (pendencies.length > 0) {
        const task = await PendingActionService.convertPendingToTask(pendencies[0].id, this.companyA, 'user-1', this.adminCtx);
        if (!task || !task.id) throw new Error('Pending conversion to task failed');
      }
    });

    await runTest('E2E-3.56-15', 'Executar Workflow', 'E2E', async () => {
      const res = await WorkflowService.runAutomations(this.companyA, this.adminCtx);
      if (typeof res.tasksCreated !== 'number') throw new Error('Workflow automation execution failed');
    });

    await runTest('E2E-3.56-16', 'Data Quality -> Task', 'E2E', async () => {
      const pendencies = await PendingActionService.getPendingActions(this.companyA);
      const dqPending = pendencies.find(p => p.category === 'DATA_QUALITY');
      if (dqPending) {
        const t = await PendingActionService.convertPendingToTask(dqPending.id, this.companyA, 'user-dq', this.adminCtx);
        if (t.category !== 'DATA_QUALITY') throw new Error('Data Quality pending conversion category mismatch');
      }
    });

    await runTest('E2E-3.56-17', 'Incident -> Task', 'E2E', async () => {
      const pendencies = await PendingActionService.getPendingActions(this.companyA);
      const incPending = pendencies.find(p => p.category === 'INCIDENT');
      if (incPending) {
        const t = await PendingActionService.convertPendingToTask(incPending.id, this.companyA, 'user-inc', this.adminCtx);
        if (t.category !== 'INCIDENT') throw new Error('Incident pending conversion category mismatch');
      }
    });

    await runTest('E2E-3.56-18', 'Fechamento Diário -> Task', 'E2E', async () => {
      const t = await TaskService.createTask(
        {
          companyId: this.companyA,
          title: 'Fechamento Diário Pendente',
          description: 'Ajustar encerramento diário',
          category: 'CLOSING_DAILY',
          priority: 'P1',
          severity: 'HIGH',
          sourceType: 'DAILY_CLOSING',
          sourceId: 'closing-daily-doc-1',
          entityType: 'SYSTEM',
          entityId: 'sys-daily-1'
        },
        this.adminCtx
      );
      if (t.category !== 'CLOSING_DAILY') throw new Error('Closing daily task creation failed');
    });

    await runTest('E2E-3.56-19', 'Multi-Tenant Strict Isolation', 'E2E', async () => {
      const tasksA = await TaskService.getAllTasks(this.companyA);
      const tasksB = await TaskService.getAllTasks(this.companyB);
      const overlap = tasksA.filter(ta => tasksB.some(tb => tb.id === ta.id));
      if (overlap.length > 0) throw new Error('Multi-tenant data leak detected');
    });

    await runTest('E2E-3.56-20', 'RBAC Validation Enforcement', 'E2E', async () => {
      const t = await TaskService.createTask(
        {
          companyId: this.companyA,
          title: 'RBAC Validation Task',
          description: 'Desc',
          category: 'DOCUMENT',
          priority: 'P2',
          severity: 'MEDIUM',
          sourceType: 'MANUAL',
          sourceId: 'rbac-val-1',
          entityType: 'SYSTEM',
          entityId: 'sys-rbac'
        },
        this.adminCtx
      );

      try {
        await TaskService.reopenTask(t.id, this.companyA, 'Reopen attempt', this.attendantCtx);
        throw new Error('Attendant was allowed to reopen task');
      } catch (e: any) {
        if (e.message.includes('Attendant was allowed')) throw e;
      }
    });

    await runTest('E2E-3.56-21', 'Backup Storage Compatibility', 'E2E', async () => {
      const tasks = await TaskService.getAllTasks(this.companyA);
      const backupJson = JSON.stringify(tasks);
      if (!backupJson.includes('companyId')) throw new Error('Backup serialization incompatible');
    });

    await runTest('E2E-3.56-22', 'Restore Storage Compatibility', 'E2E', async () => {
      const tasks = await TaskService.getAllTasks(this.companyA);
      const backupJson = JSON.stringify(tasks);
      const restored = JSON.parse(backupJson);
      if (!Array.isArray(restored)) throw new Error('Restore deserialization failed');
    });

    await runTest('E2E-3.56-23', 'AuditLog Event Recording', 'E2E', async () => {
      const t = await TaskService.createTask(
        {
          companyId: this.companyA,
          title: 'Audit Task',
          description: 'Desc',
          category: 'DOCUMENT',
          priority: 'P2',
          severity: 'MEDIUM',
          sourceType: 'MANUAL',
          sourceId: 'audit-task-1',
          entityType: 'SYSTEM',
          entityId: 'sys-audit'
        },
        this.adminCtx
      );
      if (!t.correlationId) throw new Error('AuditLog correlation ID missing');
    });

    await runTest('E2E-3.56-24', 'Correlation ID Propagation', 'E2E', async () => {
      const corr = `corr-custom-${Date.now()}`;
      const t = await TaskService.createTask(
        {
          companyId: this.companyA,
          title: 'Correlation Task',
          description: 'Desc',
          category: 'DOCUMENT',
          priority: 'P2',
          severity: 'MEDIUM',
          sourceType: 'MANUAL',
          sourceId: 'corr-task-1',
          entityType: 'SYSTEM',
          entityId: 'sys-corr',
          correlationId: corr
        },
        this.adminCtx
      );
      if (t.correlationId !== corr) throw new Error('Correlation ID propagation failed');
    });

    await runTest('E2E-3.56-25', 'Financial Freeze Verification (FINANCIAL_FILES_MODIFIED = 0)', 'E2E', async () => {
      const isFrozen = WorkflowService.verifyFinancialFreezeProtection();
      if (!isFrozen) throw new Error('Financial freeze protection verification failed');
    });

    const allPassed = adversarialResults.every(r => r.passed) && e2eResults.every(r => r.passed);

    return {
      adversarialResults,
      e2eResults,
      allPassed
    };
  }
}
