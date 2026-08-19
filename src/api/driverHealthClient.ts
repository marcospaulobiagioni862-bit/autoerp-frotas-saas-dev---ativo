import { DriverHealthAndEmergency } from '../types/entities';

export class DriverHealthApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); this.name = 'DriverHealthApiError'; }
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid driver health response');
  return value as Record<string, unknown>;
}

function validateHealth(value: unknown): DriverHealthAndEmergency {
  const item=asObject(value);
  for (const [key,val] of Object.entries(item)) {
    if (val != null && typeof val !== 'string') throw new Error(`Invalid driver health field: ${key}`);
  }
  return item as DriverHealthAndEmergency;
}

async function apiError(response: Response): Promise<DriverHealthApiError> {
  let message=`Driver health request failed (${response.status})`;
  try { const body=asObject(await response.json()); if (typeof body.error==='string') message=body.error; } catch {}
  return new DriverHealthApiError(response.status,message);
}

export class DriverHealthClient {
  static async get(driverId: string): Promise<DriverHealthAndEmergency> {
    const response=await fetch(`/api/drivers/${encodeURIComponent(driverId)}/health`,{method:'GET',credentials:'include'});
    if(!response.ok) throw await apiError(response);
    const body=asObject(await response.json());
    return validateHealth(body.health);
  }

  static async update(driverId: string, health: DriverHealthAndEmergency): Promise<DriverHealthAndEmergency> {
    const response=await fetch(`/api/drivers/${encodeURIComponent(driverId)}/health`,{
      method:'PUT', credentials:'include', headers:{'content-type':'application/json'}, body:JSON.stringify({health})
    });
    if(!response.ok) throw await apiError(response);
    const body=asObject(await response.json());
    return validateHealth(body.health);
  }
}
