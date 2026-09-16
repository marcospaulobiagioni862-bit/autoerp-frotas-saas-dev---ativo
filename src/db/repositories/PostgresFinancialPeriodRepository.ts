import { PostgresBaseRepository } from './postgresRepositories';
import { financialPeriods } from '../schema';
import { FinancialPeriod } from '../../types/entities';
import { FinancialPeriodStatus } from '../../types/enums';
import { IFinancialPeriodRepository, FilterOptions } from '../../persistence/repositories/interfaces';
import { eq, and, sql } from 'drizzle-orm';

export class PostgresFinancialPeriodRepository implements IFinancialPeriodRepository {
  private baseRepo: PostgresBaseRepository<any>;
  private tx: any;

  constructor(tx?: any) {
    this.tx = tx;
    this.baseRepo = new PostgresBaseRepository(financialPeriods, tx);
  }

  private mapRowToEntity(row: any): FinancialPeriod {
    const year = row.year;
    const month = String(row.month).padStart(2, '0');
    const lastDay = new Date(year, row.month, 0).getDate();
    return {
      id: row.id,
      companyId: row.companyId,
      startDate: `${year}-${month}-01`,
      endDate: `${year}-${month}-${String(lastDay).padStart(2, '0')}`,
      status: row.status as FinancialPeriodStatus,
      closedAt: row.closedAt,
      closedBy: row.closedBy,
      createdAt: row.createdAt || new Date().toISOString(),
      updatedAt: row.updatedAt || new Date().toISOString(),
    };
  }

  async findById(id: string): Promise<FinancialPeriod | null> {
    const row = await this.baseRepo.findById(id);
    return row ? this.mapRowToEntity(row) : null;
  }

  async create(entity: FinancialPeriod): Promise<FinancialPeriod> {
    const start = entity.startDate || new Date().toISOString();
    const parts = start.split('-');
    const year = parseInt(parts[0], 10) || new Date().getFullYear();
    const month = parseInt(parts[1], 10) || (new Date().getMonth() + 1);

    const record = {
      id: entity.id,
      companyId: entity.companyId,
      year,
      month,
      status: entity.status,
      closedAt: entity.closedAt || null,
      closedBy: entity.closedBy || null,
    };

    const created = await this.baseRepo.create(record);
    return this.mapRowToEntity(created);
  }

  async update(id: string, partial: Partial<FinancialPeriod>): Promise<FinancialPeriod> {
    const patch: any = {};
    if (partial.status) patch.status = partial.status;
    if (partial.closedAt !== undefined) patch.closedAt = partial.closedAt;
    if (partial.closedBy !== undefined) patch.closedBy = partial.closedBy;
    if (partial.startDate) {
      const parts = partial.startDate.split('-');
      patch.year = parseInt(parts[0], 10);
      patch.month = parseInt(parts[1], 10);
    }

    const updated = await this.baseRepo.update(id, patch);
    return this.mapRowToEntity(updated);
  }

  async delete(id: string): Promise<boolean> {
    return await this.baseRepo.delete(id);
  }

  async findAll(options?: FilterOptions): Promise<FinancialPeriod[]> {
    const rows = await this.baseRepo.findAll(options);
    return rows.map((r: any) => this.mapRowToEntity(r));
  }

  async count(options?: FilterOptions): Promise<number> {
    return await this.baseRepo.count(options);
  }
}

