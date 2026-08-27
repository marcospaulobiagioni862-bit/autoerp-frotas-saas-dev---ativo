import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../ManagementReportsView.tsx', import.meta.url), 'utf8');

assert.equal(
  source.includes("import { ReportAiClient"),
  false,
  'ReportAiClient must not remain a static value import',
);
assert.ok(
  source.includes("import type { ReportAiSuggestedField, ReportAiSuggestionRecord } from '../../api/reportAiClient';"),
  'rendering-only Report AI types must remain type-only imports',
);
assert.ok(
  source.includes("const loadReportAiClient = () =>"),
  'ReportAiClient loader must be declared',
);
assert.ok(
  source.includes("import('../../api/reportAiClient').then(({ ReportAiClient }) => ReportAiClient);"),
  'ReportAiClient must be loaded dynamically only on an assisted action',
);
assert.equal(
  source.split('const ReportAiClient = await loadReportAiClient();').length - 1,
  3,
  'vehicle summary, driver summary, and review must each load the client on demand',
);
assert.ok(source.includes('ReportAiClient.createVehicleSummary(vehicleId)'));
assert.ok(source.includes('ReportAiClient.createDriverSummary(driverId)'));
assert.ok(source.includes('ReportAiClient.review(assistantSuggestion.id,'));

console.log('Deferred Report AI client regression: PASS');
