import { randomUUID } from 'node:crypto';
import { auditLogs } from '../db/schema';

export interface CredentialAuditParams {
  companyId: string;
  actorUserId: string;
  actorUserName: string;
  targetUserId: string;
  action: 'CREATE' | 'UPDATE';
  event:
    | 'PASSWORD_CHANGE_SELF'
    | 'PASSWORD_RESET_ADMIN'
    | 'CREDENTIAL_CREATE_ADMIN'
    | 'BOOTSTRAP_FIRST_ADMIN_CREDENTIAL'
    | 'SEED_DEMO_CREDENTIAL';
  origin: string;
  ipAddress?: string | null;
  timestamp?: Date | string;
}

/**
 * Registra evento de ciclo de vida de credencial em audit_logs.
 * REGRA CRÍTICA DE SEGURANÇA (PH-079):
 * NUNCA registrar senhas em texto plano nem hashes nos logs de auditoria.
 * O registro é estritamente do EVENTO com metadados de autoria, origem e data.
 */
export async function recordCredentialAuditEvent(
  tx: any,
  params: CredentialAuditParams
): Promise<void> {
  const ts = params.timestamp
    ? (typeof params.timestamp === 'string' ? params.timestamp : params.timestamp.toISOString())
    : new Date().toISOString();

  // Defesa em profundidade: payload estrito somente com identificadores e metadados
  const newStatePayload = {
    event: params.event,
    targetUserId: params.targetUserId,
    actorUserId: params.actorUserId,
    actorUserName: params.actorUserName,
    origin: params.origin,
    recordedAt: ts,
    ...(params.event === 'PASSWORD_RESET_ADMIN' ? { resetByUserId: params.actorUserId } : {}),
    ...(params.event === 'CREDENTIAL_CREATE_ADMIN' ? { createdByUserId: params.actorUserId } : {}),
  };

  const serializedNewState = JSON.stringify(newStatePayload);

  // Verificação defensiva de segurança: impede que qualquer string parecida com hash ou senha passe
  if (
    serializedNewState.includes('$2a$') ||
    serializedNewState.includes('$2b$') ||
    serializedNewState.includes('$2y$') ||
    serializedNewState.toLowerCase().includes('passwordhash')
  ) {
    throw new Error('SECURITY_VIOLATION: Credential audit log payload contains sensitive hash or secret');
  }

  const changes = JSON.stringify({
    previousState: null,
    newState: serializedNewState,
    userName: params.actorUserName,
  });

  await tx.insert(auditLogs).values({
    id: randomUUID(),
    companyId: params.companyId,
    userId: params.actorUserId,
    action: params.action,
    entityType: 'UserCredential',
    entityId: params.targetUserId,
    changes,
    timestamp: ts,
    ipAddress: params.ipAddress || null,
  });
}
