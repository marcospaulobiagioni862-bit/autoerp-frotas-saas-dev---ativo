import type { WhatsappTaskProposal } from '../../api/whatsappClient';

export const WHATSAPP_TASK_PROPOSAL_FILTERS = ['ALL', 'PENDING', 'COMPLETED'] as const;

export type WhatsappTaskProposalFilter = (typeof WHATSAPP_TASK_PROPOSAL_FILTERS)[number];

export type WhatsappTaskProposalCounts = Readonly<Record<WhatsappTaskProposalFilter, number>>;

export function createWhatsappTaskProposalCounts(
  proposals: ReadonlyArray<WhatsappTaskProposal>,
): WhatsappTaskProposalCounts {
  let pending = 0;
  let completed = 0;
  for (const proposal of proposals) {
    if (proposal.status === 'PENDING') pending += 1;
    else completed += 1;
  }
  return {
    ALL: proposals.length,
    PENDING: pending,
    COMPLETED: completed,
  };
}

export function filterWhatsappTaskProposals(
  proposals: ReadonlyArray<WhatsappTaskProposal>,
  filter: WhatsappTaskProposalFilter,
): WhatsappTaskProposal[] {
  const selected = filter === 'ALL'
    ? [...proposals]
    : proposals.filter((proposal) => filter === 'PENDING'
      ? proposal.status === 'PENDING'
      : proposal.status === 'APPROVED' || proposal.status === 'REJECTED');

  if (filter !== 'PENDING') return selected;

  return selected.sort((left, right) => {
    const leftTime = Date.parse(left.createdAt);
    const rightTime = Date.parse(right.createdAt);
    const safeLeft = Number.isFinite(leftTime) ? leftTime : 0;
    const safeRight = Number.isFinite(rightTime) ? rightTime : 0;
    return safeLeft - safeRight || left.id.localeCompare(right.id);
  });
}
