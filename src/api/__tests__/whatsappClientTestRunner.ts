import {
  WhatsappClient,
  parseWhatsappConsent,
  parseWhatsappOutboxItem,
  parseWhatsappTaskProposal,
  parseWhatsappObservabilitySummary,
  type WhatsappConsent,
  type WhatsappOutboxItem,
  type WhatsappTaskProposal,
  type WhatsappObservabilitySummary,
} from '../whatsappClient';
import {
  createWhatsappTaskProposalCounts,
  filterWhatsappTaskProposals,
  WHATSAPP_TASK_PROPOSAL_FILTERS,
} from '../../components/drivers/whatsappTaskProposalTriage';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const consent: WhatsappConsent = {
  driverId: 'driver-1',
  status: 'GRANTED',
  consentSource: 'ERP_MANUAL',
  phoneMasked: '+55•••••••4321',
  grantedAt: '2026-08-24T20:00:00.000Z',
  revokedAt: null,
  updatedAt: '2026-08-24T20:00:00.000Z',
};

const outbox: WhatsappOutboxItem = {
  id: 'wao_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  driverId: 'driver-1',
  templateKey: 'DRIVER_CNH_EXPIRY',
  templateParameters: {
    driverName: 'Motorista Sintético',
    cnhExpiration: '2035-01-15',
  },
  referenceType: 'DRIVER',
  referenceId: 'driver-1',
  status: 'HELD_PROVIDER_DISABLED',
  cancellationReason: null,
  createdAt: '2026-08-24T20:00:00.000Z',
  updatedAt: '2026-08-24T20:00:00.000Z',
  cancelledAt: null,
  providerCallApplied: false,
};

const proposal: WhatsappTaskProposal = {
  id: 'wrp_11111111111111111111111111111111',
  webhookEventId: 'wwe_11111111111111111111111111111111',
  outboxId: outbox.id,
  driverId: 'driver-1',
  replyCategory: 'PAYMENT_QUESTION',
  status: 'PENDING',
  taskId: null,
  reviewedAt: null,
  createdAt: '2026-08-25T10:00:00.000Z',
  rawReplyPersisted: false,
  businessMutationApplied: false,
};

const observability: WhatsappObservabilitySummary = {
  generatedAt: '2026-08-25T11:00:00.000Z',
  windowDays: 30,
  windowStartAt: '2026-07-26T11:00:00.000Z',
  outbox: { total: 3, heldProviderDisabled: 2, cancelled: 1 },
  webhookEvents: { total: 5, sent: 1, delivered: 1, read: 1, failed: 1, repliesReceived: 1 },
  taskProposals: { total: 2, pending: 1, approved: 1, rejected: 0, oldestPendingCreatedAt: '2026-08-24T11:00:00.000Z' },
  providerEnabled: false,
  automaticBusinessMutationApplied: false,
};

export class WhatsappClientTestRunner {
  static async runAllTests(): Promise<void> {
    assert(parseWhatsappConsent(consent).status === 'GRANTED', 'valid consent rejected');
    assert(parseWhatsappOutboxItem(outbox).providerCallApplied === false, 'held outbox rejected');
    assert(parseWhatsappTaskProposal(proposal).status === 'PENDING', 'valid sanitized task proposal rejected');
    assert(parseWhatsappObservabilitySummary(observability).windowDays === 30, 'valid observability summary rejected');

    assert(WHATSAPP_TASK_PROPOSAL_FILTERS.join(',') === 'ALL,PENDING,COMPLETED', 'proposal triage filter allowlist changed');
    const triageInput: WhatsappTaskProposal[] = [
      { ...proposal, id: 'wrp_33333333333333333333333333333333', createdAt: '2026-08-25T12:00:00.000Z' },
      { ...proposal, id: 'wrp_22222222222222222222222222222222', createdAt: '2026-08-25T09:00:00.000Z' },
      { ...proposal, id: 'wrp_44444444444444444444444444444444', status: 'APPROVED', taskId: 'task-4', reviewedAt: '2026-08-25T12:05:00.000Z' },
      { ...proposal, id: 'wrp_55555555555555555555555555555555', status: 'REJECTED', reviewedAt: '2026-08-25T12:06:00.000Z' },
    ];
    const triageOriginalOrder = triageInput.map((item) => item.id).join(',');
    const triageCounts = createWhatsappTaskProposalCounts(triageInput);
    assert(triageCounts.ALL === 4 && triageCounts.PENDING === 2 && triageCounts.COMPLETED === 2, 'proposal triage counts are inconsistent');
    assert(filterWhatsappTaskProposals(triageInput, 'ALL').length === 4, 'ALL proposal triage hid authorized proposals');
    assert(filterWhatsappTaskProposals(triageInput, 'COMPLETED').every((item) => item.status !== 'PENDING'), 'COMPLETED proposal triage leaked pending items');
    const pendingTriage = filterWhatsappTaskProposals(triageInput, 'PENDING');
    assert(pendingTriage.length === 2 && pendingTriage[0].id === 'wrp_22222222222222222222222222222222', 'PENDING proposal triage must show oldest pending first');
    assert(triageInput.map((item) => item.id).join(',') === triageOriginalOrder, 'proposal triage mutated authorized input');

    let rejected = false;
    try {
      parseWhatsappConsent({ ...consent, phoneE164: '+5511987654321' });
    } catch {
      rejected = true;
    }
    assert(rejected, 'raw phone authority leaked through client parser');

    rejected = false;
    try {
      parseWhatsappOutboxItem({ ...outbox, providerCallApplied: true });
    } catch {
      rejected = true;
    }
    assert(rejected, 'provider-applied item accepted while provider is disabled');

    rejected = false;
    try {
      parseWhatsappTaskProposal({ ...proposal, replyText: 'conteúdo proibido' });
    } catch {
      rejected = true;
    }
    assert(rejected, 'raw WhatsApp reply was accepted by client parser');

    rejected = false;
    try {
      parseWhatsappObservabilitySummary({ ...observability, tenantId: 'forbidden' });
    } catch {
      rejected = true;
    }
    assert(rejected, 'observability parser accepted tenant authority');

    const originalFetch = globalThis.fetch;
    const requests: Array<{ input: string; init?: RequestInit }> = [];
    try {
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({ input: String(input), init });
        if (String(input).startsWith('/api/whatsapp/observability?windowDays=')) {
          return new Response(JSON.stringify({ item: observability }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        if (String(input).includes('/task-proposals/') && init?.method === 'POST') {
          return new Response(JSON.stringify({ item: { ...proposal, status: 'APPROVED', taskId: 'task-1', reviewedAt: '2026-08-25T10:05:00.000Z' }, replay: false }), {
            status: 201,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (String(input).endsWith('/api/whatsapp/task-proposals')) {
          return new Response(JSON.stringify({ items: [proposal, { ...proposal, id: 'wrp_22222222222222222222222222222222', driverId: 'driver-2' }] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (String(input).includes('/consents/') && init?.method === 'PUT') {
          return new Response(JSON.stringify({ item: consent, changed: true, cancelledHeldItems: 0 }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (String(input).includes('/consents/')) {
          return new Response(JSON.stringify({ item: consent }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (init?.method === 'POST') {
          return new Response(JSON.stringify({ item: outbox, created: true }), {
            status: 201,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ items: [outbox, { ...outbox, id: 'wao_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', driverId: 'driver-2', referenceId: 'driver-2' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }) as typeof fetch;

      const loadedObservability = await WhatsappClient.getObservability(30);
      assert(loadedObservability.outbox.total === 3, 'observability summary not parsed');
      assert(requests[0].input === '/api/whatsapp/observability?windowDays=30' && requests[0].init?.method === undefined && requests[0].init?.credentials === 'include', 'observability request violated readonly session contract');

      const loaded = await WhatsappClient.getConsent('driver-1');
      assert(loaded?.driverId === 'driver-1', 'consent not parsed');

      await WhatsappClient.decideConsent('driver-1', 'GRANT');
      const consentRequest = requests[2];
      const consentBody = JSON.parse(String(consentRequest.init?.body));
      assert(Object.keys(consentBody).join(',') === 'decision', 'consent sent browser authority fields');
      assert(consentBody.decision === 'GRANT', 'consent decision missing');
      assert(consentRequest.init?.credentials === 'include', 'consent omitted session');

      await WhatsappClient.createCnhReminder('driver-1');
      const outboxRequest = requests[3];
      const outboxBody = JSON.parse(String(outboxRequest.init?.body));
      assert(Object.keys(outboxBody).join(',') === 'driverId,templateKey', 'outbox sent phone, tenant or content');
      assert(outboxBody.driverId === 'driver-1', 'driver identifier missing');
      assert(outboxBody.templateKey === 'DRIVER_CNH_EXPIRY', 'template allowlist changed');

      const listed = await WhatsappClient.listForDriver('driver-1');
      assert(listed.length === 1 && listed[0].driverId === 'driver-1', 'driver outbox filter failed');
      assert(requests[4].init?.credentials === 'include', 'outbox list omitted session');

      const proposals = await WhatsappClient.listTaskProposalsForDriver('driver-1');
      assert(proposals.length === 1 && proposals[0].driverId === 'driver-1', 'task proposal driver filter failed');
      assert(requests[5].init?.method === undefined && requests[5].init?.credentials === 'include', 'task proposal list is not authenticated GET');

      const reviewed = await WhatsappClient.reviewTaskProposal(proposal.id, 'APPROVE', '  Criar tarefa humana  ');
      assert(reviewed.item.status === 'APPROVED' && reviewed.item.taskId === 'task-1', 'task proposal review response rejected');
      const reviewRequest = requests[6];
      const reviewBody = JSON.parse(String(reviewRequest.init?.body));
      assert(Object.keys(reviewBody).join(',') === 'decision,reason', 'task proposal review sent browser authority fields');
      assert(reviewBody.decision === 'APPROVE' && reviewBody.reason === 'Criar tarefa humana', 'task proposal review payload was not normalized');
      assert(reviewRequest.init?.credentials === 'include', 'task proposal review omitted session');

      const beforeInvalidReview = requests.length;
      let invalidReviewRejected = false;
      try {
        await WhatsappClient.reviewTaskProposal(proposal.id, 'APPROVE', ' ');
      } catch {
        invalidReviewRejected = true;
      }
      assert(invalidReviewRejected && requests.length === beforeInvalidReview, 'empty review reason reached the server');
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
}

WhatsappClientTestRunner.runAllTests()
  .then(() => console.log('WhatsApp client authority and local proposal triage tests PASS'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
