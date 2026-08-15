import { ContractService } from '../ContractService';
import { FinanceEngine } from '../../finance/FinanceEngine';
import { seedAutoERPTestData } from '../../../persistence/seed/seedData';
import {
  ContractRepository,
  VehicleRepository,
  DriverRepository,
  AccountReceivableRepository,
  AuditLogRepository,
  SecurityDepositRepository,
} from '../../../persistence/repositories/localRepositories';
import {
  ContractStatus,
  VehicleStatus,
  DriverStatus,
  RecurringFrequency,
  OriginType,
  AuditAction,
} from '../../../types/enums';
import { generateUUID } from '../../../shared/utils/uuid';

export interface ContractTestResultItem {
  id: string | number;
  name: string;
  passed: boolean;
  message: string;
  details?: unknown;
}

export class ContractTestRunner {
  public static async runAllTests(): Promise<{
    total: number;
    passed: number;
    failed: number;
    results: ContractTestResultItem[];
  }> {
    await seedAutoERPTestData(true);

    const companyId = 'company-main-uuid';
    const userId = 'usr-admin';
    const userName = 'Admin Tester';

    const contractService = new ContractService();
    const contractRepo = new ContractRepository();
    const vehicleRepo = new VehicleRepository();
    const driverRepo = new DriverRepository();
    const receivableRepo = new AccountReceivableRepository();
    const auditRepo = new AuditLogRepository();
    const depositRepo = new SecurityDepositRepository();

    const results: ContractTestResultItem[] = [];

    const test = async (
      id: string | number,
      name: string,
      fn: () => Promise<{ passed: boolean; message: string; details?: unknown }>
    ) => {
      try {
        const res = await fn();
        results.push({ id, name, passed: res.passed, message: res.message, details: res.details });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ id, name, passed: false, message: `Exceção: ${msg}` });
      }
    };

    let testContractId = '';
    let testVehicleId = 'veh-1';
    let testDriverId = 'drv-1';

    // CT01: Criar contrato DRAFT
    await test('CT01', 'CT01. Criar contrato DRAFT', async () => {
      const created = await contractService.createContract({
        companyId,
        vehicleId: testVehicleId,
        driverId: testDriverId,
        startDate: '2026-09-01',
        rentalAmount: 750,
        billingPeriodicity: RecurringFrequency.WEEKLY,
        securityDepositAmount: 1200,
        status: ContractStatus.DRAFT,
        userId,
        userName,
      });

      if (created && created.status === ContractStatus.DRAFT) {
        testContractId = created.id;
        return { passed: true, message: `Contrato DRAFT criado com sucesso (${created.contractNumber})`, details: created };
      }
      return { passed: false, message: 'Falha ao criar contrato DRAFT' };
    });

    // CT02: Validar contrato sem veículo
    await test('CT02', 'CT02. Validar contrato sem veículo', async () => {
      try {
        await contractService.createContract({
          companyId,
          vehicleId: '',
          driverId: testDriverId,
          startDate: '2026-09-01',
          rentalAmount: 700,
          billingPeriodicity: RecurringFrequency.WEEKLY,
          securityDepositAmount: 1000,
          userId,
          userName,
        });
        return { passed: false, message: 'Permitiu criar contrato sem veículo!' };
      } catch (err: any) {
        return { passed: true, message: `Bloqueado corretamente: ${err.message}` };
      }
    });

    // CT03: Validar contrato sem motorista
    await test('CT03', 'CT03. Validar contrato sem motorista', async () => {
      try {
        await contractService.createContract({
          companyId,
          vehicleId: testVehicleId,
          driverId: '',
          startDate: '2026-09-01',
          rentalAmount: 700,
          billingPeriodicity: RecurringFrequency.WEEKLY,
          securityDepositAmount: 1000,
          userId,
          userName,
        });
        return { passed: false, message: 'Permitiu criar contrato sem motorista!' };
      } catch (err: any) {
        return { passed: true, message: `Bloqueado corretamente: ${err.message}` };
      }
    });

    // CT04: Impedir contrato com veículo inexistente ao ativar
    await test('CT04', 'CT04. Impedir contrato com veículo inexistente ao ativar', async () => {
      const draft = await contractRepo.create({
        id: generateUUID(),
        companyId,
        contractNumber: 'CNT-INVALID-VEH',
        vehicleId: 'veh-inexistent-uuid',
        driverId: testDriverId,
        startDate: '2026-09-01',
        status: ContractStatus.DRAFT,
        rentalAmount: 800,
        billingPeriodicity: RecurringFrequency.WEEKLY,
        securityDepositAmount: 1000,
        franchiseKm: 1500,
        excessKmRate: 0.5,
        isArchived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      try {
        await contractService.activateContract({
          companyId,
          contractId: draft.id,
          userId,
          userName,
        });
        return { passed: false, message: 'Permitiu ativar contrato com veículo inexistente!' };
      } catch (err: any) {
        return { passed: true, message: `Bloqueado corretamente: ${err.message}` };
      }
    });

    // CT05: Impedir contrato com motorista inexistente ao ativar
    await test('CT05', 'CT05. Impedir contrato com motorista inexistente ao ativar', async () => {
      const draft = await contractRepo.create({
        id: generateUUID(),
        companyId,
        contractNumber: 'CNT-INVALID-DRV',
        vehicleId: testVehicleId,
        driverId: 'drv-inexistent-uuid',
        startDate: '2026-09-01',
        status: ContractStatus.DRAFT,
        rentalAmount: 800,
        billingPeriodicity: RecurringFrequency.WEEKLY,
        securityDepositAmount: 1000,
        franchiseKm: 1500,
        excessKmRate: 0.5,
        isArchived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      try {
        await contractService.activateContract({
          companyId,
          contractId: draft.id,
          userId,
          userName,
        });
        return { passed: false, message: 'Permitiu ativar contrato com motorista inexistente!' };
      } catch (err: any) {
        return { passed: true, message: `Bloqueado corretamente: ${err.message}` };
      }
    });

    // CT06: Impedir conflito de veículo (2 contratos ACTIVE no mesmo período)
    await test('CT06', 'CT06. Impedir conflito de veículo em contratos ativos simultâneos', async () => {
      // Criar e ativar primeiro contrato
      const c1 = await contractService.createContract({
        companyId,
        vehicleId: 'veh-2',
        driverId: 'drv-2',
        startDate: '2026-10-01',
        endDate: '2026-12-31',
        rentalAmount: 800,
        billingPeriodicity: RecurringFrequency.WEEKLY,
        securityDepositAmount: 1000,
        userId,
        userName,
      });
      await contractService.activateContract({
        companyId,
        contractId: c1.id,
        userId,
        userName,
      });

      // Tentar ativar segundo contrato para o mesmo veículo no mesmo período
      const c2 = await contractService.createContract({
        companyId,
        vehicleId: 'veh-2',
        driverId: 'drv-3',
        startDate: '2026-10-15',
        endDate: '2026-11-15',
        rentalAmount: 850,
        billingPeriodicity: RecurringFrequency.WEEKLY,
        securityDepositAmount: 1000,
        userId,
        userName,
      });

      try {
        await contractService.activateContract({
          companyId,
          contractId: c2.id,
          userId,
          userName,
        });
        return { passed: false, message: 'Permitiu ativar contrato conflitante no mesmo veículo!' };
      } catch (err: any) {
        return { passed: true, message: `Conflito de veículo bloqueado com sucesso: ${err.message}` };
      }
    });

    // CT07: Ativar contrato válido
    await test('CT07', 'CT07. Ativar contrato válido', async () => {
      const activated = await contractService.activateContract({
        companyId,
        contractId: testContractId,
        userId,
        userName,
      });

      if (activated && activated.status === ContractStatus.ACTIVE) {
        return { passed: true, message: 'Contrato ativado com sucesso!', details: activated };
      }
      return { passed: false, message: 'Falha ao ativar contrato' };
    });

    // CT08: DRAFT não gera recebível
    await test('CT08', 'CT08. DRAFT não gera recebível automático', async () => {
      const draft = await contractService.createContract({
        companyId,
        vehicleId: 'veh-3',
        driverId: 'drv-3',
        startDate: '2026-09-10',
        rentalAmount: 600,
        billingPeriodicity: RecurringFrequency.WEEKLY,
        securityDepositAmount: 800,
        status: ContractStatus.DRAFT,
        userId,
        userName,
      });

      const recs = await receivableRepo.findByContractId(draft.id);
      if (recs.length === 0) {
        return { passed: true, message: 'Garantido: Contrato DRAFT não gerou recebíveis.' };
      }
      return { passed: false, message: 'Contrato DRAFT gerou recebíveis indevidamente!' };
    });

    // CT09: AWAITING_SIGNATURE não gera recebível
    await test('CT09', 'CT09. AWAITING_SIGNATURE não gera recebível automático', async () => {
      const awaiting = await contractService.createContract({
        companyId,
        vehicleId: 'veh-3',
        driverId: 'drv-3',
        startDate: '2026-09-15',
        rentalAmount: 600,
        billingPeriodicity: RecurringFrequency.WEEKLY,
        securityDepositAmount: 800,
        status: ContractStatus.AWAITING_SIGNATURE,
        userId,
        userName,
      });

      const recs = await receivableRepo.findByContractId(awaiting.id);
      if (recs.length === 0) {
        return { passed: true, message: 'Garantido: Contrato AWAITING_SIGNATURE não gerou recebíveis.' };
      }
      return { passed: false, message: 'Contrato AWAITING_SIGNATURE gerou recebíveis indevidamente!' };
    });

    // CT10: ACTIVE gera cobrança
    await test('CT10', 'CT10. ACTIVE gera cobrança via FinanceEngine', async () => {
      const recs = await receivableRepo.findByContractId(testContractId);
      if (recs.length > 0 && recs[0].originalAmount === 750) {
        return { passed: true, message: `Cobrança de aluguel atrelada ao contrato criada via FinanceEngine. (ID: ${recs[0].id})`, details: recs[0] };
      }
      return { passed: false, message: 'Nenhuma cobrança encontrada para o contrato ativado' };
    });

    // CT11: Geração recorrente idempotente
    await test('CT11', 'CT11. Geração de cobrança recorrente idempotente', async () => {
      const createdRecs = await contractService.processContractRecurring(
        testContractId,
        '2026-09-08',
        userId,
        userName
      );

      if (createdRecs.length > 0) {
        return { passed: true, message: 'Cobrança de competência recorrente gerada com chave de idempotência.', details: createdRecs[0] };
      }
      return { passed: false, message: 'Falha ao processar faturamento recorrente' };
    });

    // CT12: Executar recorrência duas vezes sem duplicidade
    await test('CT12', 'CT12. Executar faturamento recorrente duas vezes sem duplicidade', async () => {
      // Primeira execução
      await contractService.processContractRecurring(testContractId, '2026-09-15', userId, userName);
      const countBefore = (await receivableRepo.findByContractId(testContractId)).length;

      // Segunda execução com a mesma data de vencimento
      await contractService.processContractRecurring(testContractId, '2026-09-15', userId, userName);
      const countAfter = (await receivableRepo.findByContractId(testContractId)).length;

      if (countBefore === countAfter) {
        return { passed: true, message: `Idempotência confirmada: Mantida contagem de ${countAfter} recebíveis sem duplicatas.` };
      }
      return { passed: false, message: `Duplicidade detectada! Antes: ${countBefore}, Depois: ${countAfter}` };
    });

    // CT13: CLOSED impede novas cobranças
    await test('CT13', 'CT13. CLOSED impede geração de novas cobranças recorrentes', async () => {
      const tempC = await contractService.createContract({
        companyId,
        vehicleId: 'veh-3',
        driverId: 'drv-3',
        startDate: '2026-09-01',
        rentalAmount: 500,
        billingPeriodicity: RecurringFrequency.WEEKLY,
        securityDepositAmount: 500,
        status: ContractStatus.CLOSED,
        userId,
        userName,
      });

      try {
        await contractService.processContractRecurring(tempC.id, '2026-09-20', userId, userName);
        return { passed: false, message: 'Permitiu faturar contrato CLOSED!' };
      } catch (err: any) {
        return { passed: true, message: `Faturamento de contrato encerrado bloqueado: ${err.message}` };
      }
    });

    // CT14: Cancelar contrato preservando histórico
    await test('CT14', 'CT14. Cancelar contrato preservando histórico financeiro', async () => {
      const cCancel = await contractService.createContract({
        companyId,
        vehicleId: 'veh-3',
        driverId: 'drv-3',
        startDate: '2026-09-01',
        rentalAmount: 650,
        billingPeriodicity: RecurringFrequency.WEEKLY,
        securityDepositAmount: 1000,
        status: ContractStatus.ACTIVE,
        userId,
        userName,
      });

      const recsBefore = await receivableRepo.findByContractId(cCancel.id);

      const cancelled = await contractService.cancelContract(cCancel.id, 'Cancelamento operacional', userId, userName);

      const recsAfter = await receivableRepo.findByContractId(cCancel.id);

      if (cancelled.status === ContractStatus.CANCELLED && recsBefore.length === recsAfter.length) {
        return { passed: true, message: 'Contrato cancelado com sucesso e histórico de recebíveis preservado.', details: cancelled };
      }
      return { passed: false, message: 'Falha no cancelamento do contrato' };
    });

    // CT15: Registrar AuditLog
    await test('CT15', 'CT15. Registrar AuditLog nas ações do contrato', async () => {
      const allLogs = await auditRepo.findAll();
      const logs = allLogs.filter((l) => l.entityId === testContractId || (l.entityName === 'Contract' && l.entityId === testContractId));

      if (logs.length >= 2) {
        return { passed: true, message: `Rastreabilidade confirmada com ${logs.length} registros no AuditLog.`, details: logs };
      }
      return { passed: false, message: 'Logs de auditoria insuficientes para o contrato' };
    });

    // CT16: Receber caução
    await test('CT16', 'CT16. Receber caução do contrato via DepositService / FinanceEngine', async () => {
      const depositRes = await FinanceEngine.receiveSecurityDeposit(
        companyId,
        testContractId,
        testDriverId,
        testVehicleId,
        1200,
        'acc-nubank-1',
        'pm-pix',
        userId,
        userName
      );

      if (depositRes.deposit && depositRes.deposit.receivedAmount === 1200) {
        return { passed: true, message: 'Caução recebida e atrelada ao contrato e motorista.', details: depositRes.deposit };
      }
      return { passed: false, message: 'Falha ao registrar recebimento de caução' };
    });

    // CT17: Integrar contrato ao motorista
    await test('CT17', 'CT17. Integrar contrato ao cadastro do motorista', async () => {
      const driver = await driverRepo.findById(testDriverId);
      if (driver && driver.currentContractId === testContractId && driver.currentVehicleId === testVehicleId) {
        return { passed: true, message: 'Vínculos de contrato e veículo refletidos no motorista com sucesso.', details: driver };
      }
      return { passed: false, message: 'Vínculos do motorista desalinhados' };
    });

    // CT18: Integrar contrato ao veículo
    await test('CT18', 'CT18. Integrar contrato e alterar status do veículo para RENTED', async () => {
      const vehicle = await vehicleRepo.findById(testVehicleId);
      if (vehicle && vehicle.status === VehicleStatus.RENTED && vehicle.currentContractId === testContractId) {
        return { passed: true, message: 'Veículo devidamente atualizado para RENTED com vínculo ao contrato.', details: vehicle };
      }
      return { passed: false, message: 'Status do veículo desalinhado' };
    });

    // CT19: Encerrar contrato
    await test('CT19', 'CT19. Encerrar contrato (CLOSED) e liberar veículo para AVAILABLE', async () => {
      const closed = await contractService.closeContract({
        companyId,
        contractId: testContractId,
        closeDate: '2026-09-30',
        userId,
        userName,
      });

      const vehicle = await vehicleRepo.findById(testVehicleId);

      if (closed.status === ContractStatus.CLOSED && vehicle?.status === VehicleStatus.AVAILABLE) {
        return { passed: true, message: 'Contrato encerrado e veículo liberado como AVAILABLE.', details: closed };
      }
      return { passed: false, message: 'Falha ao encerrar contrato ou liberar veículo' };
    });

    // CT20: Renovar contrato
    await test('CT20', 'CT20. Renovar contrato preservando histórico', async () => {
      // Re-ativar um contrato para testar renovação
      const cOld = await contractService.createContract({
        companyId,
        vehicleId: 'veh-3',
        driverId: 'drv-3',
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        rentalAmount: 700,
        billingPeriodicity: RecurringFrequency.WEEKLY,
        securityDepositAmount: 1000,
        status: ContractStatus.ACTIVE,
        userId,
        userName,
      });

      const renewRes = await contractService.renewContract({
        companyId,
        oldContractId: cOld.id,
        newStartDate: '2026-09-01',
        newEndDate: '2026-12-31',
        rentalAmount: 750,
        activateImmediately: true,
        userId,
        userName,
      });

      if (
        renewRes.oldContract.status === ContractStatus.CLOSED &&
        renewRes.newContract.status === ContractStatus.ACTIVE &&
        renewRes.newContract.rentalAmount === 750
      ) {
        return { passed: true, message: 'Renovação concluída: Contrato antigo fechado e novo contrato ativo gerado com sucesso.', details: renewRes };
      }
      return { passed: false, message: 'Falha ao renovar contrato' };
    });

    const passedCount = results.filter((r) => r.passed).length;
    const failedCount = results.filter((r) => !r.passed).length;

    return {
      total: results.length,
      passed: passedCount,
      failed: failedCount,
      results,
    };
  }
}
