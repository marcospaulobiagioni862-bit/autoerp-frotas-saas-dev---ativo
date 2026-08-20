import type { TrafficTicket } from '../../types/entities';
import { TicketResponsibility } from '../../types/enums';

export interface CreateTrafficTicketDTO {
  companyId:string;vehicleId:string;autoNumber:string;organName?:string;infractionCode:string;description:string;
  infractionDate:string;dueDate:string;discountDueDate?:string;originalAmount:number;discountedAmount?:number;
  points?:number;responsibility:TicketResponsibility;driverId?:string;notes?:string;
}
export interface UpdateTrafficTicketDTO {
  autoNumber?:string;organName?:string;infractionCode?:string;description?:string;infractionDate?:string;dueDate?:string;
  discountDueDate?:string;originalAmount?:number;discountedAmount?:number;points?:number;notes?:string;
}

function removed():never{
  throw new Error('SECURITY-2M: TrafficTicketService browser/local authority was removed. Use TrafficTicketClient/server authority.');
}

/** Compatibility shell only. All TrafficTicket authority is server-side after SECURITY-2M. */
export class TrafficTicketService {
  async createTicket(_dto:CreateTrafficTicketDTO,_userId:string,_userName:string):Promise<TrafficTicket>{return removed();}
  async generateFinancialObligation(_ticketId:string,_userId:string,_userName:string):Promise<TrafficTicket>{return removed();}
  async assignDriverAndResponsibility(_ticketId:string,_driverId:string|undefined,_responsibility:TicketResponsibility,_userId:string,_userName:string):Promise<TrafficTicket>{return removed();}
  async appealTicket(_ticketId:string,_notes:string,_userId:string,_userName:string):Promise<TrafficTicket>{return removed();}
  async cancelTicket(_ticketId:string,_reason:string,_userId:string,_userName:string):Promise<TrafficTicket>{return removed();}
  async updateTicket(_ticketId:string,_dto:UpdateTrafficTicketDTO,_userId:string,_userName:string):Promise<TrafficTicket>{return removed();}
  async archiveTicket(_ticketId:string,_userId:string,_userName:string):Promise<{action:'archived'|'deleted'}>{return removed();}
  async processNICPenalty(_ticketId:string,_nicAmount?:number,_userId:string='system',_userName:string='System'):Promise<TrafficTicket>{return removed();}
  async processPendingNICPenalties(_companyId:string,_userId:string='system',_userName:string='System'):Promise<TrafficTicket[]>{return removed();}
}
