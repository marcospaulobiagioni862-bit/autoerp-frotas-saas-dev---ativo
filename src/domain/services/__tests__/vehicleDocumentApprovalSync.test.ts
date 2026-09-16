if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size; },
  };
}

import { FleetComplianceService } from '../FleetComplianceService';
import { DocumentStatus } from '../../../types/enums';
import { seedAutoERPTestData } from '../../../persistence/seed/seedData';

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  message: string;
}

export class VehicleDocumentApprovalSyncTestRunner {
  public static async runAllTests(): Promise<{
    total: number;
    passed: number;
    failed: number;
    results: TestResult[];
  }> {
    await seedAutoERPTestData(true);

    const results: TestResult[] = [];
    const companyId = 'company-main-uuid';
    const userId = 'usr-admin';
    const userName = 'Admin Tester';
    const vehicleId = 'veh-corolla-1';

    const test = async (id: string, name: string, fn: () => Promise<void>) => {
      try {
        await fn();
        results.push({ id, name, passed: true, message: 'Sucesso' });
      } catch (err: any) {
        results.push({ id, name, passed: false, message: err.message || String(err) });
      }
    };

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 90);
    const expirationDate = futureDate.toISOString().split('T')[0];

    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 30);
    const pastExpirationDate = pastDate.toISOString().split('T')[0];

    // T01: Documento manual completo -> Válido (Aprovado sem 2ª revisão)
    await test('T01', 'Documento manual completo é salvo diretamente como Válido sem segunda revisão', async () => {
      const doc = await FleetComplianceService.createDocument({
        companyId,
        vehicleId,
        documentType: 'CRLV',
        documentNumber: 'CRLV-MANUAL-1001',
        expirationDate,
        cost: 0,
        userId,
        userName,
      });

      if (!doc.id || doc.status !== DocumentStatus.VALID) {
        throw new Error(`Documento manual completo deveria receber status VALID (recebeu: ${doc.status})`);
      }
    });

    // T02: Documento manual incompleto -> Falha na validação de campos obrigatórios
    await test('T02', 'Documento manual sem vencimento ou veículo é rejeitado com erro descritivo', async () => {
      try {
        await FleetComplianceService.createDocument({
          companyId,
          vehicleId: '',
          documentType: 'CRLV',
          documentNumber: 'CRLV-INC-001',
          expirationDate: '',
          userId,
          userName,
        });
        throw new Error('Deveria ter falhado por falta de campos obrigatórios');
      } catch (err: any) {
        if (!err.message.includes('Veículo') && !err.message.includes('vencimento')) {
          throw err;
        }
      }
    });

    // T03: Documento concluído por IA -> Válido (Aprovado)
    await test('T03', 'Documento com leitura concluída por IA recebe status Válido', async () => {
      const doc = await FleetComplianceService.createDocument({
        companyId,
        vehicleId,
        documentType: 'CRLV',
        documentNumber: 'CRLV-IA-AUTO',
        expirationDate,
        notes: 'Documento lido e aprovado por IA',
        userId,
        userName,
      });

      if (doc.status !== DocumentStatus.VALID) {
        throw new Error('Leitura concluída por IA deve gerar documento status VALID');
      }
    });

    // T04: Compliance trata "Em dia" e "Regular" como válidos
    await test('T04', 'Compliance calcula status Válido para vencimento futuro independentemente de "Em dia" ou "Regular"', async () => {
      const statusEmDia = FleetComplianceService.calculateDocumentStatus(expirationDate);
      const isOkEmDia = FleetComplianceService.isCrlvSituationValid('Em dia', expirationDate);
      const isOkRegular = FleetComplianceService.isCrlvSituationValid('Regular', expirationDate);

      if (statusEmDia !== DocumentStatus.VALID || !isOkEmDia || !isOkRegular) {
        throw new Error('Compliance deve aceitar tanto Em dia quanto Regular como válidos.');
      }
    });

    // T05: Contrato é liberado com CRLV Válido
    await test('T05', 'Contrato aceita veículo quando CRLV está Válido e Em dia', async () => {
      const isValid = FleetComplianceService.isCrlvSituationValid('Em dia', expirationDate);
      if (!isValid) {
        throw new Error('CRLV com vencimento futuro e Em dia deve liberar o contrato.');
      }
    });

    // T06: Documento vencido continua bloqueando contrato com motivo específico
    await test('T06', 'Documento CRLV vencido retorna status EXPIRED e bloqueia contrato', async () => {
      const statusPast = FleetComplianceService.calculateDocumentStatus(pastExpirationDate);
      const isPastValid = FleetComplianceService.isCrlvSituationValid('Vencido', pastExpirationDate);

      if (statusPast !== DocumentStatus.EXPIRED || isPastValid) {
        throw new Error('CRLV vencido deve ser retornado como EXPIRED e bloquear a criação de contratos.');
      }
    });

    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;

    return { total: results.length, passed, failed, results };
  }
}

VehicleDocumentApprovalSyncTestRunner.runAllTests().then((res) => {
  console.log(`Vehicle Document Approval Sync Tests: ${res.passed}/${res.total} passed`);
  if (res.failed > 0) {
    console.error('Test Failures:', res.results.filter((r) => !r.passed));
    process.exit(1);
  }
});
