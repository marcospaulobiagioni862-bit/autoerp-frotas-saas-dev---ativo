import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { db } from '../db/index';
import { vehicleTaxCalendar } from '../db/schema';

export class VehicleTaxCalendarValidationError extends Error {}

export type VehicleTaxType = 'IPVA_COTA_UNICA' | 'IPVA_PARCELADO' | 'LICENCIAMENTO';
export const VEHICLE_TAX_TYPES: readonly VehicleTaxType[] = ['IPVA_COTA_UNICA', 'IPVA_PARCELADO', 'LICENCIAMENTO'];

export interface VehicleTaxCalendarEntry {
  id: string;
  uf: string;
  referenceYear: number;
  plateLastDigit: number;
  taxType: VehicleTaxType;
  installment: number;
  dueDate: string;
  notes: string | null;
}

/**
 * Último dígito NUMÉRICO da placa.
 *
 * 🔴 Armadilha real: na placa Mercosul o último caractere pode ser LETRA
 * (ex.: ABC1D23 termina em 3, mas BRA0S17 e placas antigas como ABC1234 terminam
 * em dígito). O calendário da Sefaz é por último dígito do número da placa, então
 * pegar `plate.at(-1)` cegamente classificaria errado qualquer placa terminada em
 * letra — e vencimento de imposto errado é multa. Aqui o último dígito é o último
 * caractere NUMÉRICO da placa; placa sem nenhum dígito devolve null e o veículo
 * aparece como "não classificável" em vez de receber uma data inventada.
 */
export function plateLastDigit(plate: string): number | null {
  const digitsOnly = String(plate || '').replace(/\D/g, '');
  if (!digitsOnly) return null;
  return Number(digitsOnly[digitsOnly.length - 1]);
}

function assertYear(value: unknown): number {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new VehicleTaxCalendarValidationError();
  return year;
}

function assertUf(value: unknown): string {
  const uf = String(value || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(uf)) throw new VehicleTaxCalendarValidationError();
  return uf;
}

function assertDigit(value: unknown): number {
  const digit = Number(value);
  if (!Number.isInteger(digit) || digit < 0 || digit > 9) throw new VehicleTaxCalendarValidationError();
  return digit;
}

function assertTaxType(value: unknown): VehicleTaxType {
  const taxType = String(value || '').trim().toUpperCase() as VehicleTaxType;
  if (!VEHICLE_TAX_TYPES.includes(taxType)) throw new VehicleTaxCalendarValidationError();
  return taxType;
}

function assertInstallment(value: unknown): number {
  const installment = value === undefined || value === null || value === '' ? 1 : Number(value);
  if (!Number.isInteger(installment) || installment < 1 || installment > 12) throw new VehicleTaxCalendarValidationError();
  return installment;
}

function assertDueDate(value: unknown): string {
  const dueDate = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new VehicleTaxCalendarValidationError();
  const parsed = new Date(`${dueDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dueDate) {
    throw new VehicleTaxCalendarValidationError();
  }
  return dueDate;
}

export class VehicleTaxCalendarAuthority {
  static async list(companyId: string, filters: { uf?: string; referenceYear?: number } = {}): Promise<VehicleTaxCalendarEntry[]> {
    return await UnitOfWork.run(companyId, async () => {
      const conditions = [eq(vehicleTaxCalendar.companyId, companyId)];
      if (filters.uf) conditions.push(eq(vehicleTaxCalendar.uf, assertUf(filters.uf)));
      if (filters.referenceYear) conditions.push(eq(vehicleTaxCalendar.referenceYear, assertYear(filters.referenceYear)));
      const rows = await db
        .select()
        .from(vehicleTaxCalendar)
        .where(and(...conditions))
        .orderBy(asc(vehicleTaxCalendar.plateLastDigit), asc(vehicleTaxCalendar.taxType), asc(vehicleTaxCalendar.installment));
      return rows.map((row) => ({
        id: row.id,
        uf: row.uf,
        referenceYear: row.referenceYear,
        plateLastDigit: row.plateLastDigit,
        taxType: row.taxType as VehicleTaxType,
        installment: row.installment,
        dueDate: String(row.dueDate),
        notes: row.notes ?? null,
      }));
    });
  }

  /** Vencimentos de um veículo no ano, a partir do último dígito da placa. */
  static async forVehicle(
    companyId: string,
    input: { plate: string; uf: string; referenceYear: number },
  ): Promise<{ plateLastDigit: number | null; entries: VehicleTaxCalendarEntry[] }> {
    const digit = plateLastDigit(input.plate);
    if (digit === null) return { plateLastDigit: null, entries: [] };
    const all = await VehicleTaxCalendarAuthority.list(companyId, {
      uf: input.uf,
      referenceYear: input.referenceYear,
    });
    return { plateLastDigit: digit, entries: all.filter((entry) => entry.plateLastDigit === digit) };
  }

  static async upsert(
    companyId: string,
    actorId: string,
    input: { uf: unknown; referenceYear: unknown; plateLastDigit: unknown; taxType: unknown; installment?: unknown; dueDate: unknown; notes?: unknown },
  ): Promise<VehicleTaxCalendarEntry> {
    const uf = assertUf(input.uf);
    const referenceYear = assertYear(input.referenceYear);
    const digit = assertDigit(input.plateLastDigit);
    const taxType = assertTaxType(input.taxType);
    const installment = assertInstallment(input.installment);
    const dueDate = assertDueDate(input.dueDate);
    // Cota única não é parcela: aceitar installment > 1 aqui criaria duas linhas
    // para o mesmo imposto do mesmo dígito, e duas cobranças depois.
    if (taxType !== 'IPVA_PARCELADO' && installment !== 1) throw new VehicleTaxCalendarValidationError();
    const notes = input.notes === undefined || input.notes === null ? null : String(input.notes).slice(0, 500);

    return await UnitOfWork.run(companyId, async (context: any) => {
      const tx = context.getRawTransaction?.();
      if (!tx) throw new Error('Vehicle tax calendar persistence unavailable');
      const now = new Date().toISOString();
      const id = randomUUID();
      await tx.execute(
        // O índice único garante uma data por (empresa, UF, ano, dígito, tipo, parcela).
        // O upsert evita que recadastrar o calendário duplique o vencimento.
        (await import('drizzle-orm')).sql`
          INSERT INTO vehicle_tax_calendar
            (id, company_id, uf, reference_year, plate_last_digit, tax_type, installment, due_date, notes, created_by, created_at, updated_at)
          VALUES
            (${id}, ${companyId}, ${uf}, ${referenceYear}, ${digit}, ${taxType}, ${installment}, ${dueDate}, ${notes}, ${actorId}, ${now}, ${now})
          ON CONFLICT (company_id, uf, reference_year, plate_last_digit, tax_type, installment)
          DO UPDATE SET due_date = EXCLUDED.due_date, notes = EXCLUDED.notes, updated_at = EXCLUDED.updated_at
        `,
      );
      return { id, uf, referenceYear, plateLastDigit: digit, taxType, installment, dueDate, notes };
    });
  }
}
