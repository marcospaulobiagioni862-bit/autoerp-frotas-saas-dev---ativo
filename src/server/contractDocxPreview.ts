import type { ContractTemplateValues } from '../domain/contracts/contractTemplatePolicy';
import { UnitOfWork } from '../db/uow';
import { renderContractDocxFromAttachments } from './contractDocxRenderer';

export class ContractDocxPreviewNotFoundError extends Error {}
export class ContractDocxPreviewConflictError extends Error {}

export async function renderContractDocxPreview(
  companyId: string,
  templateId: string,
  values: ContractTemplateValues,
): Promise<Buffer> {
  const prepared = await UnitOfWork.run(companyId, async (tx) => {
    const template = await tx.getContractTemplateRepo().findByIdForCompany(companyId, templateId);
    if (!template || template.isArchived) {
      throw new ContractDocxPreviewNotFoundError('Contract template not found');
    }
    if (!template.isCurrent || template.contentMarkdown.trim()) {
      throw new ContractDocxPreviewConflictError('Contract template is not a current FILE source');
    }

    const attachments = await tx.getAttachmentRepo().findByEntity(companyId, 'ContractTemplate', template.id);
    return { template, attachments };
  });

  return renderContractDocxFromAttachments(companyId, prepared.attachments, values);
}
