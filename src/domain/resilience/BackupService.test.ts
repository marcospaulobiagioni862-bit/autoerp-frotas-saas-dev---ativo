import { BackupService, BackupRecord } from './BackupService';

export class BackupServiceTestRunner {
  public static async runAllTests(): Promise<{ total: number; passed: number; failed: number; results: any[] }> {
    const results: any[] = [];

    // Test 1: Create backup & checksum
    try {
      const companyId = 'test-company-resilience';
      const bkp = await BackupService.createBackup(companyId, 'user-admin', 'MANUAL', 'corr-test-1');
      const isValid = bkp && bkp.id && bkp.checksum.startsWith('sha256-chk-') && bkp.recordCount >= 0;

      results.push({
        id: 'res-01',
        name: 'Backup Creation & Checksum Generation',
        passed: isValid,
        message: isValid ? `Backup criado com sucesso. Checksum: ${bkp.checksum}` : 'Falha na criação ou checksum'
      });
    } catch (err: any) {
      results.push({
        id: 'res-01',
        name: 'Backup Creation & Checksum Generation',
        passed: false,
        message: `Erro: ${err?.message || err}`
      });
    }

    // Test 2: Validation of backup
    try {
      const companyId = 'test-company-resilience';
      const backups = BackupService.listBackups(companyId);
      const bkp = backups[0];
      const validation = await BackupService.validateBackup(bkp);

      results.push({
        id: 'res-02',
        name: 'Backup Integrity Validation & Checksum Verification',
        passed: validation.isValid,
        message: validation.isValid ? 'Validação de integridade aprovada com sucesso' : `Erros: ${validation.errors.join(', ')}`
      });
    } catch (err: any) {
      results.push({
        id: 'res-02',
        name: 'Backup Integrity Validation & Checksum Verification',
        passed: false,
        message: `Erro: ${err?.message || err}`
      });
    }

    // Test 3: Cross-tenant security block
    try {
      const companyId = 'test-company-resilience';
      const backups = BackupService.listBackups(companyId);
      const bkp = backups[0];
      const restoreResult = await BackupService.restoreBackup(bkp.id, 'malicious-other-tenant', 'user-admin', 'corr-test-cross');

      const blocked = !restoreResult.success && restoreResult.message.includes('Cross-tenant');

      results.push({
        id: 'res-03',
        name: 'Multi-Tenant Security Isolation on Restore',
        passed: blocked,
        message: blocked ? 'Tentativa cross-tenant bloqueada com sucesso' : 'Falha no isolamento multi-tenant'
      });
    } catch (err: any) {
      results.push({
        id: 'res-03',
        name: 'Multi-Tenant Security Isolation on Restore',
        passed: false,
        message: `Erro: ${err?.message || err}`
      });
    }

    const passed = results.filter(r => r.passed).length;
    return {
      total: results.length,
      passed,
      failed: results.length - passed,
      results
    };
  }
}
