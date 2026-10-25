import { randomUUID } from 'node:crypto';
import { and, asc, eq, sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { db } from '../db/index';
import { vehicleTaxCalendar, vehicles, accountPayables, financialCategories } from '../db/schema';
import { FinancialAuthorizationService } from '../domain/finance/FinancialAuthorizationService';
import type { AuthenticatedPrincipal } from './auth';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export class VehicleTaxCalendarValidationError extends Error {}

import officialSpData from './data/officialSpTaxCalendar.json';

export interface OfficialSpYearSchedule {
  source: string;
  ipva: Record<string | number, { cotaUnica: string; parcelas: string[] }>;
  licenciamento: Record<string | number, string>;
}

export const OFFICIAL_SP_SCHEDULES: Record<number, OfficialSpYearSchedule> = officialSpData as any;

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

  /**
   * PH-091: Aplica tabela oficial de vencimentos de SP para todos os dígitos (0 a 9)
   * homologada por ano com fonte oficial (Sefaz-SP e Detran-SP).
   */
  static async applyOfficialSpPreset(
    companyId: string,
    actorId: string,
    referenceYear: number,
  ): Promise<{ appliedCount: number; referenceYear: number; source: string }> {
    const year = assertYear(referenceYear);
    const schedule = OFFICIAL_SP_SCHEDULES[year];
    if (!schedule) {
      throw new VehicleTaxCalendarValidationError(
        `Calendário oficial de SP não homologado para o ano ${year}. Anos oficiais disponíveis: ${Object.keys(OFFICIAL_SP_SCHEDULES).join(', ')}`
      );
    }

    return await UnitOfWork.run(companyId, async (context: any) => {
      const tx = context.getRawTransaction?.();
      if (!tx) throw new Error('Vehicle tax calendar persistence unavailable');
      const now = new Date().toISOString();

      let appliedCount = 0;
      for (let digit = 0; digit <= 9; digit++) {
        const ipvaData = schedule.ipva[digit];
        const licDueDate = schedule.licenciamento[digit];

        // 1. Cota Única
        const idUnica = randomUUID();
        await tx.execute(sql`
          INSERT INTO vehicle_tax_calendar
            (id, company_id, uf, reference_year, plate_last_digit, tax_type, installment, due_date, notes, created_by, created_at, updated_at)
          VALUES
            (${idUnica}, ${companyId}, 'SP', ${year}, ${digit}, 'IPVA_COTA_UNICA', 1, ${ipvaData.cotaUnica}, ${`Cota única com desconto (${schedule.source})`}, ${actorId}, ${now}, ${now})
          ON CONFLICT (company_id, uf, reference_year, plate_last_digit, tax_type, installment)
          DO UPDATE SET due_date = EXCLUDED.due_date, notes = EXCLUDED.notes, updated_at = EXCLUDED.updated_at
        `);
        appliedCount += 1;

        // 2. IPVA Parcelado (1 a 5)
        for (let m = 0; m < 5; m++) {
          const installmentNum = m + 1;
          const idParc = randomUUID();
          await tx.execute(sql`
            INSERT INTO vehicle_tax_calendar
              (id, company_id, uf, reference_year, plate_last_digit, tax_type, installment, due_date, notes, created_by, created_at, updated_at)
            VALUES
              (${idParc}, ${companyId}, 'SP', ${year}, ${digit}, 'IPVA_PARCELADO', ${installmentNum}, ${ipvaData.parcelas[m]}, ${`Parcela ${installmentNum}/5 IPVA (${schedule.source})`}, ${actorId}, ${now}, ${now})
            ON CONFLICT (company_id, uf, reference_year, plate_last_digit, tax_type, installment)
            DO UPDATE SET due_date = EXCLUDED.due_date, notes = EXCLUDED.notes, updated_at = EXCLUDED.updated_at
          `);
          appliedCount += 1;
        }

        // 3. Licenciamento
        const idLic = randomUUID();
        await tx.execute(sql`
          INSERT INTO vehicle_tax_calendar
            (id, company_id, uf, reference_year, plate_last_digit, tax_type, installment, due_date, notes, created_by, created_at, updated_at)
          VALUES
            (${idLic}, ${companyId}, 'SP', ${year}, ${digit}, 'LICENCIAMENTO', 1, ${licDueDate}, ${`Licenciamento obrigatório (${schedule.source})`}, ${actorId}, ${now}, ${now})
          ON CONFLICT (company_id, uf, reference_year, plate_last_digit, tax_type, installment)
          DO UPDATE SET due_date = EXCLUDED.due_date, notes = EXCLUDED.notes, updated_at = EXCLUDED.updated_at
        `);
        appliedCount += 1;
      }

      return { appliedCount, referenceYear: year, source: schedule.source };
    });
  }

  /**
   * PH-091: Gera títulos em account_payables para o IPVA do veículo a partir das datas oficiais
   * cadastradas no calendário. Trava com 409 se títulos ativos para aquele ano já existirem.
   */
  static async generatePayablesForVehicle(
    companyId: string,
    actor: AuthenticatedPrincipal | { userId: string; name?: string },
    input: {
      vehicleId: string;
      referenceYear: number;
      taxType: 'IPVA_COTA_UNICA' | 'IPVA_PARCELADO';
      totalAmount: number;
    },
  ): Promise<{ items: any[] }> {
    const vehicleId = String(input.vehicleId || '').trim();
    const referenceYear = assertYear(input.referenceYear);
    const taxType = assertTaxType(input.taxType);
    if (taxType === 'LICENCIAMENTO') {
      throw new VehicleTaxCalendarValidationError('Geração de títulos suportada apenas para IPVA (Cota Única ou Parcelado)');
    }
    const totalAmount = Number(input.totalAmount);
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      throw new VehicleTaxCalendarValidationError('Valor total do IPVA deve ser maior que zero');
    }

    return await UnitOfWork.run(companyId, async (context: any) => {
      // 1. Autorizador financeiro canônico (re-autentica no banco, checa active/tenant e loga auditoria)
      await FinancialAuthorizationService.authorize(
        actor.userId,
        companyId,
        'PAYABLE_CREATE',
        context,
      );

      const tx = context.getRawTransaction?.();
      if (!tx) throw new Error('Vehicle tax calendar persistence unavailable');

      // 2. Obter veículo
      const vehicleRows = await tx.select().from(vehicles)
        .where(and(eq(vehicles.companyId, companyId), eq(vehicles.id, vehicleId)))
        .limit(1);
      const vehicle = vehicleRows[0];
      if (!vehicle) {
        throw new Error('VEHICLE_NOT_FOUND');
      }

      const digit = plateLastDigit(vehicle.plate);
      if (digit === null) {
        throw new VehicleTaxCalendarValidationError(`Placa ${vehicle.plate} não possui dígito numérico para classificação`);
      }

      const originId = `tax-ipva-${vehicleId}-${referenceYear}`;

      // 3. Trava de duplicidade (409 Conflict): verificar se já existem títulos ATIVOS de IPVA para este veículo no ano
      const existingPayables = await tx.select().from(accountPayables)
        .where(and(
          eq(accountPayables.companyId, companyId),
          eq(accountPayables.vehicleId, vehicleId),
          eq(accountPayables.originType, 'TAX_IPVA'),
          eq(accountPayables.originId, originId),
        ));

      const activeExisting = existingPayables.filter((p: any) => !p.cancelledAt);
      if (activeExisting.length > 0) {
        throw new Error('DUPLICATE_TAX_PAYABLES');
      }

      // Se houver títulos cancelados do mesmo ano/período, desocupar o period_ref e installment_number
      // para evitar colisão com os índices parciais unq_payable_recurring e unq_payable_installments
      await tx.execute(sql`
        UPDATE account_payables
        SET period_ref = period_ref || '-CANCELLED-' || substr(id, 1, 8),
            installment_number = NULL,
            updated_at = NOW()
        WHERE company_id = ${companyId}
          AND origin_type = 'TAX_IPVA'
          AND origin_id = ${originId}
          AND cancelled_at IS NOT NULL
          AND period_ref IS NOT NULL
          AND period_ref NOT LIKE '%-CANCELLED-%'
      `);

      // 4. Obter calendário correspondente ao veículo
      const uf = vehicle.registrationState ? String(vehicle.registrationState).trim().toUpperCase() : 'SP';
      const calendarEntries = await tx.select().from(vehicleTaxCalendar)
        .where(and(
          eq(vehicleTaxCalendar.companyId, companyId),
          eq(vehicleTaxCalendar.uf, uf),
          eq(vehicleTaxCalendar.referenceYear, referenceYear),
          eq(vehicleTaxCalendar.plateLastDigit, digit),
          eq(vehicleTaxCalendar.taxType, taxType),
        ))
        .orderBy(asc(vehicleTaxCalendar.installment));

      if (taxType === 'IPVA_COTA_UNICA' && calendarEntries.length === 0) {
        throw new VehicleTaxCalendarValidationError(`Nenhum vencimento de IPVA Cota Única cadastrado para ${uf} no ano ${referenceYear} (final ${digit})`);
      }

      if (taxType === 'IPVA_PARCELADO' && calendarEntries.length < 5) {
        throw new VehicleTaxCalendarValidationError(`Calendário incompleto: esperado 5 parcelas de IPVA para ${uf} no ano ${referenceYear} (final ${digit}), encontrado ${calendarEntries.length}`);
      }

      // 5. Obter categoria de despesa para IPVA / Documentação (sem fallback arbitrário para categories[0])
      const categories = await tx.select().from(financialCategories)
        .where(and(eq(financialCategories.companyId, companyId), eq(financialCategories.type, 'EXPENSE')));

      let targetCategory = categories.find((c: any) =>
        c.name.toLowerCase().includes('ipva') ||
        c.name.toLowerCase().includes('documenta') ||
        c.name.toLowerCase().includes('imposto'),
      );

      if (!targetCategory) {
        const catId = `cat-tax-${randomUUID().slice(0, 8)}`;
        const now = new Date().toISOString();
        const createdCat = {
          id: catId,
          companyId,
          name: 'IPVA e Documentação',
          type: 'EXPENSE',
          active: true,
          createdAt: now,
          updatedAt: now,
        };
        await tx.insert(financialCategories).values(createdCat);
        targetCategory = createdCat;
      }

      // 6. Gerar títulos
      const now = new Date().toISOString();
      const competenceDate = `${toIsoDate(referenceYear, 1, 1)}T00:00:00.000Z`;
      const createdPayables: any[] = [];

      if (taxType === 'IPVA_COTA_UNICA') {
        const entry = calendarEntries[0];
        const roundedAmount = (Math.round(totalAmount * 100) / 100).toFixed(2);
        const payable = {
          id: randomUUID(),
          companyId,
          originType: 'TAX_IPVA',
          originId,
          vehicleId,
          driverId: null,
          contractId: null,
          categoryId: targetCategory.id,
          description: `IPVA ${referenceYear} - Cota Única - ${vehicle.plate}`,
          originalAmount: roundedAmount,
          discountAmount: '0',
          fineAmount: '0',
          interestAmount: '0',
          additionalAmount: '0',
          updatedAmount: roundedAmount,
          paidAmount: '0',
          balanceAmount: roundedAmount,
          dueDate: `${entry.dueDate}T00:00:00.000Z`,
          competenceDate,
          status: 'PENDING',
          installmentGroupId: null,
          installmentNumber: 1,
          totalInstallments: 1,
          periodRef: `IPVA-${referenceYear}-UNICA`,
          createdAt: now,
          updatedAt: now,
        };
        await tx.insert(accountPayables).values(payable);
        createdPayables.push(payable);
      } else {
        const installmentGroupId = randomUUID();
        const count = 5;
        const totalCents = Math.round(totalAmount * 100);
        const baseCents = Math.floor(totalCents / count);
        const remainderCents = totalCents - (baseCents * count);

        for (let i = 0; i < count; i++) {
          const entry = calendarEntries[i];
          const cents = i === 0 ? baseCents + remainderCents : baseCents;
          const installmentAmount = (cents / 100).toFixed(2);
          const installmentNum = i + 1;

          const payable = {
            id: randomUUID(),
            companyId,
            originType: 'TAX_IPVA',
            originId,
            vehicleId,
            driverId: null,
            contractId: null,
            categoryId: targetCategory.id,
            description: `IPVA ${referenceYear} - Parcela ${installmentNum}/${count} - ${vehicle.plate}`,
            originalAmount: installmentAmount,
            discountAmount: '0',
            fineAmount: '0',
            interestAmount: '0',
            additionalAmount: '0',
            updatedAmount: installmentAmount,
            paidAmount: '0',
            balanceAmount: installmentAmount,
            dueDate: `${entry.dueDate}T00:00:00.000Z`,
            competenceDate,
            status: 'PENDING',
            installmentGroupId,
            installmentNumber: installmentNum,
            totalInstallments: count,
            periodRef: `IPVA-${referenceYear}-P${installmentNum}`,
            createdAt: now,
            updatedAt: now,
          };
          await tx.insert(accountPayables).values(payable);
          createdPayables.push(payable);
        }
      }

      return { items: createdPayables };
    });
  }
}
