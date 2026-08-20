import {
  DriverRepository,
  ContractRepository,
  TrafficTicketRepository,
  VehicleDocumentRepository,
  InsuranceRepository,
  AccountReceivableRepository,
  AccountPayableRepository,
} from '../../persistence/repositories/localRepositories';
import { MaintenanceClient } from '../../api/maintenanceClient';
import { TrackerClient } from '../../api/trackerClient';
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
  financialSummary: { totalRevenue:number; totalExpenses:number; netProfit:number; profitMargin:number; };
}

/** Transitional details bridge. Vehicle/KM, maintenance and Tracker are now server-authoritative. */
export class VehicleLegacyDetailsBridge {
  private driverRepo=new DriverRepository();
  private contractRepo=new ContractRepository();
  private ticketRepo=new TrafficTicketRepository();
  private documentRepo=new VehicleDocumentRepository();
  private insuranceRepo=new InsuranceRepository();
  private receivableRepo=new AccountReceivableRepository();
  private payableRepo=new AccountPayableRepository();

  async compose(vehicle:Vehicle,kmRecords:KmRecord[]):Promise<VehicleDetailedSummary>{
    const vehicleId=vehicle.id;
    const [driver,activeContract,allContracts,workOrders,trafficTickets,documents,insurances,trackers,receivables,payables]=await Promise.all([
      vehicle.currentDriverId?this.driverRepo.findById(vehicle.currentDriverId):Promise.resolve(null),
      vehicle.currentContractId?this.contractRepo.findById(vehicle.currentContractId):Promise.resolve(null),
      this.contractRepo.findAll({vehicleId}),MaintenanceClient.listWorkOrders({vehicleId}),this.ticketRepo.findAll({vehicleId}),
      this.documentRepo.findAll({vehicleId}),this.insuranceRepo.findAll({vehicleId}),TrackerClient.listByVehicle(vehicleId),
      this.receivableRepo.findAll({vehicleId}),this.payableRepo.findAll({vehicleId}),
    ]);
    const maintenances=workOrders.map(item=>({id:item.id,companyId:item.companyId,vehicleId:item.vehicleId,supplierId:item.supplierId,type:'WORK_ORDER',description:item.description,kmAtMaintenance:item.exitKm??item.entryKm,partsCost:item.subtotalParts,laborCost:item.subtotalLabor+item.subtotalServices,totalCost:item.total,status:item.status,startDate:item.startedAt||item.openedAt,completionDate:item.completedAt,accountPayableId:item.accountPayableId,notes:item.notes,createdAt:item.createdAt,updatedAt:item.updatedAt}));
    const totalRevenue=receivables.filter(item=>item.status===ObligationStatus.PAID).reduce((sum,item)=>sum+item.paidAmount,0);
    const totalExpenses=payables.filter(item=>item.status===ObligationStatus.PAID).reduce((sum,item)=>sum+item.paidAmount,0);
    const netProfit=totalRevenue-totalExpenses,profitMargin=totalRevenue>0?(netProfit/totalRevenue)*100:0;
    return {vehicle,driver:driver||undefined,activeContract:activeContract||undefined,contractHistory:allContracts,maintenances,trafficTickets,documents,insurances,trackers,kmRecords:[...kmRecords],financialSummary:{totalRevenue,totalExpenses,netProfit,profitMargin}};
  }
}
