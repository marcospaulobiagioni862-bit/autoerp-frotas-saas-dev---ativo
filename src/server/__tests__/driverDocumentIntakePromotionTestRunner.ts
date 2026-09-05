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

function currentDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: 'document-600',
    companyId: principal.companyId,
    subjectType: 'DRIVER',
    subjectId: driver.id,
    documentType: 'CNH',
    documentNumber: driver.cnhNumber,
    expirationDate: '2030-01-01',
    attachmentId: 'attachment-600',
    versionNumber: 1,
    isCurrent: true,
    isArchived: false,
    cost: 0,
    createdBy: principal.userId,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    complianceStatus: 'VALID',
    alertStage: 'NONE',
    ...overrides,
  };
}

function contextFor(options: {
  row: Record<string, unknown>;
  selectedDriver?: Record<string, unknown>;
  updateResults?: Array<{ rows: Array<{ id: string }> }>;
  currentDocument?: Record<string, unknown> | null;
}) {
  const executeResults: unknown[] = [
    { rows: [options.row] },
    ...(options.updateResults ?? []),
  ];
  let executeCount = 0;
  const auditEntries: any[] = [];
  const createdDocuments: any[] = [];
  const updatedDocuments: any[] = [];
  return {
    executeCount: () => executeCount,
    auditEntries,
    createdDocuments,
    updatedDocuments,
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
      getDocumentRepo() {
        return {
          async findCurrentWithLock() {
            return options.currentDocument ?? null;
          },
          async updateForCompany(_companyId: string, _id: string, item: Record<string, unknown>) {
            updatedDocuments.push(item);
            return options.currentDocument ? { ...options.currentDocument, ...item } : null;
          },
          async create(item: Record<string, unknown>) {
            createdDocuments.push(item);
            return item;
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

export async function runDriverDocumentIntakePromotionChecks(): Promise<void> {
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
    assert.equal(fixture.executeCount(), 3, 'promotion must lock/read and perform exactly two raw authoritative writes');
    assert.equal(fixture.createdDocuments.length, 1, 'first promoted CNH must create one canonical DocumentRecord');
    assert.equal(fixture.createdDocuments[0].versionNumber, 1, 'first canonical CNH must start at version 1');
    assert.equal(fixture.createdDocuments[0].attachmentId, 'attachment-601', 'canonical CNH must reference the promoted original attachment');
    assert.equal(fixture.updatedDocuments.length, 0, 'first CNH must not supersede a nonexistent document');
    assert.equal(fixture.auditEntries.length, 3, 'promotion must audit attachment, canonical document and intake transitions');
  }

  {
    const existing = currentDocument();
    const fixture = contextFor({
      row: promotableRow(),
      currentDocument: existing,
      updateResults: [
        { rows: [{ id: 'attachment-601' }] },
        { rows: [{ id: 'intake-601' }] },
      ],
    });
    await promoteApprovedDriverDocumentIntake(fixture.context, principal, 'intake-601', driver.id);
    assert.equal(fixture.updatedDocuments.length, 1, 'renewal must mark the previous canonical CNH as non-current');
    assert.equal(fixture.updatedDocuments[0].isCurrent, false, 'superseded CNH must no longer be current');
    assert.equal(fixture.createdDocuments.length, 1, 'renewal must create one new canonical CNH version');
    assert.equal(fixture.createdDocuments[0].versionNumber, 2, 'renewal must increment canonical CNH version');
    assert.equal(fixture.createdDocuments[0].supersedesDocumentId, 'document-600', 'renewal must link to the superseded CNH');
  }

  {
    const existing = currentDocument({
      id: 'document-601',
      attachmentId: 'attachment-601',
      versionNumber: 2,
    });
    const fixture = contextFor({
      row: promotableRow({
        intake_status: 'CONSUMED',
        driver_id: driver.id,
        consumed_at: '2026-08-29T13:40:00.000Z',
        entity_type: 'Driver',
        entity_id: driver.id,
      }),
      currentDocument: existing,
    });
    const result = await promoteApprovedDriverDocumentIntake(
      fixture.context,
      principal,
      'intake-601',
      driver.id,
    );
    assert.equal(result.promoted, false, 'same-driver replay must be idempotent');
    assert.equal(fixture.executeCount(), 1, 'idempotent replay must not perform raw writes');
    assert.equal(fixture.createdDocuments.length, 0, 'idempotent replay must not duplicate canonical CNH');
    assert.equal(fixture.updatedDocuments.length, 0, 'idempotent replay must not supersede canonical CNH');
    assert.equal(fixture.auditEntries.length, 0, 'idempotent replay must not duplicate audit mutations');
  }

  {
    const fixture = contextFor({
      row: promotableRow({
        intake_status: 'CONSUMED',
        driver_id: driver.id,
        consumed_at: '2026-08-29T13:40:00.000Z',
      }),
      updateResults: [{ rows: [{ id: 'attachment-601' }] }],
    });
    const result = await promoteApprovedDriverDocumentIntake(
      fixture.context,
      principal,
      'intake-601',
      driver.id,
    );
    assert.equal(result.promoted, false, 'consumed retry with stale attachment location must recover idempotently');
    assert.equal(fixture.executeCount(), 2, 'consumed attachment recovery must perform one raw relink write');
    assert.equal(fixture.createdDocuments.length, 1, 'consumed recovery must repair a missing canonical CNH');
    assert.equal(fixture.auditEntries.length, 2, 'consumed recovery must audit relink and repaired canonical CNH');
  }

  {
    const fixture = contextFor({
      row: promotableRow({
        entity_type: 'Driver',
        entity_id: driver.id,
      }),
      updateResults: [{ rows: [{ id: 'intake-601' }] }],
    });
    const result = await promoteApprovedDriverDocumentIntake(
      fixture.context,
      principal,
      'intake-601',
      driver.id,
    );
    assert.equal(result.promoted, true, 'approved intake with an already-relinked attachment must finish consumption');
    assert.equal(fixture.executeCount(), 2, 'already-relinked recovery must only consume the intake at raw SQL level');
    assert.equal(fixture.createdDocuments.length, 1, 'already-relinked recovery must ensure the canonical CNH exists');
    assert.equal(fixture.auditEntries.length, 2, 'already-relinked recovery must audit canonical document and intake only');
  }

  {
    const dateVariantDriver = {
      ...driver,
      birthDate: '1990-01-01T00:00:00.000Z',
      cnhExpiration: '2035-01-01T00:00:00.000Z',
    };
    const fixture = contextFor({
      row: promotableRow(),
      selectedDriver: dateVariantDriver,
      updateResults: [
        { rows: [{ id: 'attachment-601' }] },
        { rows: [{ id: 'intake-601' }] },
      ],
    });
    const result = await promoteApprovedDriverDocumentIntake(fixture.context, principal, 'intake-601', driver.id);
    assert.equal(result.promoted, true, 'equivalent ISO date representations must not create a false identity conflict');
    assert.equal(fixture.createdDocuments[0].expirationDate, '2035-01-01', 'canonical CNH must normalize expiration to date-only');
  }

  {
    const otherDriver = { ...driver, id: 'driver-601-other' };
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
    assert.equal(fixture.createdDocuments.length, 0, 'different-driver replay must not create canonical CNH');
  }

  {
    const incompatibleDriver = { ...driver, cnhNumber: '98765432100' };
    const fixture = contextFor({ row: promotableRow(), selectedDriver: incompatibleDriver });
    await assert.rejects(
      () => promoteApprovedDriverDocumentIntake(fixture.context, principal, 'intake-601', incompatibleDriver.id),
      (error: unknown) => error instanceof DriverDocumentIntakePromotionConflictError && error.message === 'DRIVER_CNH_IDENTITY_MISMATCH',
      'approved CNH must not be promoted to an identity-incompatible Driver',
    );
    assert.equal(fixture.executeCount(), 1, 'identity mismatch must fail before any write');
    assert.equal(fixture.createdDocuments.length, 0, 'identity mismatch must not create canonical CNH');
    assert.equal(fixture.auditEntries.length, 0, 'identity mismatch must not emit mutation audits');
  }

  console.log('Driver CNH intake promotion lifecycle checks passed.');
}
