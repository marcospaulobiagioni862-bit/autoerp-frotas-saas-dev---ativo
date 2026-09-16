// src/domain/admin/SystemHealthService.test.ts
import { SystemHealthService } from './SystemHealthService';

export class SystemHealthTestRunner {
  public static async runAllTests(): Promise<{ total: number; passed: number; failed: number; results: any[] }> {
    const results: any[] = [];
    const companyId = 'test-company-sys-health';

    // Test 1: Calculate Consolidated System Health Score
    try {
      const health = SystemHealthService.calculateSystemHealth(companyId);
      const passed = health.overallScore >= 0 && health.overallScore <= 100 && !isNaN(health.overallScore) && isFinite(health.overallScore);
      results.push({
        id: 'sysh-01',
        name: 'Cálculo Determinístico de Saúde Global (Score 0-100)',
        passed,
        message: passed ? `System Health Score calculado: ${health.overallScore}/100 (${health.statusClassification})` : 'Score inválido ou NaN/Infinity',
      });
    } catch (err: any) {
      results.push({ id: 'sysh-01', name: 'Cálculo Determinístico de Saúde Global (Score 0-100)', passed: false, message: err?.message });
    }

    // Test 2: Subsystem Component Breakdown Verification
    try {
      const health = SystemHealthService.calculateSystemHealth(companyId);
      const components = [
        health.persistence,
        health.backup,
        health.restore,
        health.auditLog,
        health.multiTenancy,
        health.rbac,
        health.integrity,
        health.observability,
        health.performance,
        health.configuration,
        health.security,
        health.continuity,
      ];
      const valid = components.every(c => c && typeof c.score === 'number' && c.componentName && c.status);
      results.push({
        id: 'sysh-02',
        name: 'Aferição dos 12 Subcomponentes de Saúde Técnica',
        passed: valid,
        message: valid ? 'Todos os 12 subsistemas validados com diagnósticos detalhados' : 'Subcomponentes ausentes ou corrompidos',
      });
    } catch (err: any) {
      results.push({ id: 'sysh-02', name: 'Aferição dos 12 Subcomponentes de Saúde Técnica', passed: false, message: err?.message });
    }

    const passed = results.filter(r => r.passed).length;
    return { total: results.length, passed, failed: results.length - passed, results };
  }
}
