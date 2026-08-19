import {
  DriverRepository,
  ContractRepository,
  MaintenanceRepository,
  TrafficTicketRepository,
  VehicleDocumentRepository,
  InsuranceRepository,
  TrackerRepository,
  AccountReceivableRepository,
  AccountPayableRepository,
} from '../../persistence/repositories/localRepositories';
import type { Vehicle, KmRecord } from '../../types/entities';
import { ObligationStatus } from '../../types/enums';

export interface VehicleDetailedSummary {
  vehicle: Vehicle;
  driver?: any;
  activeContract?: any;
  contractHistory: any[];
  maintenances: any[];
  trafficTickets: any[];
  documents: any[];
  insurances: any[];
  trackers: any[];
  kmRecords: KmRecord[];
  financialSummary: {
    totalRevenue: number;
    totalExpenses: number;
    netProfit: number;
    profitMargin: number;
  };
}

/**
 * Transitional supplement bridge for details tabs not migrated yet.
 * SECURITY-2I1B invariant: Vehicle and KmRecord are supplied by the server caller.
 * This class MUST NOT instantiate VehicleRepository or KmRecordRepository.
 */
export class VehicleLegacyDetailsBridge {
  private driverRepo = new DriverRepository();
  private contractRepo = new ContractRepository();
  private maintenanceRepo = new MaintenanceRepository();
  private ticketRepo = new TrafficTicketRepository();
  private documentRepo = new VehicleDocumentRepository();
  private insuranceRepo = new InsuranceRepository();
  private trackerRepo = new TrackerRepository();
  private receivableRepo = new AccountReceivableRepository();
  private payableRepo = new AccountPayableRepository();

  async compose(vehicle: Vehicle, kmRecords: KmRecord[]): Promise<VehicleDetailedSummary> {
    const vehicleId = vehicle.id;
    const [
      driver,
      activeContract,
      allContracts,
      maintenances,
      trafficTickets,
      documents,
      insurances,
      trackers,
      receivables,
      payables,
    ] = await Promise.all([
      vehicle.currentDriverId ? this.driverRepo.findById(vehicle.currentDriverId) : Promise.resolve(null),
      vehicle.currentContractId ? this.contractRepo.findById(vehicle.currentContractId) : Promise.resolve(null),
      this.contractRepo.findAll({ vehicleId }),
      this.maintenanceRepo.findAll({ vehicleId }),
      this.ticketRepo.findAll({ vehicleId }),
      this.documentRepo.findAll({ vehicleId }),
      this.insuranceRepo.findAll({ vehicleId }),
      this.trackerRepo.findAll({ vehicleId }),
      this.receivableRepo.findAll({ vehicleId }),
      this.payableRepo.findAll({ vehicleId }),
    ]);

    const totalRevenue = receivables
      .filter((item) => item.status === ObligationStatus.PAID)
      .reduce((sum, item) => sum + item.paidAmount, 0);
    const totalExpenses = payables
      .filter((item) => item.status === ObligationStatus.PAID)
      .reduce((sum, item) => sum + item.paidAmount, 0);
    const netProfit = totalRevenue - totalExpenses;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    return {
      vehicle,
      driver: driver || undefined,
      activeContract: activeContract || undefined,
      contractHistory: allContracts,
      maintenances,
      trafficTickets,
      documents,
      insurances,
      trackers,
      kmRecords: [...kmRecords],
      financialSummary: { totalRevenue, totalExpenses, netProfit, profitMargin },
    };
  }
}
