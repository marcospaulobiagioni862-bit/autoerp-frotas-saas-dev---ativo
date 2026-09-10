import type { Express, NextFunction, Request, Response } from 'express';
import { UnitOfWork } from '../db/uow';
import { MOVEFLEX_APPROVED_CONTRACT_MASTERS } from '../domain/contracts/moveflexApprovedContractMaster';
import type { AuthenticatedPrincipal } from './auth';
import { registerContractExecutionRoutes as registerLegacyContractExecutionRoutes } from './contractExecutionLegacyRoutes';

const STANDARD_TEMPLATE_KEYS = new Set<string>(
  MOVEFLEX_APPROVED_CONTRACT_MASTERS.map((item) => item.templateKey)
);

function principalFrom(req: Request): AuthenticatedPrincipal | undefined {
  return (req as Request & { principal?: AuthenticatedPrincipal }).principal;
}

function structuredExecutionResponse(res: Response): void {
  const originalJson = res.json.bind(res);
  res.json = ((payload: unknown) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return originalJson(payload);
    }

    const body = payload as Record<string, unknown>;
    const message = typeof body.error === 'string' ? body.error : '';

    if (res.statusCode === 422 && Array.isArray(body.missingFields)) {
      return originalJson({
        ...body,
        code: 'MISSING_REQUIRED_DATA',
      });
    }

    if (res.statusCode === 400 && message === 'Invalid contract execution request') {
      return originalJson({
        error: 'Os dados ou o artefato do contrato não são elegíveis para esta operação.',
        code: 'CONTRACT_INELIGIBLE',
      });
    }

    if (res.statusCode === 404 && message === 'Not found') {
      return originalJson({
        error: 'Contrato, modelo vinculado ou recurso necessário não foi encontrado.',
        code: 'TEMPLATE_NOT_FOUND',
      });
    }

    if (res.statusCode === 409 && message === 'Contract execution conflict') {
      return originalJson({
        error: 'O contrato ou o modelo vinculado não está elegível para geração neste estado.',
        code: 'CONTRACT_INELIGIBLE',
      });
    }

    if (res.statusCode === 503 && message === 'Attachment storage unavailable') {
      return originalJson({
        error: 'O armazenamento de documentos está temporariamente indisponível.',
        code: 'DOCUMENT_STORAGE_UNAVAILABLE',
      });
    }

    return originalJson(payload);
  }) as Response['json'];
}

async function enforcePersistedTemplateAuthority(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (req.method !== 'POST') {
    next();
    return;
  }

  structuredExecutionResponse(res);

  const principal = principalFrom(req);
  if (!principal) {
    next();
    return;
  }

  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? req.body as Record<string, unknown>
    : {};
  const unexpectedFields = Object.keys(body).filter((key) => key !== 'templateId');
  if (unexpectedFields.length) {
    res.status(400).json({
      error: 'A geração do contrato não aceita campos além do templateId legado.',
      code: 'INVALID_EXECUTION_REQUEST',
    });
    return;
  }

  try {
    const authority = await UnitOfWork.run(principal.companyId, async (tx) => {
      const contract = await tx.getContractRepo().findByIdForCompany(principal.companyId, req.params.id);
      if (!contract || contract.isArchived) {
        return { kind: 'CONTRACT_NOT_FOUND' as const };
      }
      if (!contract.templateId) {
        return { kind: 'TEMPLATE_NOT_LINKED' as const };
      }

      const template = await tx.getContractTemplateRepo().findByIdForCompany(
        principal.companyId,
        contract.templateId
      );
      if (!template || template.isArchived) {
        return { kind: 'TEMPLATE_NOT_FOUND' as const };
      }
      if (!template.isCurrent || !template.isActive || !STANDARD_TEMPLATE_KEYS.has(template.templateKey)) {
        return { kind: 'TEMPLATE_INELIGIBLE' as const };
      }

      return {
        kind: 'OK' as const,
        templateId: template.id,
      };
    });

    if (authority.kind === 'CONTRACT_NOT_FOUND') {
      res.status(404).json({
        error: 'Contrato não encontrado.',
        code: 'CONTRACT_NOT_FOUND',
      });
      return;
    }
    if (authority.kind === 'TEMPLATE_NOT_LINKED') {
      res.status(409).json({
        error: 'O contrato não possui um dos modelos padrão vinculado.',
        code: 'TEMPLATE_NOT_FOUND',
      });
      return;
    }
    if (authority.kind === 'TEMPLATE_NOT_FOUND') {
      res.status(404).json({
        error: 'O modelo vinculado ao contrato não foi encontrado.',
        code: 'TEMPLATE_NOT_FOUND',
      });
      return;
    }
    if (authority.kind === 'TEMPLATE_INELIGIBLE') {
      res.status(409).json({
        error: 'O modelo vinculado ao contrato não é um dos dois modelos padrão ativos.',
        code: 'CONTRACT_INELIGIBLE',
      });
      return;
    }

    // Browser-supplied templateId is intentionally ignored. The persisted
    // contract.templateId is the single source of authority for generation.
    req.body = { templateId: authority.templateId };
    next();
  } catch (error) {
    console.error('AUTOERP_CONTRACT_TEMPLATE_AUTHORITY_FAILURE', {
      name: error instanceof Error ? error.name : 'UnknownError',
      message: error instanceof Error ? error.message : 'Unknown contract template authority failure',
    });
    res.status(500).json({
      error: 'Não foi possível validar o modelo vinculado ao contrato.',
      code: 'CONTRACT_AUTHORITY_FAILURE',
    });
  }
}

export function registerContractExecutionRoutes(app: Express): void {
  app.use('/api/contracts/:id/generate-pdf', enforcePersistedTemplateAuthority);
  app.use('/api/contracts/:id/generate-docx', enforcePersistedTemplateAuthority);
  registerLegacyContractExecutionRoutes(app);
}
