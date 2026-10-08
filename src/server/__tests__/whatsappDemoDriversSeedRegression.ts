import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express, { type Request, type Response as ExpressResponse, type NextFunction } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../../db/index';
import { registerWhatsappRoutes } from '../whatsappRoutes';
import type { AuthenticatedPrincipal } from '../auth';

async function run() {
  console.log('================================================================================');
  console.log('=== AUTOERP-81: REGRESSÃO DA MASSA DEMO DE MOTORISTAS & COBRANÇA WHATSAPP ===');
  console.log('================================================================================');

  const companyId = 'staging-company-001';

  // 1. Validar que todos os 10 motoristas demo possuem telefone e whatsapp válidos e distintos
  console.log('\n[1/4] Auditando telefone e whatsapp dos 10 motoristas demo no banco...');
  const driversRes: any = await db.execute(sql`
    SELECT id, name, phone, whatsapp
    FROM drivers
    WHERE company_id = ${companyId} AND id LIKE 'v2demo%driver%'
    ORDER BY id ASC;
  `);

  const demoDrivers = driversRes.rows || driversRes;
  assert.equal(demoDrivers.length, 10, `Esperado 10 motoristas demo, encontrados ${demoDrivers.length}`);

  const phoneSet = new Set<string>();
  for (const drv of demoDrivers) {
    assert(drv.phone, `Motorista ${drv.id} (${drv.name}) não pode ter telefone nulo ou vazio`);
    assert(drv.whatsapp, `Motorista ${drv.id} (${drv.name}) não pode ter whatsapp nulo ou vazio`);
    assert.equal(drv.phone, drv.whatsapp, `Motorista ${drv.id} deve ter phone e whatsapp idênticos`);
    assert(/^11\d{9}$/.test(drv.phone), `Telefone ${drv.phone} do motorista ${drv.id} deve seguir formato 11XXXXXXXXX`);
    phoneSet.add(drv.phone);
    console.log(`  ✓ ${drv.id} | ${drv.name.padEnd(22)} | Tel: ${drv.phone}`);
  }

  assert.equal(phoneSet.size, 10, 'Todos os 10 motoristas demo devem ter números distintos entre si');
  console.log('  ✓ 10/10 motoristas demo com telefones válidos, preenchidos e não colidentes.');

  // 2. Subir servidor Express com rota de WhatsApp e autenticação simulada
  console.log('\n[2/4] Inicializando servidor Express de teste...');
  const app = express();
  app.use(express.json());

  app.use((req: Request, _res: ExpressResponse, next: NextFunction) => {
    (req as Request & { principal?: AuthenticatedPrincipal }).principal = {
      companyId,
      userId: 'v2demo-ngcompany001-user-admin',
      name: 'Admin Demo V2',
      role: 'ADMIN',
      permissions: ['*'],
    };
    next();
  });

  registerWhatsappRoutes(app);

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 3. Testar disparo real de RENT_BILLING para 3 motoristas demo diferentes
    console.log('\n[3/4] Disparando RENT_BILLING para 3 motoristas demo distintos...');
    const testCases = [
      {
        driverId: 'v2demo-ngcompany001-driver-01',
        receivableId: 'v2demo-ngcompany001-receivable-rent-01',
        expectedPhone: '5511999887766',
        namePrefix: 'Ana Souza',
      },
      {
        driverId: 'v2demo-ngcompany001-driver-02',
        receivableId: 'v2demo-ngcompany001-receivable-rent-02',
        expectedPhone: '5511900010002',
        namePrefix: 'Bruno Martins',
      },
      {
        driverId: 'v2demo-ngcompany001-driver-03',
        receivableId: 'v2demo-ngcompany001-receivable-rent-03',
        expectedPhone: '5511900010003',
        namePrefix: 'Carla Oliveira',
      },
    ];

    for (const tc of testCases) {
      console.log(`  -> Testando cobrança para ${tc.namePrefix} (Recebível: ${tc.receivableId})...`);
      const res = await fetch(`${baseUrl}/api/whatsapp/wa-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateType: 'RENT_BILLING',
          entityId: tc.receivableId,
        }),
      });

      assert.equal(res.status, 200, `Esperado HTTP 200 para ${tc.namePrefix}, recebido ${res.status}`);
      const body = (await res.json()) as {
        whatsappUrl: string;
        phone: string;
        message: string;
        templateType: string;
      };

      assert.equal(body.templateType, 'RENT_BILLING');
      assert.equal(body.phone, tc.expectedPhone);
      assert(
        body.whatsappUrl.startsWith(`https://wa.me/${tc.expectedPhone}?text=`),
        `URL esperada wa.me/${tc.expectedPhone}, obtido: ${body.whatsappUrl.slice(0, 45)}`
      );
      assert(body.message.includes(tc.namePrefix), `Mensagem deve saudar ${tc.namePrefix}`);
      assert(body.message.includes('Lembramos sobre o título referente a'), 'Mensagem deve conter template de cobrança');
      assert(body.message.includes('Chave Pix para pagamento:'), 'Mensagem deve conter chave Pix da locadora');
      console.log(`     ✓ HTTP 200 OK | Destino: ${body.phone} | Link: ${body.whatsappUrl.slice(0, 45)}...`);
    }

    // 4. Provar que evento único de auditoria foi gravado para os disparos
    console.log('\n[4/4] Verificando logs de auditoria dos disparos realizados...');
    const auditRes: any = await db.execute(sql`
      SELECT id, action, entity_type, entity_id, changes
      FROM audit_logs
      WHERE company_id = ${companyId}
        AND entity_type = 'WhatsappWaLink'
        AND entity_id IN (
          'v2demo-ngcompany001-receivable-rent-01',
          'v2demo-ngcompany001-receivable-rent-02',
          'v2demo-ngcompany001-receivable-rent-03'
        )
      ORDER BY timestamp DESC
      LIMIT 3;
    `);

    const auditRows = auditRes.rows || auditRes;
    assert(auditRows.length >= 3, `Esperado pelo menos 3 registros de auditoria, encontrados ${auditRows.length}`);
    for (const row of auditRows) {
      const parsedChanges = typeof row.changes === 'string' ? JSON.parse(row.changes) : row.changes;
      const parsedNewState = typeof parsedChanges.newState === 'string' ? JSON.parse(parsedChanges.newState) : parsedChanges.newState;
      assert.equal(parsedNewState.event, 'WHATSAPP_WAME_LINK_GENERATED');
      assert.equal(parsedNewState.templateType, 'RENT_BILLING');
      assert(parsedNewState.phone.startsWith('5511'), `Telefone auditado deve ter DDI 55: ${parsedNewState.phone}`);
    }
    console.log(`  ✓ Confirmados ${auditRows.length} registros de auditoria WHATSAPP_WAME_LINK_GENERATED em audit_logs.`);

    console.log('\n================================================================================');
    console.log('=== AUTOERP-81: TODAS AS VALIDAÇÕES PASSARAM COM SUCESSO ABSOLUTO! ===');
    console.log('================================================================================\n');
  } finally {
    server.close();
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Falha na regressão da massa demo:', err);
    process.exit(1);
  });
