import express from 'express';
import { createServer } from 'node:http';
import type { AuthenticatedPrincipal } from '../auth';
import { registerMaintenanceSlaRoutes } from '../maintenanceSlaRoutes';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const admin: AuthenticatedPrincipal = {
  companyId: 'maint-sla-route-company',
  userId: 'maint-sla-route-admin',
  name: 'SLA Route Admin',
  role: 'ADMIN',
  permissions: ['*'],
};

const readonly: AuthenticatedPrincipal = {
  companyId: 'maint-sla-route-company',
  userId: 'maint-sla-route-readonly',
  name: 'SLA Route Viewer',
  role: 'READONLY',
  permissions: [],
};

export async function runMaintenanceSlaRouteRegression(): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const who = req.header('x-test-principal');
    if (who === 'admin') (req as any).principal = admin;
    if (who === 'readonly') (req as any).principal = readonly;
    next();
  });
  registerMaintenanceSlaRoutes(app);

  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('SLA test server unavailable');
  const base = `http://127.0.0.1:${address.port}`;

  try {
    let response = await fetch(`${base}/api/maintenance/work-orders/synthetic/sla`);
    assert(response.status === 401, `SLA no-session expected 401 got ${response.status}`);

    response = await fetch(`${base}/api/maintenance/work-orders/synthetic/sla`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-test-principal': 'readonly' },
      body: JSON.stringify({ expectedDurationMinutes: 60 }),
    });
    assert(response.status === 403, `SLA READONLY write expected 403 got ${response.status}`);

    for (const forged of [
      { expectedDurationMinutes: 60, companyId: 'forged-company' },
      { expectedDurationMinutes: 60, actorUserId: 'forged-user' },
      { expectedDurationMinutes: 60, occurredAt: '2026-01-01T00:00:00.000Z' },
    ]) {
      response = await fetch(`${base}/api/maintenance/work-orders/synthetic/sla`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-test-principal': 'admin' },
        body: JSON.stringify(forged),
      });
      assert(response.status === 400, `forged SLA authority expected 400 got ${response.status}`);
    }

    response = await fetch(`${base}/api/maintenance/work-orders/synthetic/sla/delay-reasons`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-principal': 'admin' },
      body: JSON.stringify({ reason: 'forged', actorName: 'forged actor' }),
    });
    assert(response.status === 400, `forged delay actor expected 400 got ${response.status}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }

  console.log('MAINT-SLA-1C protected route regression: PASS');
}
