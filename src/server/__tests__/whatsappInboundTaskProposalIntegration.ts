import { sql } from 'drizzle-orm';
import { db } from '../../db';
import type { AuthenticatedPrincipal } from '../auth';
import {
  WhatsappInboundProposalConflictError,
  WhatsappInboundProposalForbiddenError,
  WhatsappInboundProposalValidationError,
  WhatsappInboundTaskProposalAuthority,
  validateWhatsappReplyText,
} from '../whatsappInboundTaskProposalAuthority';
import { WhatsappWebhookEventAuthority } from '../whatsappWebhookAuthority';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function rows(result: any): any[] {
  return Array.isArray(result?.rows) ? result.rows : [];
}

const companyA = 'whatsapp-1e-company-a';
const companyB = 'whatsapp-1e-company-b';
const adminA = 'whatsapp-1e-admin-a';
const viewerA = 'whatsapp-1e-viewer-a';
const adminB = 'whatsapp-1e-admin-b';
const outboxApprove = `wao_${'d'.repeat(32)}`;
const outboxReject = `wao_${'e'.repeat(32)}`;
const outboxB = `wao_${'f'.repeat(32)}`;
const principalA: AuthenticatedPrincipal = { companyId: companyA, userId: adminA, name: 'WhatsApp 1E Admin A', role: 'ADMIN', permissions: ['*'] };
const viewer: AuthenticatedPrincipal = { companyId: companyA, userId: viewerA, name: 'WhatsApp 1E Viewer', role: 'READONLY', permissions: [] };
const principalB: AuthenticatedPrincipal = { companyId: companyB, userId: adminB, name: 'WhatsApp 1E Admin B', role: 'ADMIN', permissions: ['*'] };

async function seed(): Promise<void> {
  await db.execute(sql`
    INSERT INTO companies(id,name,status,created_at,updated_at)
    VALUES
      (${companyA},'WhatsApp 1E A','ACTIVE',NOW(),NOW()),
      (${companyB},'WhatsApp 1E B','ACTIVE',NOW(),NOW())
    ON CONFLICT(id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO users(id,company_id,name,email,role,active,created_at,updated_at)
    VALUES
      (${adminA},${companyA},'WhatsApp 1E Admin A','whatsapp-1e-admin-a@example.test','ADMIN',true,NOW(),NOW()),
      (${viewerA},${companyA},'WhatsApp 1E Viewer','whatsapp-1e-viewer-a@example.test','READONLY',true,NOW(),NOW()),
      (${adminB},${companyB},'WhatsApp 1E Admin B','whatsapp-1e-admin-b@example.test','ADMIN',true,NOW(),NOW())
    ON CONFLICT(id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO whatsapp_template_catalog(company_id,template_key,version,status,body_text,parameter_keys)
    VALUES
      (${companyA},'DRIVER_CNH_EXPIRY',1,'ACTIVE','Synthetic {{driverName}} {{cnhExpiration}}','["driverName","cnhExpiration"]'::jsonb),
      (${companyB},'DRIVER_CNH_EXPIRY',1,'ACTIVE','Synthetic {{driverName}} {{cnhExpiration}}','["driverName","cnhExpiration"]'::jsonb)
    ON CONFLICT(company_id,template_key,version) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO whatsapp_outbox(
      id,company_id,driver_id,phone_e164,template_key,template_version,template_parameters,
      reference_type,reference_id,idempotency_key,status,requested_by
    ) VALUES
      (${outboxApprove},${companyA},'driver-approve','+5511999999911','DRIVER_CNH_EXPIRY',1,'{"driverName":"Synthetic","cnhExpiration":"2030-01-01"}'::jsonb,'DRIVER','driver-approve',${'4'.repeat(64)},'HELD_PROVIDER_DISABLED','test'),
      (${outboxReject},${companyA},'driver-reject','+5511999999922','DRIVER_CNH_EXPIRY',1,'{"driverName":"Synthetic","cnhExpiration":"2030-01-01"}'::jsonb,'DRIVER','driver-reject',${'5'.repeat(64)},'HELD_PROVIDER_DISABLED','test'),
      (${outboxB},${companyB},'driver-b','+5511999999933','DRIVER_CNH_EXPIRY',1,'{"driverName":"Synthetic","cnhExpiration":"2030-01-01"}'::jsonb,'DRIVER','driver-b',${'6'.repeat(64)},'HELD_PROVIDER_DISABLED','test')
    ON CONFLICT(company_id,idempotency_key) DO NOTHING
  `);
}

async function main(): Promise<void> {
  await seed();
  const now = new Date('2026-08-25T08:30:00.000Z');
  const rawReply = 'Preciso de ajuda com o pagamento do boleto';
  const classified = validateWhatsappReplyText(rawReply);
  assert(classified.category === 'PAYMENT_QUESTION' && classified.digest.length === 64, 'reply classification is not deterministic');
  for (const invalid of ['', ' '.repeat(3), 'x'.repeat(501), 'ok\u0000']) {
    let rejected = false;
    try { validateWhatsappReplyText(invalid); } catch (error) { rejected = error instanceof WhatsappInboundProposalValidationError; }
    assert(rejected, 'invalid reply text was accepted');
  }

  const before = {
    payables: Number(rows(await db.execute(sql`SELECT count(*)::int count FROM account_payables WHERE company_id=${companyA}`))[0].count),
    contracts: Number(rows(await db.execute(sql`SELECT count(*)::int count FROM contracts WHERE company_id=${companyA}`))[0].count),
  };
  const reply = await WhatsappWebhookEventAuthority.ingest(companyA, {
    providerEventId: 'synthetic-reply-approve',
    outboxId: outboxApprove,
    eventType: 'REPLY_RECEIVED',
    occurredAt: '2026-08-25T08:29:00.000Z',
    replyText: rawReply,
  }, now);
  assert(reply.created && reply.item.taskProposal?.status === 'PENDING', 'reply did not create a pending proposal');
  assert(reply.item.taskProposal?.replyCategory === 'PAYMENT_QUESTION', 'reply category was not exposed safely');
  const proposalId = reply.item.taskProposal?.id as string;

  const tenantA = await WhatsappInboundTaskProposalAuthority.list(principalA, 'PENDING');
  const tenantB = await WhatsappInboundTaskProposalAuthority.list(principalB, 'PENDING');
  assert(tenantA.some((item) => item.id === proposalId), 'tenant A cannot list its proposal');
  assert(!tenantB.some((item) => item.id === proposalId), 'proposal leaked to tenant B');

  let readonlyRejected = false;
  try { await WhatsappInboundTaskProposalAuthority.review(viewer, proposalId, 'APPROVE', 'Revisão autorizada'); }
  catch (error) { readonlyRejected = error instanceof WhatsappInboundProposalForbiddenError; }
  assert(readonlyRejected, 'READONLY approved a WhatsApp task proposal');

  const approved = await WhatsappInboundTaskProposalAuthority.review(principalA, proposalId, 'APPROVE', 'Criar tarefa para análise humana');
  const approvalReplay = await WhatsappInboundTaskProposalAuthority.review(principalA, proposalId, 'APPROVE', 'Repetição segura');
  assert(approved.item.status === 'APPROVED' && approved.item.taskId, 'approval did not create a task');
  assert(approvalReplay.replay && approvalReplay.item.taskId === approved.item.taskId, 'approval replay created another task');
  const tasks = rows(await db.execute(sql`
    SELECT id,company_id,source_type,source_id,entity_type,entity_id,status
    FROM operational_tasks
    WHERE company_id=${companyA} AND source_type='ALERT' AND source_id=${proposalId}
  `));
  assert(tasks.length === 1, 'approval did not create exactly one operational task');
  assert(tasks[0].entity_type === 'DRIVER' && tasks[0].entity_id === 'driver-approve' && tasks[0].status === 'OPEN', 'created task is not safely scoped');

  let oppositeRejected = false;
  try { await WhatsappInboundTaskProposalAuthority.review(principalA, proposalId, 'REJECT', 'Trocar decisão'); }
  catch (error) { oppositeRejected = error instanceof WhatsappInboundProposalConflictError; }
  assert(oppositeRejected, 'opposite decision replaced an approved proposal');

  const rejectedReply = await WhatsappWebhookEventAuthority.ingest(companyA, {
    providerEventId: 'synthetic-reply-reject',
    outboxId: outboxReject,
    eventType: 'REPLY_RECEIVED',
    occurredAt: '2026-08-25T08:29:30.000Z',
    replyText: 'Obrigado, não preciso de ajuda',
  }, now);
  const rejectedId = rejectedReply.item.taskProposal?.id as string;
  const rejected = await WhatsappInboundTaskProposalAuthority.review(principalA, rejectedId, 'REJECT', 'Nenhuma ação necessária');
  assert(rejected.item.status === 'REJECTED' && rejected.item.taskId === null, 'rejection created a task');
  const rejectedTasks = rows(await db.execute(sql`SELECT id FROM operational_tasks WHERE company_id=${companyA} AND source_id=${rejectedId}`));
  assert(rejectedTasks.length === 0, 'rejected proposal created an operational task');

  const stored = JSON.stringify(rows(await db.execute(sql`
    SELECT reply_category,reply_digest,status,review_reason FROM whatsapp_inbound_task_proposals WHERE company_id=${companyA}
  `)));
  assert(!stored.includes(rawReply), 'raw reply text was persisted');
  const sanitized = JSON.stringify([reply.item, approved.item, rejected.item]);
  for (const protectedValue of [rawReply, '+5511999999911', 'phone_e164', 'companyId', 'reply_digest']) {
    assert(!sanitized.includes(protectedValue), `proposal response leaked ${protectedValue}`);
  }
  const after = {
    payables: Number(rows(await db.execute(sql`SELECT count(*)::int count FROM account_payables WHERE company_id=${companyA}`))[0].count),
    contracts: Number(rows(await db.execute(sql`SELECT count(*)::int count FROM contracts WHERE company_id=${companyA}`))[0].count),
  };
  assert(JSON.stringify(before) === JSON.stringify(after), 'WhatsApp reply proposal mutated protected business data');
  console.log('WHATSAPP-1E inbound task proposal integration: PASS');
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
