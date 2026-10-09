import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import type { ITransactionContext } from '../domain/finance/ITransactionContext';
import { vehicleInspections, fileAttachments, contracts } from '../db/schema';
import { AuditAction, VehicleStatus, OriginType } from '../types/enums';
import { ReceivableService } from '../domain/finance/ReceivableService';
import type { AuthenticatedPrincipal } from './auth';

export interface InspectionSettlementCalculationInput {
  startOdometer: number;
  endOdometer: number;
  franchiseKm: number;
  excessKmRate: number;
  startFuelLevel: number;
  endFuelLevel: number;
  fuelPricePerLiter?: number;
  tankCapacityLiters?: number;
  damagesCost?: number;
  washCost?: number;
  missingAccessoriesCost?: number;
  securityDepositAvailable?: number;
}

export interface InspectionSettlementCalculationResult {
  deltaKm: number;
  excessKm: number;
  excessKmCost: number;
  deltaFuelPercent: number;
  fuelDeltaLiters: number;
  fuelCost: number;
  damagesCost: number;
  washCost: number;
  missingAccessoriesCost: number;
  totalDeviations: number;
  securityDepositAvailable: number;
  securityDepositDeducted: number;
  remainingDepositRefund: number;
  receivableAmount: number;
}

export function calculateInspectionSettlement(
  input: InspectionSettlementCalculationInput
): InspectionSettlementCalculationResult {
  const deltaKm = Math.max(0, input.endOdometer - input.startOdometer);
  const excessKm = input.franchiseKm > 0 ? Math.max(0, deltaKm - input.franchiseKm) : 0;
  const excessKmCost = Math.round(excessKm * (input.excessKmRate || 0) * 100) / 100;

  const deltaFuelPercent = Math.max(0, input.startFuelLevel - input.endFuelLevel);
  const tankCapacity = input.tankCapacityLiters || 45;
  const fuelDeltaLiters = Math.round(((deltaFuelPercent / 100) * tankCapacity) * 10) / 10;
  const fuelPrice = input.fuelPricePerLiter || 6.5;
  const fuelCost = Math.round(fuelDeltaLiters * fuelPrice * 100) / 100;

  const damagesCost = input.damagesCost || 0;
  const washCost = input.washCost || 0;
  const missingAccessoriesCost = input.missingAccessoriesCost || 0;

  const totalDeviations = Math.round(
    (excessKmCost + fuelCost + damagesCost + washCost + missingAccessoriesCost) * 100
  ) / 100;

  const deposit = input.securityDepositAvailable || 0;
  const securityDepositDeducted = Math.min(deposit, totalDeviations);
  const remainingDepositRefund = Math.max(0, deposit - totalDeviations);
  const receivableAmount = Math.max(0, totalDeviations - deposit);

  return {
    deltaKm,
    excessKm,
    excessKmCost,
    deltaFuelPercent,
    fuelDeltaLiters,
    fuelCost,
    damagesCost,
    washCost,
    missingAccessoriesCost,
    totalDeviations,
    securityDepositAvailable: deposit,
    securityDepositDeducted,
    remainingDepositRefund,
    receivableAmount,
  };
}

export class VehicleInspectionSettlementAuthority {
  static async settle(
    context: ITransactionContext,
    companyId: string,
    principal: AuthenticatedPrincipal,
    inspectionId: string,
    settlementData: Partial<InspectionSettlementCalculationResult>
  ) {
    const raw = context.getRawTransaction?.();
    if (!raw) throw new Error('Raw transaction unavailable');

    const rows: any = await raw.execute(sql`
      SELECT * FROM vehicle_inspections
      WHERE company_id = ${companyId} AND id = ${inspectionId}
      LIMIT 1
    `);
    const inspection = rows.rows?.[0];
    if (!inspection) throw new Error('Vistoria não encontrada');

    const vehicleId = inspection.vehicle_id;
    const contractId = inspection.contract_id;
    const driverId = inspection.driver_id;
    const now = new Date().toISOString();

    let receivableId: string | undefined;

    // Se houver saldo devedor não coberto pelo caução, cria título em Contas a Receber
    if (settlementData.receivableAmount && settlementData.receivableAmount > 0) {
      const vehicle = await context.getVehicleRepo().findByIdForCompany(companyId, vehicleId);
      const plate = vehicle?.plate || 'VEICULO';

      const catRows: any = await raw.execute(sql`
        SELECT id FROM financial_categories
        WHERE company_id = ${companyId} AND active = true AND type IN ('INCOME', 'BOTH')
        ORDER BY created_at ASC
        LIMIT 1
      `);
      let categoryId = catRows.rows?.[0]?.id;
      if (!categoryId) {
        categoryId = randomUUID();
        await raw.execute(sql`
          INSERT INTO financial_categories(id, company_id, name, type, active, created_at, updated_at)
          VALUES(${categoryId}, ${companyId}, 'Desvios de Devolução', 'INCOME', true, ${now}, ${now})
        `);
      }

      const receivables = await ReceivableService.create(
        {
          companyId,
          originType: OriginType.ADMINISTRATIVE,
          originId: `${inspectionId}:settlement`,
          vehicleId,
          driverId: driverId || undefined,
          contractId: contractId || undefined,
          categoryId: String(categoryId),
          description: `Desvios de Devolução - Vistoria Placa ${plate}: R$ ${settlementData.receivableAmount.toFixed(2)} (Avarias/Combustível/KM excedente)`,
          totalAmount: settlementData.receivableAmount,
          dueDate: now.slice(0, 10),
          competenceDate: now.slice(0, 10),
          userId: principal.userId,
          userName: principal.name,
        },
        context
      );
      receivableId = receivables[0]?.id;
    }

    // Se houver avarias com custo de reparo relevante, transiciona o status do veículo para MANUTENÇÃO
    if (settlementData.damagesCost && settlementData.damagesCost > 0) {
      const vehicle = await context.getVehicleRepo().findByIdForCompany(companyId, vehicleId);
      if (vehicle && vehicle.status !== VehicleStatus.BLOCKED) {
        await context.getVehicleRepo().updateForCompany(companyId, vehicleId, {
          status: VehicleStatus.MAINTENANCE,
          updatedAt: now,
        });

        await context.getAuditLogRepo().create({
          id: randomUUID(),
          companyId,
          entityName: 'Vehicle',
          entityId: vehicleId,
          action: AuditAction.UPDATE,
          userId: principal.userId,
          userName: principal.name,
          timestamp: now,
          previousState: JSON.stringify({ status: vehicle.status }),
          newState: JSON.stringify({
            status: VehicleStatus.MAINTENANCE,
            reason: 'INSPECTION_DAMAGES_DETECTED',
            inspectionId,
          }),
        });
      }
    }

    // Atualiza o checklist da vistoria com o payload de acerto
    const existingChecklist = inspection.checklist || {};
    const updatedChecklist = {
      ...existingChecklist,
      settlement: {
        ...settlementData,
        settledAt: now,
        settledBy: principal.userId,
        receivableId,
        status: 'SETTLED',
      },
    };

    await raw.execute(sql`
      UPDATE vehicle_inspections
      SET checklist = ${JSON.stringify(updatedChecklist)}::jsonb, updated_at = ${now}
      WHERE company_id = ${companyId} AND id = ${inspectionId}
    `);

    await context.getAuditLogRepo().create({
      id: randomUUID(),
      companyId,
      entityName: 'VehicleInspection',
      entityId: inspectionId,
      action: AuditAction.UPDATE,
      userId: principal.userId,
      userName: principal.name,
      timestamp: now,
      newState: JSON.stringify({
        event: 'INSPECTION_SETTLED',
        settlement: settlementData,
        receivableId,
      }),
    });

    return {
      success: true,
      receivableId,
      settlement: updatedChecklist.settlement,
    };
  }

  /**
   * Avalia anexos de vistoria que já ultrapassaram a janela de retenção jurídica de 90 dias
   * após a data de encerramento do contrato (AUTOERP-62).
   */
  static async listEligiblePurgeAttachments(
    rawTx: any,
    companyId: string,
    cutoffDays = 90
  ): Promise<Array<{ id: string; fileName: string; contractId: string; endDate: string }>> {
    const result: any = await rawTx.execute(sql`
      SELECT fa.id, fa.file_name, c.id AS contract_id, c.end_date
      FROM file_attachments fa
      JOIN vehicle_inspections vi ON vi.id = fa.entity_id AND fa.entity_type = 'VehicleInspection'
      JOIN contracts c ON c.id = vi.contract_id
      WHERE fa.company_id = ${companyId}
        AND fa.is_archived = false
        AND c.status IN ('COMPLETED', 'TERMINATED')
        AND c.end_date IS NOT NULL
        AND c.end_date::date < (CURRENT_DATE - (${cutoffDays} || ' days')::interval)
    `);

    return (result.rows || []).map((row: any) => ({
      id: String(row.id),
      fileName: String(row.file_name),
      contractId: String(row.contract_id),
      endDate: String(row.end_date),
    }));
  }
}
