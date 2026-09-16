import { TicketResponsibility, TicketStatus } from '../enums';

export interface TrafficTicket {
  id: string; // UUID
  companyId: string;
  vehicleId: string;
  driverId?: string;
  contractId?: string;
  autoNumber: string; // Auto de infração
  organName: string; // DETRAN, PRF, EPTC, etc.
  infractionCode: string;
  description: string;
  infractionDate: string;
  dueDate: string;
  discountDueDate?: string;
  originalAmount: number;
  discountedAmount?: number;
  nicAmount?: number;
  points: number;
  responsibility: TicketResponsibility;
  status: TicketStatus;
  receivableId?: string; // If charged to driver
  payableId?: string; // If paid by company
  nicPayableId?: string; // If NIC penalty generated for company
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
