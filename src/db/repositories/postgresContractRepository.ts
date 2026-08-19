import { sql } from 'drizzle-orm';
import type { ITransactionContractRepository } from '../../domain/finance/ITransactionContext';
import type { Contract } from '../../types/entities';
import { ContractStatus, RecurringFrequency } from '../../types/enums';

function rowsOf(result: any): any[] {
  return Array.isArray(result?.rows) ? result.rows : [];
}

export class PostgresContractRepository implements ITransactionContractRepository {
  constructor(private readonly tx: any) {}

  private map(row: any): Contract {
    return {
      id: String(row.id),
      companyId: String(row.company_id),
      contractNumber: String(row.contract_number || ''),
      driverId: String(row.driver_id),
      vehicleId: String(row.vehicle_id),
      startDate: String(row.start_date || ''),
      endDate: row.end_date || undefined,
      status: String(row.status) as ContractStatus,
      rentalAmount: Number(row.rental_amount || 0),
      billingPeriodicity: String(row.billing_periodicity || RecurringFrequency.WEEKLY) as RecurringFrequency,
      billingDueDayOfWeek: row.billing_due_day_of_week == null ? undefined : Number(row.billing_due_day_of_week),
      billingDueDayOfMonth: row.billing_due_day_of_month == null ? undefined : Number(row.billing_due_day_of_month),
      securityDepositAmount: Number(row.security_deposit_amount || 0),
      securityDepositId: row.security_deposit_id || undefined,
      franchiseKm: Number(row.franchise_km || 0),
      excessKmRate: Number(row.excess_km_rate || 0),
      paymentMethodId: row.payment_method_id || undefined,
      templateId: row.template_id || undefined,
      generatedPdfUrl: row.generated_pdf_url || undefined,
      signedContractUrl: row.signed_contract_url || undefined,
      notes: row.notes || undefined,
      isArchived: Boolean(row.is_archived),
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    };
  }

  async findById(id: string): Promise<Contract | null> {
    const result = await this.tx.execute(sql`SELECT * FROM contracts WHERE id = ${id} LIMIT 1`);
    const row = rowsOf(result)[0];
    return row ? this.map(row) : null;
  }

  async findByIdForCompany(companyId: string, id: string): Promise<Contract | null> {
    const result = await this.tx.execute(sql`
      SELECT * FROM contracts
      WHERE company_id = ${companyId} AND id = ${id}
      LIMIT 1
    `);
    const row = rowsOf(result)[0];
    return row ? this.map(row) : null;
  }

  async findByIdForCompanyWithLock(companyId: string, id: string): Promise<Contract | null> {
    const result = await this.tx.execute(sql`
      SELECT * FROM contracts
      WHERE company_id = ${companyId} AND id = ${id}
      FOR UPDATE
    `);
    const row = rowsOf(result)[0];
    return row ? this.map(row) : null;
  }

  async findAllByCompany(companyId: string): Promise<Contract[]> {
    const result = await this.tx.execute(sql`
      SELECT * FROM contracts
      WHERE company_id = ${companyId}
      ORDER BY created_at DESC, id DESC
    `);
    return rowsOf(result).map((row) => this.map(row));
  }

  async findByNumber(companyId: string, contractNumber: string): Promise<Contract | null> {
    const result = await this.tx.execute(sql`
      SELECT * FROM contracts
      WHERE company_id = ${companyId} AND upper(contract_number) = upper(${contractNumber})
      LIMIT 1
    `);
    const row = rowsOf(result)[0];
    return row ? this.map(row) : null;
  }

  async findActiveByVehicle(companyId: string, vehicleId: string, excludeContractId?: string): Promise<Contract | null> {
    const result = excludeContractId
      ? await this.tx.execute(sql`
          SELECT * FROM contracts
          WHERE company_id = ${companyId}
            AND vehicle_id = ${vehicleId}
            AND status = 'ACTIVE'
            AND is_archived = false
            AND id <> ${excludeContractId}
          LIMIT 1
        `)
      : await this.tx.execute(sql`
          SELECT * FROM contracts
          WHERE company_id = ${companyId}
            AND vehicle_id = ${vehicleId}
            AND status = 'ACTIVE'
            AND is_archived = false
          LIMIT 1
        `);
    const row = rowsOf(result)[0];
    return row ? this.map(row) : null;
  }

  async findActiveByDriver(companyId: string, driverId: string, excludeContractId?: string): Promise<Contract | null> {
    const result = excludeContractId
      ? await this.tx.execute(sql`
          SELECT * FROM contracts
          WHERE company_id = ${companyId}
            AND driver_id = ${driverId}
            AND status = 'ACTIVE'
            AND is_archived = false
            AND id <> ${excludeContractId}
          LIMIT 1
        `)
      : await this.tx.execute(sql`
          SELECT * FROM contracts
          WHERE company_id = ${companyId}
            AND driver_id = ${driverId}
            AND status = 'ACTIVE'
            AND is_archived = false
          LIMIT 1
        `);
    const row = rowsOf(result)[0];
    return row ? this.map(row) : null;
  }

  async create(item: Contract): Promise<Contract> {
    await this.tx.execute(sql`
      INSERT INTO contracts (
        id, company_id, driver_id, vehicle_id, status,
        contract_number, start_date, end_date, rental_amount, billing_periodicity,
        billing_due_day_of_week, billing_due_day_of_month,
        security_deposit_amount, security_deposit_id, franchise_km, excess_km_rate,
        payment_method_id, template_id, generated_pdf_url, signed_contract_url,
        notes, is_archived, created_at, updated_at
      ) VALUES (
        ${item.id}, ${item.companyId}, ${item.driverId}, ${item.vehicleId}, ${item.status},
        ${item.contractNumber}, ${item.startDate}, ${item.endDate || null}, ${item.rentalAmount}, ${item.billingPeriodicity},
        ${item.billingDueDayOfWeek ?? 1}, ${item.billingDueDayOfMonth ?? 1},
        ${item.securityDepositAmount}, ${item.securityDepositId || null}, ${item.franchiseKm}, ${item.excessKmRate},
        ${item.paymentMethodId || null}, ${item.templateId || null}, ${item.generatedPdfUrl || null}, ${item.signedContractUrl || null},
        ${item.notes || null}, ${item.isArchived}, ${item.createdAt}, ${item.updatedAt}
      )
    `);
    const created = await this.findByIdForCompany(item.companyId, item.id);
    if (!created) throw new Error('Contract create failed');
    return created;
  }

  async updateForCompany(companyId: string, id: string, changes: Partial<Contract>): Promise<Contract | null> {
    const existing = await this.findByIdForCompany(companyId, id);
    if (!existing) return null;
    const item: Contract = { ...existing, ...changes, id: existing.id, companyId: existing.companyId };
    const result = await this.tx.execute(sql`
      UPDATE contracts SET
        driver_id = ${item.driverId},
        vehicle_id = ${item.vehicleId},
        status = ${item.status},
        contract_number = ${item.contractNumber},
        start_date = ${item.startDate},
        end_date = ${item.endDate || null},
        rental_amount = ${item.rentalAmount},
        billing_periodicity = ${item.billingPeriodicity},
        billing_due_day_of_week = ${item.billingDueDayOfWeek ?? 1},
        billing_due_day_of_month = ${item.billingDueDayOfMonth ?? 1},
        security_deposit_amount = ${item.securityDepositAmount},
        security_deposit_id = ${item.securityDepositId || null},
        franchise_km = ${item.franchiseKm},
        excess_km_rate = ${item.excessKmRate},
        payment_method_id = ${item.paymentMethodId || null},
        template_id = ${item.templateId || null},
        generated_pdf_url = ${item.generatedPdfUrl || null},
        signed_contract_url = ${item.signedContractUrl || null},
        notes = ${item.notes || null},
        is_archived = ${item.isArchived},
        updated_at = ${item.updatedAt}
      WHERE company_id = ${companyId} AND id = ${id}
      RETURNING id
    `);
    if (!rowsOf(result)[0]) return null;
    return await this.findByIdForCompany(companyId, id);
  }
}
