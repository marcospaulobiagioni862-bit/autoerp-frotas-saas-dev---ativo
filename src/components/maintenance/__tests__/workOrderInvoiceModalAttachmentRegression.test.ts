import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  shouldAutoOpenWorkOrderAttachments,
  resolveWorkOrderAttachmentInitialType,
} from '../MaintenanceManagement';

const maintenanceSource = readFileSync(
  new URL('../MaintenanceManagement.tsx', import.meta.url),
  'utf8'
);

// 1. Scenario A: Work order with NO invoice across all sections must not auto-open attachments modal
assert.equal(
  shouldAutoOpenWorkOrderAttachments([
    { hasInvoice: false },
    { hasInvoice: false },
    { hasInvoice: false },
  ]),
  false,
  'Work order with NO invoice must not auto open attachments'
);

// 2. Scenario B: Work order with YES invoice in any section must auto-open attachments modal
assert.equal(
  shouldAutoOpenWorkOrderAttachments([
    { hasInvoice: false },
    { hasInvoice: true },
    { hasInvoice: false },
  ]),
  true,
  'Work order with at least one declared invoice must auto open attachments'
);

// 3. Manual open: if work order has declared invoice, starts on MAINTENANCE_INVOICE
assert.equal(
  resolveWorkOrderAttachmentInitialType({
    financialComponents: [{ hasInvoice: true }],
  }),
  'MAINTENANCE_INVOICE',
  'Manual opening on OS with declared invoice starts on MAINTENANCE_INVOICE'
);

// 4. Manual open: if work order has NO declared invoice, starts on MAINTENANCE_DOCUMENT
assert.equal(
  resolveWorkOrderAttachmentInitialType({
    financialComponents: [{ hasInvoice: false }, { hasInvoice: false }],
  }),
  'MAINTENANCE_DOCUMENT',
  'Manual opening on OS with NO declared invoice starts on MAINTENANCE_DOCUMENT'
);

assert.equal(
  resolveWorkOrderAttachmentInitialType({}),
  'MAINTENANCE_DOCUMENT',
  'Manual opening on OS without financial components starts on MAINTENANCE_DOCUMENT'
);

// 5. Source code assertions:
// createWorkOrder must not unconditionally call setAttachmentEntity(created)
assert.doesNotMatch(
  maintenanceSource,
  /setWoNumber\([^)]*\);\s*setAttachmentEntity\(created\);/,
  'createWorkOrder must not unconditionally open attachment modal'
);

// AttachmentModal documentType must use dynamic initial type rather than hardcoded string
assert.match(
  maintenanceSource,
  /<AttachmentModal[\s\S]*?documentType=\{attachmentInitialType\}/,
  'AttachmentModal must receive dynamic attachmentInitialType'
);

// Copy text in modal must not unconditionally claim that ERP opens attachments on creation
assert.doesNotMatch(
  maintenanceSource,
  /Após criar, o ERP abre os anexos para adicionar nota fiscal/,
  'Modal copy must be updated to reflect that attachments only auto-open when invoice is declared'
);

console.log('workOrderInvoiceModalAttachmentRegression: PASS');
