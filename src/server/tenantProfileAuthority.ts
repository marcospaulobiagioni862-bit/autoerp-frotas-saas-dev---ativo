import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { companies, tenantOperationalConfigs } from '../db/schema';
import { UnitOfWork } from '../db/uow';
import { AuditAction } from '../types/enums';

export const DEFAULT_MAX_VEHICLES_LIMIT = 500;
export const DEFAULT_MAX_DRIVERS_LIMIT = 1000;
export const MAX_VEHICLES_LIMIT = 100_000;
export const MAX_DRIVERS_LIMIT = 200_000;

const DEFAULT_TIMEZONE = 'America/Sao_Paulo';
const DEFAULT_CURRENCY = 'BRL';
const FALLBACK_TIMEZONES = new Set(['America/Sao_Paulo', 'UTC']);

export interface TenantProfileActor {
  companyId: string;
  userId: string;
  name: string;
  role: string;
  permissions?: string[];
}

export interface TenantProfile {
  companyId: string;
  companyName: string;
  document: string;
  timezone: string;
  currency: string;
  maxVehiclesLimit: number;
  maxDriversLimit: number;
  logoUrl: string | null;
  updatedAt: string;
  updatedBy: string;
}

export interface TenantProfileUpdate {
  companyName?: unknown;
  timezone?: unknown;
  currency?: unknown;
  maxVehiclesLimit?: unknown;
  maxDriversLimit?: unknown;
  logoUrl?: unknown;
}

export class TenantProfileForbiddenError extends Error {}
export class TenantProfileValidationError extends Error {}
export class TenantProfileNotFoundError extends Error {}

function assertAdmin(actor: TenantProfileActor): void {
  const permissions = Array.isArray(actor.permissions) ? actor.permissions : [];
  if (!actor.companyId || !actor.userId) {
    throw new TenantProfileForbiddenError();
  }
  if (String(actor.role || '').toUpperCase() !== 'ADMIN' && !permissions.includes('*') && !permissions.includes('MANAGE_TENANT')) {
    throw new TenantProfileForbiddenError();
  }
}

function validTimezone(value: string): boolean {
  const supportedValuesOf = (Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  if (typeof supportedValuesOf === 'function') {
    return supportedValuesOf('timeZone').includes(value);
  }
  return FALLBACK_TIMEZONES.has(value);
}

function requiredName(value: unknown): string {
  if (typeof value !== 'string') throw new TenantProfileValidationError();
  const name = value.trim();
  if (name.length < 2 || name.length > 160) throw new TenantProfileValidationError();
  return name;
}

function timezone(value: unknown): string {
  if (typeof value !== 'string') throw new TenantProfileValidationError();
  const normalized = value.trim();
  if (!normalized || normalized.length > 100 || !validTimezone(normalized)) throw new TenantProfileValidationError();
  return normalized;
}

function currency(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value) || value !== DEFAULT_CURRENCY) {
    throw new TenantProfileValidationError();
  }
  return value;
}

function limit(value: unknown, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < 0 || value > maximum) {
    throw new TenantProfileValidationError();
  }
  return value;
}

const VALID_IMAGE_DATA_URI_REGEX = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=\r\n]+)$/;

function optionalLogoUrl(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new TenantProfileValidationError();
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (trimmed.length > 2_000_000) throw new TenantProfileValidationError();

  // 1. Same-origin relative path: ex: /assets/logo.png, /images/brand.png
  // Deve iniciar com '/', não conter barra invertida '\' e resolver com hostname preservado na base dummy
  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.includes('\\') && !/\s/.test(trimmed)) {
    try {
      const dummyOrigin = 'https://placeholder.invalid';
      const resolved = new URL(trimmed, dummyOrigin);
      if (resolved.origin === dummyOrigin && resolved.hostname === 'placeholder.invalid') {
        return trimmed;
      }
    } catch {
      // URL inválida cai na recusa
    }
  }

  // 2. Data URI com MIME de imagem suportada pelo pdf-lib (apenas png e jpeg) e payload base64 decodificável
  const match = trimmed.match(VALID_IMAGE_DATA_URI_REGEX);
  if (match) {
    const rawBase64 = match[2].replace(/[\r\n]/g, '');
    if (rawBase64.length > 0) {
      try {
        const decoded = Buffer.from(rawBase64, 'base64');
        if (decoded.length > 0) {
          return trimmed;
        }
      } catch {
        // Falha na decodificação cai na recusa abaixo
      }
    }
  }

  // URLs externas (http://, https://), protocol-relative (//), barra invertida (/\evil.com), WebP/SVG ou payloads arbitrários são recusados
  throw new TenantProfileValidationError();
}

function sanitize(company: any, config: any): TenantProfile {
  return {
    companyId: company.id,
    companyName: company.name,
    document: company.document || '',
    timezone: config.timezone,
    currency: config.currency,
    maxVehiclesLimit: config.maxVehiclesLimit,
    maxDriversLimit: config.maxDriversLimit,
    logoUrl: config.logoUrl || null,
    updatedAt: config.updatedAt,
    updatedBy: config.updatedBy,
  };
}

async function ensureConfig(context: any, actor: TenantProfileActor, company: any): Promise<any> {
  const tx = context.getRawTransaction();
  const now = new Date().toISOString();
  const createdRows = await tx.insert(tenantOperationalConfigs).values({
    companyId: actor.companyId,
    timezone: DEFAULT_TIMEZONE,
    currency: DEFAULT_CURRENCY,
    maxVehiclesLimit: DEFAULT_MAX_VEHICLES_LIMIT,
    maxDriversLimit: DEFAULT_MAX_DRIVERS_LIMIT,
    logoUrl: null,
    updatedAt: now,
    updatedBy: actor.userId,
  }).onConflictDoNothing({ target: tenantOperationalConfigs.companyId }).returning();

  if (createdRows[0]) {
    await context.getAuditLogRepo().create({
      id: randomUUID(),
      companyId: actor.companyId,
      entityName: 'TenantOperationalConfig',
      entityId: actor.companyId,
      action: AuditAction.CREATE,
      newState: JSON.stringify({
        companyName: company.name,
        timezone: DEFAULT_TIMEZONE,
        currency: DEFAULT_CURRENCY,
        maxVehiclesLimit: DEFAULT_MAX_VEHICLES_LIMIT,
        maxDriversLimit: DEFAULT_MAX_DRIVERS_LIMIT,
      }),
      userId: actor.userId,
      userName: actor.name,
      timestamp: now,
    });
    return createdRows[0];
  }
  const existing = await tx.select().from(tenantOperationalConfigs)
    .where(eq(tenantOperationalConfigs.companyId, actor.companyId)).limit(1);
  if (!existing[0]) throw new TenantProfileNotFoundError();
  return existing[0];
}

export class TenantProfileAuthority {
  static async get(actor: TenantProfileActor): Promise<TenantProfile> {
    assertAdmin(actor);
    return await UnitOfWork.run(actor.companyId, async (context: any) => {
      const tx = context.getRawTransaction();
      const companyRows = await tx.select().from(companies)
        .where(and(eq(companies.id, actor.companyId), eq(companies.status, 'ACTIVE'))).limit(1);
      const company = companyRows[0];
      if (!company) throw new TenantProfileNotFoundError();
      const config = await ensureConfig(context, actor, company);
      return sanitize(company, config);
    });
  }

  static async update(actor: TenantProfileActor, input: TenantProfileUpdate): Promise<TenantProfile> {
    assertAdmin(actor);
    const keys = Object.keys(input);
    if (keys.length === 0 || !keys.every((key) => ['companyName', 'timezone', 'currency', 'maxVehiclesLimit', 'maxDriversLimit', 'logoUrl'].includes(key))) {
      throw new TenantProfileValidationError();
    }
    const parsed = {
      companyName: input.companyName === undefined ? undefined : requiredName(input.companyName),
      timezone: input.timezone === undefined ? undefined : timezone(input.timezone),
      currency: input.currency === undefined ? undefined : currency(input.currency),
      maxVehiclesLimit: input.maxVehiclesLimit === undefined ? undefined : limit(input.maxVehiclesLimit, MAX_VEHICLES_LIMIT),
      maxDriversLimit: input.maxDriversLimit === undefined ? undefined : limit(input.maxDriversLimit, MAX_DRIVERS_LIMIT),
      logoUrl: input.logoUrl === undefined ? undefined : optionalLogoUrl(input.logoUrl),
    };

    return await UnitOfWork.run(actor.companyId, async (context: any) => {
      const tx = context.getRawTransaction();
      const companyRows = await tx.select().from(companies)
        .where(and(eq(companies.id, actor.companyId), eq(companies.status, 'ACTIVE'))).for('update').limit(1);
      const company = companyRows[0];
      if (!company) throw new TenantProfileNotFoundError();
      await ensureConfig(context, actor, company);
      const configRows = await tx.select().from(tenantOperationalConfigs)
        .where(eq(tenantOperationalConfigs.companyId, actor.companyId)).for('update').limit(1);
      const config = configRows[0];
      if (!config) throw new TenantProfileNotFoundError();

      const candidate = {
        companyName: parsed.companyName ?? company.name,
        timezone: parsed.timezone ?? config.timezone,
        currency: parsed.currency ?? config.currency,
        maxVehiclesLimit: parsed.maxVehiclesLimit ?? config.maxVehiclesLimit,
        maxDriversLimit: parsed.maxDriversLimit ?? config.maxDriversLimit,
        logoUrl: parsed.logoUrl !== undefined ? parsed.logoUrl : (config.logoUrl || null),
      };
      const previous = sanitize(company, config);
      if (
        candidate.companyName === previous.companyName && candidate.timezone === previous.timezone &&
        candidate.currency === previous.currency && candidate.maxVehiclesLimit === previous.maxVehiclesLimit &&
        candidate.maxDriversLimit === previous.maxDriversLimit &&
        candidate.logoUrl === previous.logoUrl
      ) return previous;

      const now = new Date().toISOString();
      if (candidate.companyName !== company.name) {
        await tx.update(companies).set({ name: candidate.companyName, updatedAt: now })
          .where(eq(companies.id, actor.companyId));
      }
      const updatedRows = await tx.update(tenantOperationalConfigs).set({
        timezone: candidate.timezone,
        currency: candidate.currency,
        maxVehiclesLimit: candidate.maxVehiclesLimit,
        maxDriversLimit: candidate.maxDriversLimit,
        logoUrl: candidate.logoUrl,
        updatedAt: now,
        updatedBy: actor.userId,
      }).where(eq(tenantOperationalConfigs.companyId, actor.companyId)).returning();
      const updatedConfig = updatedRows[0];
      if (!updatedConfig) throw new TenantProfileNotFoundError();
      const updated = sanitize({ ...company, name: candidate.companyName }, updatedConfig);
      await context.getAuditLogRepo().create({
        id: randomUUID(),
        companyId: actor.companyId,
        entityName: 'TenantOperationalConfig',
        entityId: actor.companyId,
        action: AuditAction.UPDATE,
        previousState: JSON.stringify({
          companyName: previous.companyName,
          timezone: previous.timezone,
          currency: previous.currency,
          maxVehiclesLimit: previous.maxVehiclesLimit,
          maxDriversLimit: previous.maxDriversLimit,
          logoUrl: previous.logoUrl,
        }),
        newState: JSON.stringify({
          companyName: updated.companyName,
          timezone: updated.timezone,
          currency: updated.currency,
          maxVehiclesLimit: updated.maxVehiclesLimit,
          maxDriversLimit: updated.maxDriversLimit,
          logoUrl: updated.logoUrl,
        }),
        userId: actor.userId,
        userName: actor.name,
        timestamp: now,
      });
      return updated;
    });
  }

  static async getBranding(companyId: string): Promise<{ companyId: string; companyName: string; document: string; logoUrl: string | null }> {
    return await UnitOfWork.run(companyId, async (context: any) => {
      const tx = context.getRawTransaction();
      const companyRows = await tx.select().from(companies)
        .where(and(eq(companies.id, companyId), eq(companies.status, 'ACTIVE'))).limit(1);
      const company = companyRows[0];
      if (!company) throw new TenantProfileNotFoundError();
      const configRows = await tx.select().from(tenantOperationalConfigs)
        .where(eq(tenantOperationalConfigs.companyId, companyId)).limit(1);
      const config = configRows[0];
      return {
        companyId: company.id,
        companyName: company.name,
        document: company.document || '',
        logoUrl: config?.logoUrl || null,
      };
    });
  }
}

