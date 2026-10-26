import { eq } from 'drizzle-orm';
import { userCredentials, UserCredentialRow } from '../authSchema';
import { recordCredentialAuditEvent } from '../../server/credentialAudit';

export interface SetPasswordCredentialInput {
  companyId?: string;
  userId: string;
  passwordHash: string;
  auditActor?: {
    userId: string;
    userName: string;
    origin?: string;
    ipAddress?: string;
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
    const results = await this.tx
      .insert(userCredentials)
      .values({
        companyId: input.companyId || null,
        userId: input.userId,
        passwordHash: input.passwordHash,
        passwordUpdatedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: [userCredentials.userId],
        set: {
          companyId: input.companyId || null,
          passwordHash: input.passwordHash,
          passwordUpdatedAt: new Date().toISOString(),
        },
      })
      .returning();

    const credential = results[0];
    if (!credential) {
      throw new Error('AUTH_CREDENTIAL_WRITE_FAILED');
    }

    if (input.auditActor && input.companyId) {
      await recordCredentialAuditEvent(this.tx, {
        companyId: input.companyId,
        actorUserId: input.auditActor.userId,
        actorUserName: input.auditActor.userName,
        targetUserId: input.userId,
        action: 'UPDATE',
        event: 'PASSWORD_RESET_ADMIN',
        origin: input.auditActor.origin || 'AUTH_REPOSITORY',
        ipAddress: input.auditActor.ipAddress,
      });
    }

    return credential;
  }
}
