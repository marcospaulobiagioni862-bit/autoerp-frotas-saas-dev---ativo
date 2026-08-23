import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { AuditAction } from '../types/enums';

export const TENANT_PROFILE_DEFAULTS = Object.freeze({
  timezone: 'America/Sao_Paulo',
  currency: 'BRL',
  maxVehiclesLimit: 5000,
  maxDriversLimit: 10000,
});

const POSTGRES_INTEGER_MAX = 2_147_483_647;

export interface AdminTenantActor {
  companyId: string;
  userId: string;
  name: string;
  role: string;
}

export interface AdminTenantProfile {
  companyId: string;
  companyName: string;
  document: string | null;
  timezone: string;
  currency: string;
  maxVehiclesLimit: number;
  maxDriversLimit: number;
  updatedAt: string;
  updatedBy: string;
}

export interface AdminTenantProfilePatch {
  companyName?: string;
  timezone?: string;
  currency?: string;
  maxVehiclesLimit?: number;
  maxDriversLimit?: number;
}

export class AdminTenantForbiddenError extends Error {}
export class AdminTenantNotFoundError extends Error {}
export class AdminTenantValidationError extends Error {}

function assertAdmin(actor: AdminTenantActor): void {
  if (String(actor.role || '').toUpperCase() !== 'ADMIN') {
    throw new AdminTenantForbiddenError('Acesso negado: configuração do tenant requer ADMIN');
  }
}

function rows(result: any): any[] {
  return result?.rows || [];
}

function validateCompanyName(value: unknown): string {
  if (typeof value !== 'string') throw new AdminTenantValidationError('Nome da empresa inválido');
  const normalized = value.trim();
  if (!normalized || normalized.length > 200) throw new AdminTenantValidationError('Nome da empresa inválido');
  return normalized;
}

function validateTimezone(value: unknown): string {
  if (typeof value !== 'string' || value !== value.trim() || value.length < 1 || value.length > 100) {
    throw new AdminTenantValidationError('Timezone inválido');
  }

  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
  if (typeof intl.supportedValuesOf === 'function') {
    if (!intl.supportedValuesOf('timeZone').includes(value)) throw new AdminTenantValidationError('Timezone inválido');
    return value;
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date(0));
    return value;
  } catch {
    throw new AdminTenantValidationError('Timezone inválido');
  }
}

function validateCurrency(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value) || value !== 'BRL') {
    throw new AdminTenantValidationError('Moeda inválida ou ainda não suportada');
  }
  return value;
}

function validateLimit(value: unknown, field: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > POSTGRES_INTEGER_MAX
  ) {
    throw new AdminTenantValidationError(`${field} inválido`);
  }
  return value;
}

function validatePatch(input: AdminTenantProfilePatch): AdminTenantProfilePatch {
  const output: AdminTenantProfilePatch = {};
  if (Object.prototype.hasOwnProperty.call(input, 'companyName')) output.companyName = validateCompanyName(input.companyName);
  if (Object.prototype.hasOwnProperty.call(input, 'timezone')) output.timezone = validateTimezone(input.timezone);
  if (Object.prototype.hasOwnProperty.call(input, 'currency')) output.currency = validateCurrency(input.currency);
  if (Object.prototype.hasOwnProperty.call(input, 'maxVehiclesLimit')) output.maxVehiclesLimit = validateLimit(input.maxVehiclesLimit, 'Limite de veículos');
  if (Object.prototype.hasOwnProperty.call(input, 'maxDriversLimit')) output.maxDriversLimit = validateLimit(input.maxDriversLimit, 'Limite de motoristas');
  if (Object.keys(output).length === 0) throw new AdminTenantValidationError('Nenhuma alteração informada');
  return output;
}

async function writeAudit(
  txContext: any,
  actor: AdminTenantActor,
  action: AuditAction,
  previousState: unknown,
  newState: unknown,
  timestamp: string
): Promise<void> {
  await txContext.getAuditLogRepo().create({
    id: randomUUID(),
    companyId: actor.companyId,
    entityName: 'TENANT_OPERATIONAL_CONFIG',
    entityId: actor.companyId,
    action,
    previousState: previousState === undefined ? undefined : JSON.stringify(previousState),
    newState: JSON.stringify(newState),
    userId: actor.userId,
    userName: actor.name,
    timestamp,
  });
}

async function ensureProfile(txContext: any, actor: AdminTenantActor): Promise<AdminTenantProfile> {
  const tx = txContext.getRawTransaction();
  await tx.execute(sql`SELECT pg_advisory_xact_lock(abs(hashtext(${`${actor.companyId}:tenant-profile`})))`);

  const companyRows = rows(await tx.execute(sql`
    SELECT id, name, document
    FROM companies
    WHERE id=${actor.companyId} AND status='ACTIVE'
    FOR UPDATE
  `));
  const company = companyRows[0];
  if (!company) throw new AdminTenantNotFoundError('Tenant não encontrado');

  let configRows = rows(await tx.execute(sql`
    SELECT company_id, timezone, currency, max_vehicles_limit, max_drivers_limit, updated_at, updated_by
    FROM tenant_operational_configs
    WHERE company_id=${actor.companyId}
    FOR UPDATE
  `));

  if (configRows.length === 0) {
    const now = new Date().toISOString();
    await tx.execute(sql`
      INSERT INTO tenant_operational_configs(
        company_id, timezone, currency, max_vehicles_limit, max_drivers_limit, updated_at, updated_by
      ) VALUES (
        ${actor.companyId},
        ${TENANT_PROFILE_DEFAULTS.timezone},
        ${TENANT_PROFILE_DEFAULTS.currency},
        ${TENANT_PROFILE_DEFAULTS.maxVehiclesLimit},
        ${TENANT_PROFILE_DEFAULTS.maxDriversLimit},
        ${now},
        ${actor.userId}
      )
      ON CONFLICT (company_id) DO NOTHING
    `);
    configRows = rows(await tx.execute(sql`
      SELECT company_id, timezone, currency, max_vehicles_limit, max_drivers_limit, updated_at, updated_by
      FROM tenant_operational_configs
      WHERE company_id=${actor.companyId}
      FOR UPDATE
    `));
    const created = configRows[0];
    if (!created) throw new Error('Falha ao materializar configuração autoritativa do tenant');
    await writeAudit(txContext, actor, AuditAction.CREATE, undefined, {
      timezone: created.timezone,
      currency: created.currency,
      maxVehiclesLimit: Number(created.max_vehicles_limit),
      maxDriversLimit: Number(created.max_drivers_limit),
    }, now);
  }

  const config = configRows[0];
  return {
    companyId: company.id,
    companyName: company.name,
    document: company.document ?? null,
    timezone: config.timezone,
    currency: config.currency,
    maxVehiclesLimit: Number(config.max_vehicles_limit),
    maxDriversLimit: Number(config.max_drivers_limit),
    updatedAt: new Date(config.updated_at).toISOString(),
    updatedBy: config.updated_by,
  };
}

function sameProfile(a: AdminTenantProfile, b: AdminTenantProfile): boolean {
  return a.companyName === b.companyName &&
    a.timezone === b.timezone &&
    a.currency === b.currency &&
    a.maxVehiclesLimit === b.maxVehiclesLimit &&
    a.maxDriversLimit === b.maxDriversLimit;
}

export class AdminTenantAuthority {
  static async get(actor: AdminTenantActor): Promise<AdminTenantProfile> {
    assertAdmin(actor);
    return await UnitOfWork.run(actor.companyId, async (txContext: any) => ensureProfile(txContext, actor));
  }

  static async update(actor: AdminTenantActor, patch: AdminTenantProfilePatch): Promise<AdminTenantProfile> {
    assertAdmin(actor);
    const validated = validatePatch(patch);

    return await UnitOfWork.run(actor.companyId, async (txContext: any) => {
      const current = await ensureProfile(txContext, actor);
      const next: AdminTenantProfile = {
        ...current,
        companyName: validated.companyName ?? current.companyName,
        timezone: validated.timezone ?? current.timezone,
        currency: validated.currency ?? current.currency,
        maxVehiclesLimit: validated.maxVehiclesLimit ?? current.maxVehiclesLimit,
        maxDriversLimit: validated.maxDriversLimit ?? current.maxDriversLimit,
      };
      if (sameProfile(current, next)) return current;

      const tx = txContext.getRawTransaction();
      const now = new Date().toISOString();
      if (next.companyName !== current.companyName) {
        await tx.execute(sql`
          UPDATE companies
          SET name=${next.companyName}, updated_at=${now}
          WHERE id=${actor.companyId}
        `);
      }
      await tx.execute(sql`
        UPDATE tenant_operational_configs
        SET timezone=${next.timezone},
            currency=${next.currency},
            max_vehicles_limit=${next.maxVehiclesLimit},
            max_drivers_limit=${next.maxDriversLimit},
            updated_at=${now},
            updated_by=${actor.userId}
        WHERE company_id=${actor.companyId}
      `);

      const persisted = { ...next, updatedAt: now, updatedBy: actor.userId };
      await writeAudit(txContext, actor, AuditAction.UPDATE, current, persisted, now);
      return persisted;
    });
  }
}
