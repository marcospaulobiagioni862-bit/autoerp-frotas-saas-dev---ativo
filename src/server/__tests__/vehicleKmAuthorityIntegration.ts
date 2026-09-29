import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { UnitOfWork } from '../../db/uow';
import { recordVehicleKm, VehicleKmError } from '../vehicleKmAuthority';
import { registerVehicleRoutes } from '../vehicleRoutes';
import { MaintenanceAuthorityService } from '../maintenanceAuthority';
import { MaintenancePreventiveAuthority } from '../maintenancePreventiveAuthority';
import { TelemetryAuthorityService } from '../telemetryAuthority';
import type { AuthenticatedPrincipal } from '../auth';

// CI uses its disposable PostgreSQL; the existing isolated local runner uses in-memory PGlite.
if (process.env.NODE_ENV !== 'test') throw new Error('KM integration requires a test database');
const company = 'km-central-a', other = 'km-central-b', id = 'km-central-vehicle';
const actor: AuthenticatedPrincipal = { companyId: company, userId: 'km-central-user', name: 'KM test', role: 'ADMIN', permissions: ['*'] };
const first = async (query: any) => (await db.execute(query) as any).rows[0];
const count = async () => Number((await first(sql`SELECT count(*)::int n FROM vehicle_km_records WHERE company_id=${company}`)).n);
const current = async (vehicleId = id) => Number((await first(sql`SELECT current_km FROM vehicles WHERE company_id=${company} AND id=${vehicleId}`)).current_km);
const input = (kmValue: number, vehicleId = id) => ({ vehicleId, kmValue, recordDate: '2026-09-27', readingType: 'PERIODIC' as const });
const record = (kmValue: number) => UnitOfWork.run(company, tx => recordVehicleKm(tx, company, input(kmValue)));
await db.execute(sql`INSERT INTO companies(id,name,status,created_at,updated_at) VALUES (${company},'KM A','ACTIVE',now(),now()),(${other},'KM B','ACTIVE',now(),now())`);
await db.execute(sql`INSERT INTO users(id,company_id,name,email,role,active,created_at,updated_at) VALUES (${actor.userId},${company},'KM test','km-central@example.test','ADMIN',true,now(),now())`);
await db.execute(sql`INSERT INTO vehicles(id,company_id,plate,renavam,status,current_km,created_at,updated_at) VALUES
  (${id},${company},'KMC1A01','KM-CENTRAL-1','AVAILABLE',100,now(),now()),
  ('km-central-second',${company},'KMC1A02','KM-CENTRAL-2','AVAILABLE',200,now(),now()),
  ('km-central-foreign',${other},'KMC1B01','KM-CENTRAL-3','AVAILABLE',300,now(),now())`);

const app = express();
app.use(express.json());
app.use((req, _res, next) => { (req as any).principal = actor; next(); });
registerVehicleRoutes(app);
const server = createServer(app);
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address() as { port: number };
const url = `http://127.0.0.1:${address.port}`;
const post = (path: string, body: unknown) => fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const kmPath = `/api/fleet/vehicles/${id}/km-records`;
try {
  assert.equal((await post(kmPath, input(99))).status, 400);
  assert.equal(await count(), 0);
  const beforeEqual = await first(sql`SELECT updated_at FROM vehicles WHERE id=${id}`);
  for (let i = 0; i < 2; i++) assert.equal((await post(kmPath, input(100))).status, 201);
  assert.equal(await count(), 2);
  assert.equal(await current(), 100);
  assert.deepEqual((await first(sql`SELECT updated_at FROM vehicles WHERE id=${id}`)).updated_at, beforeEqual.updated_at);
  const history = await (await fetch(url + kmPath)).json();
  assert.equal(history.items.length, 2, 'GET must not hide consecutive confirmations');
  assert.notEqual(history.items[0].id, history.items[1].id);
  assert.equal((await post(kmPath, input(101))).status, 201);
  assert.equal(await current(), 101);
  assert.equal((await post(kmPath, { ...input(102), readingType: 'TELEMETRY' })).status, 400);
  await assert.rejects(UnitOfWork.run(company, tx => recordVehicleKm(tx, company, { ...input(102), readingType: 'TRACKER' as any })), VehicleKmError);
  console.log('PASS KM individual: <, repeated =, >, full history, telemetry/tracker source rejected');

  for (const state of [{ status: 'SOLD', archived: false }, { status: 'ARCHIVED', archived: false }, { status: 'AVAILABLE', archived: true }]) {
    await db.execute(sql`UPDATE vehicles SET status=${state.status},is_archived=${state.archived} WHERE id=${id}`);
    assert.equal((await post(kmPath, input(101))).status, 409);
  }
  await db.execute(sql`UPDATE vehicles SET status='AVAILABLE',is_archived=false WHERE id=${id}`);
  assert.equal((await post('/api/fleet/vehicles/km-central-foreign/km-records', input(300))).status, 404);
  await assert.rejects(UnitOfWork.run(other, tx => recordVehicleKm(tx, other, input(101))), VehicleKmError);

  let baseline = await count();
  const batch = '/api/fleet/vehicles/km-records/batch';
  assert.equal((await post(batch, { entries: [input(101), input(201, 'km-central-second')] })).status, 201);
  assert.equal(await count(), baseline + 2);
  assert.equal(await current('km-central-second'), 201);
  baseline = await count();
  // second sorts before vehicle: its advance must roll back when vehicle regresses.
  assert.equal((await post(batch, { entries: [input(100), input(202, 'km-central-second')] })).status, 400);
  assert.equal(await count(), baseline);
  assert.equal(await current('km-central-second'), 201);
  assert.equal((await post(batch, { entries: [input(101), input(301, 'km-central-foreign')] })).status, 404);
  assert.equal(await count(), baseline);
  assert.equal((await post(batch, { entries: [input(101), input(101)] })).status, 400);
  console.log('PASS KM terminal guards, tenant isolation and atomic mixed batch');

  const technicalChecklist = Object.fromEntries(['tires','glassMirrors','bodyPaint','interior','dashboard','lighting','brakes','suspension','steering','engine','transmission','safety'].map(key => [key, 'OK']));
  const inspection = (odometer: number) => post(`/api/fleet/vehicles/${id}/inspections`, {
    inspectionType: 'ENTRY',
    odometer,
    fuelLevel: 50,
    technicalChecklist,
    equipmentSnapshot: {
      tireBrand: 'Test',
      tireModel: 'Road',
      tireMeasure: '195/55 R15',
      batteryBrand: 'Test',
      batteryModel: '60Ah',
    },
  });
  baseline = await count();
  for (const km of [101, 101, 102]) assert.equal((await inspection(km)).status, 201);
  assert.equal(await count(), baseline + 3);
  assert.equal(await current(), 102);
  assert.equal((await inspection(101)).status, 400);
  assert.equal(Number((await first(sql`SELECT count(*)::int n FROM vehicle_inspections WHERE company_id=${company}`)).n), 3, 'regressive inspection rolls back');
  console.log('PASS Vistoria: repeated confirmations, advance, regressive rollback');

  const complete = async (exitKm: number, number: string) => {
    const wo = await MaintenanceAuthorityService.createWorkOrder(actor, { vehicleId: id, entryKm: await current(), number, description: 'KM central' });
    await MaintenanceAuthorityService.startWorkOrder(actor, wo.id);
    return { wo, result: await MaintenanceAuthorityService.completeWorkOrder(actor, wo.id, { exitKm }) };
  };
  baseline = await count();
  const equalOrder = await complete(102, 'KM-OS-1');
  assert.equal(equalOrder.result.status, 'COMPLETED');
  assert.equal(await count(), baseline + 1);
  await MaintenanceAuthorityService.completeWorkOrder(actor, equalOrder.wo.id, { exitKm: 102 });
  assert.equal(await count(), baseline + 1, 'retry completed OS is not a new measurement');
  await complete(103, 'KM-OS-2');
  assert.equal(await current(), 103);
  const wo = await MaintenanceAuthorityService.createWorkOrder(actor, { vehicleId: id, entryKm: 103, number: 'KM-OS-3', description: 'Regressive completion' });
  await MaintenanceAuthorityService.startWorkOrder(actor, wo.id);
  await record(104);
  baseline = await count();
  await assert.rejects(MaintenanceAuthorityService.completeWorkOrder(actor, wo.id, { exitKm: 103 }));
  assert.equal(await count(), baseline);
  assert.equal((await MaintenanceAuthorityService.getWorkOrder(company, wo.id))?.status, 'IN_PROGRESS');
  console.log('PASS Manutenção: equality, advance, regression against live KM and idempotent completion');

  const oil = (km: number) => MaintenancePreventiveAuthority.createOilChange(actor, { vehicleId: id, km, date: '2026-09-27', oilType: '5W30', oilBrand: 'Test', quantity: 4, filterChanged: true, nextKm: 10000 });
  baseline = await count();
  await oil(104); await oil(104); await oil(105);
  assert.equal(await count(), baseline + 3);
  await assert.rejects(oil(104));
  assert.equal(await current(), 105);
  const tire = await MaintenancePreventiveAuthority.createTire(actor, { vehicleId: id, position: 'FL', brand: 'Test', model: 'Test', installationDate: '2026-09-27', installationKm: 105, cost: 0 });
  await MaintenancePreventiveAuthority.rotateTire(actor, tire.id, { position: 'RL', date: '2026-09-27', km: 105 });
  await MaintenancePreventiveAuthority.removeTire(actor, tire.id, { status: 'REMOVED', date: '2026-09-27', km: 105, reason: 'Test' });
  assert.equal(await count(), baseline + 6);
  await db.execute(sql`UPDATE vehicles SET status='SOLD' WHERE id=${id}`);
  await assert.rejects(oil(105));
  await db.execute(sql`UPDATE vehicles SET status='AVAILABLE' WHERE id=${id}`);
  console.log('PASS Preventiva: oil <, repeated =, >; tire installation/rotation/removal confirmations; sold blocked');

  baseline = await count();
  await db.execute(sql`INSERT INTO trackers(id,company_id,vehicle_id,serial_number,equipment_model,imei,monthly_cost,installation_date,status,created_at,updated_at)
    VALUES('km-central-tracker',${company},${id},'KM-TRACKER','Test','111111111111111',0,'2026-09-27','ACTIVE',now(),now())`);
  const telemetry = await TelemetryAuthorityService.ingest(actor, { trackerId: 'km-central-tracker', sourceEventId: 'km-advisory', eventType: 'ODOMETER', occurredAt: new Date().toISOString(), payload: { odometerKm: 999 } });
  assert.equal(telemetry.item.status, 'ACCEPTED');
  assert.equal(await current(), 105, 'accepted telemetry must never advance official KM');
  assert.equal(await count(), baseline, 'accepted telemetry must not create official KmRecord');
  console.log('PASS accepted tracker telemetry remains advisory, without official KM writes');

  baseline = await count();
  await assert.rejects(UnitOfWork.run(company, async tx => {
    const repo = tx.getVehicleRepo();
    const failingTx = { ...tx, getVehicleRepo: () => ({
      findByIdForCompanyWithLock: repo.findByIdForCompanyWithLock.bind(repo), updateForCompany: async () => null,
    }) };
    await recordVehicleKm(failingTx, company, input(106));
  }));
  assert.equal(await count(), baseline, 'record insert rolls back when vehicle update fails');
  assert.equal(await current(), 105);

  let unlock!: () => void, locked!: () => void;
  const release = new Promise<void>(resolve => { unlock = resolve; });
  const acquired = new Promise<void>(resolve => { locked = resolve; });
  const high = UnitOfWork.run(company, async tx => {
    await tx.getVehicleRepo().findByIdForCompanyWithLock(company, id);
    locked(); await release;
    return recordVehicleKm(tx, company, input(200));
  });
  await acquired;
  let finished = false;
  const low = record(150).then(() => { finished = true; return 'accepted'; }, error => { finished = true; return error; });
  try {
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(finished, false, 'second transaction must wait for the locked vehicle');
  } finally { unlock(); }
  await high;
  const rejected = await low;
  assert(rejected instanceof VehicleKmError && rejected.kind === 'REGRESSIVE');
  assert.equal(await current(), 200);
  baseline = await count();
  const equalResults = await Promise.all([record(200), record(200)]);
  assert.notEqual(equalResults[0].record.id, equalResults[1].record.id);
  assert.equal(await count(), baseline + 2);
  console.log(`PASS concurrency: waiting writer rechecks committed KM; equal concurrent readings preserved (${process.env.USE_PGLITE === 'true' ? 'PGlite serial transactions; real row locks require the PostgreSQL CI run' : 'PostgreSQL row locks'})`);
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
console.log('KM Central integration: PASS');
