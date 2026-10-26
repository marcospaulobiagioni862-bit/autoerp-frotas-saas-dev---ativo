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

export const HASH_SECRET_PATTERN = /scrypt\$[0-9]+\$|\$2[abxy]\$\d{2}\$|\$argon2|\$pbkdf2/i;

const CANONICAL_CREDENTIAL_EVENTS = new Set([
  'PASSWORD_CHANGE_SELF',
  'PASSWORD_RESET_ADMIN',
  'CREDENTIAL_CREATE_ADMIN',
  'BOOTSTRAP_FIRST_ADMIN_CREDENTIAL',
  'SEED_DEMO_CREDENTIAL',
]);

/**
 * Validação defensiva em profundidade contra vazamento de segredos em logs de auditoria.
 * REGRA CRÍTICA (PH-079):
 * O sistema usa scrypt (scrypt$1$16384$8$1$...). Hashes criptográficos e senhas
 * nunca podem figurar em nenhuma coluna ou campo de audit_logs.
 */
export function assertNoSecretsInAuditPayload(serialized: string): void {
  // 1. Rejeição de hashes conhecidos (scrypt nativo do AutoERP, bcrypt, argon2, pbkdf2)
  if (HASH_SECRET_PATTERN.test(serialized)) {
    throw new Error('SECURITY_VIOLATION: Credential audit log payload contains sensitive hash or secret');
  }

  // 2. Rejeição de scrypt genérico estruturado
  if (/scrypt/i.test(serialized) && serialized.includes('$')) {
    throw new Error('SECURITY_VIOLATION: Credential audit log payload contains sensitive hash or secret');
  }

  // 3. Rejeição de chaves ou referências a hash/senha que não sejam os nomes de evento canônicos
  const lower = serialized.toLowerCase();
  if (lower.includes('passwordhash') || lower.includes('derivedkey') || lower.includes('saltraw')) {
    throw new Error('SECURITY_VIOLATION: Credential audit log payload contains sensitive hash or secret');
  }
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
  if (!CANONICAL_CREDENTIAL_EVENTS.has(params.event)) {
    throw new Error(`INVALID_CREDENTIAL_EVENT: Unknown event ${params.event}`);
  }

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

  // Verificação defensiva de segurança contra hashes (scrypt/bcrypt/outros) e segredos
  assertNoSecretsInAuditPayload(serializedNewState);

  const changes = JSON.stringify({
    previousState: null,
    newState: serializedNewState,
    userName: params.actorUserName,
  });

  // Validação também sobre o objeto completo de changes antes de persistir
  assertNoSecretsInAuditPayload(changes);

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
