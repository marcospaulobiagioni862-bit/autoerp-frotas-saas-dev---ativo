import React,{useEffect,useMemo,useState} from 'react';
import type {FileAttachment} from '../../types/entities';
import {AttachmentClient} from '../../api/attachmentClient';
import {AttachmentList} from './AttachmentList';
import {FileUpload} from './FileUpload';
import {Badge,Button,Card,Input} from '../ui';
import {FileArchive,RefreshCw,Upload} from 'lucide-react';

type RootEntityType='Vehicle'|'Driver';
type FileKind='ALL'|'PHOTO'|'VIDEO'|'PDF'|'OTHER';
type FileOrigin='ALL'|'DOCUMENTS'|'CONTRACTS'|'TICKETS'|'MAINTENANCE'|'INSURANCE'|'TRACKER'|'INSPECTIONS'|'OTHER';
type UploadKind='DOCUMENT'|'PHOTO'|'VIDEO'|'OTHER';

const ORIGIN_LABELS:Record<FileOrigin,string>={
  ALL:'Todas as origens',
  DOCUMENTS:'Documentos',
  CONTRACTS:'Contratos',
  TICKETS:'Multas',
  MAINTENANCE:'Manutenção / OS',
  INSURANCE:'Seguro',
  TRACKER:'Rastreador',
  INSPECTIONS:'Vistorias',
  OTHER:'Outros',
};

function kindOf(item:FileAttachment):Exclude<FileKind,'ALL'>{
  if(item.mimeType.startsWith('image/'))return'PHOTO';
  if(item.mimeType.startsWith('video/'))return'VIDEO';
  if(item.mimeType==='application/pdf')return'PDF';
  return'OTHER';
}
function originOf(item:FileAttachment,root:RootEntityType):Exclude<FileOrigin,'ALL'>{
  if(item.entityType===root)return'DOCUMENTS';
  if(item.entityType==='Contract')return'CONTRACTS';
  if(item.entityType==='TrafficTicket')return'TICKETS';
  if(item.entityType==='MaintenanceWorkOrder')return'MAINTENANCE';
  if(item.entityType==='Insurance')return'INSURANCE';
  if(item.entityType==='Tracker')return'TRACKER';
  if(item.entityType==='VehicleInspection')return'INSPECTIONS';
  return'OTHER';
}
function kindLabel(kind:FileKind):string{
  return({ALL:'Todos os tipos',PHOTO:'Fotos',VIDEO:'Vídeos',PDF:'PDFs',OTHER:'Outros arquivos'} as const)[kind];
}

export function EntityFileGallery({entityType,entityId}:{entityType:RootEntityType;entityId:string}){
  const[items,setItems]=useState<FileAttachment[]>([]);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState<string|null>(null);
  const[search,setSearch]=useState('');
  const[kind,setKind]=useState<FileKind>('ALL');
  const[origin,setOrigin]=useState<FileOrigin>('ALL');
  const[from,setFrom]=useState('');
  const[to,setTo]=useState('');
  const[uploadKind,setUploadKind]=useState<UploadKind>('DOCUMENT');
  const[uploadOpen,setUploadOpen]=useState(false);

  const load=async()=>{setLoading(true);setError(null);try{setItems(await AttachmentClient.listEntityGallery(entityType,entityId));}catch(err){setError(err instanceof Error?err.message:'Falha ao carregar arquivos relacionados.');setItems([]);}finally{setLoading(false);}};
  useEffect(()=>{void load();},[entityType,entityId]);

  const availableOrigins=useMemo(()=>{
    const values=new Set<FileOrigin>(['ALL','DOCUMENTS','CONTRACTS','TICKETS','INSPECTIONS','OTHER']);
    if(entityType==='Vehicle'){values.add('MAINTENANCE');values.add('INSURANCE');values.add('TRACKER');}
    return Array.from(values);
  },[entityType]);

  const filtered=useMemo(()=>{
    const q=search.trim().toLocaleLowerCase('pt-BR');
    return items.filter(item=>{
      if(kind!=='ALL'&&kindOf(item)!==kind)return false;
      if(origin!=='ALL'&&originOf(item,entityType)!==origin)return false;
      const date=item.createdAt.slice(0,10);
      if(from&&date<from)return false;
      if(to&&date>to)return false;
      if(q&&![
        item.fileName,item.documentType,item.description,item.entityType,
        ORIGIN_LABELS[originOf(item,entityType)],kindLabel(kindOf(item)),
      ].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR').includes(q))return false;
      return true;
    });
  },[items,kind,origin,from,to,search,entityType]);

  const uploadConfig=uploadKind==='VIDEO'
    ?{documentType:'VIDEO',allowedTypes:['video/mp4'],maxSizeMB:10}
    :uploadKind==='PHOTO'
      ?{documentType:'PHOTO',allowedTypes:['image/jpeg','image/jpg','image/png','image/webp'],maxSizeMB:10}
      :uploadKind==='OTHER'
        ?{documentType:'OTHER',allowedTypes:['application/pdf','image/jpeg','image/jpg','image/png','image/webp'],maxSizeMB:10}
        :{documentType:entityType==='Vehicle'?'VEHICLE_DOCUMENT':'DRIVER_DOCUMENT',allowedTypes:['application/pdf','image/jpeg','image/jpg','image/png','image/webp'],maxSizeMB:10};

  return <div className="space-y-4">
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold">Arquivos</h3>
          <p className="text-[11px] text-slate-500">Uma única visão dos anexos diretos e relacionados. Os arquivos não são copiados.</p>
        </div>
        <div className="flex items-center gap-2"><Badge variant="neutral">{filtered.length} de {items.length}</Badge><Button type="button" size="sm" variant="outline" onClick={()=>void load()} disabled={loading}><RefreshCw className="h-3.5 w-3.5"/>Atualizar</Button><Button type="button" size="sm" onClick={()=>setUploadOpen(value=>!value)}><Upload className="h-3.5 w-3.5"/>{uploadOpen?'Fechar envio':'Enviar arquivo'}</Button></div>
      </div>

      {uploadOpen&&<div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
        <label className="mb-3 block text-xs font-semibold text-slate-600 dark:text-slate-300">Tipo do novo arquivo
          <select className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm dark:border-slate-700 dark:bg-slate-900" value={uploadKind} onChange={event=>setUploadKind(event.target.value as UploadKind)}>
            <option value="DOCUMENT">Documento</option><option value="PHOTO">Foto</option><option value="VIDEO">Vídeo MP4</option><option value="OTHER">Outro</option>
          </select>
        </label>
        <React.Fragment key={uploadKind}><FileUpload entityType={entityType} entityId={entityId} documentType={uploadConfig.documentType} allowedTypes={uploadConfig.allowedTypes} maxSizeMB={uploadConfig.maxSizeMB} multiple onUploadComplete={()=>void load()}/></React.Fragment>
        <p className="mt-2 text-[11px] text-slate-500">Limite atual do storage: 10 MB por arquivo. Vídeos aceitos somente em MP4.</p>
      </div>}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar nome, tipo, origem..."/>
        <select aria-label="Filtrar tipo de arquivo" className="rounded-lg border border-slate-300 bg-transparent p-2 text-xs dark:border-slate-700" value={kind} onChange={event=>setKind(event.target.value as FileKind)}>
          {(['ALL','PHOTO','VIDEO','PDF','OTHER'] as FileKind[]).map(value=><option key={value} value={value}>{kindLabel(value)}</option>)}
        </select>
        <select aria-label="Filtrar origem do arquivo" className="rounded-lg border border-slate-300 bg-transparent p-2 text-xs dark:border-slate-700" value={origin} onChange={event=>setOrigin(event.target.value as FileOrigin)}>
          {availableOrigins.map(value=><option key={value} value={value}>{ORIGIN_LABELS[value]}</option>)}
        </select>
        <Input type="date" value={from} onChange={event=>setFrom(event.target.value)} aria-label="Arquivos a partir da data"/>
        <Input type="date" value={to} onChange={event=>setTo(event.target.value)} aria-label="Arquivos até a data"/>
      </div>
      <div className="flex justify-end"><Button type="button" size="sm" variant="ghost" onClick={()=>{setSearch('');setKind('ALL');setOrigin('ALL');setFrom('');setTo('');}}>Limpar filtros</Button></div>
    </Card>

    {error&&<div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}
    {loading?<div className="rounded-lg border border-dashed p-8 text-center text-sm text-slate-500">Carregando arquivos...</div>:filtered.length===0?<div className="rounded-lg border border-dashed p-8 text-center text-sm text-slate-500"><FileArchive className="mx-auto mb-2 h-7 w-7"/>Nenhum arquivo corresponde aos filtros selecionados.</div>:<AttachmentList attachments={filtered} onRefresh={()=>void load()} showPdfActions protectLatestDriverCnh={entityType==='Driver'} showProtectedDriverCnh={entityType==='Driver'}/>}
  </div>;
}
