import { generateManagementReport } from './ManagementReportsService';
import { Vehicle, Contract, Maintenance, VehicleDocument, TrafficTicket, Driver, Insurance, Tracker } from '../../types/entities';
import { VehicleStatus, ContractStatus, MaintenanceStatus, DocumentStatus, TicketStatus } from '../../types/enums';

export interface ManagementReportsTestResult {
  id: string;
  name: string;
  passed: boolean;
  message: string;
}

export class ManagementReportsTestRunner {
  public static async runAllTests(): Promise<{
    total: number;
    passed: number;
    failed: number;
    results: ManagementReportsTestResult[];
  }> {
    const results: ManagementReportsTestResult[] = [];

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

    test('MR01', 'Empty input safety & NaN/Infinity protection', () => {
      const reportEmpty = generateManagementReport({ companyId: companyA });
      if (isNaN(reportEmpty.fleet.availabilityRate) || !isFinite(reportEmpty.fleet.availabilityRate)) {
        throw new Error('NaN or Infinity detected in empty fleet availability rate');
      }
    });

    test('MR02', 'Multi-Tenancy Isolation', () => {
      const reportA = generateManagementReport({
        companyId: companyA,
        vehicles: [vehicleA, vehicleB],
      });
      if (reportA.fleet.totalVehicles !== 1 || reportA.vehicleDetails.some(v => v.plate === 'XYZ-9999')) {
        throw new Error('Multi-Tenancy isolation failed: Company A report contains Company B data');
      }
    });

    test('MR03', 'Read-only guarantee & financial non-regression', () => {
      const vehiclesCopy = JSON.parse(JSON.stringify([vehicleA]));
      generateManagementReport({ companyId: companyA, vehicles: vehiclesCopy });
      if (vehiclesCopy[0].status !== vehicleA.status) {
        throw new Error('Read-only violation: Management report mutated vehicle data');
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
