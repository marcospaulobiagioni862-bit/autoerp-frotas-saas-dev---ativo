import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../opsHealthRoutes.ts', import.meta.url), 'utf8');

assert.match(source, /app\.get\('\/api\/ops\/health'/, 'ops health endpoint must exist');
assert.match(source, /if \(!principal\)/, 'ops health must require authentication');
assert.match(source, /sql\`SELECT 1\`/, 'ops health must verify database connectivity read-only');
assert.match(source, /createAttachmentStorageFromEnvironment\(process\.env\)\.getConfiguration\(\)/, 'ops health must report sanitized attachment storage configuration');
assert.match(source, /inspectDocumentAiRuntimeMode\(process\.env\)/, 'ops health must report document AI runtime mode');
assert.match(source, /requestId: req\.requestId \|\| null/, 'ops health must expose correlation id');
assert.match(source, /RENDER_GIT_COMMIT/, 'ops health must resolve the deployed Render commit when available');
assert.match(source, /AUTOERP_ENVIRONMENT/, 'ops health must expose an explicit environment label when configured');
assert.match(source, /build,/, 'ops health must include sanitized build identity in the response');
assert.doesNotMatch(source, /GEMINI_API_KEY|R2_SECRET_ACCESS_KEY|JWT_SECRET|DATABASE_URL/, 'ops health must not expose secret names or values');
assert.doesNotMatch(source, /res\.json\([\s\S]*process\.env/, 'ops health response must not serialize process.env');

console.log('Operational health summary PASS');
