import { sql } from 'drizzle-orm';
import type { Tracker } from '../../types/entities';

function rows(result: any): any[] { return Array.isArray(result?.rows) ? result.rows : []; }
function opt(value: unknown): string | undefined { return value === null || value === undefined || value === '' ? undefined : String(value); }
function text(value: unknown): string { return value === null || value === undefined ? '' : String(value); }
function iso(value: unknown): string { if (value instanceof Date) return value.toISOString(); if (typeof value === 'string') return value; return new Date(String(value)).toISOString(); }
function dateOnly(value: unknown): string { const valueString = opt(value); return valueString ? valueString.slice(0, 10) : ''; }
function mapTracker(row: any): Tracker {
  return {
    id:String(row.id),companyId:String(row.company_id),vehicleId:String(row.vehicle_id),serialNumber:opt(row.serial_number),
    equipmentModel:text(row.equipment_model),imei:text(row.imei),chipCarrier:text(row.chip_carrier),chipNumber:text(row.chip_number),
    monthlyCost:row.monthly_cost===null||row.monthly_cost===undefined?0:Number(row.monthly_cost),installationDate:dateOnly(row.installation_date),
    status:String(row.status) as Tracker['status'],supplierId:opt(row.supplier_id),notes:opt(row.notes),lastPing:row.last_ping?iso(row.last_ping):undefined,
    providerName:opt(row.provider_name),providerContact:opt(row.provider_contact),portalUrl:opt(row.portal_url),
    createdBy:opt(row.created_by),createdAt:iso(row.created_at),updatedAt:iso(row.updated_at),
  };
}

export class PostgresTrackerRepository {
  constructor(private readonly tx:any) {}
  async findAllByCompany(companyId:string,vehicleId?:string):Promise<Tracker[]> {
    const result=vehicleId?await this.tx.execute(sql`SELECT * FROM trackers WHERE company_id=${companyId} AND vehicle_id=${vehicleId} ORDER BY created_at DESC,id DESC`):await this.tx.execute(sql`SELECT * FROM trackers WHERE company_id=${companyId} ORDER BY created_at DESC,id DESC`);return rows(result).map(mapTracker);
  }
  async findByIdForCompany(companyId:string,id:string):Promise<Tracker|null>{const row=rows(await this.tx.execute(sql`SELECT * FROM trackers WHERE company_id=${companyId} AND id=${id} LIMIT 1`))[0];return row?mapTracker(row):null;}
  async findByIdForCompanyWithLock(companyId:string,id:string):Promise<Tracker|null>{const row=rows(await this.tx.execute(sql`SELECT * FROM trackers WHERE company_id=${companyId} AND id=${id} FOR UPDATE`))[0];return row?mapTracker(row):null;}
  async findByImei(companyId:string,imei:string):Promise<Tracker|null>{const row=rows(await this.tx.execute(sql`SELECT * FROM trackers WHERE company_id=${companyId} AND imei=${imei} LIMIT 1`))[0];return row?mapTracker(row):null;}
  async findActiveByVehicle(companyId:string,vehicleId:string,excludeId?:string,lock=false):Promise<Tracker|null>{
    const result=excludeId?(lock?await this.tx.execute(sql`SELECT * FROM trackers WHERE company_id=${companyId} AND vehicle_id=${vehicleId} AND status='ACTIVE' AND id<>${excludeId} LIMIT 1 FOR UPDATE`):await this.tx.execute(sql`SELECT * FROM trackers WHERE company_id=${companyId} AND vehicle_id=${vehicleId} AND status='ACTIVE' AND id<>${excludeId} LIMIT 1`)):(lock?await this.tx.execute(sql`SELECT * FROM trackers WHERE company_id=${companyId} AND vehicle_id=${vehicleId} AND status='ACTIVE' LIMIT 1 FOR UPDATE`):await this.tx.execute(sql`SELECT * FROM trackers WHERE company_id=${companyId} AND vehicle_id=${vehicleId} AND status='ACTIVE' LIMIT 1`));const row=rows(result)[0];return row?mapTracker(row):null;
  }
  async create(item:Tracker):Promise<Tracker>{const result=await this.tx.execute(sql`
    INSERT INTO trackers(id,company_id,vehicle_id,serial_number,equipment_model,imei,chip_carrier,chip_number,monthly_cost,installation_date,status,supplier_id,provider_name,provider_contact,portal_url,notes,last_ping,created_by,created_at,updated_at)
    VALUES(${item.id},${item.companyId},${item.vehicleId},${item.serialNumber||null},${item.equipmentModel||null},${item.imei||null},${item.chipCarrier||null},${item.chipNumber||null},${String(item.monthlyCost)},${item.installationDate||null},${item.status},${item.supplierId||null},${item.providerName||null},${item.providerContact||null},${item.portalUrl||null},${item.notes||null},${item.lastPing||null},${item.createdBy||null},${item.createdAt},${item.updatedAt}) RETURNING *`);return mapTracker(rows(result)[0]);}
  async updateForCompany(companyId:string,id:string,item:Tracker):Promise<Tracker|null>{const result=await this.tx.execute(sql`
    UPDATE trackers SET serial_number=${item.serialNumber||null},equipment_model=${item.equipmentModel||null},imei=${item.imei||null},chip_carrier=${item.chipCarrier||null},chip_number=${item.chipNumber||null},monthly_cost=${String(item.monthlyCost)},installation_date=${item.installationDate||null},status=${item.status},supplier_id=${item.supplierId||null},provider_name=${item.providerName||null},provider_contact=${item.providerContact||null},portal_url=${item.portalUrl||null},notes=${item.notes||null},last_ping=${item.lastPing||null},updated_at=${item.updatedAt}
    WHERE company_id=${companyId} AND id=${id} RETURNING *`);const row=rows(result)[0];return row?mapTracker(row):null;}
}
