import { FleetComplianceService } from '../FleetComplianceService';
import {
  VehicleDocumentRepository,
  InsuranceRepository,
  TrackerRepository,
  AccountPayableRepository,
  AuditLogRepository,
} from '../../../persistence/repositories/localRepositories';
import { seedAutoERPTestData } from '../../../persistence/seed/seedData';
import { DocumentStatus } from '../../../types/enums';

export interface ComplianceTestResult {
  id: string;
  name: string;
  passed: boolean;
  message: string;
}

export class ComplianceTestRunner {
  public static async runAllTests(): Promise<{
    total: number;
    passed: number;
    failed: number;
    results: ComplianceTestResult[];
  }> {
    await seedAutoERPTestData(true);

    const results: ComplianceTestResult[] = [];
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

    // C01: Criar documento de veículo válido (CRLV)
    await test('C01', 'Criar documento de veículo válido (CRLV)', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 90);
      const expirationDate = futureDate.toISOString().split('T')[0];

      const doc = await FleetComplianceService.createDocument({
        companyId,
        vehicleId,
        documentType: 'CRLV',
        documentNumber: 'CRLV-999888',
        issueDate: '2026-01-10',
        expirationDate,
        cost: 150.0,
        notes: 'CRLV anual emitido com sucesso',
        generatePayable: true,
        userId,
        userName,
      });

      if (!doc.id || doc.status !== DocumentStatus.VALID) {
        throw new Error('Documento CRLV não criado corretamente ou status inválido.');
      }
    });

    // C02: Criar documento próximo do vencimento (IPVA)
    await test('C02', 'Criar documento próximo do vencimento (IPVA)', async () => {
      const nearDate = new Date();
      nearDate.setDate(nearDate.getDate() + 10);
      const expirationDate = nearDate.toISOString().split('T')[0];

      const doc = await FleetComplianceService.createDocument({
        companyId,
        vehicleId,
        documentType: 'IPVA',
        documentNumber: 'IPVA-2026',
        expirationDate,
        cost: 2500.0,
        generatePayable: true,
        userId,
        userName,
      });

      if (doc.status !== DocumentStatus.EXPIRING_SOON) {
        throw new Error('Status do documento IPVA deveria ser EXPIRING_SOON.');
      }
    });

    // C03: Criar apólice de seguro
    await test('C03', 'Criar apólice de seguro de veículo', async () => {
      const insurance = await FleetComplianceService.createInsurance({
        companyId,
        vehicleId,
        insuranceCompany: 'Porto Seguro S.A.',
        policyNumber: 'POL-77788899',
        coverageDetails: 'Cobertura Completa (Roubo, Furto, Colisão, Terceiros)',
        deductibleAmount: 3500.0,
        totalPremiumAmount: 4200.0,
        installmentsCount: 4,
        startDate: '2026-01-15',
        endDate: '2027-01-15',
        brokerName: 'Corretora Master',
        generatePayable: true,
        userId,
        userName,
      });

      if (!insurance.id || insurance.policyNumber !== 'POL-77788899') {
        throw new Error('Apólice de seguro não criada corretamente.');
      }
    });

    // C04: Criar rastreador e testar substituição com preservação de histórico
    await test('C04', 'Criar rastreador e testar substituição', async () => {
      const tracker1 = await FleetComplianceService.createTracker({
        companyId,
        vehicleId,
        equipmentModel: 'Concox GT06',
        imei: '864215039911223',
        chipCarrier: 'Vivo M2M',
        chipNumber: '11988887777',
        monthlyCost: 65.0,
        installationDate: '2025-01-01',
        userId,
        userName,
      });

      if (tracker1.status !== 'ACTIVE') {
        throw new Error('Rastreador inicial deveria estar ativo.');
      }

      // Novo rastreador para substituir o anterior
      const tracker2 = await FleetComplianceService.createTracker({
        companyId,
        vehicleId,
        equipmentModel: 'Suntech ST310',
        imei: '864215039933445',
        chipCarrier: 'Claro IoT',
        chipNumber: '11977776666',
        monthlyCost: 75.0,
        installationDate: '2026-06-01',
        userId,
        userName,
      });

      if (tracker2.status !== 'ACTIVE') {
        throw new Error('Novo rastreador deveria estar ativo.');
      }

      const trackerRepo = new TrackerRepository();
      const allTrackers = await trackerRepo.findAll({ vehicleId });
      const oldTracker = allTrackers.find((t) => t.id === tracker1.id);

      if (!oldTracker || oldTracker.status !== 'REMOVED') {
        throw new Error('Rastreador anterior não foi marcado como REMOVED (histórico não preservado).');
      }
    });

    // C05: Verificar integração com Contas a Pagar (Payables)
    await test('C05', 'Verificar geração de Contas a Pagar na criação de obrigações', async () => {
      const payableRepo = new AccountPayableRepository();
      const payables = await payableRepo.findByVehicleId(vehicleId);

      if (payables.length === 0) {
        throw new Error('Nenhuma conta a pagar gerada a partir dos documentos/seguros do veículo.');
      }
    });

    // C06: Verificar AuditLog de conformidade
    await test('C06', 'Verificar registro de Auditoria (AuditLog)', async () => {
      const auditRepo = new AuditLogRepository();
      const logs = await auditRepo.findAll();
      const docLogs = logs.filter((l) => l.entityName === 'VehicleDocument' || l.entityName === 'Insurance');

      if (docLogs.length === 0) {
        throw new Error('AuditLog não registrou operações de documentos ou seguros.');
      }
    });

    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;

    return {
      total: results.length,
      passed,
      failed,
      results,
    };
  }
}
