import { ContractClient } from '../../api/contractClient';
import { DocumentClient } from '../../api/documentClient';
import { DriverClient } from '../../api/driverClient';
import { FinanceObligationClient } from '../../api/financeObligationClient';
import { MaintenanceClient } from '../../api/maintenanceClient';
import { MaintenancePreventiveClient } from '../../api/maintenancePreventiveClient';
import { TrackerClient } from '../../api/trackerClient';
import { InsuranceClient } from '../../api/insuranceClient';
import { TrafficTicketClient } from '../../api/trafficTicketClient';
import { DetailAuthorityClient } from '../../api/detailAuthorityClient';
import type { Vehicle, KmRecord, AuditLog } from '../../types/entities';
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
  historyLogs: AuditLog[];
  financialSummary: { totalRevenue:number; totalExpenses:number; netProfit:number; profitMargin:number; };
}

/**
 * Compatibility adapter for VehicleDetailsModal. All operational data comes
 * from authenticated server clients. Legacy aliases below are presentation
 * aliases only and never become a second persistence authority.
 */
export class VehicleLegacyDetailsBridge {
  async compose(vehicle:Vehicle,kmRecords:KmRecord[]):Promise<VehicleDetailedSummary>{
    const vehicleId=vehicle.id;
    const [driverCore,contracts,workOrders,suppliers,oilChanges,tires,canonicalTickets,documents,insurances,trackers,allReceivables,allPayables,historyLogs]=await Promise.all([
      vehicle.currentDriverId?DriverClient.get(vehicle.currentDriverId):Promise.resolve(null),
      ContractClient.list(),
      MaintenanceClient.listWorkOrders({vehicleId}),
      MaintenanceClient.listSuppliers(),
      MaintenancePreventiveClient.listOilChanges(vehicleId),
      MaintenancePreventiveClient.listTires(vehicleId),
      TrafficTicketClient.list({vehicleId}),
      DocumentClient.list({subjectType:'VEHICLE',subjectId:vehicleId}),
      InsuranceClient.listByVehicle(vehicleId),
      TrackerClient.listByVehicle(vehicleId),
      FinanceObligationClient.listReceivables(),
      FinanceObligationClient.listPayables(),
      DetailAuthorityClient.listAudit('Vehicle',vehicleId),
    ]);

    const contractHistory=contracts.filter(item=>item.vehicleId===vehicleId);
    const activeCanonical=vehicle.currentContractId
      ? contractHistory.find(item=>item.id===vehicle.currentContractId)
      : contractHistory.find(item=>item.status==='ACTIVE');
    const receivables=allReceivables.filter(item=>item.vehicleId===vehicleId);
    const payables=allPayables.filter(item=>item.vehicleId===vehicleId);

    const supplierNames=new Map(suppliers.map(item=>[item.id,item.tradeName||item.name]));
    const workOrderHistory=workOrders.map(item=>({
      id:item.id,companyId:item.companyId,vehicleId:item.vehicleId,supplierId:item.supplierId,supplierName:item.supplierId?supplierNames.get(item.supplierId):undefined,type:'WORK_ORDER',description:item.description,
      kmAtMaintenance:item.exitKm??item.entryKm,partsCost:item.subtotalParts,laborCost:item.subtotalLabor+item.subtotalServices,totalCost:item.total,
      status:item.status,startDate:item.serviceDate||item.startedAt||item.openedAt,completionDate:item.completedAt,accountPayableId:item.accountPayableId,notes:item.notes,
      parts:item.parts,services:item.services,laborItems:item.laborItems,workOrderNumber:item.number,attachmentEntityType:'MaintenanceWorkOrder',
      createdAt:item.createdAt,updatedAt:item.updatedAt,
    }));
    const oilHistory=oilChanges.map(item=>({
      id:`oil-${item.id}`,companyId:item.companyId,vehicleId:item.vehicleId,supplierId:item.supplierId,supplierName:item.supplierId?supplierNames.get(item.supplierId):undefined,type:'OIL_CHANGE',
      description:`Troca de óleo ${item.oilBrand} ${item.oilType}${item.filterChanged?' com filtro':''}`,
      kmAtMaintenance:item.km,partsCost:0,laborCost:0,totalCost:0,status:'COMPLETED',startDate:item.date,
      completionDate:item.date,notes:item.notes,parts:[],services:[],laborItems:[],sourceAttachmentId:item.attachmentId,
      nextMaintenanceKm:item.nextKm,nextMaintenanceDate:item.nextDate,createdAt:item.createdAt,updatedAt:item.updatedAt,
    }));
    const tireHistory=tires.map(item=>({
      id:`tire-${item.id}`,companyId:item.companyId,vehicleId:item.vehicleId,supplierId:item.supplierId,supplierName:item.supplierId?supplierNames.get(item.supplierId):undefined,type:'TIRE',
      description:`Pneu ${item.brand} ${item.model} — posição ${item.position}${item.lastRotationDate?` — último rodízio em ${item.lastRotationDate}`:''}`,
      kmAtMaintenance:item.lastRotationKm??item.removalKm??item.installationKm,partsCost:item.cost,laborCost:0,totalCost:item.cost,
      status:'COMPLETED',startDate:item.lastRotationDate||item.removalDate||item.installationDate,
      completionDate:item.lastRotationDate||item.removalDate||item.installationDate,notes:item.notes,parts:[],services:[],laborItems:[],
      sourceAttachmentId:item.attachmentId,createdAt:item.createdAt,updatedAt:item.updatedAt,
    }));
    const maintenances=[...workOrderHistory,...oilHistory,...tireHistory]
      .sort((a,b)=>Date.parse(String(b.startDate||''))-Date.parse(String(a.startDate||'')));

    const driver=driverCore?{...driverCore,name:driverCore.fullName}:undefined;
    const activeContract=activeCanonical?{
      ...activeCanonical,
      recurringValue:activeCanonical.rentalAmount,
      securityDepositValue:activeCanonical.securityDepositAmount,
    }:undefined;
    const trafficTickets=canonicalTickets.map(item=>({
      ...item,
      noticeNumber:item.autoNumber,
      ticketDate:item.infractionDate,
      amount:item.originalAmount,
    }));

    const totalRevenue=receivables.filter(item=>item.status===ObligationStatus.PAID).reduce((sum,item)=>sum+item.paidAmount,0);
    const totalExpenses=payables.filter(item=>item.status===ObligationStatus.PAID).reduce((sum,item)=>sum+item.paidAmount,0);
    const netProfit=totalRevenue-totalExpenses,profitMargin=totalRevenue>0?(netProfit/totalRevenue)*100:0;
    const visibleKmRecords=kmRecords.filter((record,index,records)=>index===0||record.kmValue!==records[index-1].kmValue);

    return {
      vehicle,
      driver,
      activeContract,
      contractHistory,
      maintenances,
      trafficTickets,
      documents,
      insurances,
      trackers,
      kmRecords:visibleKmRecords,
      historyLogs,
      financialSummary:{totalRevenue,totalExpenses,netProfit,profitMargin},
    };
  }
}
