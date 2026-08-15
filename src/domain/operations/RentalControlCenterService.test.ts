import { generateRentalControlSummary } from './RentalControlCenterService';
import { Vehicle, Contract, Driver, Maintenance } from '../../types/entities';
import { VehicleStatus, ContractStatus, DriverStatus, RecurringFrequency, DocumentStatus, MaintenanceType, MaintenanceStatus } from '../../types/enums';

export interface RentalControlTestResult {
  id: string;
  name: string;
  passed: boolean;
  message: string;
}

export class RentalControlTestRunner {
  public static async runAllTests(): Promise<{
    total: number;
    passed: number;
    failed: number;
    results: RentalControlTestResult[];
  }> {
    const results: RentalControlTestResult[] = [];

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

    const vehicleA: Vehicle = {
      id: 'vA1',
      companyId: companyA,
      plate: 'ABC-1234',
      brand: 'Fiat',
      model: 'Uno',
      yearFabrication: 2022,
      yearModel: 2022,
      color: 'Branco',
      renavam: '111111111',
      chassis: 'CHASSISA1',
      currentKm: 15000,
      fuelType: 'Flex',
      category: 'Hatch',
      acquisitionValue: 50000,
      currentValue: 45000,
      rentalValueBase: 1000,
      status: VehicleStatus.AVAILABLE,
      isArchived: false,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };

    const driverA: Driver = {
      id: 'dA1',
      companyId: companyA,
      fullName: 'João Silva',
      cpf: '111.111.111-11',
      birthDate: '1990-01-01',
      phone: '(11) 99999-9999',
      whatsapp: '(11) 99999-9999',
      email: 'joao@email.com',
      address: {
        street: 'Rua A',
        number: '123',
        neighborhood: 'Centro',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '01000-000',
      },
      cnhNumber: '1234567890',
      cnhCategory: 'B',
      cnhExpiration: '2028-01-01',
      cnhStatus: DocumentStatus.VALID,
      appPlatforms: ['Uber'],
      status: DriverStatus.ACTIVE,
      isArchived: false,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };

    const contractA: Contract = {
      id: 'cA1',
      companyId: companyA,
      contractNumber: 'CTR-2026-001',
      driverId: driverA.id,
      vehicleId: vehicleA.id,
      startDate: '2026-08-01',
      endDate: '2026-09-01',
      status: ContractStatus.ACTIVE,
      rentalAmount: 1200,
      billingPeriodicity: RecurringFrequency.WEEKLY,
      securityDepositAmount: 500,
      franchiseKm: 1500,
      excessKmRate: 2.5,
      isArchived: false,
      createdAt: '2026-08-01',
      updatedAt: '2026-08-01',
    };

    test('RCC01', 'Empty input safety & NaN/Infinity protection', () => {
      const summary = generateRentalControlSummary({ companyId: companyA });
      if (isNaN(summary.counts.total) || !isFinite(summary.counts.total)) {
        throw new Error('NaN or Infinity detected in empty rental control summary');
      }
    });

    test('RCC02', 'Multi-Tenancy Isolation', () => {
      const vehicleB: Vehicle = { ...vehicleA, id: 'vB1', companyId: companyB, plate: 'XYZ-9999' };
      const contractB: Contract = { ...contractA, id: 'cB1', companyId: companyB, vehicleId: 'vB1', contractNumber: 'CTR-B' };

      const summaryA = generateRentalControlSummary({
        companyId: companyA,
        vehicles: [vehicleA, vehicleB],
        contracts: [contractA, contractB],
        drivers: [driverA],
      });

      if (summaryA.items.some(i => i.companyId !== companyA)) {
        throw new Error('Multi-Tenancy isolation failed: Company A summary contains non-company-A items');
      }
    });

    test('RCC03', 'P0 Priority Blocked Vehicle in Maintenance', () => {
      const maint: Maintenance = {
        id: 'm1',
        companyId: companyA,
        vehicleId: vehicleA.id,
        type: MaintenanceType.CORRECTIVE,
        description: 'Motor check',
        kmAtMaintenance: 15000,
        partsCost: 300,
        laborCost: 200,
        totalCost: 500,
        status: MaintenanceStatus.IN_PROGRESS,
        startDate: '2026-08-10',
        createdAt: '2026-08-10',
        updatedAt: '2026-08-10',
      };

      const summary = generateRentalControlSummary({
        companyId: companyA,
        vehicles: [vehicleA],
        contracts: [contractA],
        drivers: [driverA],
        maintenances: [maint],
      });

      const item = summary.items.find(i => i.contractId === contractA.id);
      if (!item || item.priority !== 'P0') {
        throw new Error('Failed to classify vehicle in maintenance as P0 blocked');
      }
    });

    const total = results.length;
    const passed = results.filter((r) => r.passed).length;
    const failed = total - passed;

    return { total, passed, failed, results };
  }
}
