import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { users } from '../db/schema';
import { userCompanyMemberships, userCredentials } from '../db/authSchema';
import { AuditAction } from '../types/enums';
import { getDefaultPermissionsForRole } from './rolePresets';
import { hashPassword } from './password';

export interface AdminUserActor {
  companyId: string;
  userId: string;
  name: string;
  role: string;
  permissions?: string[];
}

export interface AdminUserRecord {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

export class AdminUserForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminUserForbiddenError';
  }
}
export class AdminUserNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminUserNotFoundError';
  }
}
export class AdminUserConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminUserConflictError';
  }
}

function assertCanManageUsers(actor: AdminUserActor): void {
  const role = String(actor.role || '').toUpperCase();
  const permissions = Array.isArray(actor.permissions) ? actor.permissions : [];
  if (role === 'ADMIN' || permissions.includes('*') || permissions.includes('MANAGE_USERS')) {
    return;
  }
  throw new AdminUserForbiddenError('Acesso negado: administração de usuários requer ADMIN ou permissão MANAGE_USERS');
}

function assertCanGrantPrivilege(actor: AdminUserActor): void {
  const role = String(actor.role || '').toUpperCase();
  const permissions = Array.isArray(actor.permissions) ? actor.permissions : [];
  if (String(actor.role || '').toUpperCase() !== 'ADMIN' && !permissions.includes('*')) {
    throw new AdminUserForbiddenError('Acesso negado: concessão de privilégios requer perfil de administrador');
  }
}

function sanitizeUser(row: any): AdminUserRecord {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    active: Boolean(row.active),
    permissions: Array.isArray(row.permissions) ? [...row.permissions] : [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function auditStatusChange(
  txContext: any,
  actor: AdminUserActor,
  target: any,
  active: boolean,
  updatedAt: string
): Promise<void> {
  await txContext.getAuditLogRepo().create({
    id: randomUUID(),
    companyId: actor.companyId,
    entityName: 'User',
    entityId: target.id,
    action: AuditAction.UPDATE,
    previousState: JSON.stringify({ active: Boolean(target.active) }),
    newState: JSON.stringify({ active, updatedAt }),
    userId: actor.userId,
    userName: actor.name,
    timestamp: updatedAt,
  });
}

async function hasMembershipsTable(tx: any): Promise<boolean> {
  try {
    const res: any = await tx.execute(sql`SELECT to_regclass('user_company_memberships') AS reg`);
    return Boolean(res.rows?.[0]?.reg || res[0]?.reg);
  } catch {
    return false;
  }
}

async function hasCredentialsTable(tx: any): Promise<boolean> {
  try {
    const res: any = await tx.execute(sql`SELECT to_regclass('user_credentials') AS reg`);
    return Boolean(res.rows?.[0]?.reg || res[0]?.reg);
  } catch {
    return false;
  }
}

async function hasColumn(tx: any, table: string, col: string): Promise<boolean> {
  try {
    const res: any = await tx.execute(
      sql`SELECT 1 FROM information_schema.columns WHERE table_name = ${table} AND column_name = ${col}`
    );
    return Boolean(res.rows?.length || res?.length);
  } catch {
    return false;
  }
}

export class AdminUserAuthority {
  static async list(actor: AdminUserActor): Promise<AdminUserRecord[]> {
    assertCanManageUsers(actor);
    return await UnitOfWork.run(actor.companyId, async (txContext: any) => {
      const tx = txContext.getRawTransaction();
      const hasTable = await hasMembershipsTable(tx);
      if (hasTable) {
        const rows = await tx
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            role: userCompanyMemberships.role,
            active: userCompanyMemberships.active,
            permissions: userCompanyMemberships.permissions,
            createdAt: userCompanyMemberships.createdAt,
            updatedAt: userCompanyMemberships.updatedAt,
          })
          .from(userCompanyMemberships)
          .innerJoin(users, eq(userCompanyMemberships.userId, users.id))
          .where(eq(userCompanyMemberships.companyId, actor.companyId));

        if (rows.length > 0) {
          return rows.map(sanitizeUser).sort((a: AdminUserRecord, b: AdminUserRecord) =>
            a.name.localeCompare(b.name, 'pt-BR') || a.id.localeCompare(b.id)
          );
        }
      }

      const fallbackRows = await tx
        .select()
        .from(users)
        .where(eq(users.companyId, actor.companyId));

      return fallbackRows.map(sanitizeUser).sort((a: AdminUserRecord, b: AdminUserRecord) =>
        a.name.localeCompare(b.name, 'pt-BR') || a.id.localeCompare(b.id)
      );
    });
  }

  static async setActive(
    actor: AdminUserActor,
    targetUserId: string,
    active: boolean
  ): Promise<AdminUserRecord> {
    assertCanManageUsers(actor);
    if (!targetUserId || targetUserId.trim() === '') throw new AdminUserNotFoundError('Usuário não encontrado');

    return await UnitOfWork.run(actor.companyId, async (txContext: any) => {
      const tx = txContext.getRawTransaction();

      // Serialize administrative status changes for the tenant so two concurrent
      // deactivations cannot independently observe the same "last admin" count.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(abs(hashtext(${`${actor.companyId}:admin-user-status`})))`
      );

      const hasTable = await hasMembershipsTable(tx);
      let target: any = null;

      if (hasTable) {
        const memberRows = await tx
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            role: userCompanyMemberships.role,
            active: userCompanyMemberships.active,
            permissions: userCompanyMemberships.permissions,
            createdAt: userCompanyMemberships.createdAt,
            updatedAt: userCompanyMemberships.updatedAt,
          })
          .from(userCompanyMemberships)
          .innerJoin(users, eq(userCompanyMemberships.userId, users.id))
          .where(
            and(
              eq(userCompanyMemberships.companyId, actor.companyId),
              eq(userCompanyMemberships.userId, targetUserId)
            )
          )
          .for('update')
          .limit(1);
        target = memberRows[0];
      }

      if (!target) {
        const legacyRows = await tx
          .select()
          .from(users)
          .where(and(eq(users.companyId, actor.companyId), eq(users.id, targetUserId)))
          .for('update')
          .limit(1);
        target = legacyRows[0];
      }

      if (!target) throw new AdminUserNotFoundError('Usuário não encontrado');

      if (!active && target.id === actor.userId) {
        throw new AdminUserConflictError('Administrador não pode desativar a própria conta autenticada');
      }

      if (!active && Boolean(target.active) && String(target.role || '').toUpperCase() === 'ADMIN') {
        let activeAdminCount = 0;
        if (hasTable) {
          const activeMembers = await tx
            .select({ id: userCompanyMemberships.userId })
            .from(userCompanyMemberships)
            .where(
              and(
                eq(userCompanyMemberships.companyId, actor.companyId),
                eq(userCompanyMemberships.active, true),
                sql`upper(${userCompanyMemberships.role}) = 'ADMIN'`
              )
            )
            .for('update');
          activeAdminCount = activeMembers.length;
        }

        if (activeAdminCount === 0) {
          const activeUsers = await tx
            .select({ id: users.id })
            .from(users)
            .where(
              and(
                eq(users.companyId, actor.companyId),
                eq(users.active, true),
                sql`upper(${users.role}) = 'ADMIN'`
              )
            )
            .for('update');
          activeAdminCount = activeUsers.length;
        }

        if (activeAdminCount <= 1) {
          throw new AdminUserConflictError('Não é possível desativar o último administrador ativo');
        }
      }

      if (Boolean(target.active) === active) return sanitizeUser(target);

      const updatedAt = new Date().toISOString();

      if (hasTable) {
        await tx
          .update(userCompanyMemberships)
          .set({ active, updatedAt })
          .where(
            and(
              eq(userCompanyMemberships.companyId, actor.companyId),
              eq(userCompanyMemberships.userId, target.id)
            )
          );
      }

      await tx
        .update(users)
        .set({ active, updatedAt })
        .where(and(eq(users.companyId, actor.companyId), eq(users.id, target.id)));

      await auditStatusChange(txContext, actor, target, active, updatedAt);
      return sanitizeUser({
        ...target,
        active,
        updatedAt,
      });
    });
  }

  static async setPermissions(
    actor: AdminUserActor,
    targetUserId: string,
    newRole: string,
    newPermissions: string[]
  ): Promise<AdminUserRecord> {
    assertCanGrantPrivilege(actor);
    if (!targetUserId || targetUserId.trim() === '') throw new AdminUserNotFoundError('Usuário não encontrado');
    if (actor.userId === targetUserId) {
      throw new AdminUserForbiddenError('Não é permitido alterar o próprio papel ou privilégios de administrador');
    }
    const roleClean = newRole.trim().toUpperCase();
    if (!roleClean) throw new AdminUserConflictError('Papel do usuário é obrigatório');

    return await UnitOfWork.run(actor.companyId, async (txContext: any) => {
      const tx = txContext.getRawTransaction();

      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(abs(hashtext(${`${actor.companyId}:admin-user-status`})))`
      );

      const hasTable = await hasMembershipsTable(tx);
      let target: any = null;

      if (hasTable) {
        const memberRows = await tx
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            role: userCompanyMemberships.role,
            active: userCompanyMemberships.active,
            permissions: userCompanyMemberships.permissions,
            createdAt: userCompanyMemberships.createdAt,
            updatedAt: userCompanyMemberships.updatedAt,
          })
          .from(userCompanyMemberships)
          .innerJoin(users, eq(userCompanyMemberships.userId, users.id))
          .where(
            and(
              eq(userCompanyMemberships.companyId, actor.companyId),
              eq(userCompanyMemberships.userId, targetUserId)
            )
          )
          .for('update')
          .limit(1);
        target = memberRows[0];
      }

      if (!target) {
        const legacyRows = await tx
          .select()
          .from(users)
          .where(and(eq(users.companyId, actor.companyId), eq(users.id, targetUserId)))
          .for('update')
          .limit(1);
        target = legacyRows[0];
      }

      if (!target) throw new AdminUserNotFoundError('Usuário não encontrado');

      // Proteção: não rebaixar o último administrador ativo
      if (String(target.role || '').toUpperCase() === 'ADMIN' && roleClean !== 'ADMIN') {
        let activeAdminCount = 0;
        if (hasTable) {
          const activeMembers = await tx
            .select({ id: userCompanyMemberships.userId })
            .from(userCompanyMemberships)
            .where(
              and(
                eq(userCompanyMemberships.companyId, actor.companyId),
                eq(userCompanyMemberships.active, true),
                sql`upper(${userCompanyMemberships.role}) = 'ADMIN'`
              )
            )
            .for('update');
          activeAdminCount = activeMembers.length;
        }

        if (activeAdminCount === 0) {
          const activeUsers = await tx
            .select({ id: users.id })
            .from(users)
            .where(
              and(
                eq(users.companyId, actor.companyId),
                eq(users.active, true),
                sql`upper(${users.role}) = 'ADMIN'`
              )
            )
            .for('update');
          activeAdminCount = activeUsers.length;
        }

        if (activeAdminCount <= 1) {
          throw new AdminUserConflictError('Não é possível remover o perfil de administrador do último administrador ativo');
        }
      }

      const cleanPermissions = Array.from(new Set(newPermissions.map((p) => p.trim()).filter(Boolean)));
      const updatedAt = new Date().toISOString();

      if (hasTable) {
        await tx
          .update(userCompanyMemberships)
          .set({
            role: roleClean,
            permissions: cleanPermissions,
            updatedAt,
          })
          .where(
            and(
              eq(userCompanyMemberships.companyId, actor.companyId),
              eq(userCompanyMemberships.userId, target.id)
            )
          );
      }

      await tx
        .update(users)
        .set({
          role: roleClean,
          permissions: cleanPermissions,
          updatedAt,
        })
        .where(and(eq(users.companyId, actor.companyId), eq(users.id, target.id)));

      await txContext.getAuditLogRepo().create({
        id: randomUUID(),
        companyId: actor.companyId,
        entityName: 'User',
        entityId: target.id,
        action: AuditAction.UPDATE,
        previousState: JSON.stringify({ role: target.role, permissions: target.permissions }),
        newState: JSON.stringify({ role: roleClean, permissions: cleanPermissions, updatedAt }),
        userId: actor.userId,
        userName: actor.name,
        timestamp: updatedAt,
      });

      return sanitizeUser({
        ...target,
        role: roleClean,
        permissions: cleanPermissions,
        updatedAt,
      });
    });
  }

  static async provisionUser(
    actor: AdminUserActor,
    input: { id?: string; name: string; email: string; role: string; permissions?: string[]; companyId?: string; password?: string }
  ): Promise<AdminUserRecord> {
    assertCanManageUsers(actor);
    // Guarda de seguranca multi-tenant estrita (AUTOERP-82):
    // Um ADMIN da empresa A NAO pode criar ou alterar vinculo de ninguem na empresa B.
    if (input.companyId && input.companyId.trim() !== '' && input.companyId.trim() !== actor.companyId) {
      throw new AdminUserForbiddenError('Acesso negado: não é permitido gerenciar usuários de outra empresa');
    }

    let passwordHash: string | null = null;
    if (typeof input.password === 'string' && input.password.trim() !== '') {
      const cleanPassword = input.password.trim();
      if (cleanPassword.length < 12) {
        throw new AdminUserConflictError('A senha provisória deve conter no mínimo 12 caracteres');
      }
      passwordHash = await hashPassword(cleanPassword);
    }

    const roleClean = input.role.trim().toUpperCase();
    if (!roleClean) throw new AdminUserConflictError('Papel do usuário é obrigatório');
    const assignedPermissions = (Array.isArray(input.permissions) && input.permissions.length > 0)
      ? Array.from(new Set(input.permissions.map((p) => p.trim()).filter(Boolean)))
      : getDefaultPermissionsForRole(roleClean);

    // Guarda de privilégios estrita (Regra 3.2-a do CLAUDE.md):
    // Somente administradores autênticos ou portadores de '*' podem provisionar outro ADMIN
    // ou conceder privilégio irrestrito '*'
    if (roleClean === 'ADMIN' || assignedPermissions.includes('*')) {
      assertCanGrantPrivilege(actor);
    }

    // Operadores sem perfil ADMIN só podem criar usuários até o teto do preset do papel correspondente
    const actorRole = String(actor.role || '').toUpperCase();
    const actorPermissions = Array.isArray(actor.permissions) ? actor.permissions : [];
    const isFullAdmin = actorRole === 'ADMIN' || actorPermissions.includes('*');
    if (!isFullAdmin) {
      const allowedPreset = getDefaultPermissionsForRole(roleClean);
      const hasExcessivePermission = assignedPermissions.some((p) => !allowedPreset.includes(p));
      if (hasExcessivePermission) {
        throw new AdminUserForbiddenError(
          'Acesso negado: operadores sem perfil de administrador só podem atribuir permissões até o limite do perfil padrão'
        );
      }
    }

    return await UnitOfWork.run(actor.companyId, async (txContext: any) => {
      const tx = txContext.getRawTransaction();
      const now = new Date().toISOString();
      const cleanEmail = input.email.trim().toLowerCase();

      // 1. Localiza ou cria a identidade do usuário em users
      const existingUserRows = await tx
        .select()
        .from(users)
        .where(sql`lower(${users.email}) = ${cleanEmail}`)
        .limit(1);

      let userRecord: any = existingUserRows[0];
      if (!userRecord) {
        const userId = input.id || randomUUID();
        const inserted = await tx
          .insert(users)
          .values({
            id: userId,
            companyId: actor.companyId,
            name: input.name.trim(),
            email: cleanEmail,
            role: roleClean,
            active: true,
            permissions: assignedPermissions,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        userRecord = inserted[0];
      } else if (input.name && input.name.trim()) {
        await tx
          .update(users)
          .set({ name: input.name.trim(), updatedAt: now })
          .where(eq(users.id, userRecord.id));
      }

      // 2. Insere ou atualiza o vinculo multi-tenant em user_company_memberships
      const hasTable = await hasMembershipsTable(tx);
      if (hasTable) {
        await tx
          .insert(userCompanyMemberships)
          .values({
            userId: userRecord.id,
            companyId: actor.companyId,
            role: roleClean,
            permissions: assignedPermissions,
            active: true,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
            set: {
              role: roleClean,
              permissions: assignedPermissions,
              active: true,
              updatedAt: now,
            },
          });
      }

      // 3. Insere credencial inicial se senha foi informada e o usuario ainda nao tem credencial
      if (passwordHash) {
        const hasCreds = await hasCredentialsTable(tx);
        if (hasCreds) {
          const credRows = await tx
            .select({ userId: userCredentials.userId })
            .from(userCredentials)
            .where(eq(userCredentials.userId, userRecord.id))
            .limit(1);
          if (credRows.length === 0) {
            await tx.insert(userCredentials).values({
              userId: userRecord.id,
              companyId: actor.companyId,
              passwordHash,
              passwordUpdatedAt: now,
            });
          }
        }
      }

      await txContext.getAuditLogRepo().create({
        id: randomUUID(),
        companyId: actor.companyId,
        entityName: 'User',
        entityId: userRecord.id,
        action: AuditAction.CREATE,
        previousState: null,
        newState: JSON.stringify({ name: input.name, email: input.email, role: roleClean, permissions: assignedPermissions }),
        userId: actor.userId,
        userName: actor.name,
        timestamp: now,
      });

      return sanitizeUser({
        ...userRecord,
        role: roleClean,
        permissions: assignedPermissions,
      });
    });
  }

  static async updateUser(
    actor: AdminUserActor,
    targetUserId: string,
    input: {
      name?: string;
      email?: string;
      phone?: string;
      role?: string;
      password?: string;
    }
  ): Promise<AdminUserRecord> {
    assertCanManageUsers(actor);

    return await UnitOfWork.run(actor.companyId, async (txContext: any) => {
      const tx = txContext.getRawTransaction();
      const now = new Date().toISOString();

      // 1. Buscar usuario
      const [existing] = await tx
        .select()
        .from(users)
        .where(eq(users.id, targetUserId))
        .limit(1);

      if (!existing) {
        throw new AdminUserNotFoundError('Usuário não encontrado');
      }

      // 2. Guarda multi-tenant: o usuario precisa pertencer a mesma empresa do ator
      const hasMemberships = await hasMembershipsTable(tx);
      let membershipRole: string | null = null;
      if (hasMemberships) {
        const mems = await tx
          .select()
          .from(userCompanyMemberships)
          .where(
            and(
              eq(userCompanyMemberships.userId, targetUserId),
              eq(userCompanyMemberships.companyId, actor.companyId)
            )
          )
          .limit(1);
        if (mems.length > 0) {
          membershipRole = mems[0].role;
        }
      }

      if (existing.companyId !== actor.companyId && !membershipRole) {
        throw new AdminUserForbiddenError('Acesso negado: não é permitido gerenciar usuários de outra empresa');
      }

      // 3. Guarda de privilegio caso haja alteracao de papel
      let newRole: string | undefined;
      let newPermissions: string[] | undefined;
      if (typeof input.role === 'string' && input.role.trim() !== '') {
        newRole = input.role.trim().toUpperCase();
        const currentRole = (membershipRole || existing.role || '').toUpperCase();
        if (newRole !== currentRole) {
          if (newRole === 'ADMIN' || currentRole === 'ADMIN') {
            assertCanGrantPrivilege(actor);
          }
          newPermissions = getDefaultPermissionsForRole(newRole);
          if (newRole === 'ADMIN' && !newPermissions.includes('*')) {
            newPermissions.push('*');
          }
        }
      }

      // 4. Se senha informada, validacao e hash
      let passwordHash: string | null = null;
      if (typeof input.password === 'string' && input.password.trim() !== '') {
        const cleanPassword = input.password.trim();
        if (cleanPassword.length < 12) {
          throw new AdminUserConflictError('A senha deve conter no mínimo 12 caracteres');
        }
        passwordHash = await hashPassword(cleanPassword);
      }

      // 5. Update na tabela users
      const userUpdates: Record<string, any> = {
        updatedAt: now,
      };
      if (typeof input.name === 'string' && input.name.trim() !== '') {
        userUpdates.name = input.name.trim();
      }
      if (typeof input.email === 'string' && input.email.trim() !== '') {
        userUpdates.email = input.email.trim().toLowerCase();
      }
      if (newRole) {
        userUpdates.role = newRole;
      }
      if (newPermissions) {
        userUpdates.permissions = newPermissions;
      }
      if (typeof input.phone === 'string') {
        const hasPhoneCol = await hasColumn(tx, 'users', 'phone');
        if (hasPhoneCol) {
          userUpdates.phone = input.phone.trim();
        }
      }

      await tx.update(users).set(userUpdates).where(eq(users.id, targetUserId));

      // 6. Update em userCompanyMemberships se existir
      if (hasMemberships && newRole) {
        await tx
          .insert(userCompanyMemberships)
          .values({
            userId: targetUserId,
            companyId: actor.companyId,
            role: newRole,
            permissions: newPermissions,
            active: existing.active,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
            set: {
              role: newRole,
              permissions: newPermissions,
              updatedAt: now,
            },
          });
      }

      // 7. Atualizar credencial se senha informada
      if (passwordHash) {
        const hasCreds = await hasCredentialsTable(tx);
        if (hasCreds) {
          await tx
            .insert(userCredentials)
            .values({
              userId: targetUserId,
              companyId: actor.companyId,
              passwordHash,
              passwordUpdatedAt: now,
            })
            .onConflictDoUpdate({
              target: userCredentials.userId,
              set: {
                passwordHash,
                passwordUpdatedAt: now,
              },
            });
        }
      }

      // 8. Log de auditoria
      await txContext.getAuditLogRepo().create({
        id: randomUUID(),
        companyId: actor.companyId,
        entityName: 'User',
        entityId: targetUserId,
        action: AuditAction.UPDATE,
        previousState: JSON.stringify({ name: existing.name, email: existing.email, role: existing.role }),
        newState: JSON.stringify({ name: userUpdates.name || existing.name, email: userUpdates.email || existing.email, role: newRole || existing.role }),
        userId: actor.userId,
        userName: actor.name,
        timestamp: now,
      });

      return sanitizeUser({
        ...existing,
        ...userUpdates,
        role: newRole || membershipRole || existing.role,
        permissions: newPermissions || existing.permissions,
      });
    });
  }
}
