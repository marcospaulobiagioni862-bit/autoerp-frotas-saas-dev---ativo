import { eq } from 'drizzle-orm';
import { userCredentials, UserCredentialRow } from '../authSchema';
import { recordCredentialAuditEvent } from '../../server/credentialAudit';

export interface SetPasswordCredentialInput {
  companyId: string;
  userId: string;
  passwordHash: string;
  auditActor: {
    userId: string;
    userName: string;
    origin: string;
    event?: 'BOOTSTRAP_FIRST_ADMIN_CREDENTIAL' | 'PASSWORD_RESET_ADMIN' | 'PASSWORD_CHANGE_SELF' | 'SEED_DEMO_CREDENTIAL';
    ipAddress?: string | null;
  };
}

export class PostgresAuthCredentialRepository {
  constructor(private readonly tx: any) {
    if (!tx) {
      throw new Error('AUTH_CREDENTIAL_TRANSACTION_REQUIRED');
    }
  }

  async findByUserId(arg1: string, arg2?: string): Promise<UserCredentialRow | null> {
    const targetUserId = arg2 ? arg2 : arg1;
    const results = await this.tx
      .select()
      .from(userCredentials)
      .where(eq(userCredentials.userId, targetUserId))
      .limit(1);

    return results[0] || null;
  }

  async setPasswordHash(input: SetPasswordCredentialInput): Promise<UserCredentialRow> {
    if (!input.companyId || !input.auditActor || !input.auditActor.userId) {
      throw new Error('AUTH_CREDENTIAL_AUDIT_REQUIRED');
    }

    const now = new Date().toISOString();
    const results = await this.tx
      .insert(userCredentials)
      .values({
        companyId: input.companyId,
        userId: input.userId,
        passwordHash: input.passwordHash,
        passwordUpdatedAt: now,
      })
      .onConflictDoUpdate({
        target: [userCredentials.userId],
        set: {
          companyId: input.companyId,
          passwordHash: input.passwordHash,
          passwordUpdatedAt: now,
        },
      })
      .returning();

    const credential = results[0];
    if (!credential) {
      throw new Error('AUTH_CREDENTIAL_WRITE_FAILED');
    }

    await recordCredentialAuditEvent(this.tx, {
      companyId: input.companyId,
      actorUserId: input.auditActor.userId,
      actorUserName: input.auditActor.userName,
      targetUserId: input.userId,
      action: 'UPDATE',
      event: input.auditActor.event || 'PASSWORD_RESET_ADMIN',
      origin: input.auditActor.origin || 'AUTH_REPOSITORY',
      ipAddress: input.auditActor.ipAddress,
      timestamp: now,
    });

    return credential;
  }
}
