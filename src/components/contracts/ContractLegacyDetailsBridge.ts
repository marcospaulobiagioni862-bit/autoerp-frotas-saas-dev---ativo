import {
  AuditLogRepository,
  TrafficTicketRepository,
} from '../../persistence/repositories/localRepositories';
import type { AuditLog, TrafficTicket } from '../../types/entities';

export interface ContractSupplementalDetails {
  tickets: TrafficTicket[];
  history: AuditLog[];
}

/**
 * Temporary bridge for Contract-adjacent entities outside SECURITY-2I3/G9.
 * It deliberately never imports ContractRepository, VehicleRepository or DriverRepository
 * and therefore cannot become a fallback authority for Contract/Vehicle/Driver core.
 */
export class ContractLegacyDetailsBridge {
  private readonly ticketRepo = new TrafficTicketRepository();
  private readonly auditRepo = new AuditLogRepository();

  async load(companyId: string, contractId: string): Promise<ContractSupplementalDetails> {
    const [tickets, audit] = await Promise.all([
      this.ticketRepo.findAllForCompany(companyId),
      this.auditRepo.findAll(),
    ]);
    return {
      tickets: tickets.filter((item) => item.contractId === contractId),
      history: audit
        .filter((item) => item.companyId === companyId && item.entityId === contractId)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    };
  }
}
