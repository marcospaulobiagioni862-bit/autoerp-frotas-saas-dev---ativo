import assert from 'node:assert/strict';
import express, { type NextFunction, type Request, type Response as ExpressResponse } from 'express';
import { createServer } from 'node:http';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { UnitOfWork } from '../../db/uow';
import type { AuthenticatedPrincipal } from '../auth';
import { buildReportAiSuggestion } from '../reportAiSuggestion';
import {
  persistReportAiSuggestion,
  registerReportAiSuggestionRoutes,
} from '../reportAiSuggestionRoutes';

const companyA = 'report-ai-review-company-a';
const companyB = 'report-ai-review-company-b';
const adminAId = 'report-ai-review-admin-a';
const adminBId = 'report-ai-review-admin-b';
const readonlyAId = 'report-ai-review-readonly-a';
const driverAId = 'report-ai-driver-summary-a';
const vehicleAId = 'report-ai-vehicle-summary-a';

function resultRows(result: any): Record<string, any>[] {
  if (Array.isArray(result)) return result;
  return Array.isArray(result?.rows) ? result.rows : [];
}

async function responseJson(response: globalThis.Response): Promise<any> {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function suggestion(companyId: string, suffix: string) {
  return buildReportAiSuggestion({
    companyId,
    targetType: 'OPERATIONAL_REPORT',
    targetId: `report-draft-${suffix}`,
    allowedFields: ['driverName', 'amount', 'notes'],
    requiredFields: ['driverName', 'amount', 'notes'],
    candidates: [
      {
        companyId,
        field: 'driverName',
        value: `Motorista Sintético ${suffix}`,
        sensitivity: 'GENERAL',
        source: {
          kind: 'POSTGRES',
          entityType: 'Driver',
          entityId: `driver-${suffix}`,
          observedAt: '2026-08-24T20:00:00.000Z',
          confidence: null,
          reviewedAt: null,
        },
      },
      {
        companyId,
        field: 'amount',
        value: 125.5,
        sensitivity: 'FINANCIAL',
        source: {
          kind: 'POSTGRES',
          entityType: 'Receivable',
          entityId: `receivable-${suffix}`,
          observedAt: '2026-08-24T20:00:00.000Z',
          confidence: null,
          reviewedAt: null,
        },
      },
    ],
  });
}

export class ReportAiSuggestionAuthorityIntegrationRunner {
  static async runAllTests(): Promise<void> {
    await db.execute(sql`
      INSERT INTO companies (id, name, status, created_at, updated_at) VALUES
        (${companyA}, 'Report AI Company A', 'ACTIVE', NOW(), NOW()),
        (${companyB}, 'Report AI Company B', 'ACTIVE', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO users (id, company_id, name, email, role, active, created_at, updated_at) VALUES
        (${adminAId}, ${companyA}, 'Report AI Admin A', 'report-ai-admin-a@example.test', 'ADMIN', true, NOW(), NOW()),
        (${adminBId}, ${companyB}, 'Report AI Admin B', 'report-ai-admin-b@example.test', 'ADMIN', true, NOW(), NOW()),
        (${readonlyAId}, ${companyA}, 'Report AI Readonly A', 'report-ai-readonly-a@example.test', 'READONLY', true, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `);

    await db.execute(sql`
      INSERT INTO drivers (
        id, company_id, name, cpf, cnh, active, birth_date, phone, whatsapp, email,
        address_street, address_number, address_neighborhood, address_city, address_state,
        address_zip_code, cnh_category, cnh_expiration, app_platforms, status,
        is_archived, created_at, updated_at
      ) VALUES (
        ${driverAId}, ${companyA}, 'Motorista Resumo Sintético', '52998224725', '12345678900',
        true, '1990-01-01', '11999999999', '11999999999', 'report-ai-driver@example.test',
        'Rua Sintética', '1', 'Centro', 'São Paulo', 'SP', '01001000', 'B', '2035-01-01',
        ARRAY['synthetic'], 'ACTIVE', false, '2026-08-24T20:00:00.000Z', '2026-08-24T20:00:00.000Z'
      )
      ON CONFLICT (id) DO NOTHING
    `);

    await db.execute(sql`
      INSERT INTO vehicles (
        id, company_id, plate, renavam, brand, model, version, year_fabrication, year_model,
        color, chassis, current_km, next_maintenance_km, fuel_type, category,
        acquisition_value, current_value, rental_value_base, status, is_archived,
        created_at, updated_at
      ) VALUES (
        ${vehicleAId}, ${companyA}, 'TST1A23', '00987654321', 'Marca Sintética',
        'Modelo Sintético', 'Versão Teste', 2025, 2026, 'Prata', '9BRTESTE000000001',
        12345, 15000, 'Flex', 'HATCH', 50000, 45000, 900, 'AVAILABLE', false,
        '2026-08-24T20:00:00.000Z', '2026-08-24T20:00:00.000Z'
      )
      ON CONFLICT (id) DO NOTHING
    `);

    const suggestionA = suggestion(companyA, 'a');
    const suggestionB = suggestion(companyB, 'b');
    const first = await persistReportAiSuggestion(companyA, { userId: adminAId, name: 'Report AI Admin A' }, suggestionA);
    assert.equal(first.created, true);
    assert.equal(first.item.status, 'PENDING_REVIEW');
    assert.equal(first.item.suggestion.decision, 'HUMAN_CONFIRMATION_REQUIRED');
    const replay = await persistReportAiSuggestion(companyA, { userId: adminAId, name: 'Report AI Admin A' }, suggestionA);
    assert.equal(replay.created, false);
    assert.equal(replay.item.id, first.item.id);

    await assert.rejects(
      () => persistReportAiSuggestion(companyA, { userId: adminAId, name: 'Report AI Admin A' }, {
        ...suggestionA,
        targetId: 'forged-collision',
      }),
    );
    await persistReportAiSuggestion(companyB, { userId: adminBId, name: 'Report AI Admin B' }, suggestionB);

    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: ExpressResponse, next: NextFunction) => {
      const companyId = typeof req.headers['x-test-company'] === 'string' ? req.headers['x-test-company'] : '';
      const role = typeof req.headers['x-test-role'] === 'string' ? req.headers['x-test-role'] : '';
      const userId = typeof req.headers['x-test-user'] === 'string' ? req.headers['x-test-user'] : '';
      if (companyId && role && userId) {
        (req as Request & { principal?: AuthenticatedPrincipal }).principal = {
          companyId,
          userId,
          name: `${role} Report AI Integration`,
          role,
          permissions: [],
        };
      }
      next();
    });
    registerReportAiSuggestionRoutes(app);

    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const base = `http://127.0.0.1:${address.port}`;

    const request = async (
      route: string,
      options: RequestInit = {},
      principal?: { companyId: string; role: string; userId: string },
    ): Promise<globalThis.Response> => {
      const headers = new Headers(options.headers);
      if (principal) {
        headers.set('x-test-company', principal.companyId);
        headers.set('x-test-role', principal.role);
        headers.set('x-test-user', principal.userId);
      }
      if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
      return await fetch(`${base}${route}`, { ...options, headers });
    };

    const adminA = { companyId: companyA, role: 'ADMIN', userId: adminAId };
    const adminB = { companyId: companyB, role: 'ADMIN', userId: adminBId };
    const readonlyA = { companyId: companyA, role: 'READONLY', userId: readonlyAId };

    try {
      let response = await request('/api/report-ai/suggestions');
      assert.equal(response.status, 401);

      response = await request('/api/report-ai/suggestions/driver-summary', {
        method: 'POST',
        body: JSON.stringify({ driverId: driverAId }),
      }, readonlyA);
      assert.equal(response.status, 403, 'readonly principal must not create suggestions');

      response = await request('/api/report-ai/suggestions/driver-summary', {
        method: 'POST',
        body: JSON.stringify({ driverId: driverAId, companyId: companyB }),
      }, adminA);
      assert.equal(response.status, 400, 'browser tenant authority must be rejected');

      response = await request('/api/report-ai/suggestions/driver-summary', {
        method: 'POST',
        body: JSON.stringify({ driverId: driverAId }),
      }, adminB);
      assert.equal(response.status, 404, 'cross-tenant driver must look absent');

      response = await request('/api/report-ai/suggestions/driver-summary', {
        method: 'POST',
        body: JSON.stringify({ driverId: driverAId }),
      }, adminA);
      assert.ok(response.status === 201 || response.status === 200);
      const driverSummary = (await responseJson(response)).item;
      assert.equal(driverSummary.companyId, companyA);
      assert.equal(driverSummary.targetType, 'DRIVER_SUMMARY');
      assert.equal(driverSummary.targetId, driverAId);
      assert.equal(driverSummary.status, 'PENDING_REVIEW');
      assert.equal(driverSummary.review, null);
      const driverFields = new Map<string, any>(driverSummary.suggestion.suggestedFields.map((field: any) => [field.field, field]));
      assert.equal(driverFields.has('cpf'), false, 'CPF must not be exposed in assisted summary');
      assert.equal(driverFields.get('driverName')?.value, 'Motorista Resumo Sintético');
      assert.equal(driverFields.get('cnhNumber')?.requiresServerRevalidation, true);
      assert.equal(driverSummary.suggestion.missingFields.length, 0);
      for (const field of driverSummary.suggestion.suggestedFields) {
        assert.ok(field.provenance.length > 0);
        assert.ok(field.provenance.every((source: any) =>
          source.kind === 'POSTGRES' && source.entityType === 'Driver' && source.entityId === driverAId
        ));
      }

      response = await request('/api/report-ai/suggestions/vehicle-summary', {
        method: 'POST',
        body: JSON.stringify({ vehicleId: vehicleAId }),
      }, readonlyA);
      assert.equal(response.status, 403, 'readonly principal must not create vehicle suggestions');

      response = await request('/api/report-ai/suggestions/vehicle-summary', {
        method: 'POST',
        body: JSON.stringify({ vehicleId: vehicleAId, companyId: companyB }),
      }, adminA);
      assert.equal(response.status, 400, 'browser tenant authority must be rejected for vehicles');

      response = await request('/api/report-ai/suggestions/vehicle-summary', {
        method: 'POST',
        body: JSON.stringify({ vehicleId: vehicleAId }),
      }, adminB);
      assert.equal(response.status, 404, 'cross-tenant vehicle must look absent');

      response = await request('/api/report-ai/suggestions/vehicle-summary', {
        method: 'POST',
        body: JSON.stringify({ vehicleId: vehicleAId }),
      }, adminA);
      assert.ok(response.status === 201 || response.status === 200);
      const vehicleSummary = (await responseJson(response)).item;
      assert.equal(vehicleSummary.companyId, companyA);
      assert.equal(vehicleSummary.targetType, 'VEHICLE_SUMMARY');
      assert.equal(vehicleSummary.targetId, vehicleAId);
      const vehicleFields = new Map<string, any>(vehicleSummary.suggestion.suggestedFields.map((field: any) => [field.field, field]));
      assert.equal(vehicleFields.get('plate')?.value, 'TST1A23');
      assert.equal(vehicleFields.get('plate')?.requiresServerRevalidation, true);
      assert.equal(vehicleFields.has('acquisitionValue'), false, 'financial acquisition value must not be exposed');
      assert.equal(vehicleFields.has('currentValue'), false, 'financial current value must not be exposed');
      assert.equal(vehicleFields.has('rentalValueBase'), false, 'financial rental value must not be exposed');
      assert.equal(vehicleSummary.suggestion.missingFields.length, 0);
      for (const field of vehicleSummary.suggestion.suggestedFields) {
        assert.ok(field.provenance.length > 0);
        assert.ok(field.provenance.every((source: any) =>
          source.kind === 'POSTGRES' && source.entityType === 'Vehicle' && source.entityId === vehicleAId
        ));
      }

      response = await request('/api/report-ai/suggestions', {}, adminA);
      assert.equal(response.status, 200);
      const listA = (await responseJson(response)).items;
      assert.ok(listA.some((item: any) => item.id === suggestionA.id));
      assert.equal(listA.some((item: any) => item.id === suggestionB.id), false);

      response = await request(`/api/report-ai/suggestions/${suggestionB.id}`, {}, adminA);
      assert.equal(response.status, 404, 'cross-tenant suggestion must look absent');

      response = await request(`/api/report-ai/suggestions/${suggestionA.id}/review`, {
        method: 'POST',
        body: JSON.stringify({ decision: 'CONFIRM', corrections: { notes: 'Revisado por humano.' } }),
      }, readonlyA);
      assert.equal(response.status, 403);

      response = await request(`/api/report-ai/suggestions/${suggestionA.id}/review`, {
        method: 'POST',
        body: JSON.stringify({
          decision: 'CONFIRM',
          corrections: { notes: 'Revisado por humano.' },
          companyId: companyB,
        }),
      }, adminA);
      assert.equal(response.status, 400, 'forged tenant authority must be rejected');

      response = await request(`/api/report-ai/suggestions/${suggestionA.id}/review`, {
        method: 'POST',
        body: JSON.stringify({ decision: 'CONFIRM', corrections: { serverOnlyField: 'forged' } }),
      }, adminA);
      assert.equal(response.status, 400, 'correction outside suggestion fields must be rejected');

      const reviewBody = {
        decision: 'CONFIRM',
        corrections: { notes: 'Revisado por humano.' },
        notes: 'Confirmação sintética.',
      };
      response = await request(`/api/report-ai/suggestions/${suggestionA.id}/review`, {
        method: 'POST',
        body: JSON.stringify(reviewBody),
      }, adminA);
      assert.equal(response.status, 200);
      const confirmed = (await responseJson(response)).item;
      assert.equal(confirmed.status, 'CONFIRMED');
      assert.equal(confirmed.review.businessMutationApplied, false);
      assert.equal(confirmed.review.finalFields.notes, 'Revisado por humano.');
      assert.equal(confirmed.reviewedBy, adminAId);

      response = await request(`/api/report-ai/suggestions/${suggestionA.id}/review`, {
        method: 'POST',
        body: JSON.stringify(reviewBody),
      }, adminA);
      assert.equal(response.status, 200, 'identical human review must be idempotent');
      assert.equal((await responseJson(response)).item.reviewHash, confirmed.reviewHash);

      response = await request(`/api/report-ai/suggestions/${suggestionA.id}/review`, {
        method: 'POST',
        body: JSON.stringify({ decision: 'REJECT', notes: 'conflicting terminal decision' }),
      }, adminA);
      assert.equal(response.status, 409);

      response = await request(`/api/report-ai/suggestions/${suggestionA.id}`, {}, adminB);
      assert.equal(response.status, 404);

      const auditRows = await UnitOfWork.run(companyA, async (context: any) => {
        const tx = context.getRawTransaction();
        return resultRows(await tx.execute(sql`
          SELECT changes FROM audit_logs
          WHERE company_id = ${companyA}
            AND entity_type = 'ReportAiSuggestion'
            AND entity_id = ${suggestionA.id}
            AND action = 'UPDATE'
        `));
      });
      assert.equal(auditRows.length, 1, 'human confirmation must emit one audit event');
      const changes = typeof auditRows[0].changes === 'string'
        ? JSON.parse(auditRows[0].changes)
        : auditRows[0].changes;
      const next = typeof changes.newState === 'string'
        ? JSON.parse(changes.newState)
        : changes.newState;
      assert.equal(next.status, 'CONFIRMED');
      assert.equal(next.businessMutationApplied, false);
      assert.equal(next.reviewedBy, adminAId);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => error ? reject(error) : resolve()),
      );
    }
  }
}

if (process.argv[1]?.includes('reportAiSuggestionAuthorityIntegration')) {
  ReportAiSuggestionAuthorityIntegrationRunner.runAllTests()
    .then(() => console.log('Report AI suggestion authority integration PASS'))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
