import { isCivilDate } from './installmentCompetence';
import { diffCivilDays } from './civilDate';
export interface DocumentAlertSettings { redDays: number; yellowDays: number; }
export const DEFAULT_DOCUMENT_ALERT_SETTINGS: DocumentAlertSettings = { redDays: 7, yellowDays: 15 };
export function validateDocumentAlertSettings(value: unknown): DocumentAlertSettings {
  const item = value as DocumentAlertSettings;
  if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(key => !['redDays','yellowDays'].includes(key)) || !Number.isInteger(item.redDays) || !Number.isInteger(item.yellowDays) || item.redDays < 0 || item.yellowDays < item.redDays || item.yellowDays > 365) throw new Error('Informe prazos inteiros entre 0 e 365; amarelo deve ser maior ou igual ao vermelho');
  return { redDays: item.redDays, yellowDays: item.yellowDays };
}
export function documentExpirationState(expiration: string, settings = DEFAULT_DOCUMENT_ALERT_SETTINGS, today = new Date(), timeZone = 'America/Sao_Paulo'): { days: number; color: 'RED' | 'YELLOW' | 'GREEN' } | null {
  if (!isCivilDate(expiration)) return null;
  const days = diffCivilDays(expiration, today, timeZone);
  return { days, color: days <= settings.redDays ? 'RED' : days <= settings.yellowDays ? 'YELLOW' : 'GREEN' };
}
