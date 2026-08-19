import express, { type NextFunction, type Request, type Response as ExpressResponse } from 'express';
import { createServer } from 'node:http';
import { sql } from 'drizzle-orm';
import { db } from '../src/db';
import { registerContractRoutes } from '../src/server/contractRoutes';
import type { AuthenticatedPrincipal } from '../src/server/auth';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function scalar(query: any): Promise<any> {
  const result: any = await db.execute(query);
  return result.rows?.[0];
}

async function main(): Promise<void> {
  const companyId = 'security-2i3-final-cnh-company';
  const userId = 'security-2i3-final-cnh-admin';
  const vehicleId = 'security-2i3-final-cnh-vehicle';
  const driverId = 'security-2i3-final-cnh-driver';
  const contractId = 'security-2i3-final-cnh-contract';

  await db.execute(sql`
    INSERT INTO companies (id, name, status, created_at, updated_at)
    VALUES (${companyId}, 'I3 Final CNH Company', 'ACTIVE', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO users (id, company_id, name, email, role, active, created_at, updated_at)
    VALUES (${userId}, ${companyId}, 'I3 Final Admin', 'i3-final-cnh@example.test', 'ADMIN', true, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO vehicles (id, company_id, plate, renavam, status, is_archived, created_at, updated_at)
    VALUES (${vehicleId}, ${companyId}, 'I3F1A01', 'I3FINALRENAVAM1', 'AVAILABLE', false, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO drivers (
      id, company_id, name, cpf, cnh, active, cnh_expiration, status, app_platforms, is_archived, created_at, updated_at
    ) VALUES (
      ${driverId}, ${companyId}, 'Driver Pending CNH', '52998224725', '12345678900', true,
      NULL, 'ACTIVE', ARRAY['Uber'], false, NOW(), NOW()
    )
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO contracts (
      id, company_id, driver_id, vehicle_id, status, contract_number, start_date,
      rental_amount, billing_periodicity, billing_due_day_of_week, billing_due_day_of_month,
      security_deposit_amount, franchise_km, excess_km_rate, is_archived, created_at, updated_at
    ) VALUES (
      ${contractId}, ${companyId}, ${driverId}, ${vehicleId}, 'DRAFT', 'CNT-I3-FINAL-CNH', '2026-09-01',
      700, 'WEEKLY', 1, 1, 0, 1000, 0.5, false, NOW(), NOW()
    )
    ON CONFLICT (id) DO NOTHING
  `);

  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: ExpressResponse, next: NextFunction) => {
    (req as Request & { principal?: AuthenticatedPrincipal }).principal = {
      companyId,
      userId,
      name: 'I3 Final Admin',
      role: 'ADMIN',
      permissions: [],
    };
    next();
  });
  registerContractRoutes(app);

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert(address && typeof address === 'object', 'server address unavailable');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/contracts/${contractId}/activate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    assert(response.status === 409, `PENDING CNH activation must be 409, got ${response.status}`);

    const contract = await scalar(sql`SELECT status FROM contracts WHERE id=${contractId}`);
    const vehicle = await scalar(sql`SELECT status, current_driver_id, current_contract_id FROM vehicles WHERE id=${vehicleId}`);
    const receivable = await scalar(sql`SELECT count(*)::int AS count FROM account_receivables WHERE contract_id=${contractId}`);
    const audit = await scalar(sql`SELECT count(*)::int AS count FROM audit_logs WHERE entity_name='Contract' AND entity_id=${contractId} AND action='UPDATE'`);

    assert(contract?.status === 'DRAFT', `PENDING CNH changed Contract status: ${contract?.status}`);
    assert(vehicle?.status === 'AVAILABLE', `PENDING CNH changed Vehicle status: ${vehicle?.status}`);
    assert(!vehicle?.current_driver_id && !vehicle?.current_contract_id, 'PENDING CNH created Vehicle binding');
    assert(Number(receivable?.count) === 0, 'PENDING CNH created receivable');
    assert(Number(audit?.count) === 0, 'PENDING CNH created activation audit');

    console.log('SECURITY-2I3 PENDING CNH runtime denial PASS');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
