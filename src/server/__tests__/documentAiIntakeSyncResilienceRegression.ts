/**
 * PH-071 — a falha de sincronizacao do intake nao pode derrubar o estado da extracao.
 *
 * Incidente de 2026-10-16: uma unica extracao de multa cujo sync lancava
 * INTAKE_STATE_MISMATCH desfazia o proprio claim por rollback. A linha voltava para
 * PENDING com attempt_count = 0, sem failure_code; e como o claim pega a mais antiga
 * primeiro, ela era reescolhida a cada ciclo. A fila de Document AI ficou parada 4
 * dias, para todo tipo de documento e todo tenant, com a tela eternamente em 50%.
 *
 * Hermetico: le o codigo-fonte, nao toca em banco nenhum. Idempotente.
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const queueSource = readFileSync(fileURLToPath(new URL('../documentAiQueue.ts', import.meta.url)), 'utf8');

const syncHelper = queueSource.match(
  /async function syncDocumentIntakeWorkerResult\([\s\S]*?\n\}/,
)?.[0] ?? '';
assert.notEqual(syncHelper, '', 'syncDocumentIntakeWorkerResult deve existir em documentAiQueue.ts');

assert.match(
  syncHelper,
  /try\s*\{/,
  'a sincronizacao de intake deve estar dentro de try: sem isso, um intake inconsistente desfaz o claim por rollback',
);
assert.match(
  syncHelper,
  /catch\s*\(error\)/,
  'a sincronizacao de intake deve capturar o erro em vez de propagar',
);
assert.match(
  syncHelper,
  /AUTOERP_DOCUMENT_AI_INTAKE_SYNC_FAILURE/,
  'a falha de sync deve ser registrada com marcador proprio: engolir em silencio foi o que escondeu o incidente por 4 dias',
);
assert.doesNotMatch(
  syncHelper.split('catch (error)')[1] ?? '',
  /\bthrow\b/,
  'o catch nao pode relancar: relancar reintroduz o rollback que travou a fila',
);

// O marcador tem de carregar o suficiente para achar a linha culpada sem adivinhar.
for (const campo of ['extractionId', 'attachmentId', 'targetStatus', 'reason']) {
  assert.match(syncHelper, new RegExp(campo), `o log de falha de sync deve conter ${campo}`);
}

// Todos os pontos de resultado (requeue/processing-failed, complete, fail, stale-pending, fail-direct)
// continuam passando pelo helper protegido, e nenhum chama os syncs especificos direto (o que furaria a protecao).
const chamadasHelper = queueSource.match(/syncDocumentIntakeWorkerResult\(context/g) ?? [];
assert.equal(chamadasHelper.length, 5, 'os 5 pontos de resultado de extracao devem usar o helper protegido');
const corpoForaDoHelper = queueSource.replace(syncHelper, '');
assert.doesNotMatch(
  corpoForaDoHelper,
  /await\s+syncDriverDocumentIntakeWorkerResult|await\s+syncVehicleDocumentIntakeWorkerResult|await\s+syncTrafficTicketDocumentIntakeWorkerResult/,
  'nenhum ponto pode chamar os syncs especificos direto, por fora da protecao',
);

console.log('PH-071 document AI intake sync resilience regression: PASS');
