import { randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { UnitOfWork } from '../db/uow';
import { AuditAction, ContractStatus } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';

const WRITE_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'OPERATIONAL']);

function principalFrom(req: Request): AuthenticatedPrincipal | undefined {
  return (req as Request & { principal?: AuthenticatedPrincipal }).principal;
}

function requirePrincipal(req: Request, res: Response): AuthenticatedPrincipal | null {
  const principal = principalFrom(req);
  if (!principal) {
    res.status(401).json({ error: 'Unauthorized: Authentication required' });
    return null;
  }
  const role = String(principal.role || '').toUpperCase();
  const permissions = Array.isArray(principal.permissions) ? principal.permissions : [];
  if (!principal.userId || !principal.companyId || (!permissions.includes('*') && !permissions.includes('EDIT_CONTRACT') && !WRITE_ROLES.has(role))) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return principal;
}

export function registerContractSimpleSignRoutes(app: Express): void {
  app.post('/api/contracts/:id/sign-status', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res);
    if (!principal) return;
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || typeof req.body.signed !== 'boolean' || Object.keys(req.body).some((key) => key !== 'signed')) {
      res.status(400).json({ error: 'Invalid contract sign status request' });
      return;
    }

    try {
      const result = await UnitOfWork.run(principal.companyId, async (tx) => {
        const contract = await tx.getContractRepo().findByIdForCompanyWithLock(principal.companyId, req.params.id);
        if (!contract || contract.isArchived) return { kind: 'NOT_FOUND' as const };
        if (![ContractStatus.DRAFT, ContractStatus.AWAITING_SIGNATURE].includes(contract.status)) {
          return { kind: 'CONFLICT' as const };
        }

        const generatedPdf = await tx.getContractArtifactRepo().findCurrentForContract(principal.companyId, contract.id, 'GENERATED_PDF', true);
        const generatedDocx = await tx.getContractArtifactRepo().findCurrentForContract(principal.companyId, contract.id, 'GENERATED_DOCX', true);
        const generated = generatedDocx || generatedPdf;
        const reviewed = await tx.getContractArtifactRepo().findCurrentForContract(principal.companyId, contract.id, 'REVIEWED_FINAL_PDF', true);
        const source = reviewed || generated;
        const currentSigned = await tx.getContractArtifactRepo().findCurrentForContract(principal.companyId, contract.id, 'SIGNED_EVIDENCE', true);
        const now = new Date().toISOString();

        if (req.body.signed) {
          if (!source) return { kind: 'NO_DOCUMENT' as const };
          if (currentSigned) return { kind: 'OK' as const, contract, artifact: currentSigned, signed: true, replayed: true };

          const artifact = await tx.getContractArtifactRepo().create({
            id: randomUUID(),
            companyId: principal.companyId,
            contractId: contract.id,
            artifactType: 'SIGNED_EVIDENCE',
            attachmentId: source.attachmentId,
            templateId: source.templateId,
            sourceArtifactId: source.id,
            snapshotJson: source.snapshotJson,
            snapshotHash: source.snapshotHash,
            signatureMethod: 'MANUAL_CONFIRMATION',
            signedByName: principal.name,
            signedAt: now,
            isCurrent: true,
            isArchived: false,
            createdBy: principal.userId,
            createdAt: now,
            updatedAt: now,
          });
          const saved = await tx.getContractRepo().updateForCompany(principal.companyId, contract.id, { updatedAt: now });
          if (!saved) return { kind: 'NOT_FOUND' as const };
          await tx.getAuditLogRepo().create({
            id: randomUUID(), companyId: principal.companyId, entityName: 'Contract', entityId: contract.id,
            action: AuditAction.UPDATE, userId: principal.userId, userName: principal.name,
            previousState: JSON.stringify({ signed: false }),
            newState: JSON.stringify({ event: 'MANUAL_SIGN_STATUS', signed: true, sourceArtifactId: source.id }),
            timestamp: now,
          });
          return { kind: 'OK' as const, contract: saved, artifact, signed: true, replayed: false };
        }

        if (!currentSigned) return { kind: 'OK' as const, contract, artifact: null, signed: false, replayed: true };
        const archived = await tx.getContractArtifactRepo().updateForCompany(principal.companyId, currentSigned.id, {
          isCurrent: false,
          isArchived: true,
          updatedAt: now,
        });
        if (!archived) return { kind: 'CONFLICT' as const };
        const saved = await tx.getContractRepo().updateForCompany(principal.companyId, contract.id, {
          signedContractUrl: '',
          updatedAt: now,
        });
        if (!saved) return { kind: 'NOT_FOUND' as const };
        await tx.getAuditLogRepo().create({
          id: randomUUID(), companyId: principal.companyId, entityName: 'Contract', entityId: contract.id,
          action: AuditAction.UPDATE, userId: principal.userId, userName: principal.name,
          previousState: JSON.stringify({ signed: true, artifactId: currentSigned.id }),
          newState: JSON.stringify({ event: 'MANUAL_SIGN_STATUS', signed: false }),
          timestamp: now,
        });
        return { kind: 'OK' as const, contract: saved, artifact: null, signed: false, replayed: false };
      });

      if (result.kind === 'NOT_FOUND') { res.status(404).json({ error: 'Not found' }); return; }
      if (result.kind === 'CONFLICT') { res.status(409).json({ error: 'Contract sign status conflict' }); return; }
      if (result.kind === 'NO_DOCUMENT') { res.status(409).json({ error: 'Generate the contract document before marking it as signed' }); return; }
      res.status(result.replayed ? 200 : 201).json(result);
    } catch (error) {
      console.error('AUTOERP_CONTRACT_SIMPLE_SIGN_FAILURE', error);
      res.status(500).json({ error: 'Contract sign status operation failed' });
    }
  });
}
