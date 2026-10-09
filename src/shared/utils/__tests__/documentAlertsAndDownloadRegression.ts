import assert from 'node:assert/strict';
import { documentExpirationState, validateDocumentAlertSettings } from '../documentAlertSettings';
import { downloadBlob } from '../downloadBlob';
const today = new Date('2026-09-01T12:00:00Z');
for (const [date,color] of [['2026-08-31','RED'],['2026-09-08','RED'],['2026-09-09','YELLOW'],['2026-09-16','YELLOW'],['2026-09-17','GREEN']] as const) assert.equal(documentExpirationState(date,undefined,today)?.color,color);
assert.equal(documentExpirationState('2026-09-10',{redDays:10,yellowDays:20},today)?.color,'RED');
assert.equal(documentExpirationState('2026-09-18',{redDays:10,yellowDays:20},today)?.color,'YELLOW');
assert.equal(documentExpirationState('2026-02-30',undefined,today),null);
for (const settings of [{redDays:15,yellowDays:7},{redDays:-1,yellowDays:15},{redDays:1.5,yellowDays:15},{redDays:7,yellowDays:366},{redDays:7,yellowDays:15,companyId:'forged'}]) assert.throws(()=>validateDocumentAlertSettings(settings));
const events:string[]=[],timers:Array<()=>void>=[];
const oldURL=globalThis.URL,oldDocument=globalThis.document,oldWindow=globalThis.window;
try {
  (globalThis as any).URL={createObjectURL:()=>{events.push('create');return 'blob:test';},revokeObjectURL:()=>events.push('revoke')};
  (globalThis as any).document={body:{appendChild:()=>events.push('append')},createElement:()=>({click:()=>events.push('click'),remove:()=>events.push('remove')})};
  (globalThis as any).window={setTimeout:(callback:()=>void,delay:number)=>{assert.equal(delay,60000);timers.push(callback);}};
  downloadBlob(new Blob(['pdf']),'documento.pdf');
  assert.deepEqual(events,['create','append','click','remove'],'URL must stay usable after click');
  timers[0](); assert.equal(events.at(-1),'revoke');
} finally { globalThis.URL=oldURL;globalThis.document=oldDocument;globalThis.window=oldWindow; }
console.log('Document alert boundaries/configuration and deferred download URL cleanup: PASS');
