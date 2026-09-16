import { SystemIntegrityAuditService } from './SystemIntegrityAuditService';
import { TestResultItem } from '../finance/__tests__/financeTestRunner';

export class SystemIntegrityTestRunner {
  public static async runAllTests(companyId = 'company-main-uuid'): Promise<{
    passed: number;
    total: number;
    failed: number;
    results: TestResultItem[];
  }> {
    const service = new SystemIntegrityAuditService();
    const results: TestResultItem[] = [];

    // 1. Financial Lock Check
    try {
      const lock = service.verifyFinancialLock();
      if (lock.filesModified === 0 && lock.schemaChanged === 0 && lock.balanceChanged === 0) {
        results.push({
          id: 'sys-fin-lock-01',
          name: 'FINANCE-LOCK: /src/domain/finance Intacto e Congelado (FINANCIAL_FILES_MODIFIED = 0)',
          passed: true,
          message: 'Sucesso: Diretório financeiro inalterado. Nenhuma mutação de saldo ou schema.',
        });
      } else {
        results.push({
          id: 'sys-fin-lock-01',
          name: 'FINANCE-LOCK: Trava do Núcleo Financeiro',
          passed: false,
          message: 'Falha: Mutação detectada no núcleo financeiro congelado.',
        });
      }
    } catch (err: any) {
      results.push({
        id: 'sys-fin-lock-01',
        name: 'FINANCE-LOCK: Trava do Núcleo Financeiro',
        passed: false,
        message: err.message || 'Exceção ao verificar trava financeira',
      });
    }

    // 2. Run Adversarial Suite (SYS-01 to SYS-20)
    try {
      const advResults = await service.runAdversarialSuite(companyId);
      for (const adv of advResults) {
        results.push({
          id: `sys-adv-${adv.code.toLowerCase()}`,
          name: `ADVERSARIAL [${adv.code}]: ${adv.description}`,
          passed: adv.passed,
          message: adv.details,
        });
      }
    } catch (err: any) {
      results.push({
        id: 'sys-adv-runner-err',
        name: 'ADVERSARIAL: Suíte de Testes Adversariais',
        passed: false,
        message: err.message || 'Erro na suíte adversarial',
      });
    }

    // 3. System Integrity & Homologation Matrix Check
    try {
      const report = await service.generateIntegrityReport(companyId);
      const isHomologated = report.matrixStatus.fase354Status === 'HOMOLOGADO' && report.matrixStatus.p0Count === 0 && report.matrixStatus.p1Count === 0;

      results.push({
        id: 'sys-homologation-matrix',
        name: 'HOMOLOGAÇÃO [3.54]: Matriz Final de Auditoria Transversal & Prontidão Sistêmica',
        passed: isHomologated,
        message: `Status: ${report.matrixStatus.fase354Status}. Achados P0: ${report.matrixStatus.p0Count}, P1: ${report.matrixStatus.p1Count}, P2: ${report.matrixStatus.p2Count}, P3: ${report.matrixStatus.p3Count}. Pronto para Produção: ${report.matrixStatus.readyForNextPhase}`,
      });
    } catch (err: any) {
      results.push({
        id: 'sys-homologation-matrix',
        name: 'HOMOLOGAÇÃO [3.54]: Matriz Final de Auditoria Transversal',
        passed: false,
        message: err.message || 'Erro ao validar matriz de homologação',
      });
    }

    const passedCount = results.filter((r) => r.passed).length;
    const totalCount = results.length;
    const failedCount = totalCount - passedCount;

    return {
      passed: passedCount,
      total: totalCount,
      failed: failedCount,
      results,
    };
  }
}

export const runSystemIntegrityTests = async (companyId = 'company-main-uuid') => {
  return await SystemIntegrityTestRunner.runAllTests(companyId);
};
