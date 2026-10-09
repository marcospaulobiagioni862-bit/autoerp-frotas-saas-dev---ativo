import { sql, and, eq, desc } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { auditLogs } from '../db/schema';
import type { Vehicle, KmRecord, AuditLog, VehicleOwnershipHistory } from '../types/entities';
import type { VehicleDetailedSummary } from '../domain/services/VehicleLegacyDetailsBridge';

export class VehicleDetailsNotFoundError extends Error {
  constructor(message = 'Veículo não encontrado') {
    super(message);
    this.name = 'VehicleDetailsNotFoundError';
  }
}

export async function getVehicleDetailsSummary(
  companyId: string,
  vehicleId: string
): Promise<VehicleDetailedSummary> {
  return await UnitOfWork.run(companyId, async (txContext) => {
    const raw = txContext.getRawTransaction();

    // 1. Veículo
    const vehicle = await txContext.getVehicleRepo().findByIdForCompany(companyId, vehicleId);
    if (!vehicle) {
      throw new VehicleDetailsNotFoundError();
    }

    // 2. Motorista atual vinculado (se houver)
    let driver: any = undefined;
    if (vehicle.currentDriverId) {
      const driverCore = await txContext.getDriverRepo().findByIdForCompany(companyId, vehicle.currentDriverId);
      if (driverCore) {
        driver = { ...driverCore, name: driverCore.fullName };
      }
    }

    // 3. Contratos do veículo (somente deste veículo)
    const contractResult = await raw.execute(sql`
      SELECT c.*, EXISTS (
        SELECT 1 FROM contract_artifacts a
        WHERE a.company_id = c.company_id AND a.contract_id = c.id
          AND a.artifact_type = 'SIGNED_EVIDENCE'
          AND a.is_current = true AND a.is_archived = false
      ) AS has_signed_evidence
      FROM contracts c
      WHERE c.company_id = ${companyId} AND c.vehicle_id = ${vehicleId}
      ORDER BY c.created_at DESC, c.id DESC
    `);
    const contractRows = Array.isArray(contractResult?.rows) ? contractResult.rows : [];
    const contractHistory = contractRows.map((row: any) => ({
      id: String(row.id),
      companyId: String(row.company_id),
      contractNumber: String(row.contract_number || ''),
      driverId: String(row.driver_id),
      vehicleId: String(row.vehicle_id),
      startDate: String(row.start_date || ''),
      endDate: row.end_date || undefined,
      status: String(row.status),
      rentalAmount: Number(row.rental_amount || 0),
      recurringValue: Number(row.rental_amount || 0),
      billingPeriodicity: String(row.billing_periodicity || 'WEEKLY'),
      billingDueDayOfWeek: row.billing_due_day_of_week == null ? undefined : Number(row.billing_due_day_of_week),
      billingDueDayOfMonth: row.billing_due_day_of_month == null ? undefined : Number(row.billing_due_day_of_month),
      securityDepositAmount: Number(row.security_deposit_amount || 0),
      securityDepositValue: Number(row.security_deposit_amount || 0),
      securityDepositId: row.security_deposit_id || undefined,
      franchiseKm: Number(row.franchise_km || 0),
      excessKmRate: Number(row.excess_km_rate || 0),
      paymentMethodId: row.payment_method_id || undefined,
      templateId: row.template_id || undefined,
      generatedPdfUrl: row.generated_pdf_url || undefined,
      signedContractUrl: row.signed_contract_url || undefined,
      hasSignedEvidence: Boolean(row.has_signed_evidence),
      signatureRequired: Boolean(row.signature_required),
      notes: row.notes || undefined,
      isArchived: Boolean(row.is_archived),
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    }));

    const activeCanonical = vehicle.currentContractId
      ? contractHistory.find((item: any) => item.id === vehicle.currentContractId)
      : contractHistory.find((item: any) => item.status === 'ACTIVE');
    const activeContract = activeCanonical;

    // 4. Manutenções (execução sequencial para evitar concorrência em conexão pg compartilhada)
    const workOrders = await txContext.getWorkOrderRepo().findAllByCompany(companyId, vehicleId);
    const suppliers = await txContext.getSupplierRepo().findAllByCompany(companyId);
    const oilChanges = await txContext.getOilChangeRepo().findAllByCompany(companyId, vehicleId);
    const tires = await txContext.getTireRepo().findAllByCompany(companyId, vehicleId);

    const supplierNames = new Map(suppliers.map((item: any) => [item.id, item.tradeName || item.name]));

    const workOrderHistory = workOrders.map((item: any) => ({
      id: item.id,
      companyId: item.companyId,
      vehicleId: item.vehicleId,
      supplierId: item.supplierId,
      supplierName: item.supplierId ? supplierNames.get(item.supplierId) : undefined,
      type: 'WORK_ORDER',
      description: item.description,
      kmAtMaintenance: item.exitKm ?? item.entryKm,
      partsCost: item.subtotalParts,
      laborCost: item.subtotalLabor + item.subtotalServices,
      totalCost: item.total,
      status: item.status,
      startDate: item.serviceDate || item.startedAt || item.openedAt,
      completionDate: item.completedAt,
      accountPayableId: item.accountPayableId,
      notes: item.notes,
      parts: item.parts,
      services: item.services,
      laborItems: item.laborItems,
      workOrderNumber: item.number,
      attachmentEntityType: 'MaintenanceWorkOrder',
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));

    const oilHistory = oilChanges.map((item: any) => ({
      id: `oil-${item.id}`,
      companyId: item.companyId,
      vehicleId: item.vehicleId,
      supplierId: item.supplierId,
      supplierName: item.supplierId ? supplierNames.get(item.supplierId) : undefined,
      type: 'OIL_CHANGE',
      description: `Troca de óleo ${item.oilBrand} ${item.oilType}${item.filterChanged ? ' com filtro' : ''}`,
      kmAtMaintenance: item.km,
      partsCost: 0,
      laborCost: 0,
      totalCost: 0,
      status: 'COMPLETED',
      startDate: item.date,
      completionDate: item.date,
      notes: item.notes,
      parts: [],
      services: [],
      laborItems: [],
      sourceAttachmentId: item.attachmentId,
      nextMaintenanceKm: item.nextKm,
      nextMaintenanceDate: item.nextDate,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));

    const tireHistory = tires.map((item: any) => ({
      id: `tire-${item.id}`,
      companyId: item.companyId,
      vehicleId: item.vehicleId,
      supplierId: item.supplierId,
      supplierName: item.supplierId ? supplierNames.get(item.supplierId) : undefined,
      type: 'TIRE',
      description: `Pneu ${item.brand} ${item.model} — posição ${item.position}${item.lastRotationDate ? ` — último rodízio em ${item.lastRotationDate}` : ''}`,
      kmAtMaintenance: item.lastRotationKm ?? item.removalKm ?? item.installationKm,
      partsCost: item.cost,
      laborCost: 0,
      totalCost: item.cost,
      status: 'COMPLETED',
      startDate: item.lastRotationDate || item.removalDate || item.installationDate,
      completionDate: item.lastRotationDate || item.removalDate || item.installationDate,
      notes: item.notes,
      parts: [],
      services: [],
      laborItems: [],
      sourceAttachmentId: item.attachmentId,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));

    const maintenances = [...workOrderHistory, ...oilHistory, ...tireHistory]
      .sort((a, b) => Date.parse(String(b.startDate || '')) - Date.parse(String(a.startDate || '')));

    // 5. Multas canônicas vinculadas ao veículo
    const canonicalTickets = await txContext.getTrafficTicketRepo().findAllByCompany(companyId, { vehicleId });
    const trafficTickets = canonicalTickets.map((item: any) => ({
      ...item,
      noticeNumber: item.autoNumber,
      ticketDate: item.infractionDate,
      amount: item.originalAmount ?? item.amount,
    }));

    // 6. Documentos, Seguros e Rastreadores
    const documents = await txContext.getDocumentRepo().findAllByCompany(companyId, { subjectType: 'VEHICLE', subjectId: vehicleId });
    const insurances = await txContext.getInsuranceRepo().findAllByCompany(companyId, { vehicleId });
    const trackers = await txContext.getTrackerRepo().findAllByCompany(companyId, vehicleId);

    // 7. Leituras de odômetro (com filtro anti-duplicata de leituras consecutivas)
    const rawKm = await txContext.getKmRecordRepo().findByVehicleIdForCompany(companyId, vehicleId);
    const kmRecords = rawKm.filter((record, index, records) => index === 0 || record.kmValue !== records[index - 1].kmValue);

    // 8. Histórico e auditoria (últimos 200 eventos do veículo)
    const auditRows = await raw
      .select()
      .from(auditLogs)
      .where(and(
        eq(auditLogs.companyId, companyId),
        eq(auditLogs.entityType, 'Vehicle'),
        eq(auditLogs.entityId, vehicleId),
      ))
      .orderBy(desc(auditLogs.timestamp))
      .limit(200);

    const historyLogs = auditRows.map((row: any) => {
      let previousState: string | undefined;
      let newState: string | undefined;
      let userName = 'Sistema';
      try {
        const parsed = JSON.parse(String(row.changes || '{}'));
        previousState = parsed.previousState ?? undefined;
        newState = parsed.newState ?? undefined;
        userName = parsed.userName || userName;
      } catch {}
      return {
        id: String(row.id),
        companyId: String(row.companyId),
        entityName: String(row.entityType),
        entityId: String(row.entityId),
        action: String(row.action) as any,
        previousState,
        newState,
        userId: String(row.userId),
        userName,
        ipAddress: row.ipAddress || undefined,
        timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp),
      };
    });

    // 9. Histórico de titularidade
    const ownershipHistory: VehicleOwnershipHistory[] = await txContext.getVehicleRepo().getOwnershipHistoryForVehicle(companyId, vehicleId);

    // 10. Agregação financeira direta via SQL (zero sobrecarga de memória no cliente)
    const revRes = await raw.execute(sql`
      SELECT COALESCE(SUM(paid_amount), 0)::numeric AS total
      FROM account_receivables
      WHERE company_id = ${companyId} AND vehicle_id = ${vehicleId} AND status = 'PAID'
    `);
    const payRes = await raw.execute(sql`
      SELECT COALESCE(SUM(paid_amount), 0)::numeric AS total
      FROM account_payables
      WHERE company_id = ${companyId} AND vehicle_id = ${vehicleId} AND status = 'PAID'
    `);
    const totalRevenue = Number(revRes.rows?.[0]?.total || 0);
    const totalExpenses = Number(payRes.rows?.[0]?.total || 0);
    const netProfit = totalRevenue - totalExpenses;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
    const financialSummary = { totalRevenue, totalExpenses, netProfit, profitMargin };

    // 11. Resumo operacional de vistorias
    const inspLatestRes = await raw.execute(sql`
      SELECT id, inspection_type, inspection_date, km, result, inspector_name
      FROM vehicle_inspections
      WHERE company_id = ${companyId} AND vehicle_id = ${vehicleId}
      ORDER BY inspection_date DESC, created_at DESC
      LIMIT 1
    `);
    const inspCountRes = await raw.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM vehicle_inspections
      WHERE company_id = ${companyId} AND vehicle_id = ${vehicleId}
    `);
    const latestInspRow = inspLatestRes.rows?.[0];
    const inspectionsSummary = {
      total: Number(inspCountRes.rows?.[0]?.count || 0),
      latest: latestInspRow ? {
        id: String(latestInspRow.id),
        inspectionType: String(latestInspRow.inspection_type),
        inspectionDate: String(latestInspRow.inspection_date),
        km: Number(latestInspRow.km),
        result: String(latestInspRow.result),
        inspectorName: latestInspRow.inspector_name ? String(latestInspRow.inspector_name) : undefined,
      } : undefined,
    };

    // 12. Contagem de fotos e arquivos anexados
    const filesCountRes = await raw.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM file_attachments
      WHERE company_id = ${companyId} AND entity_type = 'Vehicle' AND entity_id = ${vehicleId}
    `);
    const filesCount = Number(filesCountRes.rows?.[0]?.count || 0);

    // 13. Alertas preventivos calculados no servidor (complianceAlerts)
    const todayStr = new Date().toISOString().slice(0, 10);
    const currentYear = new Date().getFullYear();
    const isMaintenanceOverdue = Boolean(vehicle.nextMaintenanceKm && vehicle.currentKm >= vehicle.nextMaintenanceKm);
    const isInsuranceExpired = insurances.length === 0 || !insurances.some((ins: any) => ins.status === 'ACTIVE' && String(ins.endDate || '').slice(0, 10) >= todayStr);
    const hasPendingTickets = trafficTickets.some((t: any) => t.responsibility === 'DRIVER' && !t.driverIndicatedAt && ['PENDING_IDENTIFICATION', 'IDENTIFIED'].includes(t.status));
    const isCrlvOutdated = Boolean(vehicle.crlvExerciseYear && vehicle.crlvExerciseYear < currentYear);

    const complianceAlerts = {
      isMaintenanceOverdue,
      isInsuranceExpired,
      hasPendingTickets,
      isCrlvOutdated,
    };

    return {
      vehicle,
      driver,
      activeContract,
      contractHistory,
      maintenances,
      trafficTickets,
      documents,
      insurances,
      trackers,
      kmRecords,
      historyLogs,
      ownershipHistory,
      financialSummary,
      inspectionsSummary,
      filesCount,
      complianceAlerts,
    };
  });
}
