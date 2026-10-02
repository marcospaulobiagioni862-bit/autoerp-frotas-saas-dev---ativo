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
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { TrafficTicketFormModal } from '../TrafficTicketFormModal';
import { TrafficTicketDocumentIntakeModal } from '../TrafficTicketDocumentIntakeModal';
import { TrafficTicketClient } from '../../../api/trafficTicketClient';
import { TrafficTicketDocumentIntakeClient } from '../../../api/trafficTicketDocumentIntakeClient';
import { DocumentAiClient } from '../../../api/documentAiClient';
import { VehicleClient } from '../../../api/vehicleClient';
import { DriverClient } from '../../../api/driverClient';
import { TicketResponsibility } from '../../../types/enums';

// Real modals and error clients; other API calls use memory doubles only.
const { act } = TestRenderer;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).document = { body:{style:{}},documentElement:{style:{}},querySelector:()=>null };
(globalThis as any).window = { addEventListener(){},removeEventListener(){},confirm:()=>true };
const friendly='Auto de infração já cadastrado';
const originalFetch=globalThis.fetch;
let requests=0;
globalThis.fetch=async()=>{requests++;return new Response(JSON.stringify({error:friendly}),{status:409,headers:{'content-type':'application/json'}});};
const vehicle:any={id:'vehicle',plate:'ABC1D23',brand:'Brand',model:'Model'};
VehicleClient.list=async()=>[vehicle];DriverClient.list=async()=>[];
TrafficTicketClient.categories=async()=>[{id:'expense',name:'Multas de trânsito',type:'BOTH'}];
const content=(node:any):string=>typeof node==='string'?node:Array.isArray(node)?node.map(content).join(' '):node?.children?content(node.children):'';
const button=(tree:any,label:string)=>tree.root.findAllByType('button').find((node:any)=>content(node.props.children).includes(label));
const field=(tree:any,label:string)=>{const node=tree.root.findAllByType('label').find((node:any)=>content(node.props.children).startsWith(label));assert(node,'missing field '+label);return node.findAll((item:any)=>['input','select','textarea'].includes(item.type))[0];};
const change=async(tree:any,label:string,value:string)=>{await act(async()=>{field(tree,label).props.onChange({target:{value}});});};
const values=(tree:any)=>tree.root.findAll((node:any)=>['input','select','textarea'].includes(node.type)).map((node:any)=>node.props.value);
try{
  let closed=0,succeeded=0,tree:any;
  await act(async()=>{tree=TestRenderer.create(React.createElement(TrafficTicketFormModal,{isOpen:true,onClose:()=>closed++,onSuccess:()=>succeeded++}));});
  for(const [label,value] of [['Veículo *','vehicle'],['Quem vai assumir',TicketResponsibility.COMPANY],['Auto de infração *','DUP-123'],['Órgão *','DETRAN'],['Código *','123'],['Descrição *','Preserved description'],['Data infração *','2026-09-01'],['Vencimento *','2026-09-30'],['Valor original *','200'],['Categoria Contas a Pagar','expense']] as const)await change(tree,label,value);
  const manualBefore=values(tree);const requestCount=requests;
  await act(async()=>{await tree.root.findByType('form').props.onSubmit({preventDefault(){}});});
  assert.equal(requests,requestCount+1);assert(content(tree.toJSON()).includes(friendly));assert.equal(closed,0);assert.equal(succeeded,0);assert.deepEqual(values(tree),manualBefore,'manual form erased data after conflict');
  await act(async()=>{tree.unmount();});

  const fields={plate:'ABC1D23',noticeNumber:'DUP-123',organName:'DETRAN',infractionCode:'123',description:'Preserved description',infractionDate:'2026-09-01',dueDate:'2026-09-30',amount:200,points:4};
  const extraction:any={id:'extraction',attachmentId:'attachment',status:'REVIEW_REQUIRED',proposedFields:fields,updatedAt:'2026-09-01T00:00:00Z'};
  TrafficTicketDocumentIntakeClient.create=async()=>({id:'intake'}) as any;
  TrafficTicketDocumentIntakeClient.upload=async()=>({id:'attachment'}) as any;
  TrafficTicketDocumentIntakeClient.analyze=async()=>({id:'extraction'}) as any;
  TrafficTicketDocumentIntakeClient.getApprovedDraft=async()=>({documentType:'TRAFFIC_TICKET',fields});
  TrafficTicketDocumentIntakeClient.getSuggestions=async()=>({plate:vehicle.plate,vehicle,ambiguous:false});
  DocumentAiClient.list=async()=>[extraction];DocumentAiClient.review=async()=>({...extraction,status:'APPROVED'});
  await act(async()=>{tree=TestRenderer.create(React.createElement(TrafficTicketDocumentIntakeModal,{isOpen:true,onClose:()=>closed++,onCreated:()=>succeeded++}));});
  await act(async()=>{button(tree,'Começar leitura com IA').props.onClick();});
  await act(async()=>{tree.root.findByProps({type:'file'}).props.onChange({target:{files:[new File(['%PDF'],'notice.pdf',{type:'application/pdf'})]},currentTarget:{value:'notice.pdf'}});});
  await act(async()=>{button(tree,'Atualizar análise').props.onClick();});
  await act(async()=>{button(tree,'Aprovar dados').props.onClick();});
  await change(tree,'Quem vai assumir',TicketResponsibility.COMPANY);await change(tree,'Categoria da despesa','expense');await change(tree,'Observações','Keep this draft');
  const intakeBefore=values(tree),beforeRequests=requests;
  await act(async()=>{button(tree,'Criar multa e Conta a Pagar').props.onClick();});
  assert.equal(requests,beforeRequests+1);assert(content(tree.toJSON()).includes(friendly));assert(content(tree.toJSON()).includes('DUP-123'));assert.equal(closed,0);assert.equal(succeeded,0);assert.deepEqual(values(tree),intakeBefore,'document form erased data after conflict');assert(button(tree,'Criar multa e Conta a Pagar'),'document modal closed after conflict');
  await act(async()=>{tree.unmount();});
  console.log('GAP 10 real manual/document modals: friendly conflict, remain open and preserve data PASS');
}finally{globalThis.fetch=originalFetch;}
