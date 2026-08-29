import assert from 'node:assert/strict';
import type { AuthenticatedPrincipal } from '../auth';
import {
  DriverDocumentIntakePromotionConflictError,
  promoteApprovedDriverDocumentIntake,
} from '../driverDocumentIntakePromotion';

const principal: AuthenticatedPrincipal = {
  companyId: 'company-601',
  userId: 'user-601',
  name: 'Synthetic CNH Reviewer',
  role: 'ADMIN',
  permissions: [],
};

const driver = {
  id: 'driver-601',
  companyId: principal.companyId,
  fullName: 'Motorista Sintetico',
  cpf: '52998224725',
  birthDate: '1990-01-01',
  cnhNumber: '12345678900',
  cnhExpiration: '2035-01-01',
  isArchived: false,
};

function promotableRow(overrides: Record<string, unknown> = {}) {
  return {
    intake_status: 'APPROVED',
    created_by: principal.userId,
    attachment_id: 'attachment-601',
    approved_extraction_id: 'extraction-601',
    driver_id: null,
    expires_at: '2099-01-01T00:00:00.000Z',
    consumed_at: null,
    extraction_id: 'extraction-601',
    extraction_attachment_id: 'attachment-601',
    extraction_status: 'APPROVED',
    detected_document_type: 'CNH',
    proposed_fields: {
      cpf: driver.cpf,
      birthDate: driver.birthDate,
      cnhNumber: '00000000000',
      cnhExpiration: driver.cnhExpiration,
    },
    corrections: {
      cnhNumber: driver.cnhNumber,
    },
    entity_type: 'DriverDocumentIntake',
    entity_id: 'intake-601',
    document_type: 'CNH',
    content_state: 'AVAILABLE',
    is_archived: false,
    ...overrides,
  };
}

function contextFor(options: {
  row: Record<string, unknown>;
  selectedDriver?: typeof driver | { id: string; cnhNumber: string; cnhExpiration: string; cpf: string; birthDate: string; isArchived: boolean };
  updateResults?: Array<{ rows: Array<{ id: string }> }>;
}) {
  const executeResults: unknown[] = [
    { rows: [options.row] },
    ...(options.updateResults ?? []),
  ];
  let executeCount = 0;
  const auditEntries: unknown[] = [];
  return {
    executeCount: () => executeCount,
    auditEntries,
    context: {
      getRawTransaction() {
        return {
          async execute() {
            const result = executeResults[executeCount];
            executeCount += 1;
            return result ?? { rows: [] };
          },
        };
      },
      getDriverRepo() {
        return {
          async findByIdForCompany() {
            return options.selectedDriver ?? driver;
          },
        };
      },
      getAuditLogRepo() {
        return {
          async create(entry: unknown) {
            auditEntries.push(entry);
            return entry;
          },
        };
      },
    },
  };
}

{
  const fixture = contextFor({
    row: promotableRow(),
    updateResults: [
      { rows: [{ id: 'attachment-601' }] },
      { rows: [{ id: 'intake-601' }] },
    ],
  });
  const result = await promoteApprovedDriverDocumentIntake(
    fixture.context,
    principal,
    'intake-601',
    driver.id,
  );
  assert.deepEqual(result, {
    driverId: driver.id,
    attachmentId: 'attachment-601',
    promoted: true,
  });
  assert.equal(fixture.executeCount(), 3, 'promotion must lock/read and perform exactly two authoritative writes');
  assert.equal(fixture.auditEntries.length, 2, 'promotion must audit attachment and intake transitions');
}

{
  const fixture = contextFor({
    row: promotableRow({
      intake_status: 'CONSUMED',
      driver_id: driver.id,
      consumed_at: '2026-08-29T13:40:00.000Z',
      entity_type: 'Driver',
      entity_id: driver.id,
    }),
  });
  const result = await promoteApprovedDriverDocumentIntake(
    fixture.context,
    principal,
    'intake-601',
    driver.id,
  );
  assert.equal(result.promoted, false, 'same-driver replay must be idempotent');
  assert.equal(fixture.executeCount(), 1, 'idempotent replay must not write again');
  assert.equal(fixture.auditEntries.length, 0, 'idempotent replay must not duplicate audit mutations');
}

{
  const otherDriver = {
    ...driver,
    id: 'driver-601-other',
  };
  const fixture = contextFor({
    row: promotableRow({
      intake_status: 'CONSUMED',
      driver_id: driver.id,
      consumed_at: '2026-08-29T13:40:00.000Z',
      entity_type: 'Driver',
      entity_id: driver.id,
    }),
    selectedDriver: otherDriver,
  });
  await assert.rejects(
    () => promoteApprovedDriverDocumentIntake(fixture.context, principal, 'intake-601', otherDriver.id),
    (error: unknown) => error instanceof DriverDocumentIntakePromotionConflictError && error.message === 'CONSUMED_BY_DIFFERENT_DRIVER',
    'consumed intake must fail closed for a different Driver',
  );
  assert.equal(fixture.executeCount(), 1, 'different-driver replay must not write');
}

{
  const incompatibleDriver = {
    ...driver,
    cnhNumber: '98765432100',
  };
  const fixture = contextFor({ row: promotableRow(), selectedDriver: incompatibleDriver });
  await assert.rejects(
    () => promoteApprovedDriverDocumentIntake(fixture.context, principal, 'intake-601', incompatibleDriver.id),
    (error: unknown) => error instanceof DriverDocumentIntakePromotionConflictError && error.message === 'DRIVER_CNH_IDENTITY_MISMATCH',
    'approved CNH must not be promoted to an identity-incompatible Driver',
  );
  assert.equal(fixture.executeCount(), 1, 'identity mismatch must fail before any write');
  assert.equal(fixture.auditEntries.length, 0, 'identity mismatch must not emit mutation audits');
}

console.log('Driver CNH intake promotion lifecycle checks passed.');
