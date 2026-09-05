import type { FileAttachment } from '../types/entities';

export type TrafficTicketDocumentIntakeStatus=
  |'DRAFT'|'DOCUMENT_UPLOADED'|'EXTRACTING'|'REVIEW_REQUIRED'|'APPROVED'|'CONSUMED'|'FAILED'|'ARCHIVED';

export interface TrafficTicketDocumentIntake {
  id:string;companyId:string;createdBy:string;status:TrafficTicketDocumentIntakeStatus;idempotencyKey:string;
  documentType:'TRAFFIC_TICKET';attachmentId?:string;approvedExtractionId?:string;trafficTicketId?:string;
  expiresAt:string;consumedAt?:string;archivedAt?:string;createdAt:string;updatedAt:string;
}
export interface TrafficTicketDocumentAiExtraction {
  id:string;attachmentId:string;attachmentChecksum:string;status:string;createdAt:string;updatedAt:string;
}
export type TrafficTicketDraftField='plate'|'noticeNumber'|'organName'|'infractionCode'|'description'|'infractionDate'|'infractionTime'|'infractionLocation'|'dueDate'|'discountDueDate'|'amount'|'discountAmount'|'points';
export interface ApprovedTrafficTicketDraft {documentType:'TRAFFIC_TICKET';fields:Partial<Record<TrafficTicketDraftField,string|number>>;}
export interface TrafficTicketIntakeSuggestions {
  plate?:string;vehicle?:{id:string;plate:string;brand:string;model:string};contract?:{id:string;number:string};driver?:{id:string;name:string};ambiguous:boolean;
}

function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid traffic ticket intake payload');return value as Record<string,unknown>;}
async function errorMessage(response:Response):Promise<string>{try{const payload=record(await response.json());if(typeof payload.error==='string')return payload.error;}catch{}return `Traffic ticket intake request failed (${response.status})`;}
function validateIntake(value:unknown):TrafficTicketDocumentIntake{
  const item=record(value),statuses=new Set(['DRAFT','DOCUMENT_UPLOADED','EXTRACTING','REVIEW_REQUIRED','APPROVED','CONSUMED','FAILED','ARCHIVED']);
  for(const key of ['id','companyId','createdBy','status','idempotencyKey','documentType','expiresAt','createdAt','updatedAt'])if(typeof item[key]!=='string')throw new Error('Invalid traffic ticket intake payload');
  if(!statuses.has(String(item.status))||item.documentType!=='TRAFFIC_TICKET')throw new Error('Invalid traffic ticket intake payload');
  return item as unknown as TrafficTicketDocumentIntake;
}
function validateDraft(value:unknown):ApprovedTrafficTicketDraft{
  const draft=record(value);if(draft.documentType!=='TRAFFIC_TICKET')throw new Error('Invalid approved traffic ticket draft');
  const fields=record(draft.fields),allowed=new Set<TrafficTicketDraftField>(['plate','noticeNumber','organName','infractionCode','description','infractionDate','infractionTime','infractionLocation','dueDate','discountDueDate','amount','discountAmount','points']);
  for(const [key,value] of Object.entries(fields))if(!allowed.has(key as TrafficTicketDraftField)||(typeof value!=='string'&&typeof value!=='number'))throw new Error('Invalid approved traffic ticket draft');
  return {documentType:'TRAFFIC_TICKET',fields:fields as ApprovedTrafficTicketDraft['fields']};
}
function validateAttachment(value:unknown):FileAttachment{
  const item=record(value);for(const key of ['id','companyId','entityType','entityId','fileName','mimeType','createdAt'])if(typeof item[key]!=='string')throw new Error('Invalid traffic ticket intake attachment');
  if(item.entityType!=='TrafficTicketDocumentIntake'||item.documentType!=='TRAFFIC_TICKET')throw new Error('Invalid traffic ticket intake attachment');
  return item as unknown as FileAttachment;
}

export class TrafficTicketDocumentIntakeClient {
  static async create(idempotencyKey:string):Promise<TrafficTicketDocumentIntake>{
    const response=await fetch('/api/traffic-ticket-document-intakes',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({idempotencyKey})});
    if(!response.ok)throw new Error(await errorMessage(response));return validateIntake(record(await response.json()).item);
  }
  static async upload(id:string,file:File):Promise<FileAttachment>{
    const headers=new Headers();headers.set('content-type',file.type);headers.set('x-autoerp-file-name',encodeURIComponent(file.name));
    const response=await fetch(`/api/traffic-ticket-document-intakes/${encodeURIComponent(id)}/attachment`,{method:'POST',credentials:'include',headers,body:file});
    if(!response.ok)throw new Error(await errorMessage(response));return validateAttachment(record(await response.json()).item);
  }
  static async analyze(id:string):Promise<TrafficTicketDocumentAiExtraction>{
    const response=await fetch(`/api/traffic-ticket-document-intakes/${encodeURIComponent(id)}/document-ai`,{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:'{}'});
    if(!response.ok)throw new Error(await errorMessage(response));const item=record(record(await response.json()).item);
    for(const key of ['id','attachmentId','attachmentChecksum','status','createdAt','updatedAt'])if(typeof item[key]!=='string')throw new Error('Invalid traffic ticket document AI payload');
    return item as unknown as TrafficTicketDocumentAiExtraction;
  }
  static async getApprovedDraft(id:string):Promise<ApprovedTrafficTicketDraft>{
    const response=await fetch(`/api/traffic-ticket-document-intakes/${encodeURIComponent(id)}/approved-draft`,{credentials:'include'});if(!response.ok)throw new Error(await errorMessage(response));return validateDraft(record(await response.json()).draft);
  }
  static async getSuggestions(id:string):Promise<TrafficTicketIntakeSuggestions>{
    const response=await fetch(`/api/traffic-ticket-document-intakes/${encodeURIComponent(id)}/suggestions`,{credentials:'include'});if(!response.ok)throw new Error(await errorMessage(response));
    const item=record(record(await response.json()).item);if(typeof item.ambiguous!=='boolean')throw new Error('Invalid traffic ticket suggestion payload');
    return item as unknown as TrafficTicketIntakeSuggestions;
  }
}
