import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import express, { type NextFunction, type Request, type Response as ExpressResponse } from 'express';
import { sql } from 'drizzle-orm';

// Carregar variáveis Neon
try {
  const envContent = readFileSync(join(homedir(), '.config/autoerp-neon.env'), 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = /^([A-Z0-9_]+)="?([^"]*)"?$/.exec(trimmed);
    if (match) {
      process.env[match[1]] = match[2];
    }
  }
} catch (e) {
  console.warn('Could not read ~/.config/autoerp-neon.env:', e);
}

const neonUrl = process.env.HOMOLOG_DATABASE_URL || process.env.STAGING_MAIN_DATABASE_URL || process.env.DATABASE_URL;
if (!neonUrl) {
  console.error('FATAL: HOMOLOG_DATABASE_URL is required to run real massa verification.');
  process.exit(1);
}

process.env.DATABASE_URL = neonUrl;
process.env.USE_PGLITE = 'false';
process.env.NODE_ENV = 'development';

// Importar db e rotas após configurar o DATABASE_URL
async function main() {
  const { db } = await import('../../db/index');
  const { registerWhatsappRoutes } = await import('../whatsappRoutes');

  const companyId = 'staging-company-001';
  const driverId = 'v2demo-ngcompany001-driver-01';
  const vehicleId = 'v2demo-ngcompany001-vehicle-01';
  const contractId = 'v2demo-ngcompany001-contract-01';
  const ticketId = 'v2demo-ngcompany001-traffic-ticket-01';

  console.log('--- AUTOERP-55: VERIFICAÇÃO EM CENÁRIOS REAIS COM MASSA DO AUTOERP-60 (NEON) ---');
  console.log('Database:', neonUrl.split('@')[1]?.split('/')[0] || 'neon');

  // 1. Preparar/garantir dados demo com telefone e datas consistentes
  await db.execute(sql`
    UPDATE drivers
    SET phone = '11999887766', whatsapp = '11999887766', cnh_expiration = '2028-12-31'
    WHERE id = ${driverId} AND company_id = ${companyId}
  `);

  await db.execute(sql`
    UPDATE traffic_tickets
    SET original_amount = 195.23,
        due_date = '2026-11-15',
        organ_name = 'DETRAN-SP',
        infraction_code = '7455-0',
        description = 'Transitar em velocidade superior a máxima permitida',
        infraction_date = '2026-09-20',
        infraction_location = 'Av. Paulista, 1000'
    WHERE id = ${ticketId} AND company_id = ${companyId}
  `);

  await db.execute(sql`
    INSERT INTO traffic_ticket_driver_indications (
      id, company_id, traffic_ticket_id, indication_deadline, status, created_at, updated_at
    ) VALUES (
      'ind-demo-55-01', ${companyId}, ${ticketId}, '2026-10-30', 'PENDING', NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET indication_deadline = '2026-10-30', updated_at = NOW()
  `);

  // 2. Subir servidor HTTP com autenticação ADMIN para staging-company-001
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: ExpressResponse, next: NextFunction) => {
    (req as any).principal = {
      companyId,
      userId: 'staging-admin-001',
      name: 'Admin Demo Neon',
      role: 'ADMIN',
      permissions: ['*'],
    };
    next();
  });

  registerWhatsappRoutes(app);

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object', 'server address unavailable');
  const base = `http://127.0.0.1:${address.port}`;

  function extractRows(res: any): any[] {
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.rows)) return res.rows;
    return [];
  }

  try {
    // -------------------------------------------------------------
    // CENÁRIO 1: Template KM_REQUEST (Atualização de Quilometragem)
    // -------------------------------------------------------------
    console.log('\n[CENÁRIO 1] Testando disparo de KM_REQUEST para contrato da massa...');
    const kmRes = await fetch(`${base}/api/whatsapp/wa-link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ templateType: 'KM_REQUEST', entityId: contractId }),
    });
    assert.equal(kmRes.status, 200, `KM_REQUEST must return 200, got ${kmRes.status}`);
    const kmData = (await kmRes.json()) as any;
    assert.equal(kmData.phone, '5511999887766', 'Phone must be normalized to E.164 with 55 prefix');
    assert(kmData.whatsappUrl.startsWith('https://wa.me/5511999887766?text='), 'Must produce valid wa.me URL');
    assert(kmData.message.includes('DMO1A01'), 'Message must reference vehicle plate DMO1A01');
    assert(kmData.message.includes('Ana Souza Demo'), 'Message must reference driver name');
    console.log('✔ KM_REQUEST gerado com sucesso:');
    console.log('  Telefone:', kmData.phone);
    console.log('  Mensagem:', kmData.message);
    console.log('  Link:', kmData.whatsappUrl.slice(0, 80) + '...');

    // Verificar auditoria no Neon
    const kmAuditRes: any = await db.execute(sql`
      SELECT changes FROM audit_logs
      WHERE company_id = ${companyId}
        AND entity_type = 'WhatsappWaLink'
        AND changes LIKE '%templateType%KM_REQUEST%'
      ORDER BY timestamp DESC
      LIMIT 1
    `);
    assert(extractRows(kmAuditRes).length >= 1, 'Audit log must record WHATSAPP_WAME_LINK_GENERATED for KM_REQUEST');
    console.log('✔ Linha de auditoria gravada e comprovada no Neon para KM_REQUEST');

    // -------------------------------------------------------------
    // CENÁRIO 2: Template TRAFFIC_TICKET (Multa de Trânsito)
    // -------------------------------------------------------------
    console.log('\n[CENÁRIO 2] Testando disparo de TRAFFIC_TICKET para multa da massa...');
    const ticketRes = await fetch(`${base}/api/whatsapp/wa-link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ templateType: 'TRAFFIC_TICKET', entityId: ticketId }),
    });
    assert.equal(ticketRes.status, 200, `TRAFFIC_TICKET must return 200, got ${ticketRes.status}`);
    const ticketData = (await ticketRes.json()) as any;
    assert.equal(ticketData.phone, '5511999887766', 'Phone must be normalized to E.164 with 55 prefix');
    assert(ticketData.whatsappUrl.startsWith('https://wa.me/5511999887766?text='), 'Must produce valid wa.me URL');
    assert(ticketData.message.includes('AIT-DEMO-NGCOMPANY001'), 'Message must contain auto number');
    assert(ticketData.message.includes('DMO1A01'), 'Message must contain vehicle plate');
    assert(ticketData.message.includes('195,23'), 'Message must contain formatted amount');
    assert(ticketData.message.includes('2026-10-30'), 'Message must contain indication deadline');
    console.log('✔ TRAFFIC_TICKET gerado com sucesso:');
    console.log('  Telefone:', ticketData.phone);
    console.log('  Mensagem:', ticketData.message);
    console.log('  Link:', ticketData.whatsappUrl.slice(0, 80) + '...');

    // Verificar auditoria no Neon
    const ticketAuditRes: any = await db.execute(sql`
      SELECT changes FROM audit_logs
      WHERE company_id = ${companyId}
        AND entity_type = 'WhatsappWaLink'
        AND changes LIKE '%templateType%TRAFFIC_TICKET%'
      ORDER BY timestamp DESC
      LIMIT 1
    `);
    assert(extractRows(ticketAuditRes).length >= 1, 'Audit log must record WHATSAPP_WAME_LINK_GENERATED for TRAFFIC_TICKET');
    console.log('✔ Linha de auditoria gravada e comprovada no Neon para TRAFFIC_TICKET');

    // -------------------------------------------------------------
    // CENÁRIO 3: Template CNH_EXPIRY (Vencimento de CNH)
    // -------------------------------------------------------------
    console.log('\n[CENÁRIO 3] Testando disparo de CNH_EXPIRY para motorista da massa...');
    const cnhRes = await fetch(`${base}/api/whatsapp/wa-link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ templateType: 'CNH_EXPIRY', entityId: driverId }),
    });
    assert.equal(cnhRes.status, 200, `CNH_EXPIRY must return 200, got ${cnhRes.status}`);
    const cnhData = (await cnhRes.json()) as any;
    assert.equal(cnhData.phone, '5511999887766', 'Phone must be normalized to E.164 with 55 prefix');
    assert(cnhData.whatsappUrl.startsWith('https://wa.me/5511999887766?text='), 'Must produce valid wa.me URL');
    assert(cnhData.message.includes('Ana Souza Demo'), 'Message must contain driver name');
    assert(cnhData.message.includes('2028-12-31'), 'Message must contain CNH expiration date');
    console.log('✔ CNH_EXPIRY gerado com sucesso:');
    console.log('  Telefone:', cnhData.phone);
    console.log('  Mensagem:', cnhData.message);
    console.log('  Link:', cnhData.whatsappUrl.slice(0, 80) + '...');

    // Verificar auditoria no Neon
    const cnhAuditRes: any = await db.execute(sql`
      SELECT changes FROM audit_logs
      WHERE company_id = ${companyId}
        AND entity_type = 'WhatsappWaLink'
        AND changes LIKE '%templateType%CNH_EXPIRY%'
      ORDER BY timestamp DESC
      LIMIT 1
    `);
    assert(extractRows(cnhAuditRes).length >= 1, 'Audit log must record WHATSAPP_WAME_LINK_GENERATED for CNH_EXPIRY');
    console.log('✔ Linha de auditoria gravada e comprovada no Neon para CNH_EXPIRY');

    console.log('\n★ TODOS OS 3 CENÁRIOS REAIS DE WHATSAPP WA.ME (AUTOERP-55) FORAM VALIDADOS COM 100% DE SUCESSO NO NEON!');
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error('VERIFICAÇÃO REAL DO AUTOERP-55 FALHOU:', err);
  process.exit(1);
});
