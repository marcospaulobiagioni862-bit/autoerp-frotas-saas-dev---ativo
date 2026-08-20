import { TicketResponsibility, TicketStatus } from '../enums';

export interface TrafficTicket {
  id: string;
  companyId: string;
  vehicleId: string;
  driverId?: string;
  contractId?: string;
  autoNumber: string;
  organName: string;
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
  receivableId?: string;
  payableId?: string;
  nicPayableId?: string;
  notes?: string;
  createdBy?: string;
  cancelledAt?: string;
  cancelReason?: string;
  responsibilityVersion?: number;
  createdAt: string;
  updatedAt: string;
}
