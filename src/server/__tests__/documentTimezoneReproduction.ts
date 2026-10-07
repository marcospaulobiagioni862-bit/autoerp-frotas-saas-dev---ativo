import assert from 'node:assert/strict';
import {
  parseIsoDate,
  daysUntilExpiration,
  evaluateDocumentCompliance,
  DocumentPolicyValidationError,
} from '../../domain/documents/documentPolicy';

/**
 * REPRODUTOR DE DEFEITO DEDICADO - AUTOERP-15 / AUTOERP-79
 *
 * Demonstra como datas no formato ISO com timestamp completo e timezone offset
 * (ex: '2026-10-08T22:00:00-03:00') são rejeitadas por parseIsoDate, que exige
 * estritamente o formato civil /^\d{4}-\d{2}-\d{2}$/.
 *
 * No fluxo do sistema:
 * 1. PostgresDocumentRepository.map() executa evaluateDocumentCompliance(expiration_date, ...)
 *    para TODAS as linhas retornadas por findAllByCompany().
 * 2. Se UMA linha tiver formato timestamp com timezone, evaluateDocumentCompliance lança
 *    DocumentPolicyValidationError.
 * 3. O controller documentRoutes captura o erro e envia HTTP 400 Bad Request.
 * 4. Consequência: GET /api/documents/alerts falha completamente (HTTP 400) para a empresa inteira.
 */
export function runDocumentTimezoneReproduction(): void {
  const badTimestamp = '2026-10-08T22:00:00-03:00';
  const goodIsoDate = '2026-10-08';

  // 1. parseIsoDate rejeita badTimestamp
  assert.throws(
    () => parseIsoDate(badTimestamp, 'expirationDate', true),
    (err: any) => {
      assert(err instanceof DocumentPolicyValidationError, 'Deve ser DocumentPolicyValidationError');
      assert.equal(err.message, 'Invalid expirationDate');
      return true;
    },
    'parseIsoDate deve lançar DocumentPolicyValidationError para timestamps com timezone'
  );

  // 2. daysUntilExpiration propaga o erro de parseIsoDate
  assert.throws(
    () => daysUntilExpiration(badTimestamp),
    (err: any) => {
      assert(err instanceof DocumentPolicyValidationError, 'Deve ser DocumentPolicyValidationError');
      assert.equal(err.message, 'Invalid expirationDate');
      return true;
    },
    'daysUntilExpiration deve falhar com DocumentPolicyValidationError para timestamps com timezone'
  );

  // 3. evaluateDocumentCompliance propaga o erro, quebrando o mapeamento do repositório
  assert.throws(
    () => evaluateDocumentCompliance(badTimestamp, true),
    (err: any) => {
      assert(err instanceof DocumentPolicyValidationError, 'Deve ser DocumentPolicyValidationError');
      assert.equal(err.message, 'Invalid expirationDate');
      return true;
    },
    'evaluateDocumentCompliance deve quebrar a lista inteira se um documento contiver timestamp'
  );

  // 4. Data normalizada no formato civil YYYY-MM-DD é aceita com sucesso
  const parsed = parseIsoDate(goodIsoDate, 'expirationDate', true);
  assert.equal(parsed, goodIsoDate);

  const days = daysUntilExpiration(goodIsoDate, new Date('2026-10-07T12:00:00Z'));
  assert.equal(days, 1);

  const compliance = evaluateDocumentCompliance(goodIsoDate, true, new Date('2026-10-07T12:00:00Z'));
  assert.equal(compliance.alertStage, 'D1');
  assert.equal(compliance.daysToExpiration, 1);

  console.log('✓ documentTimezoneReproduction: comprovou recusa de timestamp e aceitação de formato civil.');
}

if (process.argv[1]?.endsWith('documentTimezoneReproduction.ts')) {
  runDocumentTimezoneReproduction();
}
