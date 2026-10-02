export type InstallmentCompetenceMode = 'SINGLE_EVENT' | 'PER_INSTALLMENT';

export function isCivilDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export interface InstallmentCompetenceInput {
  competenceDate?: string;
  competenceMode?: InstallmentCompetenceMode;
  installmentCompetenceDates?: string[];
}

// A payment schedule does not by itself imply a monthly economic event.
export function installmentCompetences(input: InstallmentCompetenceInput, dueDates: string[]): string[] {
  if (input.competenceMode !== undefined && !['SINGLE_EVENT', 'PER_INSTALLMENT'].includes(input.competenceMode)) throw new Error('Modo de competência inválido');
  if (input.competenceDate !== undefined && !isCivilDate(input.competenceDate)) throw new Error('Data de competência inválida');
  if (input.installmentCompetenceDates !== undefined) {
    if (input.competenceMode !== 'PER_INSTALLMENT' || !Array.isArray(input.installmentCompetenceDates) || input.installmentCompetenceDates.length !== dueDates.length || !input.installmentCompetenceDates.every(isCivilDate)) throw new Error('Informe uma competência válida para cada parcela');
    return [...input.installmentCompetenceDates];
  }
  if (input.competenceMode === 'SINGLE_EVENT') return dueDates.map(() => input.competenceDate || dueDates[0]);
  if (input.competenceMode === 'PER_INSTALLMENT') {
    const base = input.competenceDate || dueDates[0];
    return dueDates.map((_, index) => {
      const date = new Date(`${base}T00:00:00Z`);
      const day = date.getUTCDate();
      date.setUTCDate(1);
      date.setUTCMonth(date.getUTCMonth() + index);
      const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
      date.setUTCDate(Math.min(day, lastDay));
      return date.toISOString().slice(0, 10);
    });
  }
  // Keep callers using the homologated API unchanged unless they choose a mode.
  return dueDates.map(date => input.competenceDate || date);
}
