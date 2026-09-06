import assert from 'node:assert/strict';
import {
  buildMoveFlexBaseContractPdf,
  MOVEFLEX_BASE_CONTRACT_PDF_FILENAME,
} from '../moveflexBaseContractPdf';

const bytes = await buildMoveFlexBaseContractPdf();
assert.ok(bytes.length > 5_000, 'MoveFlex base PDF must contain generated contract content');
assert.equal(
  new TextDecoder().decode(bytes.slice(0, 5)),
  '%PDF-',
  'MoveFlex base PDF must be a valid PDF document',
);
assert.equal(
  MOVEFLEX_BASE_CONTRACT_PDF_FILENAME,
  'Contrato_MoveFlex_Modelo_Base.pdf',
  'MoveFlex base PDF filename must remain stable',
);

console.log('MoveFlex base PDF generation regression: PASS');
