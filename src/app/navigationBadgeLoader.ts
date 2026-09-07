import { TrackerClient } from '../api/trackerClient';
import { generateOperationalPendings } from '../domain/operations/serverOperationalPendingProjection';
import {
  AccountPayableRepository,
  AccountReceivableRepository,
  ContractRepository,
  DriverDocumentRepository,
  DriverRepository,
  InsuranceRepository,
  MaintenanceRepository,
  TrafficTicketRepository,
  VehicleDocumentRepository,
  VehicleRepository,
} from '../persistence/repositories/serverReadModelRepositories';
import { ObligationStatus } from '../types/enums';

export interface NavigationBadgeCounts {
  pendingReceivablesCount: number;
  pendingPayablesCount: number;
  pendingPendingsCount: number;
}

type RequestStillCurrent = () => boolean;

const isPendingObligation = (item: { status: ObligationStatus }): boolean =>
  item.status === ObligationStatus.PENDING ||
  item.status === ObligationStatus.PARTIALLY_PAID;

export async function loadNavigationBadgeCounts(
  companyId: string,
  requestStillCurrent: RequestStillCurrent,
): Promise<NavigationBadgeCounts | null> {
  const recRepo = new AccountReceivableRepository();
  const payRepo = new AccountPayableRepository();
  const vehRepo = new VehicleRepository();
  const contractRepo = new ContractRepository();
  const maintRepo = new MaintenanceRepository();
  const vehDocRepo = new VehicleDocumentRepository();
  const drvDocRepo = new DriverDocumentRepository();
  const ticketRepo = new TrafficTicketRepository();
  const drvRepo = new DriverRepository();
  const insRepo = new InsuranceRepository();

  const [
    receivables,
    payables,
    vehicles,
    contracts,
    maintenances,
    vehicleDocuments,
    driverDocuments,
    tickets,
    drivers,
    insurances,
    trackers,
  ] = await Promise.all([
    recRepo.findAllForCompany(companyId),
    payRepo.findAllForCompany(companyId),
    vehRepo.findAllForCompany(companyId),
    contractRepo.findAllForCompany(companyId),
    maintRepo.findAllForCompany(companyId),
    vehDocRepo.findAllForCompany(companyId),
    drvDocRepo.findAllForCompany(companyId),
    ticketRepo.findAllForCompany(companyId),
    drvRepo.findAllForCompany(companyId),
    insRepo.findAllForCompany(companyId),
    TrackerClient.list(),
  ]);

  if (!requestStillCurrent()) return null;

  const pendingReceivablesCount = receivables.filter(isPendingObligation).length;
  const pendingPayablesCount = payables.filter(isPendingObligation).length;
  const pendingPendingsCount = generateOperationalPendings({
    companyId,
    vehicles,
    contracts,
    maintenances,
    vehicleDocuments,
    driverDocuments,
    tickets,
    drivers,
    insurances,
    trackers,
    receivables,
    payables,
  }).length;

  if (!requestStillCurrent()) return null;

  return {
    pendingReceivablesCount,
    pendingPayablesCount,
    pendingPendingsCount,
  };
}
