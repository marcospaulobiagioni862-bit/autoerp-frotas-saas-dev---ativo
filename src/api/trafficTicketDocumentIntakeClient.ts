export type TrafficTicketDocumentIntakeStatus =
  | 'DRAFT' | 'DOCUMENT_UPLOADED' | 'EXTRACTING' | 'REVIEW_REQUIRED' | 'APPROVED' | 'CONSUMED' | 'FAILED' | 'ARCHIVED';

export interface TrafficTicketDocumentIntake {
  id:string;
  companyId:string;
  createdBy:string;
  status:TrafficTicketDocumentIntakeStatus;
  idempotencyKey:string;
  attachmentId?:string;
  approvedExtractionId?:string;
  trafficTicketId?:string;
  expiresAt:string;
  consumedAt?:string;
  archivedAt?:string;
  createdAt:string;
  updatedAt:string;
}

function record(value:unknown):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid traffic ticket document intake payload');
  return value as Record<string,unknown>;
}
function validate(value:unknown):TrafficTicketDocumentIntake{
  const item=record(value);
  const statuses=new Set(['DRAFT','DOCUMENT_UPLOADED','EXTRACTING','REVIEW_REQUIRED','APPROVED','CONSUMED','FAILED','ARCHIVED']);
  for(const key of ['id','companyId','createdBy','status','idempotencyKey','expiresAt','createdAt','updatedAt']){
    if(typeof item[key]!=='string')throw new Error('Invalid traffic ticket document intake payload');
  }
  if(!statuses.has(String(item.status)))throw new Error('Invalid traffic ticket document intake payload');
  return item as unknown as TrafficTicketDocumentIntake;
}
async function errorMessage(response:Response):Promise<string>{
  try{const payload=record(await response.json());if(typeof payload.error==='string')return payload.error;}catch{}
  return `Traffic ticket document intake request failed (${response.status})`;
}

export class TrafficTicketDocumentIntakeClient{
  static async create(idempotencyKey:string):Promise<TrafficTicketDocumentIntake>{
    const response=await fetch('/api/traffic-ticket-document-intakes',{
      method:'POST',credentials:'include',headers:{'content-type':'application/json'},
      body:JSON.stringify({idempotencyKey}),
    });
    if(!response.ok)throw new Error(await errorMessage(response));
    return validate(record(await response.json()).item);
  }
  static async get(id:string):Promise<TrafficTicketDocumentIntake>{
    const response=await fetch(`/api/traffic-ticket-document-intakes/${encodeURIComponent(id)}`,{credentials:'include'});
    if(!response.ok)throw new Error(await errorMessage(response));
    return validate(record(await response.json()).item);
  }
}
