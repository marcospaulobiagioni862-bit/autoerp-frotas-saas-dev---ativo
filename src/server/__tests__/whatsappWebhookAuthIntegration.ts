import { sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  WhatsappWebhookAuthenticationError,
  WhatsappWebhookAuthority,
  WhatsappWebhookReplayError,
  canonicalizeWhatsappWebhookBody,
  createWhatsappWebhookSignature,
} from '../whatsappWebhookAuth';
import {
  WhatsappWebhookConflictError,
  WhatsappWebhookEventAuthority,
  WhatsappWebhookNotFoundError,
  type IngestWhatsappWebhookEventInput,
} from '../whatsappWebhookAuthority';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function rows(result: any): any[] {
  return Array.isArray(result?.rows) ? result.rows : [];
}
async function rejectsAuthentication(callback: () => unknown | Promise<unknown>, message: string): Promise<void> {
  let rejected = false;
  try {
    await callback();
  } catch (error) {
    rejected = error instanceof WhatsappWebhookAuthenticationError;
  }
  assert(rejected, message);
}

const companyA = 'whatsapp-1d-company-a';
const companyB = 'whatsapp-1d-company-b';
const outboxA = `wao_${'a'.repeat(32)}`;
const outboxCancelledA = `wao_${'c'.repeat(32)}`;
const outboxB = `wao_${'b'.repeat(32)}`;
const secretA = 'synthetic-whatsapp-secret-a-at-least-32-characters';
const secretB = 'synthetic-whatsapp-secret-b-at-least-32-characters';
const config = JSON.stringify({ [companyA]: secretA, [companyB]: secretB });

async function seed(): Promise<void> {
  await db.execute(sql`
    INSERT INTO companies(id,name,status,created_at,updated_at)
    VALUES
      (${companyA},'WhatsApp 1D A','ACTIVE',NOW(),NOW()),
      (${companyB},'WhatsApp 1D B','ACTIVE',NOW(),NOW())
    ON CONFLICT(id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO whatsapp_template_catalog(
      company_id,template_key,version,status,body_text,parameter_keys
    ) VALUES
      (${companyA},'DRIVER_CNH_EXPIRY',1,'ACTIVE','Synthetic {{driverName}} {{cnhExpiration}}','["driverName","cnhExpiration"]'::jsonb),
      (${companyB},'DRIVER_CNH_EXPIRY',1,'ACTIVE','Synthetic {{driverName}} {{cnhExpiration}}','["driverName","cnhExpiration"]'::jsonb)
    ON CONFLICT(company_id,template_key,version) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO whatsapp_outbox(
      id,company_id,driver_id,phone_e164,template_key,template_version,template_parameters,
      reference_type,reference_id,idempotency_key,status,requested_by
    ) VALUES
      (${outboxA},${companyA},'driver-a','+5511999999999','DRIVER_CNH_EXPIRY',1,'{"driverName":"Synthetic A","cnhExpiration":"2030-01-01"}'::jsonb,'DRIVER','driver-a',${'1'.repeat(64)},'HELD_PROVIDER_DISABLED','test'),
      (${outboxCancelledA},${companyA},'driver-c','+5511977777777','DRIVER_CNH_EXPIRY',1,'{"driverName":"Synthetic C","cnhExpiration":"2030-01-01"}'::jsonb,'DRIVER','driver-c',${'3'.repeat(64)},'CANCELLED','test'),
      (${outboxB},${companyB},'driver-b','+5511988888888','DRIVER_CNH_EXPIRY',1,'{"driverName":"Synthetic B","cnhExpiration":"2030-01-01"}'::jsonb,'DRIVER','driver-b',${'2'.repeat(64)},'HELD_PROVIDER_DISABLED','test')
    ON CONFLICT(company_id,idempotency_key) DO NOTHING
  `);
}

async function main(): Promise<void> {
  await seed();
  const now = new Date('2026-08-25T07:45:00.000Z');
  const timestamp = now.toISOString();
  const nonce = 'nonce_whatsapp_1d_0001';
  const body: IngestWhatsappWebhookEventInput = {
    providerEventId: 'synthetic-provider-event-1',
    outboxId: outboxA,
    eventType: 'DELIVERED',
    occurredAt: '2026-08-25T07:44:00.000Z',
  };

  assert(canonicalizeWhatsappWebhookBody({ b: 2, a: 1 }) === '{"a":1,"b":2}', 'canonical body is not deterministic');
  const signature = createWhatsappWebhookSignature(secretA, companyA, timestamp, nonce, body);
  const verified = WhatsappWebhookAuthority.verify(
    { companyId: companyA, timestamp, nonce, signature },
    body,
    now,
    config,
  );
  assert(verified.companyId === companyA && verified.nonce === nonce, 'valid webhook was not verified');

  await rejectsAuthentication(
    () => WhatsappWebhookAuthority.verify({ companyId: companyA, timestamp, nonce, signature }, body, now, ''),
    'missing configuration did not fail closed',
  );
  await rejectsAuthentication(
    () => WhatsappWebhookAuthority.verify({ companyId: companyA, timestamp, nonce, signature }, body, now, '{'),
    'malformed configuration did not fail closed',
  );
  await rejectsAuthentication(
    () => WhatsappWebhookAuthority.verify(
      { companyId: companyA, timestamp, nonce, signature: `sha256=${'0'.repeat(64)}` },
      body,
      now,
      config,
    ),
    'invalid signature was accepted',
  );
  await rejectsAuthentication(
    () => WhatsappWebhookAuthority.verify(
      { companyId: companyA, timestamp, nonce, signature },
      { ...body, eventType: 'READ' },
      now,
      config,
    ),
    'altered body was accepted',
  );
  await rejectsAuthentication(
    () => WhatsappWebhookAuthority.verify(
      { companyId: companyA, timestamp: '2026-08-25T07:39:59.000Z', nonce, signature },
      body,
      now,
      config,
    ),
    'expired timestamp was accepted',
  );
  await rejectsAuthentication(
    () => WhatsappWebhookAuthority.verify(
      { companyId: companyA, timestamp: '2026-08-25T07:46:01.000Z', nonce, signature },
      body,
      now,
      config,
    ),
    'future timestamp was accepted',
  );

  await WhatsappWebhookAuthority.claimNonce(verified);
  let replayRejected = false;
  try {
    await WhatsappWebhookAuthority.claimNonce(verified);
  } catch (error) {
    replayRejected = error instanceof WhatsappWebhookReplayError;
  }
  assert(replayRejected, 'same-tenant nonce replay was accepted');
  await WhatsappWebhookAuthority.claimNonce({ companyId: companyB, nonce, signedAt: verified.signedAt });
  const nonceCounts = rows(await db.execute(sql`
    SELECT company_id,count(*)::int count
    FROM whatsapp_webhook_nonces
    WHERE nonce=${nonce}
    GROUP BY company_id
    ORDER BY company_id
  `));
  assert(nonceCounts.length === 2 && nonceCounts.every((row) => Number(row.count) === 1), 'nonce was not tenant isolated');

  const beforePayables = Number(rows(await db.execute(sql`SELECT count(*)::int count FROM account_payables WHERE company_id=${companyA}`))[0].count);
  const created = await WhatsappWebhookEventAuthority.ingest(companyA, body, now);
  const replay = await WhatsappWebhookEventAuthority.ingest(companyA, body, now);
  assert(created.created && !replay.created && created.item.id === replay.item.id, 'providerEventId was not idempotent');
  assert(created.item.disposition === 'QUARANTINED', 'held outbox event was not quarantined');
  assert(created.item.quarantineReason === 'OUTBOX_NOT_DISPATCHED', 'held outbox reason is unsafe');
  assert(created.item.providerCallApplied === false && created.item.businessMutationApplied === false, 'unsafe webhook effects reported');

  let collisionRejected = false;
  try {
    await WhatsappWebhookEventAuthority.ingest(companyA, { ...body, eventType: 'READ' }, now);
  } catch (error) {
    collisionRejected = error instanceof WhatsappWebhookConflictError;
  }
  assert(collisionRejected, 'divergent providerEventId collision was accepted');

  let foreignRejected = false;
  try {
    await WhatsappWebhookEventAuthority.ingest(companyA, {
      ...body,
      providerEventId: 'synthetic-provider-event-foreign',
      outboxId: outboxB,
    }, now);
  } catch (error) {
    foreignRejected = error instanceof WhatsappWebhookNotFoundError;
  }
  assert(foreignRejected, 'foreign-tenant outbox was accepted');

  const cancelled = await WhatsappWebhookEventAuthority.ingest(companyA, {
    providerEventId: 'synthetic-provider-event-cancelled',
    outboxId: outboxCancelledA,
    eventType: 'FAILED',
    occurredAt: body.occurredAt,
  }, now);
  assert(cancelled.item.quarantineReason === 'OUTBOX_CANCELLED', 'cancelled outbox event was not quarantined');

  const statuses = rows(await db.execute(sql`
    SELECT id,status FROM whatsapp_outbox
    WHERE company_id=${companyA} AND id IN (${outboxA},${outboxCancelledA})
    ORDER BY id
  `));
  assert(statuses.length === 2, 'synthetic outbox baseline missing');
  assert(statuses.some((row) => row.id === outboxA && row.status === 'HELD_PROVIDER_DISABLED'), 'webhook changed held outbox status');
  assert(statuses.some((row) => row.id === outboxCancelledA && row.status === 'CANCELLED'), 'webhook changed cancelled outbox status');
  const afterPayables = Number(rows(await db.execute(sql`SELECT count(*)::int count FROM account_payables WHERE company_id=${companyA}`))[0].count);
  assert(beforePayables === afterPayables, 'webhook created a financial payable');

  const sanitized = JSON.stringify(created.item);
  for (const protectedValue of [secretA, '+5511999999999', 'phone_e164', 'template_parameters', 'companyId']) {
    assert(!sanitized.includes(protectedValue), `webhook response leaked ${protectedValue}`);
  }
  console.log('WHATSAPP-1D authenticated synthetic webhook integration: PASS');
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
