import { sql } from 'drizzle-orm';
import { db } from '../index';
import type { Insurance, InsuranceStatus } from '../../types/entities';

function rows(result:any):any[]{return Array.isArray(result?.rows)?result.rows:[];}
function dateOnly(value:unknown):string{if(value instanceof Date)return value.toISOString().slice(0,10);return String(value||'').slice(0,10);}
function iso(value:unknown):string{if(value instanceof Date)return value.toISOString();return typeof value==='string'?value:new Date(String(value)).toISOString();}
function optional(value:unknown):string|undefined{return value===null||value===undefined||value===''?undefined:String(value);}
function map(row:any):Insurance{
  const payableIds=Array.isArray(row.account_payable_ids)?row.account_payable_ids:[];
  return {
    id:String(row.id),companyId:String(row.company_id),vehicleId:String(row.vehicle_id),
    insuranceCompany:String(row.insurance_company),policyNumber:String(row.policy_number),
    coverageDetails:String(row.coverage_details||''),deductibleAmount:Number(row.deductible_amount||0),
    totalPremiumAmount:Number(row.total_premium_amount||0),installmentsCount:Number(row.installments_count||1),
    startDate:dateOnly(row.start_date),endDate:dateOnly(row.end_date),status:String(row.status) as InsuranceStatus,
    brokerName:optional(row.broker_name),brokerPhone:optional(row.broker_phone),
    cancellationReason:optional(row.cancellation_reason),cancelledAt:row.cancelled_at?iso(row.cancelled_at):undefined,
    accountPayableIds:payableIds.map(String),createdBy:optional(row.created_by),createdAt:iso(row.created_at),updatedAt:iso(row.updated_at),
  };
}

export class PostgresInsuranceRepository {
  private tx:any;
  constructor(tx?:any){this.tx=tx||db;}

  async findAllByCompany(companyId:string,filters:{vehicleId?:string;status?:InsuranceStatus}={}):Promise<Insurance[]>{
    const result=filters.vehicleId
      ? await this.tx.execute(sql`SELECT * FROM insurances WHERE company_id=${companyId} AND vehicle_id=${filters.vehicleId} ORDER BY start_date DESC,id DESC`)
      : filters.status
        ? await this.tx.execute(sql`SELECT * FROM insurances WHERE company_id=${companyId} AND status=${filters.status} ORDER BY end_date,id`)
        : await this.tx.execute(sql`SELECT * FROM insurances WHERE company_id=${companyId} ORDER BY start_date DESC,id DESC`);
    return rows(result).map(map);
  }

  async findByIdForCompany(companyId:string,id:string):Promise<Insurance|null>{
    const result=await this.tx.execute(sql`SELECT * FROM insurances WHERE company_id=${companyId} AND id=${id} LIMIT 1`);
    return rows(result)[0]?map(rows(result)[0]):null;
  }

  async findByIdForCompanyWithLock(companyId:string,id:string):Promise<Insurance|null>{
    const result=await this.tx.execute(sql`SELECT * FROM insurances WHERE company_id=${companyId} AND id=${id} FOR UPDATE`);
    return rows(result)[0]?map(rows(result)[0]):null;
  }

  async findByPolicyNumber(companyId:string,policyNumber:string):Promise<Insurance|null>{
    const result=await this.tx.execute(sql`SELECT * FROM insurances WHERE company_id=${companyId} AND policy_number=${policyNumber} LIMIT 1`);
    return rows(result)[0]?map(rows(result)[0]):null;
  }

  async create(item:Insurance):Promise<Insurance>{
    const result=await this.tx.execute(sql`
      INSERT INTO insurances(
        id,company_id,vehicle_id,insurance_company,policy_number,coverage_details,
        deductible_amount,total_premium_amount,installments_count,start_date,end_date,status,
        broker_name,broker_phone,account_payable_ids,created_by,created_at,updated_at
      ) VALUES (
        ${item.id},${item.companyId},${item.vehicleId},${item.insuranceCompany},${item.policyNumber},${item.coverageDetails},
        ${String(item.deductibleAmount)},${String(item.totalPremiumAmount)},${item.installmentsCount},${item.startDate},${item.endDate},${item.status},
        ${item.brokerName||null},${item.brokerPhone||null},${JSON.stringify(item.accountPayableIds||[]) }::jsonb,${item.createdBy||''},${item.createdAt},${item.updatedAt}
      ) RETURNING *
    `);
    return map(rows(result)[0]);
  }

  async setPayableIds(companyId:string,id:string,payableIds:string[],updatedAt:string):Promise<Insurance>{
    const result=await this.tx.execute(sql`
      UPDATE insurances SET account_payable_ids=${JSON.stringify(payableIds)}::jsonb,updated_at=${updatedAt}
      WHERE company_id=${companyId} AND id=${id} RETURNING *
    `);
    if(!rows(result)[0])throw new Error('Seguro não encontrado');
    return map(rows(result)[0]);
  }

  async cancel(companyId:string,id:string,reason:string,cancelledAt:string):Promise<Insurance>{
    const result=await this.tx.execute(sql`
      UPDATE insurances SET status='CANCELLED',cancellation_reason=${reason},cancelled_at=${cancelledAt},updated_at=${cancelledAt}
      WHERE company_id=${companyId} AND id=${id} RETURNING *
    `);
    if(!rows(result)[0])throw new Error('Seguro não encontrado');
    return map(rows(result)[0]);
  }

  async markExpired(companyId:string,id:string,updatedAt:string):Promise<Insurance>{
    const result=await this.tx.execute(sql`
      UPDATE insurances SET status='EXPIRED',updated_at=${updatedAt}
      WHERE company_id=${companyId} AND id=${id} AND status='ACTIVE' RETURNING *
    `);
    if(rows(result)[0])return map(rows(result)[0]);
    const current=await this.findByIdForCompany(companyId,id);if(!current)throw new Error('Seguro não encontrado');return current;
  }
}
