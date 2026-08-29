export interface MaintenanceSlaSource {
  status: string;
  openedAt: string;
  startedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
}

export interface MaintenanceSlaMetrics {
  openedDurationMs: number | null;
  waitToStartMs: number | null;
  activeWorkMs: number | null;
  knownDowntimeMs: number | null;
  isFrozen: boolean;
}

function parseIso(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function duration(start: number | null, end: number | null): number | null {
  if (start === null || end === null || end < start) return null;
  return end - start;
}

export function deriveMaintenanceSlaMetrics(
  source: MaintenanceSlaSource,
  nowIso: string,
): MaintenanceSlaMetrics {
  const opened = parseIso(source.openedAt);
  const started = parseIso(source.startedAt);
  const completed = parseIso(source.completedAt);
  const cancelled = parseIso(source.cancelledAt);
  const now = parseIso(nowIso);

  const terminal = completed ?? cancelled;
  const referenceEnd = terminal ?? now;
  const isFrozen = terminal !== null;

  return {
    openedDurationMs: duration(opened, referenceEnd),
    waitToStartMs: started === null ? null : duration(opened, started),
    activeWorkMs:
      started === null
        ? null
        : duration(started, completed ?? (source.status === 'IN_PROGRESS' ? now : null)),
    knownDowntimeMs: duration(opened, referenceEnd),
    isFrozen,
  };
}

export function formatMaintenanceDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return '—';
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}min`;
  return `${minutes}min`;
}
