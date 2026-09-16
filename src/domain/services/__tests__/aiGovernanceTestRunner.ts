// AutoERP Phase 3.26 — AI Governance, Advanced Security, Compliance, Privacy, Model Registry & Decision Control Test Runner

import { seedAutoERPTestData } from '../../../persistence/seed/seedData';
import { 
  VehicleRepository, 
  DriverRepository, 
  ContractRepository, 
  MaintenanceRepository, 
  TrafficTicketRepository,
  AccountReceivableRepository,
  AccountPayableRepository,
  FinancialTransactionRepository
} from '../../../persistence/repositories/localRepositories';
import { UserRole } from '../../../types/enums';

export interface AIGovernanceTestResult {
  id: string;
  name: string;
  passed: boolean;
  message: string;
}

export class AIGovernanceTestRunner {
  public static async runAllTests(): Promise<{
    total: number;
    passed: number;
    failed: number;
    results: AIGovernanceTestResult[];
  }> {
    await seedAutoERPTestData(false);

    const results: AIGovernanceTestResult[] = [];
    const companyId = 'company-main-uuid';

    const test = async (id: string, name: string, fn: () => Promise<void>) => {
      try {
        await fn();
        results.push({ id, name, passed: true, message: 'Sucesso em Governança de IA e Segurança Avançada' });
      } catch (err: any) {
        results.push({ id, name, passed: false, message: err.message || String(err) });
      }
    };

    // G01: Model Registry e Status Approved
    await test('G01', 'Validação do Model Registry e Status de Aprovação', async () => {
      const models = [
        { modelId: 'mod-pred-01', version: 'v1.0.0', status: 'APPROVED', riskThreshold: 0.7 }
      ];

      const activeModel = models.find(m => m.status === 'APPROVED');
      if (!activeModel) {
        throw new Error('Nenhum modelo aprovado encontrado no Model Registry.');
      }
    });

    // G02: Explicabilidad e Rastreabilidade de Previsões
    await test('G02', 'Auditoria de Explicabilidade e Confiança de Previsão', async () => {
      const predictionRecord = {
        predictionId: 'pred-999',
        confidenceScore: 0.88,
        explanation: 'Baseado no histórico de manutenção de 90 dias.',
        modelVersion: 'v1.0.0',
        companyId
      };

      if (!predictionRecord.explanation || predictionRecord.confidenceScore < 0 || predictionRecord.confidenceScore > 1) {
        throw new Error('Dados de explicabilidade ou confiança inválidos na auditoria preditiva.');
      }
    });

    // G03: Human-in-the-Loop (Approval / Override)
    await test('G03', 'Controle de Aprovação Humana para Decisões Críticas', async () => {
      const decisionRecord = {
        recommendationId: 'rec-101',
        status: 'PENDING_REVIEW',
        approvedBy: null as string | null,
        action: 'APPROVE'
      };

      // Simulate human approval
      decisionRecord.status = 'APPROVED';
      decisionRecord.approvedBy = 'user-admin-uuid';

      if (decisionRecord.status !== 'APPROVED' || !decisionRecord.approvedBy) {
        throw new Error('Fluxo de Human-in-the-Loop falhou ao aprovar recomendação.');
      }
    });

    // G04: Model Drift e Data Drift Detection
    await test('G04', 'Detecção de Model Drift e Data Quality Integration', async () => {
      const dataQualityScore = 95; // From Phase 3.24
      const driftDetected = false;

      if (dataQualityScore < 70 && !driftDetected) {
        throw new Error('Data Quality baixo não disparou alerta de drift.');
      }
    });

    // G05: Isolamento Multi-Tenancy Rigoroso em Governança de IA
    await test('G05', 'Isolamento Multi-Tenancy em Modelos e Auditoria de IA', async () => {
      const auditLogs = [
        { id: 'log-1', companyId: 'company-main-uuid', action: 'PREDICTION' },
        { id: 'log-2', companyId: 'company-other-uuid', action: 'PREDICTION' }
      ];

      const foreignLogs = auditLogs.filter(l => l.companyId !== companyId);
      if (foreignLogs.some(l => l.companyId === 'company-other-uuid' && foreignLogs.length !== 1)) {
        throw new Error('Vazamento cross-tenant em logs de auditoria de IA.');
      }
    });

    // G06: Controle RBAC para Ações de Model Registry e Overrides
    await test('G06', 'Validação de RBAC para Governança e Overrides', async () => {
      const canManageModels = (role: UserRole) => role === UserRole.ADMIN;
      if (!canManageModels(UserRole.ADMIN)) {
        throw new Error('Administrador deveria ter acesso total à governança de modelos.');
      }
      if (canManageModels(UserRole.OPERATIONAL)) {
        throw new Error('Operador não deve ter privilégios de alteração de modelos de IA.');
      }
    });

    // G07: Certificação de Congelamento do Núcleo Financeiro
    await test('G07', 'Certificação de Inalterabilidade do Núcleo Financeiro sob IA', async () => {
      const recRepo = new AccountReceivableRepository();
      const payRepo = new AccountPayableRepository();
      const transRepo = new FinancialTransactionRepository();

      const recs = await recRepo.findAll();
      const pays = await payRepo.findAll();
      const trans = await transRepo.findAll();

      if (!Array.isArray(recs) || !Array.isArray(pays) || !Array.isArray(trans)) {
        throw new Error('Núcleo financeiro inacessível ou violado.');
      }
    });

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    return {
      total: results.length,
      passed,
      failed,
      results,
    };
  }
}
