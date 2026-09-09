export interface OpsBuildIdentity {
  commitSha: string | null;
  environment: string;
  service: string | null;
}

export interface OpsHealthSummary {
  state: 'OK' | 'DEGRADED';
  build: OpsBuildIdentity;
}

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid operational health response');
  return value as RecordValue;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export class OpsHealthClient {
  static async get(): Promise<OpsHealthSummary> {
    const response = await fetch('/api/ops/health', { credentials: 'include' });
    if (!response.ok) throw new Error(`Operational health request failed (${response.status})`);
    const payload = record(await response.json());
    const build = record(payload.build);
    if (payload.state !== 'OK' && payload.state !== 'DEGRADED') throw new Error('Invalid operational health state');
    const environment = optionalString(build.environment);
    if (!environment) throw new Error('Invalid operational build environment');
    return {
      state: payload.state,
      build: {
        commitSha: optionalString(build.commitSha),
        environment,
        service: optionalString(build.service),
      },
    };
  }
}
