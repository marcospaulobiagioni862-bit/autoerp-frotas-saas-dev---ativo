import { generateDailyOperations } from './DailyOperationsService';
import { Vehicle, Contract, Maintenance, VehicleDocument, TrafficTicket, Driver, Insurance, Tracker } from '../../types/entities';
import { VehicleStatus, ContractStatus, MaintenanceStatus, DocumentStatus, TicketStatus } from '../../types/enums';

export interface DailyOperationsTestResult {
  id: string;
  name: string;
  passed: boolean;
  message: string;
}

export class DailyOperationsTestRunner {
  public static async runAllTests(): Promise<{
    total: number;
    passed: number;
    failed: number;
    results: DailyOperationsTestResult[];
  }> {
    const results: DailyOperationsTestResult[] = [];

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

    const vehicleB: Vehicle = {
      id: 'vB1',
      companyId: companyB,
      plate: 'XYZ-9999',
      brand: 'VW',
      model: 'Gol',
      yearFabrication: 2022,
      yearModel: 2022,
      color: 'Prata',
      renavam: '222222222',
      chassis: 'CHASSISB1',
      currentKm: 20000,
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

    test('DO01', 'Empty input safety & NaN/Infinity protection', () => {
      const summaryEmpty = generateDailyOperations({ companyId: companyA });
      if (isNaN(summaryEmpty.counts.total) || !isFinite(summaryEmpty.counts.total)) {
        throw new Error('NaN or Infinity detected in empty daily operations summary');
      }
    });

    test('DO02', 'Multi-Tenancy Isolation', () => {
      const summaryA = generateDailyOperations({
        companyId: companyA,
        vehicles: [vehicleA, vehicleB],
      });
      if (summaryA.actions.some(a => a.vehiclePlate === 'XYZ-9999')) {
        throw new Error('Multi-Tenancy isolation failed: Company A daily operations contain Company B data');
      }
    });

    test('DO03', 'Read-only guarantee & data immutability', () => {
      const vehiclesCopy = JSON.parse(JSON.stringify([vehicleA]));
      generateDailyOperations({ companyId: companyA, vehicles: vehiclesCopy });
      if (vehiclesCopy[0].status !== vehicleA.status) {
        throw new Error('Read-only violation: DailyOperationsService mutated vehicle data');
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
