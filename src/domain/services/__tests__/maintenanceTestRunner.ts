import { MaintenanceService } from '../MaintenanceService';
import {
  WorkOrderRepository,
  SupplierRepository,
  PartRepository,
  AccountPayableRepository,
  FinancialTransactionRepository,
  FinancialAccountRepository,
  VehicleRepository,
} from '../../../persistence/repositories/localRepositories';
import { SettlementService } from '../../finance/SettlementService';
import { VehicleStatus, ObligationStatus } from '../../../types/enums';
import { generateUUID } from '../../../shared/utils/uuid';

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

export class MaintenanceTestRunner {
  public static async runAllTests(): Promise<{ total: number; passed: number; failed: number; results: TestResult[] }> {
    const results: TestResult[] = [];
    const companyId = 'company-test-uuid-' + Math.random().toString(36).substring(7);
    const userId = 'user-test-1';
    const userName = 'Test Auditor';

    const woRepo = new WorkOrderRepository();
    const supRepo = new SupplierRepository();
    const partRepo = new PartRepository();
    const payableRepo = new AccountPayableRepository();
    const txRepo = new FinancialTransactionRepository();
    const accRepo = new FinancialAccountRepository();
    const vehicleRepo = new VehicleRepository();

    // Setup dummy vehicle and account
    const vehicleId = generateUUID();
    await vehicleRepo.create({
      id: vehicleId,
      companyId,
      plate: 'TST-9999',
      brand: 'Fiat',
      model: 'Strada',
      yearFabrication: 2024,
      yearModel: 2024,
      color: 'Branco',
      renavam: '123456789',
      chassis: '9BWZZZ37Z...',
      currentKm: 10000,
      fuelType: 'Flex',
      category: 'Utilitário',
      acquisitionValue: 80000,
      currentValue: 75000,
      rentalValueBase: 150,
      status: VehicleStatus.AVAILABLE,
      isArchived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const accountId = generateUUID();
    await accRepo.create({
      id: accountId,
      companyId,
      name: 'Conta Teste Caixa',
      type: anyTypeCash(),
      initialBalance: 10000,
      currentBalance: 10000,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Test 1: Create Supplier
    let supplierId = '';
    try {
      const sup = await MaintenanceService.createSupplier({
        companyId,
        name: 'Oficina Mecânica Teste',
        document: '12345678000199',
        phone: '11999998888',
        category: 'Mecânica',
        status: 'ACTIVE',
      }, userId, userName);
      supplierId = sup.id;
      results.push({ name: 'Criação de Fornecedor (Supplier)', passed: true });
    } catch (e: any) {
      results.push({ name: 'Criação de Fornecedor (Supplier)', passed: false, error: e.message });
    }

    // Test 2: Create Part & Verify zero tx
    let partId = '';
    try {
      const part = await MaintenanceService.createPart({
        companyId,
        code: 'P-OIL-01',
        name: 'Filtro de Óleo',
        category: 'Filtros',
        unit: 'UN',
        currentCost: 45.0,
        minimumStock: 2,
        currentStock: 10,
        status: 'ACTIVE',
      }, userId, userName);
      partId = part.id;
      results.push({ name: 'Criação de Peça (Part)', passed: true });
    } catch (e: any) {
      results.push({ name: 'Criação de Peça (Part)', passed: false, error: e.message });
    }

    // Test 3: Create Work Order & Verify FinancialTransaction = 0
    let workOrderId = '';
    try {
      const txBefore = await txRepo.findAll();
      const wo = await MaintenanceService.createWorkOrder({
        companyId,
        number: 'OS-TST-001',
        vehicleId,
        supplierId,
        entryKm: 10000,
        description: 'Revisão de 10k km',
        parts: [{ partId, description: 'Filtro de Óleo', quantity: 1, unitCost: 45.0 }],
        laborItems: [{ description: 'Mão de obra troca de óleo', hours: 1, hourlyRate: 150.0 }],
        userId,
        userName,
      });
      workOrderId = wo.id;
      const txAfter = await txRepo.findAll();
      const newTxCount = txAfter.length - txBefore.length;

      if (newTxCount !== 0) {
        throw new Error(`Esperado 0 FinancialTransaction na criação da OS, encontrado ${newTxCount}`);
      }
      if (wo.total !== 195.0) {
        throw new Error(`Total esperado 195.0, obtido ${wo.total}`);
      }
      results.push({ name: 'Criação de OS (FinancialTransaction = 0)', passed: true });
    } catch (e: any) {
      results.push({ name: 'Criação de OS (FinancialTransaction = 0)', passed: false, error: e.message });
    }

    // Test 4: Complete Work Order & Generate AccountPayable
    let payableId = '';
    try {
      const woCompleted = await MaintenanceService.completeWorkOrder({
        workOrderId,
        exitKm: 10050,
        categoryId: 'cat-maint-exp',
        dueDate: '2026-09-01',
        userId,
        userName,
      });

      payableId = woCompleted.accountPayableId || '';
      if (!payableId) {
        throw new Error('AccountPayable não foi gerado na conclusão da OS');
      }

      const pay = await payableRepo.findById(payableId);
      if (!pay || pay.originalAmount !== 195.0) {
        throw new Error('Valor do AccountPayable incorreto');
      }

      const txs = await txRepo.findAll();
      // Should still be 0 tx until settlement
      results.push({ name: 'Conclusão de OS e Geração de AccountPayable', passed: true });
    } catch (e: any) {
      results.push({ name: 'Conclusão de OS e Geração de AccountPayable', passed: false, error: e.message });
    }

    // Test 5: Settlement of AccountPayable -> Creates FinancialTransaction & Updates Account
    try {
      if (!payableId) throw new Error('PayableId ausente para teste de liquidação');
      const payBefore = await payableRepo.findById(payableId);
      const accBefore = await accRepo.findById(accountId);

      const txsBefore = await txRepo.findAll();
      await SettlementService.registerPayment({
        companyId,
        obligationId: payableId,
        financialAccountId: accountId,
        paymentMethodId: 'pm-pix',
        paymentAmount: payBefore?.updatedAmount || 195.0,
        paymentDate: '2026-08-11',
        userId,
        userName,
      });

      const txsAfter = await txRepo.findAll();
      if (txsAfter.length - txsBefore.length !== 1) {
        throw new Error('Liquidação deve gerar exatamente 1 FinancialTransaction');
      }

      const accAfter = await accRepo.findById(accountId);
      if (accAfter && accBefore && accAfter.currentBalance !== accBefore.currentBalance - 195.0) {
        throw new Error('Saldo da conta financeira não foi deduzido corretamente');
      }

      results.push({ name: 'Liquidação de AccountPayable (Settlement -> FinancialTransaction = 1)', passed: true });
    } catch (e: any) {
      results.push({ name: 'Liquidação de AccountPayable (Settlement -> FinancialTransaction = 1)', passed: false, error: e.message });
    }

    // Test 6: Historical preservation check
    try {
      // Modify part cost after OS completion
      await partRepo.update(partId, { currentCost: 999.0 });
      const woCheck = await woRepo.findById(workOrderId);
      if (woCheck?.parts[0].unitCost !== 45.0) {
        throw new Error('Preço histórico da peça na OS foi alterado indevidamente!');
      }
      results.push({ name: 'Preservação de Preço Histórico na OS', passed: true });
    } catch (e: any) {
      results.push({ name: 'Preservação de Preço Histórico na OS', passed: false, error: e.message });
    }

    const passed = results.filter((r) => r.passed).length;
    const failed = results.length - passed;
    return {
      total: results.length,
      passed,
      failed,
      results,
    };
  }
}

function anyTypeCash(): any {
  return 'CASH';
}
