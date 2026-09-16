import { generateRentalLifecycleSummary, validateRentalStateTransition } from './RentalLifecycleService';
import { Vehicle, Contract, Driver } from '../../types/entities';
import { VehicleStatus, ContractStatus, DriverStatus, RecurringFrequency, DocumentStatus } from '../../types/enums';

export interface RentalLifecycleTestResult {
  id: string;
  name: string;
  passed: boolean;
  message: string;
}

export class RentalLifecycleTestRunner {
  public static async runAllTests(): Promise<{
    total: number;
    passed: number;
    failed: number;
    results: RentalLifecycleTestResult[];
  }> {
    const results: RentalLifecycleTestResult[] = [];

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

    test('RL01', 'Empty input safety & NaN/Infinity protection', () => {
      const summary = generateRentalLifecycleSummary({ companyId: companyA });
      if (isNaN(summary.counts.total) || !isFinite(summary.counts.total)) {
        throw new Error('NaN or Infinity detected in empty rental lifecycle summary');
      }
    });

    test('RL02', 'Multi-Tenancy Isolation', () => {
      const vehicleB: Vehicle = { ...vehicleA, id: 'vB1', companyId: companyB, plate: 'XYZ-9999' };
      const contractB: Contract = { ...contractA, id: 'cB1', companyId: companyB, vehicleId: 'vB1', contractNumber: 'CTR-B' };

      const summaryA = generateRentalLifecycleSummary({
        companyId: companyA,
        vehicles: [vehicleA, vehicleB],
        contracts: [contractA, contractB],
        drivers: [driverA],
      });

      if (summaryA.items.some(i => i.companyId !== companyA)) {
        throw new Error('Multi-Tenancy isolation failed: Company A summary contains non-company-A items');
      }
    });

    test('RL03', 'State Machine Transition Validation', () => {
      const t1 = validateRentalStateTransition('CLOSED', 'ACTIVE');
      if (t1.allowed) {
        throw new Error('State machine failed to block invalid transition CLOSED -> ACTIVE');
      }

      const t2 = validateRentalStateTransition('ACTIVE', 'CLOSED');
      if (!t2.allowed) {
        throw new Error('State machine incorrectly blocked valid transition ACTIVE -> CLOSED');
      }
    });

    test('RL04', 'Read-only guarantee & data immutability', () => {
      const vehiclesCopy = JSON.parse(JSON.stringify([vehicleA]));
      generateRentalLifecycleSummary({ companyId: companyA, vehicles: vehiclesCopy, contracts: [contractA], drivers: [driverA] });
      if (vehiclesCopy[0].status !== vehicleA.status) {
        throw new Error('Read-only violation: RentalLifecycleService mutated vehicle data');
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
