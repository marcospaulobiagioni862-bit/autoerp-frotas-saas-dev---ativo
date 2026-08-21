import { DetailAuthorityClient } from '../../api/detailAuthorityClient';
import { TrafficTicketClient } from '../../api/trafficTicketClient';
import type { AuditLog, TrafficTicket } from '../../types/entities';

export interface ContractSupplementalDetails {
  tickets: TrafficTicket[];
  history: AuditLog[];
}

/**
 * Compatibility adapter for the Contract details UI. Supplemental reads are
 * now server-authoritative and fail closed; companyId remains only as a legacy
 * composition argument and is never used as transport authority.
 */
export class ContractLegacyDetailsBridge {
  async load(_companyId: string, contractId: string): Promise<ContractSupplementalDetails> {
    const [tickets, history] = await Promise.all([
      TrafficTicketClient.list(),
      DetailAuthorityClient.listAudit('Contract', contractId),
    ]);
    return {
      tickets: tickets.filter((item) => item.contractId === contractId),
      history,
    };
  }
}