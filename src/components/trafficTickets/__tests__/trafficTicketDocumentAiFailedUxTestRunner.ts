import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../TrafficTicketDocumentIntakeModal.tsx', import.meta.url), 'utf8');

assert.match(source, /failed=extraction\?\.status==='FAILED'/, 'FAILED status must have an explicit UI state');
assert.match(source, /Falha no processamento da IA\./, 'FAILED state must explain that AI processing failed');
assert.match(source, /Nenhuma multa, Conta a Pagar ou Conta a Receber foi criada\./, 'FAILED state must confirm no business mutation');
assert.match(source, /Iniciar nova leitura/, 'FAILED state must provide a safe restart action');
assert.match(source, /setError\(failureMessage\(current\.failureCode\)\)/, 'refresh must surface provider failure through sanitized message');
assert.doesNotMatch(source, /failureCode\}\s*<|\{extraction\.failureCode\}/, 'raw failure code must not be exposed directly');

console.log('Traffic-ticket document AI failed-state UX PASS');
