from pathlib import Path
import subprocess

# Prepare the TS validation harness for ESM execution.
p = Path('.ci/security-2i1b-validation.ts')
text = p.read_text(encoding='utf-8')
text = text.replace("import { spawn } from 'node:child_process';", "import { spawn } from 'node:child_process';\nimport { createHash } from 'node:crypto';")
text = text.replace("'km-init-' + requireMd5('company-i1b-a:veh-preexisting')", "'km-init-' + createHash('md5').update('company-i1b-a:veh-preexisting').digest('hex')")
start = text.find("\nfunction requireMd5(value: string): string {")
if start >= 0:
    end = text.find("\n}\n\nasync function login", start)
    if end < 0:
        raise SystemExit('requireMd5 end not found')
    text = text[:start] + "\n\nasync function login" + text[end + len("\n}\n\nasync function login"):]
p.write_text(text, encoding='utf-8')

# Drizzle wraps pg errors in DrizzleQueryError.cause. Preserve 409 semantics for
# tenant-scoped unique conflicts instead of leaking them as generic 500 errors.
p = Path('src/server/vehicleRoutes.ts')
source = p.read_text(encoding='utf-8')
old = """function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === '23505');
}
"""
new = """function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth++) {
    if ('code' in current && (current as { code?: unknown }).code === '23505') return true;
    current = 'cause' in current ? (current as { cause?: unknown }).cause : undefined;
  }
  return false;
}
"""
if source.count(old) != 1:
    raise SystemExit(f'wrapped unique handler anchor count={source.count(old)}')
p.write_text(source.replace(old, new, 1), encoding='utf-8')

# The source changed after the first compile gates, so compile it again before
# the PostgreSQL runtime validation uses dist/server.mjs.
subprocess.run(['npm', 'run', 'lint'], check=True)
subprocess.run(['npm', 'run', 'build'], check=True)
