import { DocumentStatus } from '../../types/enums';

export const DEFAULT_CIVIL_TIMEZONE = 'America/Sao_Paulo';

const CIVIL_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Converte qualquer entrada de data (Date, ISO string, timestamp ou data civil pura)
 * para a string no formato civil 'YYYY-MM-DD' ancorada no fuso horário especificado.
 */
export function toCivilDateString(
  value: Date | string | number | null | undefined,
  timeZone = DEFAULT_CIVIL_TIMEZONE
): string {
  if (value === null || value === undefined || value === '') return '';

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (CIVIL_DATE_REGEX.test(trimmed)) {
      return trimmed;
    }
  }

  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;

  if (!year || !month || !day) return '';
  return `${year}-${month}-${day}`;
}

/**
 * Retorna a data civil de hoje ('YYYY-MM-DD') no fuso horário civil especificado.
 */
export function todayCivilDate(
  timeZone = DEFAULT_CIVIL_TIMEZONE,
  now = new Date()
): string {
  return toCivilDateString(now, timeZone);
}

/**
 * Calcula a diferença em dias civis inteiros entre uma data alvo e uma data base.
 * Retorno:
 *  > 0 : faltam X dias para a data alvo (futuro)
 *  = 0 : é exatamente hoje (mesmo dia civil)
 *  < 0 : venceu há X dias (passado)
 */
export function diffCivilDays(
  targetDate: string | Date | null | undefined,
  baseDate: string | Date | null | undefined = new Date(),
  timeZone = DEFAULT_CIVIL_TIMEZONE
): number {
  const targetStr = toCivilDateString(targetDate, timeZone);
  if (!targetStr) return 0;

  const baseStr = toCivilDateString(baseDate, timeZone);
  if (!baseStr) return 0;

  const [tY, tM, tD] = targetStr.split('-').map(Number);
  const [bY, bM, bD] = baseStr.split('-').map(Number);

  const targetUtc = Date.UTC(tY, tM - 1, tD);
  const baseUtc = Date.UTC(bY, bM - 1, bD);

  return Math.round((targetUtc - baseUtc) / 86_400_000);
}

export interface CnhEvaluationResult {
  status: DocumentStatus;
  daysToExpiration: number;
  inGracePeriod: boolean;
  graceDaysRemaining: number;
  color: 'RED' | 'YELLOW' | 'GREEN' | 'GRAY';
}

/**
 * Avalia o status e conformidade de uma CNH baseado na data civil de Brasília (America/Sao_Paulo),
 * calculando dias restantes, prazo de tolerância de 30 dias do CTB (art. 162, V) e limiar configurável.
 */
export function evaluateCnhCompliance(
  expirationDate?: string | null,
  options?: {
    now?: Date;
    timeZone?: string;
    yellowDays?: number;
    redDays?: number;
  }
): CnhEvaluationResult {
  if (!expirationDate || !expirationDate.trim()) {
    return {
      status: DocumentStatus.PENDING,
      daysToExpiration: 0,
      inGracePeriod: false,
      graceDaysRemaining: 0,
      color: 'GRAY',
    };
  }

  const timeZone = options?.timeZone || DEFAULT_CIVIL_TIMEZONE;
  const now = options?.now || new Date();
  const yellowThreshold = options?.yellowDays ?? 30;
  const redThreshold = options?.redDays ?? 0;

  const daysToExpiration = diffCivilDays(expirationDate, now, timeZone);

  // Regra de tolerância do CTB: art. 162, V permite conduzir até 30 dias corridos após vencimento da CNH
  const isExpired = daysToExpiration < 0;
  const inGracePeriod = isExpired && daysToExpiration >= -30;
  const graceDaysRemaining = inGracePeriod ? 30 + daysToExpiration : 0;

  let status: DocumentStatus;
  let color: 'RED' | 'YELLOW' | 'GREEN' | 'GRAY';

  if (daysToExpiration < 0) {
    status = DocumentStatus.EXPIRED;
    color = 'RED';
  } else if (daysToExpiration <= yellowThreshold) {
    status = DocumentStatus.EXPIRING_SOON;
    color = daysToExpiration <= redThreshold ? 'RED' : 'YELLOW';
  } else {
    status = DocumentStatus.VALID;
    color = 'GREEN';
  }

  return {
    status,
    daysToExpiration,
    inGracePeriod,
    graceDaysRemaining,
    color,
  };
}
