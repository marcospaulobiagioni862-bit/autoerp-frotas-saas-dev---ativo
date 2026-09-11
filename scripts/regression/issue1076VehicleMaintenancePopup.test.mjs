import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../src/components/fleet/VehicleDetailsModal.tsx', import.meta.url),
  'utf8',
);

test('#1076 keeps a writable maintenance report popup reference', () => {
  const popupOpen = "const popup=window.open('','_blank','width=1100,height=800')";
  const popupCheck = 'if(!popup){';
  const blockedMessage =
    "window.alert('Não foi possível abrir o relatório. Permita pop-ups para este site e tente novamente.')";
  const detachOpener = 'popup.opener=null;';
  const documentWrite = 'popup.document.write(';

  const popupOpenIndex = source.indexOf(popupOpen);
  const popupCheckIndex = source.indexOf(popupCheck, popupOpenIndex);
  const blockedMessageIndex = source.indexOf(blockedMessage, popupCheckIndex);
  const detachOpenerIndex = source.indexOf(detachOpener, blockedMessageIndex);
  const documentWriteIndex = source.indexOf(documentWrite, detachOpenerIndex);

  assert.ok(popupOpenIndex >= 0, 'window.open must omit noopener/noreferrer so its document remains writable');
  assert.ok(popupCheckIndex > popupOpenIndex, 'the blocked-popup guard must follow window.open');
  assert.ok(blockedMessageIndex > popupCheckIndex, 'a blocked popup must display a clear message');
  assert.ok(detachOpenerIndex > blockedMessageIndex, 'popup.opener must be cleared after the null guard');
  assert.ok(documentWriteIndex > detachOpenerIndex, 'document.write must happen only after popup.opener is cleared');
  assert.equal(
    source.includes("noopener,noreferrer,width=1100,height=800"),
    false,
    'the report popup must not use noopener/noreferrer in window.open',
  );
});
