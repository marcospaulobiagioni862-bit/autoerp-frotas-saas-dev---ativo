// SECURITY-2N: browser/runtime seed authority is disabled.
// Test/database seeding must happen through explicit server/test tooling, never
// through the production React runtime or local browser persistence.

export interface SeedResult {
  message: string;
  seededCount: number;
}

export async function seedAutoERPTestData(forceReset: boolean = false): Promise<SeedResult> {
  if (forceReset) {
    throw new Error('BROWSER_SEED_RESET_DISABLED_SERVER_AUTHORITY_REQUIRED');
  }
  return {
    message: 'Browser seed disabled: server-authoritative runtime active.',
    seededCount: 0,
  };
}
