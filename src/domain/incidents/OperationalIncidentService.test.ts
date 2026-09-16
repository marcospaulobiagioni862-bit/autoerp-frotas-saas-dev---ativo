import { generateOperationalIncidentSummary, validateIncidentStateTransition, OperationalIncident } from './OperationalIncidentService';
import { Vehicle, Contract, Driver } from '../../types/entities';
import { VehicleStatus, ContractStatus, DriverStatus } from '../../types/enums';

export interface IncidentTestResult {
  id: string;
  name: string;
  passed: boolean;
  message: string;
}

export class OperationalIncidentTestRunner {
  public static async runAllTests(): Promise<{
    total: number;
    passed: number;
    failed: number;
    results: IncidentTestResult[];
  }> {
    const results: IncidentTestResult[] = [];

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

    test('INC01', 'State machine valid transitions', () => {
      if (!validateIncidentStateTransition('OPEN', 'IN_PROGRESS')) throw new Error('OPEN -> IN_PROGRESS should be valid');
      if (!validateIncidentStateTransition('IN_PROGRESS', 'RESOLVED')) throw new Error('IN_PROGRESS -> RESOLVED should be valid');
      if (!validateIncidentStateTransition('RESOLVED', 'CLOSED')) throw new Error('RESOLVED -> CLOSED should be valid');
    });

    test('INC02', 'State machine invalid transitions', () => {
      if (validateIncidentStateTransition('CLOSED', 'OPEN')) throw new Error('CLOSED -> OPEN without audit should be invalid');
      if (validateIncidentStateTransition('CANCELLED', 'RESOLVED')) throw new Error('CANCELLED -> RESOLVED should be invalid');
    });

    test('INC03', 'Empty input safety & NaN protection', () => {
      const summary = generateOperationalIncidentSummary({ companyId: companyA });
      if (isNaN(summary.counts.total) || !isFinite(summary.counts.total)) {
        throw new Error('NaN or Infinity detected in incident summary counts');
      }
    });

    test('INC04', 'Multi-Tenancy Isolation', () => {
      const incA: OperationalIncident = {
        id: 'inc-A1',
        companyId: companyA,
        type: 'TEST',
        category: 'OPERATIONAL',
        priority: 'P1',
        status: 'OPEN',
        title: 'Incidente A',
        description: 'Teste Tenant A',
        createdAt: '2026-08-01',
        updatedAt: '2026-08-01',
        recurrenceCount: 0,
        isRecurring: false,
        slaStatus: 'ON_TIME',
        actions: [],
      };

      const incB: OperationalIncident = {
        id: 'inc-B1',
        companyId: companyB,
        type: 'TEST',
        category: 'OPERATIONAL',
        priority: 'P1',
        status: 'OPEN',
        title: 'Incidente B',
        description: 'Teste Tenant B',
        createdAt: '2026-08-01',
        updatedAt: '2026-08-01',
        recurrenceCount: 0,
        isRecurring: false,
        slaStatus: 'ON_TIME',
        actions: [],
      };

      const summary = generateOperationalIncidentSummary({
        companyId: companyA,
        incidents: [incA, incB],
      });

      if (summary.incidents.some(i => i.companyId !== companyA)) {
        throw new Error('Multi-Tenancy isolation failed: found incident from company B in company A summary');
      }
    });

    test('INC05', 'Adversarial Cross-Tenant Injection', () => {
      const maliciousInc: OperationalIncident = {
        id: 'inc-malicious',
        companyId: companyB, // belongs to company B
        type: 'SECURITY',
        category: 'OPERATIONAL',
        priority: 'P0',
        status: 'OPEN',
        title: 'Malicious',
        description: 'Cross tenant attempt',
        createdAt: '2026-08-01',
        updatedAt: '2026-08-01',
        recurrenceCount: 0,
        isRecurring: false,
        slaStatus: 'ON_TIME',
        actions: [],
      };

      const summary = generateOperationalIncidentSummary({
        companyId: companyA,
        incidents: [maliciousInc],
      });

      if (summary.incidents.find(i => i.id === 'inc-malicious')) {
        throw new Error('Security vulnerability: Cross-tenant incident was not filtered out');
      }
    });

    const total = results.length;
    const passed = results.filter(r => r.passed).length;
    const failed = total - passed;

    return { total, passed, failed, results };
  }
}
