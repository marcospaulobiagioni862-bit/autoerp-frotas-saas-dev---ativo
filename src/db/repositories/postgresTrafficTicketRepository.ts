import { sql } from 'drizzle-orm';
import { db } from '../index';
import type { TrafficTicket } from '../../types/entities';
import { TicketResponsibility, TicketStatus } from '../../types/enums';

function rows(result:any):any[]{return Array.isArray(result?.rows)?result.rows:[];}
function dateOnly(value:unknown):string{if(value instanceof Date)return value.toISOString().slice(0,10);return String(value||'').slice(0,10);}
function iso(value:unknown):string{if(value instanceof Date)return value.toISOString();return typeof value==='string'?value:new Date(String(value)).toISOString();}
function optional(value:unknown):string|undefined{return value===null||value===undefined||value===''?undefined:String(value);}
function map(row:any):TrafficTicket{
  return {
    id:String(row.id),companyId:String(row.company_id),vehicleId:String(row.vehicle_id),
    driverId:optional(row.driver_id),contractId:optional(row.contract_id),
    autoNumber:String(row.auto_number),organName:String(row.organ_name||''),infractionCode:String(row.infraction_code||''),
    description:String(row.description||''),infractionDate:dateOnly(row.infraction_date||row.issue_date),
    dueDate:dateOnly(row.due_date||row.issue_date),discountDueDate:row.discount_due_date?dateOnly(row.discount_due_date):undefined,
    originalAmount:Number(row.original_amount??row.amount??0),
    discountedAmount:row.discounted_amount==null?undefined:Number(row.discounted_amount),
    nicAmount:row.nic_amount==null?undefined:Number(row.nic_amount),points:Number(row.points||0),
    responsibility:String(row.responsibility||TicketResponsibility.UNIDENTIFIED) as TicketResponsibility,
    status:String(row.status) as TicketStatus,receivableId:optional(row.receivable_id),payableId:optional(row.base_payable_id),
    nicPayableId:optional(row.nic_payable_id),notes:optional(row.notes),createdBy:optional(row.created_by),
    cancelledAt:row.cancelled_at?iso(row.cancelled_at):undefined,cancelReason:optional(row.cancel_reason),
    responsibilityVersion:Number(row.responsibility_version||0),createdAt:iso(row.created_at),updatedAt:iso(row.updated_at),
  };
}

export class PostgresTrafficTicketRepository {
  constructor(private tx:any=db){}

  async findAllByCompany(companyId:string,filters:{vehicleId?:string;driverId?:string;status?:TicketStatus;responsibility?:TicketResponsibility}={}):Promise<TrafficTicket[]>{
    let result:any;
    if(filters.vehicleId) result=await this.tx.execute(sql`SELECT * FROM traffic_tickets WHERE company_id=${companyId} AND canonical_ready=true AND vehicle_id=${filters.vehicleId} ORDER BY infraction_date DESC,id DESC`);
    else if(filters.driverId) result=await this.tx.execute(sql`SELECT * FROM traffic_tickets WHERE company_id=${companyId} AND canonical_ready=true AND driver_id=${filters.driverId} ORDER BY infraction_date DESC,id DESC`);
    else if(filters.status) result=await this.tx.execute(sql`SELECT * FROM traffic_tickets WHERE company_id=${companyId} AND canonical_ready=true AND status=${filters.status} ORDER BY infraction_date DESC,id DESC`);
    else if(filters.responsibility) result=await this.tx.execute(sql`SELECT * FROM traffic_tickets WHERE company_id=${companyId} AND canonical_ready=true AND responsibility=${filters.responsibility} ORDER BY infraction_date DESC,id DESC`);
    else result=await this.tx.execute(sql`SELECT * FROM traffic_tickets WHERE company_id=${companyId} AND canonical_ready=true ORDER BY infraction_date DESC,id DESC`);
    return rows(result).map(map);
  }

  async findByIdForCompany(companyId:string,id:string):Promise<TrafficTicket|null>{
    const result=await this.tx.execute(sql`SELECT * FROM traffic_tickets WHERE company_id=${companyId} AND canonical_ready=true AND id=${id} LIMIT 1`);
    return rows(result)[0]?map(rows(result)[0]):null;
  }

  async findByIdForCompanyWithLock(companyId:string,id:string):Promise<TrafficTicket|null>{
    const result=await this.tx.execute(sql`SELECT * FROM traffic_tickets WHERE company_id=${companyId} AND canonical_ready=true AND id=${id} FOR UPDATE`);
    return rows(result)[0]?map(rows(result)[0]):null;
  }

  async findByAutoNumber(companyId:string,autoNumber:string):Promise<TrafficTicket|null>{
    const result=await this.tx.execute(sql`SELECT * FROM traffic_tickets WHERE company_id=${companyId} AND canonical_ready=true AND upper(auto_number)=upper(${autoNumber}) LIMIT 1`);
    return rows(result)[0]?map(rows(result)[0]):null;
  }

  async create(item:TrafficTicket):Promise<TrafficTicket>{
    const result=await this.tx.execute(sql`
      INSERT INTO traffic_tickets(
        id,company_id,vehicle_id,driver_id,contract_id,auto_number,amount,issue_date,status,
        organ_name,infraction_code,description,infraction_date,due_date,discount_due_date,
        original_amount,discounted_amount,nic_amount,points,responsibility,
        base_payable_id,receivable_id,nic_payable_id,notes,created_by,cancelled_at,cancel_reason,
        responsibility_version,canonical_ready,created_at,updated_at
      ) VALUES (
        ${item.id},${item.companyId},${item.vehicleId},${item.driverId||null},${item.contractId||null},${item.autoNumber},
        ${String(item.originalAmount)},${item.infractionDate},${item.status},
        ${item.organName},${item.infractionCode},${item.description},${item.infractionDate},${item.dueDate},${item.discountDueDate||null},
        ${String(item.originalAmount)},${item.discountedAmount==null?null:String(item.discountedAmount)},
        ${item.nicAmount==null?null:String(item.nicAmount)},${item.points},${item.responsibility},
        ${item.payableId||null},${item.receivableId||null},${item.nicPayableId||null},${item.notes||null},${item.createdBy||null},
        ${item.cancelledAt||null},${item.cancelReason||null},${item.responsibilityVersion||0},true,${item.createdAt},${item.updatedAt}
      ) RETURNING *
    `);
    return map(rows(result)[0]);
  }

  async save(item:TrafficTicket):Promise<TrafficTicket>{
    const result=await this.tx.execute(sql`
      UPDATE traffic_tickets SET
        driver_id=${item.driverId||null},contract_id=${item.contractId||null},organ_name=${item.organName},
        infraction_code=${item.infractionCode},description=${item.description},due_date=${item.dueDate},
        discount_due_date=${item.discountDueDate||null},discounted_amount=${item.discountedAmount==null?null:String(item.discountedAmount)},
        nic_amount=${item.nicAmount==null?null:String(item.nicAmount)},points=${item.points},responsibility=${item.responsibility},
        status=${item.status},base_payable_id=${item.payableId||null},receivable_id=${item.receivableId||null},
        nic_payable_id=${item.nicPayableId||null},notes=${item.notes||null},cancelled_at=${item.cancelledAt||null},
        cancel_reason=${item.cancelReason||null},responsibility_version=${item.responsibilityVersion||0},updated_at=${item.updatedAt}
      WHERE company_id=${item.companyId} AND id=${item.id} AND canonical_ready=true
      RETURNING *
    `);
    if(!rows(result)[0])throw new Error('Multa não encontrada');
    return map(rows(result)[0]);
  }
}
