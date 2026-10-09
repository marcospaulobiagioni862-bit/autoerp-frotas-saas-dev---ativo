import assert from 'node:assert/strict';
import { DocumentStatus } from '../../types/enums';
import {
  diffCivilDays,
  evaluateCnhCompliance,
  toCivilDateString,
  todayCivilDate,
} from '../../shared/utils/civilDate';
import { evaluateCnhStatus, evaluateCnhStatusDetailed } from '../driverCnhStatus';
import {
  daysUntilExpiration,
  evaluateDocumentCompliance,
} from '../../domain/documents/documentPolicy';

export function runCivilDateRegression(): void {
  // 1. Cenário Crítico do AUTOERP-15:
  // Às 22:00 de Brasília em 2026-10-08, o servidor Render em UTC está em 2026-10-09T01:00:00Z.
  const nowUtc22hBrt = new Date('2026-10-09T01:00:00.000Z');

  // Confere que a data civil de hoje em Brasília ainda é 2026-10-08:
  const todayBrt = todayCivilDate('America/Sao_Paulo', nowUtc22hBrt);
  assert.equal(todayBrt, '2026-10-08', 'Data civil de Brasília às 22h deve ser 2026-10-08, não 2026-10-09');

  // Documento que vence amanhã (2026-10-09) NÃO pode aparecer como vencido às 22h do dia anterior:
  const daysTomorrow = diffCivilDays('2026-10-09', nowUtc22hBrt, 'America/Sao_Paulo');
  assert.equal(daysTomorrow, 1, 'Documento que vence amanhã deve ter exatamente 1 dia restante');

  // Documento que vence hoje (2026-10-08) NÃO pode aparecer como vencido ontem:
  const daysToday = diffCivilDays('2026-10-08', nowUtc22hBrt, 'America/Sao_Paulo');
  assert.equal(daysToday, 0, 'Documento que vence hoje deve ter exatamente 0 dias restantes');

  // Documento que venceu ontem (2026-10-07) tem -1 dia:
  const daysYesterday = diffCivilDays('2026-10-07', nowUtc22hBrt, 'America/Sao_Paulo');
  assert.equal(daysYesterday, -1, 'Documento que venceu ontem deve ter -1 dia');

  // 2. Integração com evaluateDocumentCompliance e daysUntilExpiration em documentPolicy:
  const complianceTomorrow = evaluateDocumentCompliance('2026-10-09', true, nowUtc22hBrt);
  assert.equal(complianceTomorrow.complianceStatus, DocumentStatus.EXPIRING_SOON);
  assert.equal(complianceTomorrow.daysToExpiration, 1);
  assert.equal(complianceTomorrow.alertStage, 'D1');

  const complianceToday = evaluateDocumentCompliance('2026-10-08', true, nowUtc22hBrt);
  assert.equal(complianceToday.complianceStatus, DocumentStatus.EXPIRING_SOON);
  assert.equal(complianceToday.daysToExpiration, 0);
  assert.equal(complianceToday.alertStage, 'DUE_TODAY');

  const complianceYesterday = evaluateDocumentCompliance('2026-10-07', true, nowUtc22hBrt);
  assert.equal(complianceYesterday.complianceStatus, DocumentStatus.EXPIRED);
  assert.equal(complianceYesterday.daysToExpiration, -1);
  assert.equal(complianceYesterday.alertStage, 'POST_DUE');

  // 3. Regra do CTB (art. 162, V) - Tolerância legal de 30 dias para CNH:
  // Expirada há 5 dias: está dentro do período de tolerância do CTB
  const cnhGrace = evaluateCnhCompliance('2026-10-03', { now: nowUtc22hBrt });
  assert.equal(cnhGrace.status, DocumentStatus.EXPIRED);
  assert.equal(cnhGrace.inGracePeriod, true, 'Deve estar no período de tolerância do CTB');
  assert.equal(cnhGrace.daysToExpiration, -5);
  assert.equal(cnhGrace.graceDaysRemaining, 25, 'Devem restar 25 dias de tolerância do CTB');

  // Expirada há 30 dias: último dia de tolerância do CTB
  const cnhGraceLastDay = evaluateCnhCompliance('2026-09-08', { now: nowUtc22hBrt });
  assert.equal(cnhGraceLastDay.status, DocumentStatus.EXPIRED);
  assert.equal(cnhGraceLastDay.inGracePeriod, true);
  assert.equal(cnhGraceLastDay.daysToExpiration, -30);
  assert.equal(cnhGraceLastDay.graceDaysRemaining, 0);

  // Expirada há 31 dias: tolerância do CTB esgotada
  const cnhGraceExceeded = evaluateCnhCompliance('2026-09-07', { now: nowUtc22hBrt });
  assert.equal(cnhGraceExceeded.status, DocumentStatus.EXPIRED);
  assert.equal(cnhGraceExceeded.inGracePeriod, false, 'Tolerância do CTB esgotada');
  assert.equal(cnhGraceExceeded.graceDaysRemaining, 0);

  // 4. evaluateCnhStatusDetailed e evaluateCnhStatus:
  assert.equal(evaluateCnhStatus('2026-10-09', { now: nowUtc22hBrt }), DocumentStatus.EXPIRING_SOON);
  assert.equal(evaluateCnhStatus('2026-10-08', { now: nowUtc22hBrt }), DocumentStatus.EXPIRING_SOON);
  assert.equal(evaluateCnhStatus('2026-10-07', { now: nowUtc22hBrt }), DocumentStatus.EXPIRED);
  assert.equal(evaluateCnhStatus('2026-12-01', { now: nowUtc22hBrt }), DocumentStatus.VALID);
  assert.equal(evaluateCnhStatus(null), DocumentStatus.PENDING);
  assert.equal(evaluateCnhStatus(''), DocumentStatus.PENDING);

  // 5. Normalização resiliente de timestamp com timezone:
  const normalized = toCivilDateString('2026-10-08T22:00:00-03:00', 'America/Sao_Paulo');
  assert.equal(normalized, '2026-10-08', 'toCivilDateString deve converter timestamp para a data civil correspondente');

  console.log('✓ civilDateRegression: todos os testes de data civil, CTB e recalculo de CNH passaram com sucesso.');
}

if (process.argv[1]?.endsWith('civilDateRegression.ts')) {
  runCivilDateRegression();
}
