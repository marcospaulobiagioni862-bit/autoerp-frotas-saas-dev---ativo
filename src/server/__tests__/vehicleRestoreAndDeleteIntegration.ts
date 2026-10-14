import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import express, { type Request, type Response as ExpressResponse, type NextFunction } from 'express';
import { sql } from 'drizzle-orm';
import { VehicleStatus } from '../../types/enums';
import type { AuthenticatedPrincipal } from '../auth';

// 1. Carregar conexão Postgres autoritativa
try {
  const neonEnvPath = join(homedir(), '.config/autoerp-neon.env');
  if (existsSync(neonEnvPath)) {
    const envContent = readFileSync(neonEnvPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = /^([A-Z0-9_]+)="?([^"]*)"?$/.exec(trimmed);
      if (match) {
        process.env[match[1]] = match[2];
      }
    }
  }
} catch (e) {
  // Ignora se não existir
}

const dbUrl = process.env.DATABASE_URL || process.env.STAGING_MAIN_DATABASE_URL;
if (!dbUrl) {
  console.error('FATAL: DATABASE_URL ou STAGING_MAIN_DATABASE_URL é obrigatório para executar o teste de integração real.');
  process.exit(1);
}

process.env.DATABASE_URL = dbUrl;
process.env.USE_PGLITE = 'false';

async function runVehicleRestoreAndDeleteIntegration() {
  console.log('=== TESTE DE INTEGRAÇÃO REAL: EXCLUSÃO SEGURA E RETORNO AO ESTOQUE (PH-029) ===');
  console.log(`Database: ${dbUrl.replace(/:[^:@]+@/, ':***@')}`);

  // Importar dinamicamente para garantir que db/index use o DATABASE_URL configurado
  const { db } = await import('../../db/index');
  const { registerVehicleRoutes } = await import('../vehicleRoutes');
  const { registerVehicleLifecycleRoutes } = await import('../vehicleLifecycleRoutes');

  // Cria tenant isolado exclusivo para o teste
  const companyId = `test-res-del-${randomUUID().slice(0, 8)}`;
  const companyName = `Test Co ${companyId}`;
  const adminUserId = `user-admin-${randomUUID().slice(0, 8)}`;
  const opUserId = `user-op-${randomUUID().slice(0, 8)}`;

  await db.execute(sql`
    INSERT INTO companies (id, name, status, created_at, updated_at)
    VALUES (${companyId}, ${companyName}, 'ACTIVE', now(), now())
  `);

  await db.execute(sql`
    INSERT INTO users (id, company_id, name, email, role, active, created_at, updated_at)
    VALUES 
      (${adminUserId}, ${companyId}, 'Admin Test', ${adminUserId + '@example.test'}, 'ADMIN', true, now(), now()),
      (${opUserId}, ${companyId}, 'Op Test', ${opUserId + '@example.test'}, 'OPERATIONAL', true, now(), now())
  `);

  let currentPrincipal: AuthenticatedPrincipal = {
    userId: adminUserId,
    companyId,
    name: 'Admin Test',
    role: 'ADMIN',
    permissions: ['*'],
  };

  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: ExpressResponse, next: NextFunction) => {
    (req as Request & { principal?: AuthenticatedPrincipal }).principal = { ...currentPrincipal };
    next();
  });

  registerVehicleRoutes(app);
  registerVehicleLifecycleRoutes(app);

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const cleanupVehicleIds: string[] = [];

  try {
    // -------------------------------------------------------------------------
    // [1/5] Validar 403 Forbidden em DELETE para usuário sem permissão
    // -------------------------------------------------------------------------
    console.log('\n[1/5] Testando 403 Forbidden em DELETE para usuário sem DELETE_VEHICLE...');
    const plate1 = `TST${Math.floor(1000 + Math.random() * 9000)}`;
    const vehId1 = randomUUID();
    cleanupVehicleIds.push(vehId1);

    await db.execute(sql`
      INSERT INTO vehicles (
        id, company_id, plate, brand, model, color, fuel_type, category,
        renavam, chassis, current_km, acquisition_value, current_value, rental_value_base,
        year_fabrication, year_model, status, is_archived, created_at, updated_at
      ) VALUES (
        ${vehId1}, ${companyId}, ${plate1}, 'VW', 'Gol', 'Branco', 'Flex', 'Hatch / Sedan Compacto',
        ${'REN' + Math.floor(100000000 + Math.random() * 900000000)},
        ${'9BWAG45U6PT' + Math.floor(100000 + Math.random() * 900000)},
        10000, 50000, 45000, 1500, 2022, 2023, 'AVAILABLE', false, now(), now()
      )
    `);

    currentPrincipal = {
      userId: opUserId,
      companyId,
      name: 'Operador Readonly',
      role: 'OPERATIONAL',
      permissions: ['VIEW_VEHICLE'],
    };

    const resForbidden = await fetch(`${baseUrl}/api/fleet/vehicles/${vehId1}`, {
      method: 'DELETE',
    });
    assert.equal(resForbidden.status, 403, `Esperado 403 ao deletar sem permissão, obteve ${resForbidden.status}`);
    console.log('✓ 403 Forbidden validado com sucesso para usuário sem DELETE_VEHICLE.');

    // -------------------------------------------------------------------------
    // [2/5] Validar 409 Conflict em DELETE quando veículo tem histórico (multa / recebível)
    // -------------------------------------------------------------------------
    console.log('\n[2/5] Testando 409 Conflict em DELETE para veículo com histórico comercial/operacional...');
    currentPrincipal = {
      userId: adminUserId,
      companyId,
      name: 'Admin Test',
      role: 'ADMIN',
      permissions: ['*'],
    };

    const ticketId = randomUUID();
    await db.execute(sql`
      INSERT INTO traffic_tickets (
        id, company_id, vehicle_id, auto_number, amount, issue_date, status, canonical_ready, points, responsibility_version, created_at, updated_at
      ) VALUES (
        ${ticketId}, ${companyId}, ${vehId1}, ${'AUTO-' + ticketId.slice(0, 8)}, 195.23, now(), 'PENDING_IDENTIFICATION', false, 0, 0, now(), now()
      )
    `);

    const resConflict = await fetch(`${baseUrl}/api/fleet/vehicles/${vehId1}`, {
      method: 'DELETE',
    });
    assert.equal(resConflict.status, 409, `Esperado 409 ao tentar deletar veículo com histórico, obteve ${resConflict.status}`);
    const conflictBody = (await resConflict.json()) as any;
    assert.match(conflictBody.error, /não é possível excluir definitivamente/i);

    // Garantir que veículo continua existindo no banco
    const stillVeh = (await db.execute(sql`SELECT count(*)::int as cnt FROM vehicles WHERE id = ${vehId1}`)).rows[0] as any;
    assert.equal(Number(stillVeh.cnt), 1, 'Veículo não deve ser removido quando há registros vinculados');
    console.log('✓ 409 Conflict validado: bloqueio rigoroso contra exclusão de veículo com histórico.');

    // Limpar o registro de histórico para permitir próximos testes
    await db.execute(sql`DELETE FROM traffic_tickets WHERE id = ${ticketId}`);

    // -------------------------------------------------------------------------
    // [3/5] Validar 200 OK em DELETE de veículo limpo (cadastro via rota oficial) e AUDITORIA REAL DE TODAS AS 22 TABELAS
    // -------------------------------------------------------------------------
    console.log('\n[3/5] Testando 200 OK em DELETE de veículo criado pela rota oficial (cadastro por engano)...');
    
    // Inicializar catálogo de manutenção e ativar templates com intervalos válidos (padrão de produção)
    const { MaintenancePlanTemplateAuthority } = await import('../maintenancePlanTemplateAuthority');
    await MaintenancePlanTemplateAuthority.list(currentPrincipal);
    await db.execute(sql`
      UPDATE maintenance_plan_templates 
      SET active = true, interval_km = 10000 
      WHERE id IN (
        SELECT id FROM maintenance_plan_templates 
        WHERE company_id = ${companyId} 
        LIMIT 3
      )
    `);

    const plateClean = `CLN${Math.floor(1000 + Math.random() * 9000)}`;
    const renavamClean = `${Math.floor(10000000000 + Math.random() * 90000000000)}`;
    const chassisClean = `9BWAG45U6PT${Math.floor(100000 + Math.random() * 900000)}`;

    const resCreate = await fetch(`${baseUrl}/api/fleet/vehicles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plate: plateClean,
        brand: 'Fiat',
        model: 'Mobi',
        yearFabrication: 2023,
        yearModel: 2024,
        color: 'Branco',
        renavam: renavamClean,
        chassis: chassisClean,
        currentKm: 5000,
        fuelType: 'Flex',
        category: 'Hatch / Sedan Compacto',
        acquisitionValue: 45000,
        currentValue: 42000,
        rentalValueBase: 1300,
        ownerType: 'COMPANY',
      }),
    });
    assert.equal(resCreate.status, 201, `Falha ao criar veículo via POST: status ${resCreate.status}`);
    const createdBody = (await resCreate.json()) as any;
    const cleanVehId = createdBody.item.id;
    cleanupVehicleIds.push(cleanVehId);

    // Verificar que o próprio cadastro gerou planos de manutenção e histórico de propriedade no banco real
    const maintPlansBefore = (await db.execute(sql`SELECT count(*)::int as cnt FROM maintenance_plans WHERE vehicle_id = ${cleanVehId}`)).rows[0] as any;
    assert.ok(Number(maintPlansBefore.cnt) > 0, `O cadastro deveria ter criado planos de manutenção automáticos (criou ${maintPlansBefore.cnt})`);
    console.log(`  -> Confirmado: POST /api/fleet/vehicles gerou ${maintPlansBefore.cnt} planos de manutenção automáticos.`);

    // Executar DELETE
    const resDeleteClean = await fetch(`${baseUrl}/api/fleet/vehicles/${cleanVehId}`, {
      method: 'DELETE',
    });
    assert.equal(resDeleteClean.status, 200, `Esperado 200 ao deletar veículo sem histórico, obteve ${resDeleteClean.status}`);
    const deleteCleanBody = (await resDeleteClean.json()) as any;
    assert.equal(deleteCleanBody.success, true);

    // Auditoria exaustiva em banco real: consultar todas as tabelas com a coluna vehicle_id
    console.log('  -> Auditando integridade referencial em 100% das tabelas do banco com a coluna vehicle_id...');
    const tablesResult = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.columns 
      WHERE column_name = 'vehicle_id' AND table_schema = 'public' 
      ORDER BY table_name;
    `);
    const tablesWithVehicleId = (tablesResult.rows || []).map((r: any) => String(r.table_name));
    assert.ok(tablesWithVehicleId.length >= 21, `Esperado no mínimo 21 tabelas com vehicle_id, encontrado ${tablesWithVehicleId.length}`);

    for (const table of tablesWithVehicleId) {
      const q = sql.raw(`SELECT count(*)::int as cnt FROM "${table}" WHERE vehicle_id = '${cleanVehId}'`);
      const row = ((await db.execute(q)).rows?.[0] || {}) as any;
      const count = Number(row.cnt || 0);
      assert.equal(count, 0, `Tabela '${table}' contém ${count} registro(s) órfão(s) para o veículo excluído!`);
    }

    const vehStillInDb = (await db.execute(sql`SELECT count(*)::int as cnt FROM vehicles WHERE id = ${cleanVehId}`)).rows[0] as any;
    assert.equal(Number(vehStillInDb.cnt), 0, 'Veículo não deve existir na tabela vehicles');
    console.log(`✓ 200 OK validado no banco real: zero órfãos em todas as 22 tabelas com vehicle_id!`);

    // -------------------------------------------------------------------------
    // [4/5] Validar 201 OK em restore de veículo SOLD e de veículo ARCHIVED
    // -------------------------------------------------------------------------
    console.log('\n[4/5] Testando 201 OK ao restaurar veículo SOLD e veículo ARCHIVED (FGL6I36)...');
    const soldVehId = randomUUID();
    cleanupVehicleIds.push(soldVehId);
    await db.execute(sql`
      INSERT INTO vehicles (
        id, company_id, plate, brand, model, color, fuel_type, category,
        renavam, chassis, current_km, acquisition_value, current_value, rental_value_base,
        year_fabrication, year_model, status, is_archived, created_at, updated_at
      ) VALUES (
        ${soldVehId}, ${companyId}, 'FGL6I36', 'Fiat', 'Mobi', 'Preto', 'Flex', 'Hatch / Sedan Compacto',
        ${'REN' + Math.floor(100000000 + Math.random() * 900000000)},
        ${'9BWAG45U6PT' + Math.floor(100000 + Math.random() * 900000)},
        35000, 40000, 38000, 1200, 2021, 2022, 'SOLD', false, now(), now()
      )
    `);

    const resRestoreSold = await fetch(`${baseUrl}/api/fleet/vehicles/${soldVehId}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restoreDate: '2026-10-14',
        reason: 'Recompra / retorno de veículo vendido ao estoque ativo',
      }),
    });
    assert.equal(resRestoreSold.status, 201, `Esperado 201 ao restaurar veículo SOLD, obteve ${resRestoreSold.status}`);
    const restoredSoldDb = (await db.execute(sql`SELECT status, is_archived FROM vehicles WHERE id = ${soldVehId}`)).rows[0] as any;
    assert.equal(restoredSoldDb.status, 'AVAILABLE', 'Status do veículo após restore deve ser AVAILABLE');
    assert.equal(restoredSoldDb.is_archived, false, 'is_archived deve ser false');

    // Testar com veículo ARCHIVED
    const archivedVehId = randomUUID();
    cleanupVehicleIds.push(archivedVehId);
    await db.execute(sql`
      INSERT INTO vehicles (
        id, company_id, plate, brand, model, color, fuel_type, category,
        renavam, chassis, current_km, acquisition_value, current_value, rental_value_base,
        year_fabrication, year_model, status, is_archived, created_at, updated_at
      ) VALUES (
        ${archivedVehId}, ${companyId}, 'ARC1A23', 'Chevrolet', 'Onix', 'Prata', 'Flex', 'Hatch / Sedan Compacto',
        ${'REN' + Math.floor(100000000 + Math.random() * 900000000)},
        ${'9BWAG45U6PT' + Math.floor(100000 + Math.random() * 900000)},
        25000, 55000, 52000, 1600, 2022, 2023, 'ARCHIVED', true, now(), now()
      )
    `);

    const resRestoreArchived = await fetch(`${baseUrl}/api/fleet/vehicles/${archivedVehId}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restoreDate: '2026-10-14',
        reason: 'Reativação de veículo arquivado',
      }),
    });
    assert.equal(resRestoreArchived.status, 201, `Esperado 201 ao restaurar veículo ARCHIVED, obteve ${resRestoreArchived.status}`);
    const restoredArchivedDb = (await db.execute(sql`SELECT status, is_archived FROM vehicles WHERE id = ${archivedVehId}`)).rows[0] as any;
    assert.equal(restoredArchivedDb.status, 'AVAILABLE', 'Status do veículo arquivado após restore deve ser AVAILABLE');
    assert.equal(restoredArchivedDb.is_archived, false, 'is_archived deve ser false');

    // Validar evento de ciclo de vida gravado no banco real
    const eventsRes = await db.execute(sql`
      SELECT action, reason FROM vehicle_lifecycle_events WHERE vehicle_id IN (${soldVehId}, ${archivedVehId}) ORDER BY created_at ASC
    `);
    assert.equal(eventsRes.rows.length, 2, 'Deve ter gravado 2 eventos de ciclo de vida RESTORED');
    for (const ev of eventsRes.rows as any[]) {
      assert.equal(ev.action, 'RESTORED');
    }
    console.log('✓ 201 OK validado no banco real: veículos SOLD e ARCHIVED retornam com sucesso ao estoque como AVAILABLE.');

    // -------------------------------------------------------------------------
    // [5/5] Validar 409 Conflict ao tentar restaurar veículo que já está AVAILABLE
    // -------------------------------------------------------------------------
    console.log('\n[5/5] Testando 409 Conflict ao tentar restaurar veículo que já está AVAILABLE...');
    const resAlreadyAvailable = await fetch(`${baseUrl}/api/fleet/vehicles/${archivedVehId}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restoreDate: '2026-10-14',
        reason: 'Tentativa redundante',
      }),
    });
    assert.equal(resAlreadyAvailable.status, 409, `Esperado 409 para veículo já AVAILABLE, obteve ${resAlreadyAvailable.status}`);
    const alreadyAvailableBody = (await resAlreadyAvailable.json()) as any;
    assert.match(alreadyAvailableBody.error, /only a sold or archived vehicle can return to stock/i);
    console.log('✓ 409 Conflict validado: bloqueia tentativa de retorno de veículo já ativo.');

    console.log('\n================================================================================');
    console.log('=== TODOS OS 5 CASOS DE TESTE PASSARAM COM SUCESSO CONTRA O POSTGRES REAL! ===');
    console.log('================================================================================\n');
  } finally {
    // Limpeza de fixtures do teste
    try {
      for (const vId of cleanupVehicleIds) {
        await db.execute(sql`DELETE FROM maintenance_plans WHERE vehicle_id = ${vId}`);
        await db.execute(sql`DELETE FROM vehicle_lifecycle_events WHERE vehicle_id = ${vId}`);
        await db.execute(sql`DELETE FROM vehicle_km_records WHERE vehicle_id = ${vId}`);
        const hasScheduleTable = await db.execute(sql`
          SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vehicle_km_reading_schedules' LIMIT 1
        `);
        if ((hasScheduleTable.rows?.length || 0) > 0) {
          await db.execute(sql`DELETE FROM vehicle_km_reading_schedules WHERE vehicle_id = ${vId}`);
        }
        await db.execute(sql`DELETE FROM vehicle_inspections WHERE vehicle_id = ${vId}`);
        await db.execute(sql`DELETE FROM vehicle_document_intakes WHERE vehicle_id = ${vId}`);
        await db.execute(sql`DELETE FROM vehicle_ownership_history WHERE vehicle_id = ${vId}`);
        await db.execute(sql`DELETE FROM vehicles WHERE id = ${vId}`);
      }
      await db.execute(sql`DELETE FROM maintenance_plan_templates WHERE company_id = ${companyId}`);
      await db.execute(sql`DELETE FROM users WHERE company_id = ${companyId}`);
      await db.execute(sql`DELETE FROM companies WHERE id = ${companyId}`);
      console.log('Limpeza de dados de teste concluída com sucesso (zero resíduos).');
    } catch (cleanupErr) {
      console.warn('Aviso ao limpar dados de teste:', cleanupErr);
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

runVehicleRestoreAndDeleteIntegration().catch((err) => {
  console.error('FALHA NO TESTE DE INTEGRAÇÃO REAL:', err);
  process.exit(1);
});
