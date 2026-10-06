import assert from 'node:assert/strict';
import React, { useState } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { AuthContext } from '../../hooks/useAuth';
import { useLocalFormDraft } from '../../hooks/useLocalFormDraft';
import { draftKey, readFormDraft, writeFormDraft } from '../localFormDraft';
import { clearAllUnsavedChanges, hasUnsavedChanges, installUnsavedChangesBeforeUnload } from '../unsavedChangesAuthority';
import { NewVersionNotice } from '../../components/common/NewVersionNotice';

const items = new Map<string, string>();
const storage = {getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => {items.set(key,value);}, removeItem: (key: string) => {items.delete(key);}};
const listeners = new Map<string, Function>();
let consent = false, reloads = 0, closes = 0, poll!: () => void;
Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true, localStorage: storage, __AUTOERP_BUILD_ID__: 'old', window: {
  confirm: () => consent, addEventListener: (name: string, fn: Function) => listeners.set(name,fn), removeEventListener: (name: string) => listeners.delete(name),
  setInterval: (fn: () => void) => {poll=fn;return 1;}, clearInterval() {}, location: {reload: () => {reloads++;}},
}, fetch: async () => ({ok: true,json: async () => ({buildId:'new'})})});
const key=draftKey('company','user','long-form');
assert.notEqual(key,draftKey('other-company','user','long-form'));
assert.notEqual(key,draftKey('company','other-user','long-form'));
writeFormDraft(storage,key,{text:'saved'},100);
assert.deepEqual(readFormDraft(storage,key,{text:''},101),{text:'saved'});
assert.equal(readFormDraft(storage,key,{text:''},15*86400000),null);
assert.equal(readFormDraft(storage,key,{text:0},101),null);
items.set(key,'broken');assert.equal(readFormDraft(storage,key,{text:''}),null);items.clear();
let draft!: ReturnType<typeof useLocalFormDraft<{text:string}>>, setValue!: (value: {text:string}) => void;
function Form() {
  const [value,set]=useState({text:''});setValue=set;
  draft=useLocalFormDraft('long-form',value,set);
  return <span>{value.text}</span>;
}
const provider=(child: React.ReactNode) => <AuthContext.Provider value={{user:{id:'user',userId:'user',companyId:'company',name:'Tester',role:'ADMIN',active:true,permissions:['*']},authMode:'server-session',logout:async()=>{}}}>{child}</AuthContext.Provider>;
let tree!: TestRenderer.ReactTestRenderer;
await act(async()=>{tree=TestRenderer.create(provider(<Form/>));});
assert.equal(hasUnsavedChanges(),false);
await act(async()=>{setValue({text:'draft'});});
assert.equal(hasUnsavedChanges(),true);assert.equal(readFormDraft(storage,key,{text:''})?.text,'draft');
const remove=installUnsavedChangesBeforeUnload();let prevented=false;
const event={preventDefault(){prevented=true;},returnValue:undefined as unknown};listeners.get('beforeunload')!(event);
assert(prevented);assert.equal(event.returnValue,'');remove();
draft.close(()=>closes++);assert.equal(closes,0);
await act(async()=>{tree.unmount();});assert.equal(hasUnsavedChanges(),false);
await act(async()=>{tree=TestRenderer.create(provider(<Form/>));});
assert.equal(tree.root.findByType('span').children.join(''),'draft');assert.equal(hasUnsavedChanges(),true);
await act(async()=>{setValue({text:''});});assert.equal(hasUnsavedChanges(),false);assert.equal(items.has(key),false);
await act(async()=>{setValue({text:'persist'});});
await act(async()=>{draft.clear();setValue({text:''});});assert.equal(items.has(key),false);assert.equal(hasUnsavedChanges(),false);
await act(async()=>{setValue({text:'new edit'});});assert.equal(hasUnsavedChanges(),true);
let notice!: TestRenderer.ReactTestRenderer;
await act(async()=>{notice=TestRenderer.create(<NewVersionNotice/>);});
assert.equal(reloads,0,'a newer build must never reload automatically');
await act(async()=>{notice.root.findAllByType('button')[1].props.onClick();});assert.equal(reloads,0,'dirty form blocks reload when cancelled');
consent=true;await act(async()=>{notice.root.findAllByType('button')[1].props.onClick();});assert.equal(reloads,1);
await act(async()=>{notice.root.findAllByType('button')[0].props.onClick();});assert.equal(notice.toJSON(),null);
await act(async()=>{poll();});assert.equal(reloads,1);assert.equal(notice.toJSON(),null);
await act(async()=>{tree.unmount();notice.unmount();});clearAllUnsavedChanges();
console.log('Local drafts: isolation, expiry, restoration, revert, save reset, unload guard; version notice: manual guarded reload PASS');
