import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { users } from '../db/schema';
import { AuditAction } from '../types/enums';
import { getDefaultPermissionsForRole } from './rolePresets';

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

export class AdminUserForbiddenError extends Error {}
export class AdminUserNotFoundError extends Error {}
export class AdminUserConflictError extends Error {}

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

export class AdminUserAuthority {
  static async list(actor: AdminUserActor): Promise<AdminUserRecord[]> {
    assertCanManageUsers(actor);
    return await UnitOfWork.run(actor.companyId, async (txContext: any) => {
      const tx = txContext.getRawTransaction();
      const rows = await tx
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          active: users.active,
          permissions: users.permissions,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        })
        .from(users)
        .where(eq(users.companyId, actor.companyId));

      return rows.map(sanitizeUser).sort((a: AdminUserRecord, b: AdminUserRecord) =>
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

      const targetRows = await tx
        .select()
        .from(users)
        .where(and(eq(users.companyId, actor.companyId), eq(users.id, targetUserId)))
        .for('update')
        .limit(1);
      const target = targetRows[0];
      if (!target) throw new AdminUserNotFoundError('Usuário não encontrado');

      if (!active && target.id === actor.userId) {
        throw new AdminUserConflictError('Administrador não pode desativar a própria conta autenticada');
      }

      if (!active && Boolean(target.active) && String(target.role || '').toUpperCase() === 'ADMIN') {
        const activeAdmins = await tx
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
        if (activeAdmins.length <= 1) {
          throw new AdminUserConflictError('Não é possível desativar o último administrador ativo');
        }
      }

      if (Boolean(target.active) === active) return sanitizeUser(target);

      const updatedAt = new Date().toISOString();
      const rows = await tx
        .update(users)
        .set({ active, updatedAt })
        .where(and(eq(users.companyId, actor.companyId), eq(users.id, target.id)))
        .returning({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          active: users.active,
          permissions: users.permissions,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        });

      const updated = rows[0];
      if (!updated) throw new AdminUserNotFoundError('Usuário não encontrado');
      await auditStatusChange(txContext, actor, target, active, updatedAt);
      return sanitizeUser(updated);
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

      const targetRows = await tx
        .select()
        .from(users)
        .where(and(eq(users.companyId, actor.companyId), eq(users.id, targetUserId)))
        .for('update')
        .limit(1);
      const target = targetRows[0];
      if (!target) throw new AdminUserNotFoundError('Usuário não encontrado');

      // Proteção: não rebaixar o último administrador ativo
      if (String(target.role || '').toUpperCase() === 'ADMIN' && roleClean !== 'ADMIN') {
        const activeAdmins = await tx
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
        if (activeAdmins.length <= 1) {
          throw new AdminUserConflictError('Não é possível remover o perfil de administrador do último administrador ativo');
        }
      }

      const cleanPermissions = Array.from(new Set(newPermissions.map((p) => p.trim()).filter(Boolean)));
      const updatedAt = new Date().toISOString();

      const rows = await tx
        .update(users)
        .set({
          role: roleClean,
          permissions: cleanPermissions,
          updatedAt,
        })
        .where(and(eq(users.companyId, actor.companyId), eq(users.id, target.id)))
        .returning({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          active: users.active,
          permissions: users.permissions,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        });

      const updated = rows[0];
      if (!updated) throw new AdminUserNotFoundError('Usuário não encontrado');

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

      return sanitizeUser(updated);
    });
  }

  static async provisionUser(
    actor: AdminUserActor,
    input: { id?: string; name: string; email: string; role: string; permissions?: string[] }
  ): Promise<AdminUserRecord> {
    assertCanManageUsers(actor);
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
      const userId = input.id || randomUUID();
      const now = new Date().toISOString();

      const inserted = await tx
        .insert(users)
        .values({
          id: userId,
          companyId: actor.companyId,
          name: input.name.trim(),
          email: input.email.trim().toLowerCase(),
          role: roleClean,
          active: true,
          permissions: assignedPermissions,
          createdAt: now,
          updatedAt: now,
        })
        .returning({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          active: users.active,
          permissions: users.permissions,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        });

      await txContext.getAuditLogRepo().create({
        id: randomUUID(),
        companyId: actor.companyId,
        entityName: 'User',
        entityId: userId,
        action: AuditAction.CREATE,
        newState: JSON.stringify({ name: input.name, email: input.email, role: roleClean, permissions: assignedPermissions }),
        userId: actor.userId,
        userName: actor.name,
        timestamp: now,
      });

      return sanitizeUser(inserted[0]);
    });
  }
}
