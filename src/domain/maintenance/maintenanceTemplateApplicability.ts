/** Optional, conjunctive criteria. Missing criteria preserve legacy generic templates. */
export interface MaintenanceTemplateApplicability {
  manufacturer?: string;
  model?: string;
  yearFrom?: number;
  yearTo?: number;
  engine?: string;
  kmMin?: number;
  kmMax?: number;
}

export type MaintenanceTemplateApplicabilityInput = {
  [K in keyof MaintenanceTemplateApplicability]?: MaintenanceTemplateApplicability[K] | null;
};

export function validateTemplateApplicability(
  input: MaintenanceTemplateApplicabilityInput,
  current: MaintenanceTemplateApplicability = {},
): MaintenanceTemplateApplicability {
  const next = { ...current };
  for (const key of ['manufacturer', 'model', 'engine'] as const) {
    const value = input[key];
    if (value === undefined) continue;
    if (value === null) { next[key] = undefined; continue; }
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 200) throw new Error(`Invalid ${key}`);
    next[key] = value.trim();
  }
  for (const key of ['yearFrom', 'yearTo', 'kmMin', 'kmMax'] as const) {
    const value = input[key];
    if (value === undefined) continue;
    if (value === null) { next[key] = undefined; continue; }
    const min = key.startsWith('year') ? 1900 : 0;
    const max = key.startsWith('year') ? 9999 : 2147483647;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${key}`);
    next[key] = value;
  }
  if (next.yearFrom !== undefined && next.yearTo !== undefined && next.yearFrom > next.yearTo) throw new Error('Invalid year range');
  if (next.kmMin !== undefined && next.kmMax !== undefined && next.kmMin > next.kmMax) throw new Error('Invalid KM range');
  return next;
}

const normalize = (value: string) => value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toUpperCase();

export function matchesMaintenanceTemplate(
  companyId: string,
  template: MaintenanceTemplateApplicability & { companyId: string },
  vehicle: { companyId: string; brand?: string; model?: string; yearModel?: number; currentKm: number; engine?: string },
): boolean {
  if (!companyId.trim() || template.companyId !== companyId || vehicle.companyId !== companyId) return false;
  for (const [criterion, actual] of [[template.manufacturer, vehicle.brand], [template.model, vehicle.model], [template.engine, vehicle.engine]]) {
    if (criterion !== undefined && (!actual?.trim() || normalize(criterion) !== normalize(actual))) return false;
  }
  if ((template.yearFrom !== undefined || template.yearTo !== undefined) &&
      (!Number.isInteger(vehicle.yearModel) || vehicle.yearModel! < 1900 || vehicle.yearModel! > 9999)) return false;
  if (template.yearFrom !== undefined && vehicle.yearModel! < template.yearFrom) return false;
  if (template.yearTo !== undefined && vehicle.yearModel! > template.yearTo) return false;
  if (!Number.isInteger(vehicle.currentKm) || vehicle.currentKm < 0) return false;
  // Inclusive integer bounds: 0..19999 / 20000..50000 / 50001..unbounded.
  if (template.kmMin !== undefined && vehicle.currentKm < template.kmMin) return false;
  if (template.kmMax !== undefined && vehicle.currentKm > template.kmMax) return false;
  return true;
}
