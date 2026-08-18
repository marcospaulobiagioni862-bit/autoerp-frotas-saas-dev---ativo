import { and, eq } from 'drizzle-orm';
import { userCredentials, UserCredentialRow } from '../authSchema';

export interface SetPasswordCredentialInput {
  companyId: string;
  userId: string;
  passwordHash: string;
}

export class PostgresAuthCredentialRepository {
  constructor(private readonly tx: any) {
    if (!tx) {
      throw new Error('AUTH_CREDENTIAL_TRANSACTION_REQUIRED');
    }
  }

  async findByUserId(companyId: string, userId: string): Promise<UserCredentialRow | null> {
    const results = await this.tx
      .select()
      .from(userCredentials)
      .where(
        and(
          eq(userCredentials.companyId, companyId),
          eq(userCredentials.userId, userId)
        )
      )
      .limit(1);

    return results[0] || null;
  }

  async setPasswordHash(input: SetPasswordCredentialInput): Promise<UserCredentialRow> {
    const results = await this.tx
      .insert(userCredentials)
      .values({
        companyId: input.companyId,
        userId: input.userId,
        passwordHash: input.passwordHash,
        passwordUpdatedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: [userCredentials.companyId, userCredentials.userId],
        set: {
          passwordHash: input.passwordHash,
          passwordUpdatedAt: new Date().toISOString(),
        },
      })
      .returning();

    const credential = results[0];
    if (!credential) {
      throw new Error('AUTH_CREDENTIAL_WRITE_FAILED');
    }
    return credential;
  }
}
