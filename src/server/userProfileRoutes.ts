import type { Express, Request, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { users } from '../db/schema';
import { userCredentials } from '../db/authSchema';
import type { AuthenticatedPrincipal } from './auth';
import { hashPassword, verifyPassword } from './password';

function principal(req: Request): AuthenticatedPrincipal | undefined {
  return (req as Request & { principal?: AuthenticatedPrincipal }).principal;
}

function requirePrincipal(req: Request, res: Response): AuthenticatedPrincipal | null {
  const item = principal(req);
  if (!item) {
    res.status(401).json({ error: 'Unauthorized: Authentication required' });
    return null;
  }
  return item;
}

async function hasColumn(table: string, col: string): Promise<boolean> {
  try {
    const res: any = await db.execute(
      sql`SELECT 1 FROM information_schema.columns WHERE table_name = ${table} AND column_name = ${col}`
    );
    return Boolean(res.rows?.length || res?.length);
  } catch {
    return false;
  }
}

async function hasCredentialsTable(): Promise<boolean> {
  try {
    const res: any = await db.execute(sql`SELECT to_regclass('user_credentials') AS reg`);
    return Boolean(res.rows?.[0]?.reg || res[0]?.reg);
  } catch {
    return false;
  }
}

export function registerUserProfileRoutes(app: Express): void {
  // 1. GET /api/me/profile
  app.get('/api/me/profile', async (req: Request, res: Response) => {
    const p = requirePrincipal(req, res);
    if (!p) return;

    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, p.userId))
        .limit(1);

      if (!user) {
        res.status(404).json({ error: 'Usuário não encontrado' });
        return;
      }

      res.json({
        profile: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: p.role,
          companyId: p.companyId,
          phone: (user as any).phone || null,
          avatarUrl: (user as any).avatarUrl || null,
        },
      });
    } catch (error) {
      res.status(500).json({ error: 'Falha ao carregar perfil' });
    }
  });

  // 2. PATCH /api/me/profile - Fail-closed estrito contra escalada de privilégio (AUTOERP-89)
  app.patch('/api/me/profile', async (req: Request, res: Response) => {
    const p = requirePrincipal(req, res);
    if (!p) return;

    const body = req.body || {};

    // Lista negra explícita que dispara 400 imediato se houver tentativa de manipulação
    const forbiddenKeys = ['role', 'permissions', 'companyId', 'active', 'id', 'email', 'company_id'];
    for (const key of forbiddenKeys) {
      if (key in body) {
        res.status(400).json({
          error: `Operação negada: não é permitido alterar o campo '${key}' pelo perfil pessoal.`,
        });
        return;
      }
    }

    const { name, phone, avatarUrl } = body;
    const updates: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (typeof name === 'string') {
      const cleanName = name.trim();
      if (!cleanName) {
        res.status(400).json({ error: 'Nome não pode ficar em branco' });
        return;
      }
      updates.name = cleanName;
    }

    if (typeof phone === 'string') {
      const hasPhone = await hasColumn('users', 'phone');
      if (hasPhone) {
        updates.phone = phone.trim();
      }
    }

    if (typeof avatarUrl === 'string' || avatarUrl === null) {
      const hasAvatar = await hasColumn('users', 'avatar_url');
      if (hasAvatar) {
        updates.avatarUrl = avatarUrl;
      }
    }

    try {
      await db.update(users).set(updates).where(eq(users.id, p.userId));

      const [updated] = await db
        .select()
        .from(users)
        .where(eq(users.id, p.userId))
        .limit(1);

      res.json({
        profile: {
          id: updated.id,
          name: updated.name,
          email: updated.email,
          role: p.role,
          companyId: p.companyId,
          phone: (updated as any).phone || null,
          avatarUrl: (updated as any).avatarUrl || null,
        },
      });
    } catch (error) {
      res.status(500).json({ error: 'Falha ao atualizar perfil' });
    }
  });

  // 3. POST /api/me/change-password
  app.post('/api/me/change-password', async (req: Request, res: Response) => {
    const p = requirePrincipal(req, res);
    if (!p) return;

    const { currentPassword, newPassword } = req.body || {};

    if (!currentPassword || typeof currentPassword !== 'string') {
      res.status(400).json({ error: 'Senha atual é obrigatória' });
      return;
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 12) {
      res.status(400).json({ error: 'A nova senha deve conter no mínimo 12 caracteres' });
      return;
    }

    try {
      const hasCreds = await hasCredentialsTable();
      if (!hasCreds) {
        res.status(400).json({ error: 'Tabela de credenciais não disponível' });
        return;
      }

      const [cred] = await db
        .select()
        .from(userCredentials)
        .where(eq(userCredentials.userId, p.userId))
        .limit(1);

      if (!cred || !cred.passwordHash) {
        res.status(400).json({ error: 'Credencial não configurada para este usuário' });
        return;
      }

      const isCurrentValid = await verifyPassword(currentPassword, cred.passwordHash);
      if (!isCurrentValid) {
        res.status(400).json({ error: 'Senha atual incorreta' });
        return;
      }

      const newHash = await hashPassword(newPassword.trim());
      const now = new Date();

      await db
        .update(userCredentials)
        .set({
          passwordHash: newHash,
          passwordUpdatedAt: now,
        })
        .where(eq(userCredentials.userId, p.userId));

      res.json({ success: true, message: 'Senha alterada com sucesso' });
    } catch (error) {
      res.status(500).json({ error: 'Falha ao alterar senha' });
    }
  });

  // 4. POST /api/me/avatar
  app.post('/api/me/avatar', async (req: Request, res: Response) => {
    const p = requirePrincipal(req, res);
    if (!p) return;

    const { avatarUrl } = req.body || {};
    if (!avatarUrl || typeof avatarUrl !== 'string') {
      res.status(400).json({ error: 'Imagem de avatar inválida' });
      return;
    }

    const cleanAvatar = avatarUrl.trim();
    const isBase64Image = /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(cleanAvatar);
    const isHttpUrl = /^https?:\/\/[^\s$.?#].[^\s]*$/i.test(cleanAvatar);

    if (!isBase64Image && !isHttpUrl) {
      res.status(400).json({ error: 'Formato de avatar inválido. Envie uma imagem válida (base64 ou URL HTTP/HTTPS)' });
      return;
    }

    try {
      const hasAvatar = await hasColumn('users', 'avatar_url');
      if (hasAvatar) {
        await db.update(users).set({ avatarUrl, updatedAt: new Date() }).where(eq(users.id, p.userId));
      }
      res.json({ success: true, avatarUrl });
    } catch (error) {
      res.status(500).json({ error: 'Falha ao atualizar foto de perfil' });
    }
  });

  // 5. DELETE /api/me/avatar
  app.delete('/api/me/avatar', async (req: Request, res: Response) => {
    const p = requirePrincipal(req, res);
    if (!p) return;

    try {
      const hasAvatar = await hasColumn('users', 'avatar_url');
      if (hasAvatar) {
        await db.update(users).set({ avatarUrl: null, updatedAt: new Date() }).where(eq(users.id, p.userId));
      }
      res.json({ success: true, avatarUrl: null });
    } catch (error) {
      res.status(500).json({ error: 'Falha ao remover foto de perfil' });
    }
  });
}
