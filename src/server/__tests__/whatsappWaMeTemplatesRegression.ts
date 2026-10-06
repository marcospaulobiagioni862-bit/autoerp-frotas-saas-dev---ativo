import assert from 'node:assert/strict';
import express, { type NextFunction, type Request, type Response as ExpressResponse } from 'express';
import { createServer } from 'node:http';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import type { AuthenticatedPrincipal } from '../auth';
import { registerWhatsappRoutes } from '../whatsappRoutes';

const companyIdA = 'wame-company-a';
const companyIdB = 'wame-company-b';
const userIdA = 'wame-user-a';
const userIdB = 'wame-user-b';

const driverAId = 'wame-driver-a';
const driverInvalidPhoneId = 'wame-driver-inv';
const vehicleAId = 'wame-vehicle-a';
const contractAId = 'wame-contract-a';
const ticketAId = 'wame-ticket-a';
const ticketNoDriverId = 'wame-ticket-nodriver';

function resultRows(result: any): Record<string, any>[] {
  if (Array.isArray(result)) return result;
  return Array.isArray(result?.rows) ? result.rows : [];
}

async function runRegression(): Promise<void> {
  console.log('--- Starting whatsappWaMeTemplatesRegression ---');

  // 0. Create required tables if using in-memory DB / PGlite
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS companies (
      id text PRIMARY KEY,
      name text NOT NULL,
      status text NOT NULL DEFAULT 'ACTIVE',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id text PRIMARY KEY,
      company_id text NOT NULL,
      name text NOT NULL,
      email text NOT NULL,
      role text NOT NULL,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS drivers (
      id text PRIMARY KEY,
      company_id text NOT NULL,
      name text NOT NULL,
      cpf text,
      cnh text,
      active boolean NOT NULL DEFAULT true,
      birth_date date,
      phone text,
      whatsapp text,
      email text,
      address_street text,
      address_number text,
      address_neighborhood text,
      address_city text,
      address_state text,
      address_zip_code text,
      cnh_category text,
      cnh_expiration date,
      app_platforms text[],
      status text NOT NULL DEFAULT 'ACTIVE',
      is_archived boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS vehicles (
      id text PRIMARY KEY,
      company_id text NOT NULL,
      plate text NOT NULL,
      model text NOT NULL,
      brand text NOT NULL,
      year integer,
      color text,
      renavam text,
      chassi text,
      status text NOT NULL DEFAULT 'AVAILABLE',
      category text,
      current_km integer NOT NULL DEFAULT 0,
      current_driver_id text,
      current_contract_id text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS contracts (
      id text PRIMARY KEY,
      company_id text NOT NULL,
      contract_number text NOT NULL,
      vehicle_id text NOT NULL,
      driver_id text NOT NULL,
      start_date date NOT NULL,
      end_date date,
      rental_amount numeric NOT NULL DEFAULT 0,
      security_deposit_amount numeric NOT NULL DEFAULT 0,
      franchise_km integer NOT NULL DEFAULT 0,
      excess_km_rate numeric NOT NULL DEFAULT 0,
      billing_periodicity text NOT NULL DEFAULT 'MONTHLY',
      status text NOT NULL DEFAULT 'ACTIVE',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS traffic_tickets (
      id text PRIMARY KEY,
      company_id text NOT NULL,
      vehicle_id text NOT NULL,
      driver_id text,
      auto_number text NOT NULL,
      organ_name text,
      infraction_code text,
      description text,
      infraction_date date,
      infraction_location text,
      due_date date,
      original_amount numeric NOT NULL DEFAULT 0,
      points integer DEFAULT 0,
      status text NOT NULL DEFAULT 'PENDING_IDENTIFICATION',
      responsibility text NOT NULL DEFAULT 'UNIDENTIFIED',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS traffic_ticket_driver_indications (
      id text PRIMARY KEY,
      company_id text NOT NULL,
      traffic_ticket_id text NOT NULL,
      driver_id text NOT NULL,
      status text NOT NULL DEFAULT 'PENDING',
      indication_deadline date,
      notes text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id text PRIMARY KEY,
      company_id text NOT NULL,
      user_id text,
      action text NOT NULL,
      entity_type text NOT NULL,
      entity_id text NOT NULL,
      changes text,
      timestamp timestamptz NOT NULL DEFAULT now(),
      correlation_id text,
      ip_address text
    )
  `);

  // 1. Setup companies & users
  await db.execute(sql`
    INSERT INTO companies (id, name, status, created_at, updated_at) VALUES
      (${companyIdA}, 'WaMe Co A', 'ACTIVE', NOW(), NOW()),
      (${companyIdB}, 'WaMe Co B', 'ACTIVE', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  await db.execute(sql`
    INSERT INTO users (id, company_id, name, email, role, active, created_at, updated_at) VALUES
      (${userIdA}, ${companyIdA}, 'WaMe User A', 'wame-a@example.test', 'ADMIN', true, NOW(), NOW()),
      (${userIdB}, ${companyIdB}, 'WaMe User B', 'wame-b@example.test', 'ADMIN', true, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  // 2. Setup drivers
  await db.execute(sql`
    INSERT INTO drivers (
      id, company_id, name, cpf, cnh, active, birth_date, phone, whatsapp, email,
      address_street, address_number, address_neighborhood, address_city, address_state,
      address_zip_code, cnh_category, cnh_expiration, app_platforms, status,
      is_archived, created_at, updated_at
    ) VALUES
    (
      ${driverAId}, ${companyIdA}, 'Carlos Motorista WaMe', '12345678909', '98765432101',
      true, '1985-05-10', '11999998888', '11999998888', 'carlos.wame@example.test',
      'Rua A', '10', 'Centro', 'São Paulo', 'SP', '01001000', 'B', '2027-11-20',
      ARRAY['uber'], 'ACTIVE', false, NOW(), NOW()
    ),
    (
      ${driverInvalidPhoneId}, ${companyIdA}, 'Invalido Fone', '98765432100', '11223344556',
      true, '1988-01-01', '11111111111', '11111111111', 'inv.wame@example.test',
      'Rua B', '20', 'Centro', 'São Paulo', 'SP', '01001000', 'B', '2028-05-15',
      ARRAY['uber'], 'ACTIVE', false, NOW(), NOW()
    )
    ON CONFLICT (id) DO NOTHING
  `);

  // 3. Setup vehicles
  await db.execute(sql`
    INSERT INTO vehicles (
      id, company_id, plate, model, brand, year, color, renavam, chassi, status,
      category, current_km, current_driver_id, created_at, updated_at
    ) VALUES
    (
      ${vehicleAId}, ${companyIdA}, 'WAM-1234', 'Onix Plus', 'Chevrolet', 2023, 'Prata',
      '12345678901', '9BWZZZ377VT004251', 'RENTED', 'SEDAN', 45200, ${driverAId}, NOW(), NOW()
    )
    ON CONFLICT (id) DO NOTHING
  `);

  // 4. Setup contracts
  await db.execute(sql`
    INSERT INTO contracts (
      id, company_id, contract_number, vehicle_id, driver_id, start_date,
      rental_amount, security_deposit_amount, franchise_km, excess_km_rate,
      billing_periodicity, status, created_at, updated_at
    ) VALUES
    (
      ${contractAId}, ${companyIdA}, 'CTR-WAME-001', ${vehicleAId}, ${driverAId}, '2026-01-01',
      2500, 1000, 5000, 0.50, 'MONTHLY', 'ACTIVE', NOW(), NOW()
    )
    ON CONFLICT (id) DO NOTHING
  `);

  // 5. Setup traffic tickets & indication
  await db.execute(sql`
    INSERT INTO traffic_tickets (
      id, company_id, vehicle_id, driver_id, auto_number, organ_name, infraction_code,
      description, infraction_date, infraction_location, due_date, original_amount,
      points, status, responsibility, created_at, updated_at
    ) VALUES
    (
      ${ticketAId}, ${companyIdA}, ${vehicleAId}, ${driverAId}, 'NOT-WAME-999', 'DETRAN-SP',
      '745-5-0', 'Transitar em velocidade superior à máxima permitida em até 20%',
      '2026-09-15', 'Av. Paulista, 1000', '2026-10-30', 130.16, 4, 'IDENTIFIED',
      'DRIVER', NOW(), NOW()
    ),
    (
      ${ticketNoDriverId}, ${companyIdA}, ${vehicleAId}, NULL, 'NOT-NODRIVER-888', 'DETRAN-SP',
      '745-5-0', 'Excesso de velocidade', '2026-09-18', 'Av. Brasil, 200', '2026-11-05',
      130.16, 4, 'PENDING_IDENTIFICATION', 'UNIDENTIFIED', NOW(), NOW()
    )
    ON CONFLICT (id) DO NOTHING
  `);

  await db.execute(sql`
    INSERT INTO traffic_ticket_driver_indications (
      id, company_id, traffic_ticket_id, driver_id, status, indication_deadline,
      notes, created_at, updated_at
    ) VALUES
    (
      'ind-wame-001', ${companyIdA}, ${ticketAId}, ${driverAId}, 'PENDING',
      '2026-10-20', 'Prazo normal', NOW(), NOW()
    )
    ON CONFLICT (id) DO NOTHING
  `);

  // 6. Setup Express App & Routes
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
        name: 'WaMe Tester',
        role,
        permissions: [],
      };
    }
    next();
  });
  registerWhatsappRoutes(app);

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;

  const request = async (
    route: string,
    body: any,
    principal?: { companyId: string; role: string; userId: string },
  ): Promise<{ status: number; data: any }> => {
    const headers = new Headers({ 'content-type': 'application/json' });
    if (principal) {
      headers.set('x-test-company', principal.companyId);
      headers.set('x-test-role', principal.role);
      headers.set('x-test-user', principal.userId);
    }
    const res = await fetch(`${base}${route}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: res.status, data };
  };

  const adminA = { companyId: companyIdA, role: 'ADMIN', userId: userIdA };
  const adminB = { companyId: companyIdB, role: 'ADMIN', userId: userIdB };

  try {
    // Test 1: Unauthenticated returns 401
    {
      const res = await request('/api/whatsapp/wa-link', {
        templateType: 'KM_REQUEST',
        entityId: contractAId,
      });
      assert.equal(res.status, 401, 'Unauthenticated request must be 401');
      console.log('✓ Test 1: Unauthenticated rejected with 401');
    }

    // Test 2: KM_REQUEST via Contract ID
    {
      const res = await request('/api/whatsapp/wa-link', {
        templateType: 'KM_REQUEST',
        entityId: contractAId,
      }, adminA);
      assert.equal(res.status, 200, 'KM_REQUEST via contract must be 200');
      assert.equal(res.data.templateType, 'KM_REQUEST');
      assert.equal(res.data.phone, '5511999998888');
      assert.ok(res.data.whatsappUrl.startsWith('https://wa.me/5511999998888?text='));
      assert.ok(res.data.message.includes('Carlos Motorista WaMe'));
      assert.ok(res.data.message.includes('WAM-1234'));
      assert.ok(res.data.message.includes('odômetro'));

      // Check audit log
      const logs = resultRows(await db.execute(sql`
        SELECT action, changes FROM audit_logs
        WHERE company_id = ${companyIdA} AND entity_type = 'WhatsappWaLink' AND entity_id = ${contractAId}
        ORDER BY timestamp DESC LIMIT 1
      `));
      assert.equal(logs.length, 1);
      const changes = JSON.parse(logs[0].changes);
      const parsed = JSON.parse(changes.newState);
      assert.equal(parsed.event, 'WHATSAPP_WAME_LINK_GENERATED');
      assert.equal(parsed.templateType, 'KM_REQUEST');
      assert.equal(parsed.phone, '5511999998888');
      console.log('✓ Test 2: KM_REQUEST via Contract ID succeeded with audit log');
    }

    // Test 3: KM_REQUEST via Vehicle ID (with active contract)
    {
      const res = await request('/api/whatsapp/wa-link', {
        templateType: 'KM_REQUEST',
        entityId: vehicleAId,
      }, adminA);
      assert.equal(res.status, 200, 'KM_REQUEST via vehicle must be 200');
      assert.equal(res.data.templateType, 'KM_REQUEST');
      assert.equal(res.data.phone, '5511999998888');
      assert.ok(res.data.whatsappUrl.includes('5511999998888'));
      assert.ok(res.data.message.includes('WAM-1234'));
      console.log('✓ Test 3: KM_REQUEST via Vehicle ID succeeded');
    }

    // Test 4: TRAFFIC_TICKET via Ticket ID
    {
      const res = await request('/api/whatsapp/wa-link', {
        templateType: 'TRAFFIC_TICKET',
        entityId: ticketAId,
      }, adminA);
      assert.equal(res.status, 200, 'TRAFFIC_TICKET must be 200');
      assert.equal(res.data.templateType, 'TRAFFIC_TICKET');
      assert.equal(res.data.phone, '5511999998888');
      assert.ok(res.data.message.includes('NOT-WAME-999'));
      assert.ok(res.data.message.includes('WAM-1234'));
      assert.ok(res.data.message.includes('DETRAN-SP'));
      assert.ok(res.data.message.includes('745-5-0'));
      assert.ok(res.data.message.includes('130,16'));
      assert.ok(res.data.message.includes('2026-10-20')); // indication deadline

      // Check audit log
      const logs = resultRows(await db.execute(sql`
        SELECT action, changes FROM audit_logs
        WHERE company_id = ${companyIdA} AND entity_type = 'WhatsappWaLink' AND entity_id = ${ticketAId}
        ORDER BY timestamp DESC LIMIT 1
      `));
      assert.equal(logs.length, 1);
      const changes = JSON.parse(logs[0].changes);
      const parsed = JSON.parse(changes.newState);
      assert.equal(parsed.event, 'WHATSAPP_WAME_LINK_GENERATED');
      assert.equal(parsed.templateType, 'TRAFFIC_TICKET');
      console.log('✓ Test 4: TRAFFIC_TICKET succeeded with full infraction details and audit');
    }

    // Test 5: CNH_EXPIRY via Driver ID
    {
      const res = await request('/api/whatsapp/wa-link', {
        templateType: 'CNH_EXPIRY',
        entityId: driverAId,
      }, adminA);
      assert.equal(res.status, 200, 'CNH_EXPIRY must be 200');
      assert.equal(res.data.templateType, 'CNH_EXPIRY');
      assert.equal(res.data.phone, '5511999998888');
      assert.ok(res.data.message.includes('Carlos Motorista WaMe'));
      assert.ok(res.data.message.includes('2027-11-20'));
      assert.ok(res.data.message.includes('renovação'));

      // Check audit log
      const logs = resultRows(await db.execute(sql`
        SELECT action, changes FROM audit_logs
        WHERE company_id = ${companyIdA} AND entity_type = 'WhatsappWaLink' AND entity_id = ${driverAId}
        ORDER BY timestamp DESC LIMIT 1
      `));
      assert.equal(logs.length, 1);
      const changes = JSON.parse(logs[0].changes);
      const parsed = JSON.parse(changes.newState);
      assert.equal(parsed.event, 'WHATSAPP_WAME_LINK_GENERATED');
      assert.equal(parsed.templateType, 'CNH_EXPIRY');
      console.log('✓ Test 5: CNH_EXPIRY succeeded with expiration date and audit');
    }

    // Test 6: Ticket without driver rejects 400
    {
      const res = await request('/api/whatsapp/wa-link', {
        templateType: 'TRAFFIC_TICKET',
        entityId: ticketNoDriverId,
      }, adminA);
      assert.equal(res.status, 400, 'Ticket without driver must return 400');
      console.log('✓ Test 6: Ticket without driver rejected with 400');
    }

    // Test 7: Driver with invalid phone (repeated digits 11111111111) rejects 400
    {
      const res = await request('/api/whatsapp/wa-link', {
        templateType: 'CNH_EXPIRY',
        entityId: driverInvalidPhoneId,
      }, adminA);
      assert.equal(res.status, 400, 'Invalid phone number must return 400');
      console.log('✓ Test 7: Invalid phone number rejected with 400');
    }

    // Test 8: Tenant isolation - Company B cannot access Company A's entities
    {
      const res = await request('/api/whatsapp/wa-link', {
        templateType: 'KM_REQUEST',
        entityId: contractAId,
      }, adminB);
      assert.equal(res.status, 404, 'Cross-tenant access must return 404');
      console.log('✓ Test 8: Cross-tenant isolation verified with 404');
    }

    // Test 9: Unknown templateType rejects 400
    {
      const res = await request('/api/whatsapp/wa-link', {
        templateType: 'UNKNOWN_TEMPLATE',
        entityId: contractAId,
      }, adminA);
      assert.equal(res.status, 400, 'Unknown template type must return 400');
      console.log('✓ Test 9: Unknown template type rejected with 400');
    }

    console.log('--- All 9 tests passed successfully! ---');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

runRegression().catch((err) => {
  console.error('Regression failed:', err);
  process.exit(1);
});
