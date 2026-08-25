import { sql } from 'drizzle-orm';
import { db } from '../../db';
import type { AuthenticatedPrincipal } from '../auth';
import {
  WhatsappObservabilityAuthority,
  WhatsappObservabilityForbiddenError,
  resolveWhatsappObservabilityWindowDays,
} from '../whatsappObservabilityAuthority';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function rows(result: any): any[] { return Array.isArray(result?.rows) ? result.rows : []; }

const companyA = 'whatsapp-1f-company-a';
const companyB = 'whatsapp-1f-company-b';
const adminA = 'whatsapp-1f-admin-a';
const viewerA = 'whatsapp-1f-viewer-a';
const outboxHeld = `wao_${'1'.repeat(32)}`;
const outboxCancelled = `wao_${'2'.repeat(32)}`;
const outboxOld = `wao_${'3'.repeat(32)}`;
const outboxB = `wao_${'4'.repeat(32)}`;
const principalViewer: AuthenticatedPrincipal = { companyId: companyA,userId: viewerA,name: 'WhatsApp 1F Viewer',role: 'READONLY',permissions: [] };

async function seed(): Promise<void> {
  await db.execute(sql`INSERT INTO companies(id,name,status,created_at,updated_at) VALUES
    (${companyA},'WhatsApp 1F A','ACTIVE',NOW(),NOW()),(${companyB},'WhatsApp 1F B','ACTIVE',NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO users(id,company_id,name,email,role,active,created_at,updated_at) VALUES
    (${adminA},${companyA},'WhatsApp 1F Admin A','whatsapp-1f-admin-a@example.test','ADMIN',true,NOW(),NOW()),
    (${viewerA},${companyA},'WhatsApp 1F Viewer A','whatsapp-1f-viewer-a@example.test','READONLY',true,NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO whatsapp_template_catalog(company_id,template_key,version,status,body_text,parameter_keys) VALUES
    (${companyA},'DRIVER_CNH_EXPIRY',1,'ACTIVE','Synthetic {{driverName}} {{cnhExpiration}}','["driverName","cnhExpiration"]'::jsonb),
    (${companyB},'DRIVER_CNH_EXPIRY',1,'ACTIVE','Synthetic {{driverName}} {{cnhExpiration}}','["driverName","cnhExpiration"]'::jsonb)
    ON CONFLICT(company_id,template_key,version) DO NOTHING`);
  await db.execute(sql`INSERT INTO whatsapp_outbox(id,company_id,driver_id,phone_e164,template_key,template_version,template_parameters,reference_type,reference_id,idempotency_key,status,requested_by,created_at,updated_at,cancelled_at) VALUES
    (${outboxHeld},${companyA},'driver-held','+5511999999911','DRIVER_CNH_EXPIRY',1,'{"driverName":"A","cnhExpiration":"2030-01-01"}'::jsonb,'DRIVER','driver-held',${'1'.repeat(64)},'HELD_PROVIDER_DISABLED',${adminA},'2026-08-25T10:00:00.000Z','2026-08-25T10:00:00.000Z',NULL),
    (${outboxCancelled},${companyA},'driver-cancelled','+5511999999922','DRIVER_CNH_EXPIRY',1,'{"driverName":"A","cnhExpiration":"2030-01-01"}'::jsonb,'DRIVER','driver-cancelled',${'2'.repeat(64)},'CANCELLED',${adminA},'2026-08-24T10:00:00.000Z','2026-08-24T10:00:00.000Z','2026-08-24T11:00:00.000Z'),
    (${outboxOld},${companyA},'driver-old','+5511999999933','DRIVER_CNH_EXPIRY',1,'{"driverName":"A","cnhExpiration":"2030-01-01"}'::jsonb,'DRIVER','driver-old',${'3'.repeat(64)},'HELD_PROVIDER_DISABLED',${adminA},'2026-06-01T10:00:00.000Z','2026-06-01T10:00:00.000Z',NULL),
    (${outboxB},${companyB},'driver-b','+5511999999944','DRIVER_CNH_EXPIRY',1,'{"driverName":"B","cnhExpiration":"2030-01-01"}'::jsonb,'DRIVER','driver-b',${'4'.repeat(64)},'HELD_PROVIDER_DISABLED','foreign','2026-08-25T10:00:00.000Z','2026-08-25T10:00:00.000Z',NULL)
    ON CONFLICT(company_id,idempotency_key) DO NOTHING`);
  await db.execute(sql`INSERT INTO whatsapp_webhook_events(id,company_id,provider_event_id,outbox_id,event_type,occurred_at,disposition,quarantine_reason,received_at) VALUES
    (${`whe_${'1'.repeat(32)}`},${companyA},'wa-1f-delivered',${outboxHeld},'DELIVERED','2026-08-25T10:05:00.000Z','QUARANTINED','OUTBOX_NOT_DISPATCHED','2026-08-25T10:05:00.000Z'),
    (${`whe_${'2'.repeat(32)}`},${companyA},'wa-1f-failed',${outboxCancelled},'FAILED','2026-08-24T11:00:00.000Z','QUARANTINED','OUTBOX_CANCELLED','2026-08-24T11:00:00.000Z'),
    (${`whe_${'3'.repeat(32)}`},${companyA},'wa-1f-reply-pending',${outboxHeld},'REPLY_RECEIVED','2026-08-25T10:10:00.000Z','QUARANTINED','OUTBOX_NOT_DISPATCHED','2026-08-25T10:10:00.000Z'),
    (${`whe_${'4'.repeat(32)}`},${companyA},'wa-1f-reply-rejected',${outboxCancelled},'REPLY_RECEIVED','2026-08-24T11:10:00.000Z','QUARANTINED','OUTBOX_CANCELLED','2026-08-24T11:10:00.000Z'),
    (${`whe_${'5'.repeat(32)}`},${companyB},'wa-1f-foreign',${outboxB},'DELIVERED','2026-08-25T10:05:00.000Z','QUARANTINED','OUTBOX_NOT_DISPATCHED','2026-08-25T10:05:00.000Z')
    ON CONFLICT(company_id,provider_event_id) DO NOTHING`);
  await db.execute(sql`INSERT INTO whatsapp_inbound_task_proposals(id,company_id,webhook_event_id,outbox_id,driver_id,reply_category,reply_digest,status,reviewed_by_user_id,reviewed_by_name,review_reason,reviewed_at,created_at,updated_at) VALUES
    (${`wrp_${'1'.repeat(32)}`},${companyA},${`whe_${'3'.repeat(32)}`},${outboxHeld},'driver-held','GENERAL',${'a'.repeat(64)},'PENDING',NULL,NULL,NULL,NULL,'2026-08-25T10:10:00.000Z','2026-08-25T10:10:00.000Z'),
    (${`wrp_${'2'.repeat(32)}`},${companyA},${`whe_${'4'.repeat(32)}`},${outboxCancelled},'driver-cancelled','DOCUMENT_QUESTION',${'b'.repeat(64)},'REJECTED',${adminA},'WhatsApp 1F Admin A','Sem ação necessária','2026-08-24T12:00:00.000Z','2026-08-24T11:10:00.000Z','2026-08-24T12:00:00.000Z')
    ON CONFLICT(company_id,webhook_event_id) DO NOTHING`);
}

async function main(): Promise<void> {
  await seed();
  assert(resolveWhatsappObservabilityWindowDays('7') === 7, 'valid observability window rejected');
  assert(resolveWhatsappObservabilityWindowDays('0') === 30, 'unsafe observability window was not defaulted');
  assert(resolveWhatsappObservabilityWindowDays('366') === 30, 'unbounded observability window was not defaulted');
  const before = rows(await db.execute(sql`SELECT
    (SELECT COUNT(*)::int FROM whatsapp_outbox WHERE company_id=${companyA}) AS outbox_count,
    (SELECT COUNT(*)::int FROM whatsapp_webhook_events WHERE company_id=${companyA}) AS webhook_count,
    (SELECT COUNT(*)::int FROM whatsapp_inbound_task_proposals WHERE company_id=${companyA}) AS proposal_count,
    (SELECT COUNT(*)::int FROM operational_tasks WHERE company_id=${companyA}) AS task_count`))[0];
  const summary = await WhatsappObservabilityAuthority.get(principalViewer,new Date('2026-08-25T11:00:00.000Z'),'30');
  assert(summary.windowDays === 30 && summary.windowStartAt === '2026-07-26T11:00:00.000Z', 'server window is incorrect');
  assert(summary.outbox.total === 2 && summary.outbox.heldProviderDisabled === 1 && summary.outbox.cancelled === 1, 'outbox aggregate is incorrect');
  assert(summary.webhookEvents.total === 4, 'webhook aggregate is incorrect');
  assert(summary.webhookEvents.delivered === 1 && summary.webhookEvents.failed === 1 && summary.webhookEvents.repliesReceived === 2, 'webhook event breakdown is incorrect');
  assert(summary.taskProposals.total === 2 && summary.taskProposals.pending === 1 && summary.taskProposals.rejected === 1, 'proposal aggregate is incorrect');
  assert(summary.taskProposals.oldestPendingCreatedAt === '2026-08-25T10:10:00.000Z', 'oldest pending timestamp is incorrect');
  assert(summary.providerEnabled === false && summary.automaticBusinessMutationApplied === false, 'safe observability flags are incorrect');
  let forbidden = false;
  try { await WhatsappObservabilityAuthority.get({companyId:companyA,userId:'intruder',name:'Intruder',role:'UNKNOWN',permissions:[]},new Date('2026-08-25T11:00:00.000Z'),'30'); }
  catch (error) { forbidden = error instanceof WhatsappObservabilityForbiddenError; }
  assert(forbidden, 'unauthorized principal accessed WhatsApp observability');
  const serialized = JSON.stringify(summary);
  for (const protectedValue of [companyA,'+5511999999911','reply_digest','phone_e164','provider_event_id','rawReply']) assert(!serialized.includes(protectedValue), `observability response leaked ${protectedValue}`);
  const after = rows(await db.execute(sql`SELECT
    (SELECT COUNT(*)::int FROM whatsapp_outbox WHERE company_id=${companyA}) AS outbox_count,
    (SELECT COUNT(*)::int FROM whatsapp_webhook_events WHERE company_id=${companyA}) AS webhook_count,
    (SELECT COUNT(*)::int FROM whatsapp_inbound_task_proposals WHERE company_id=${companyA}) AS proposal_count,
    (SELECT COUNT(*)::int FROM operational_tasks WHERE company_id=${companyA}) AS task_count`))[0];
  assert(JSON.stringify(before) === JSON.stringify(after), 'read-only observability mutated WhatsApp or operational data');
  console.log('WHATSAPP-1F read-only observability integration: PASS');
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
