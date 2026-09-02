const CURRENT_VERIFY_FULL_ALIASES = new Set(['prefer', 'require', 'verify-ca']);

export function normalizePostgresConnectionString(connectionString: string): string {
  try {
    const parsed = new URL(connectionString);
    if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') return connectionString;
    if (parsed.searchParams.get('uselibpqcompat')?.toLowerCase() === 'true') return connectionString;

    const sslMode = parsed.searchParams.get('sslmode')?.toLowerCase();
    if (!sslMode || !CURRENT_VERIFY_FULL_ALIASES.has(sslMode)) return connectionString;

    parsed.searchParams.set('sslmode', 'verify-full');
    return parsed.toString();
  } catch {
    // Preserve the original value so node-postgres remains the authority for invalid URLs.
    return connectionString;
  }
}
