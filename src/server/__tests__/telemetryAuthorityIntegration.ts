import express from 'express';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { registerTrackerRoutes } from '../trackerRoutes';
import type { AuthenticatedPrincipal } from '../auth';

const require = createRequire(import.meta.url); const { Client } = require('pg') as typeof import('pg');
const companyA = 'telemetry-1a-company-a', companyB = 'telemetry-1a-company-b';
const userA = 'telemetry-1a-user-a', vehicleA = 'telemetry-1a-vehicle-a', vehicleB = 'telemetry-1a-vehicle-b';
const trackerA = 'telemetry-1a-tracker-a', trackerB = 'telemetry-1a-tracker-b', removedA = 'telemetry-1a-removed-a';
const imeiA = '123456789012345', imeiB = '543210987654321';
const roleName = 'telemetry_1a_rls_user', rolePassword = 'telemetry-1a-test-password';
const actor: AuthenticatedPrincipal = { companyId: companyA, userId: userA, name: 'Telemetry Admin', role: 'ADMIN', permissions: ['*'] };
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function rows(result: any): any[] { return Array.isArray(result?.rows) ? result.rows : []; }
async function one(query: any): Promise<any> { return rows(await db.execute(query))[0]; }

async function seed(): Promise<void> {
  await db.execute(sql`INSERT INTO companies(id,name,status,created_at,updated_at) VALUES (${companyA},'Telemetry A','ACTIVE',NOW(),NOW()),(${companyB},'Telemetry B','ACTIVE',NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO users(id,company_id,name,email,role,active,created_at,updated_at) VALUES (${userA},${companyA},'Telemetry Admin','telemetry@example.test','ADMIN',true,NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO vehicles(id,company_id,plate,renavam,status,current_km,created_at,updated_at) VALUES (${vehicleA},${companyA},'TAA1A01','TEL-A','AVAILABLE',3210,NOW(),NOW()),(${vehicleB},${companyB},'TBB1B01','TEL-B','AVAILABLE',6540,NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO trackers(id,company_id,vehicle_id,equipment_model,imei,status,created_by,created_at,updated_at) VALUES
    (${trackerA},${companyA},${vehicleA},'Synthetic A',${imeiA},'ACTIVE',${userA},NOW(),NOW()),
    (${trackerB},${companyB},${vehicleB},'Synthetic B',${imeiB},'ACTIVE','telemetry-b',NOW(),NOW()),
    (${removedA},${companyA},${vehicleA},'Removed',${'999999999999999'},'REMOVED',${userA},NOW(),NOW()) ON CONFLICT(company_id,id) DO NOTHING`);
}

async function withServer(run: (base: string) => Promise<void>): Promise<void> {
  const app = express(); app.use(express.json()); app.use((req, _res, next) => { if (req.header('x-test-principal') === 'admin') (req as any).principal = actor; next(); }); registerTrackerRoutes(app);
  const server = createServer(app); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('test address unavailable');
  try { await run(`http://127.0.0.1:${address.port}`); } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}
function post(base: string, trackerId: string, body: unknown): Promise<Response> {
  return fetch(`${base}/api/trackers/${trackerId}/telemetry/events`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-test-principal': 'admin' }, body: JSON.stringify(body) });
}
function event(sourceEventId: string, eventType: string, occurredAt: string, payload: Record<string, unknown>): Record<string, unknown> {
  return { sourceEventId, eventType, occurredAt, payload, synthetic: true };
}

async function testAuthorityAndQuarantine(): Promise<void> {
  await withServer(async base => {
    let response = await fetch(`${base}/api/trackers/${trackerA}/telemetry/events`); assert(response.status === 401, `no session expected 401 got ${response.status}`);
    response = await post(base, trackerA, { ...event('forged-tenant', 'HEARTBEAT', '2026-08-24T18:00:00Z', { imei: imeiA }), companyId: companyB }); assert(response.status === 400, `forged tenant expected 400 got ${response.status}`);
    response = await post(base, trackerB, event('cross-tenant', 'HEARTBEAT', '2026-08-24T18:00:00Z', { imei: imeiB })); assert(response.status === 404, `cross tenant expected 404 got ${response.status}`);
    response = await post(base, removedA, event('removed', 'HEARTBEAT', '2026-08-24T18:00:00Z', { imei: '999999999999999' })); assert(response.status === 404, `removed tracker expected 404 got ${response.status}`);
    response = await post(base, trackerA, event('financial-forgery', 'ODOMETER', '2026-08-24T18:00:00Z', { imei: imeiA, odometerKm: 3300, amount: 100 })); assert(response.status === 400, `financial payload expected 400 got ${response.status}`);
    response = await post(base, trackerA, { ...event('real-event', 'HEARTBEAT', '2026-08-24T18:00:00Z', { imei: imeiA }), synthetic: false }); assert(response.status === 400, `non-synthetic expected 400 got ${response.status}`);

    response = await post(base, trackerA, event('odo-base', 'ODOMETER', '2026-08-24T18:00:00Z', { imei: imeiA, odometerKm: 4000 })); assert(response.status === 201, `accepted odometer expected 201 got ${response.status}`); const accepted = await response.json() as any; assert(accepted.item.status === 'ACCEPTED' && accepted.replayed === false, 'baseline was not accepted');
    response = await post(base, trackerA, event('odo-base', 'ODOMETER', '2026-08-24T18:00:00Z', { imei: imeiA, odometerKm: 9999 })); assert(response.status === 200, `replay expected 200 got ${response.status}`); const replay = await response.json() as any; assert(replay.replayed === true && replay.item.id === accepted.item.id && replay.item.odometerKm === 4000, 'replay did not preserve first event');
    response = await post(base, trackerA, event('odo-regression', 'ODOMETER', '2026-08-24T18:01:00Z', { imei: imeiA, odometerKm: 3900 })); const regression = await response.json() as any; assert(response.status === 201 && regression.item.quarantineReason === 'ODOMETER_REGRESSION', 'regressive odometer was not quarantined');
    response = await post(base, trackerA, event('odo-jump', 'ODOMETER', '2026-08-24T18:02:00Z', { imei: imeiA, odometerKm: 10000 })); const jump = await response.json() as any; assert(jump.item.quarantineReason === 'ODOMETER_JUMP', 'odometer jump was not quarantined');
    response = await post(base, trackerA, event('device-mismatch', 'HEARTBEAT', '2026-08-24T18:03:00Z', { imei: imeiB, batteryPercent: 50 })); const mismatch = await response.json() as any; assert(mismatch.item.quarantineReason === 'DEVICE_MISMATCH', 'IMEI mismatch was not quarantined');
    response = await post(base, trackerA, event('bad-time', 'HEARTBEAT', 'not-a-timestamp', { imei: imeiA })); const badTime = await response.json() as any; assert(badTime.item.quarantineReason === 'TIMESTAMP_INVALID', 'invalid timestamp was not quarantined');
    response = await post(base, trackerA, event('future-time', 'HEARTBEAT', '2099-01-01T00:00:00Z', { imei: imeiA })); const future = await response.json() as any; assert(future.item.quarantineReason === 'TIMESTAMP_FUTURE', 'future timestamp was not quarantined');
    response = await post(base, trackerA, event('heartbeat-new', 'HEARTBEAT', '2026-08-24T19:00:00Z', { imei: imeiA, batteryPercent: 90 })); assert((await response.json() as any).item.status === 'ACCEPTED', 'new heartbeat not accepted');
    response = await post(base, trackerA, event('heartbeat-old', 'HEARTBEAT', '2026-08-24T18:30:00Z', { imei: imeiA, batteryPercent: 80 })); assert((await response.json() as any).item.quarantineReason === 'OUT_OF_SEQUENCE', 'out-of-sequence event not quarantined');

    response = await post(base, trackerA, event('position-secret', 'POSITION', '2026-08-24T19:01:00Z', { imei: imeiA, latitude: -23.55052, longitude: -46.633308, speedKph: 42 })); assert(response.status === 201, 'position event rejected');
    response = await fetch(`${base}/api/trackers/${trackerA}/telemetry/events?limit=100`, { headers: { 'x-test-principal': 'admin' } }); assert(response.status === 200, 'telemetry list failed');
    const listText = await response.text(); assert(!listText.includes('latitude') && !listText.includes('longitude') && !listText.includes('-23.55052') && !listText.includes('-46.633308'), 'precise position leaked to browser');
    const list = JSON.parse(listText); assert(list.items.some((item: any) => item.hasPosition === true), 'masked position indicator missing');
  });
  assert(Number((await one(sql`SELECT count(*)::int count FROM telemetry_events WHERE company_id=${companyA} AND tracker_id=${trackerA} AND source_event_id='odo-base'`)).count) === 1, 'replay created duplicate event');
  assert(Number((await one(sql`SELECT current_km FROM vehicles WHERE company_id=${companyA} AND id=${vehicleA}`)).current_km) === 3210, 'telemetry changed authoritative vehicle km');
  assert(Number((await one(sql`SELECT count(*)::int count FROM account_payables WHERE company_id=${companyA} AND origin_id=${trackerA}`)).count) === 0, 'telemetry created payable');
  assert(Number((await one(sql`SELECT count(*)::int count FROM account_receivables WHERE company_id=${companyA} AND origin_id=${trackerA}`)).count) === 0, 'telemetry created receivable');
  assert(Number((await one(sql`SELECT count(*)::int count FROM audit_logs WHERE company_id=${companyA} AND entity_name='TelemetryEvent'`)).count) >= 9, 'telemetry audit trail missing');
}

async function testRls(): Promise<void> {
  await db.execute(sql.raw(`DROP ROLE IF EXISTS ${roleName}`)); await db.execute(sql.raw(`CREATE ROLE ${roleName} LOGIN PASSWORD '${rolePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`));
  await db.execute(sql.raw(`GRANT USAGE ON SCHEMA public TO ${roleName}`)); await db.execute(sql.raw(`GRANT SELECT,INSERT,UPDATE ON telemetry_events TO ${roleName}`));
  const url = new URL(process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/autoerp_phase1_test'); const client = new Client({ host: url.hostname, port: Number(url.port || 5432), database: url.pathname.slice(1), user: roleName, password: rolePassword }); await client.connect();
  try { await client.query('BEGIN'); await client.query(`SELECT set_config('app.current_tenant',$1,true)`, [companyA]); const visible = await client.query('SELECT company_id FROM telemetry_events'); assert(visible.rows.every((row: any) => row.company_id === companyA), 'telemetry RLS leaked tenant'); let rejected = false; try { await client.query(`INSERT INTO telemetry_events(id,company_id,tracker_id,source_event_id,raw_occurred_at,event_type,raw_payload,payload_sha256,status,ingested_by,is_synthetic) VALUES ('tev_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',$1,$2,'cross','x','HEARTBEAT','{}',$3,'ACCEPTED','x',true)`, [companyB, trackerB, 'a'.repeat(64)]); } catch { rejected = true; } assert(rejected, 'telemetry RLS allowed cross-tenant insert'); await client.query('ROLLBACK'); }
  finally { await client.end(); await db.execute(sql.raw(`DROP OWNED BY ${roleName}`)); await db.execute(sql.raw(`DROP ROLE IF EXISTS ${roleName}`)); }
}

async function main(): Promise<void> { await seed(); await testAuthorityAndQuarantine(); await testRls(); console.log('TELEMETRY-1A synthetic authority integration: PASS'); }
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
