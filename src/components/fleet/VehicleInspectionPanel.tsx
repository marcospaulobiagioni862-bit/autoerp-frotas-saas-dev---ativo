import { useLocalFormDraft } from '../../hooks/useLocalFormDraft';
import React,{useEffect,useMemo,useState} from 'react';
import { ClipboardCheck,Plus,Smartphone,ArrowRightLeft,Camera,Shield,Eye,AlertTriangle,CheckCircle2,X } from 'lucide-react';
import { VehicleInspectionClient,type VehicleInspectionChecklist,type VehicleInspectionType,type VehicleInspection,type VehicleInspectionItemStatus,type VehicleInspectionTechnicalChecklist,type VehicleInspectionTechnicalKey,type VehicleInspectionResult,type InspectionComparisonPair } from '../../api/vehicleInspectionClient';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { FileUpload } from '../documents/FileUpload';
import { AttachmentList } from '../documents/AttachmentList';
import { VehicleInspectionWizardModal } from './VehicleInspectionWizardModal';
import { InspectionComparatorModal } from './InspectionComparatorModal';

const ITEMS=[
 ['keyMain','Chave principal'],['keySpare','Chave reserva'],['crlvPrinted','CRLV impresso'],
 ['phoneHolder','Suporte para celular'],['jack','Macaco'],['triangle','Triângulo'],
 ['wheelWrench','Chave de roda'],['spareTire','Estepe'],['seatCover','Capa de banco'],
 ['ownerManual','Manual do proprietário'],['floorMats','Tapetes'],['multimedia','Multimídia'],
] as const;

const TECHNICAL_ITEMS:[VehicleInspectionTechnicalKey,string][]=[
 ['tires','Pneus e rodas'],
 ['glassMirrors','Vidros e retrovisores'],
 ['bodyPaint','Carroceria e pintura'],
 ['interior','Interior'],
 ['dashboard','Painel e instrumentos'],
 ['lighting','Iluminação'],
 ['brakes','Freios'],
 ['suspension','Suspensão'],
 ['steering','Direção'],
 ['engine','Motor'],
 ['transmission','Transmissão'],
 ['safety','Itens de segurança'],
];
const TECHNICAL_OPTIONS:{value:VehicleInspectionItemStatus;label:string}[]=[
 {value:'OK',label:'OK'},
 {value:'ATTENTION',label:'Atenção'},
 {value:'FAILED',label:'Reprovado'},
 {value:'NOT_APPLICABLE',label:'Não se aplica'},
];
const CRITICAL_KEYS=new Set<VehicleInspectionTechnicalKey>(['tires','brakes','steering','safety']);

function derivePreview(items:Partial<Record<VehicleInspectionTechnicalKey,VehicleInspectionItemStatus>>):VehicleInspectionResult|null{
 if(!TECHNICAL_ITEMS.every(([key])=>Boolean(items[key]))) return null;
 for(const [key] of TECHNICAL_ITEMS){
 if(items[key]==='FAILED'&&CRITICAL_KEYS.has(key)) return 'BLOCKED_FOR_RENTAL';
 }
 if(TECHNICAL_ITEMS.some(([key])=>items[key]==='FAILED')) return 'FAILED';
 if(TECHNICAL_ITEMS.some(([key])=>items[key]==='ATTENTION')) return 'APPROVED_WITH_RESERVATIONS';
 return 'APPROVED';
}
function resultLabel(result:VehicleInspectionResult|undefined):string{
 if(result==='APPROVED')return 'Aprovado';
 if(result==='APPROVED_WITH_RESERVATIONS')return 'Aprovado com ressalvas';
 if(result==='FAILED')return 'Reprovado';
 if(result==='BLOCKED_FOR_RENTAL')return 'Bloqueado para locação';
 return 'Vistoria legada';
}

function emptyChecklist():VehicleInspectionChecklist{
 return Object.fromEntries(ITEMS.map(([key])=>[key,false])) as unknown as VehicleInspectionChecklist;
}

export function VehicleInspectionPanel({
 vehicleId,
 currentKm,
 vehiclePlate='VEÍCULO',
 vehicleModel='',
 contractId,
 driverId,
 driverName,
}:{
 vehicleId:string;
 currentKm:number;
 vehiclePlate?:string;
 vehicleModel?:string;
 contractId?:string;
 driverId?:string;
 driverName?:string;
}){
 const[items,setItems]=useState<VehicleInspection[]>([]);
 const[type,setType]=useState<VehicleInspectionType>('EXIT');
 const[odometer,setOdometer]=useState(String(currentKm));
 const[fuelLevel,setFuelLevel]=useState('100');
 const[notes,setNotes]=useState('');
 const[tireBrand,setTireBrand]=useState(''),[tireModel,setTireModel]=useState(''),[tireMeasure,setTireMeasure]=useState('');
 const[batteryBrand,setBatteryBrand]=useState(''),[batteryModel,setBatteryModel]=useState('');
 const[checklist,setChecklist]=useState<VehicleInspectionChecklist>(emptyChecklist());
 const[technicalChecklist,setTechnicalChecklist]=useState<Partial<Record<VehicleInspectionTechnicalKey,VehicleInspectionItemStatus>>>({});
 const[loading,setLoading]=useState(false);
 const[error,setError]=useState<string|null>(null);
 const[expanded,setExpanded]=useState<string|null>(null);
 const[wizardOpen,setWizardOpen]=useState(false);
 const[comparatorOpen,setComparatorOpen]=useState(false);
 const[comparisonData,setComparisonData]=useState<InspectionComparisonPair|null>(null);
 const[comparatorLoading,setComparatorLoading]=useState(false);
 const[previewImage,setPreviewImage]=useState<{url:string;label:string}|null>(null);

 const load=async()=>{try{setItems(await VehicleInspectionClient.list(vehicleId));}catch(e){setError(e instanceof Error?e.message:'Falha ao carregar vistorias.');}};
 useEffect(()=>{void load();},[vehicleId]);
 useEffect(()=>{setOdometer(String(currentKm));},[currentKm]);
 const checked=useMemo(()=>Object.values(checklist).filter(Boolean).length,[checklist]);
 const technicalCompleted=useMemo(()=>TECHNICAL_ITEMS.filter(([key])=>Boolean(technicalChecklist[key])).length,[technicalChecklist]);
 const resultPreview=useMemo(()=>derivePreview(technicalChecklist),[technicalChecklist]);

 const formDraft = useLocalFormDraft(`inspection:${vehicleId}`, { type, odometer, fuelLevel, notes, tireBrand, tireModel, tireMeasure, batteryBrand, batteryModel, checklist, technicalChecklist }, draft => { setType(draft.type); setOdometer(draft.odometer); setFuelLevel(draft.fuelLevel); setNotes(draft.notes); setTireBrand(draft.tireBrand); setTireModel(draft.tireModel); setTireMeasure(draft.tireMeasure); setBatteryBrand(draft.batteryBrand); setBatteryModel(draft.batteryModel); setChecklist(draft.checklist); setTechnicalChecklist(draft.technicalChecklist); });

 const create=async()=>{
 setLoading(true);setError(null);
 try{
 const km=Number(odometer),fuel=Number(fuelLevel);
 if(!Number.isInteger(km)||km<currentKm)throw new Error('A KM da vistoria não pode ser menor que a KM atual do veículo.');
 if(!Number.isInteger(fuel)||fuel<0||fuel>100)throw new Error('Informe combustível entre 0% e 100%.');
 if(!resultPreview)throw new Error('Avalie todos os itens da vistoria técnica antes de salvar.');
 if(!tireBrand.trim()||!tireModel.trim()||!tireMeasure.trim()||!batteryBrand.trim()||!batteryModel.trim())throw new Error('Informe marca, modelo e medida dos pneus e marca/modelo da bateria.');
 const item=await VehicleInspectionClient.create(vehicleId,{
 inspectionType:type,odometer:km,fuelLevel:fuel,checklist,
 technicalChecklist:technicalChecklist as VehicleInspectionTechnicalChecklist,
 equipmentSnapshot:{tireBrand:tireBrand.trim(),tireModel:tireModel.trim(),tireMeasure:tireMeasure.trim(),batteryBrand:batteryBrand.trim(),batteryModel:batteryModel.trim()},
 notes:notes.trim()||undefined,
 });
 formDraft.clear();
 setItems(current=>[item,...current]);setExpanded(item.id);setNotes('');setChecklist(emptyChecklist());setTechnicalChecklist({});
 setTireBrand('');setTireModel('');setTireMeasure('');setBatteryBrand('');setBatteryModel('');
 }catch(e){setError(e instanceof Error?e.message:'Falha ao criar vistoria.');}
 finally{setLoading(false);}
 };

 const openComparator = async (targetId?: string) => {
 setComparatorLoading(true);
 try {
 const targetContractId = targetId || contractId || (items[0]?.contractId);
 if (!targetContractId) throw new Error('Nenhum contrato vinculado identificado para comparação.');
 const data = await VehicleInspectionClient.getComparison(targetContractId);
 setComparisonData(data);
 setComparatorOpen(true);
 } catch (e) {
 setError(e instanceof Error ? e.message : 'Falha ao carregar comparador de vistoria.');
 } finally {
 setComparatorLoading(false);
 }
 };

 return <div data-draft-dirty={formDraft.dirty} className="space-y-4">
 {/* Banner de Destaque: Vistoria Mobile no Pátio */}
 <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-raised p-4 text-white shadow-lg">
 <div className="space-y-0.5">
 <h4 className="flex items-center gap-2 font-bold text-base text-white">
 <Smartphone className="w-5 h-5 border-border" /> Vistoria Mobile no Pátio (Wizard 6 Passos)
 </h4>
 <p className="text-xs border-border">
 Câmera nativa traseira, fotos obrigatórias por ângulo, odômetro, diagrama de avarias e assinatura na tela.
 </p>
 </div>
 <div className="flex flex-wrap gap-2">
 <Button
 size="sm"
 variant="secondary"
 onClick={() => setWizardOpen(true)}
 className="bg-white text-badge-plum-t1-text hover:bg-badge-plum-t1-bg font-bold gap-1.5 shadow"
 >
 <Smartphone className="w-4 h-4" /> Iniciar Vistoria Mobile
 </Button>
 {items.length > 0 && (
 <Button
 size="sm"
 variant="outline"
 onClick={() => void openComparator()}
 isLoading={comparatorLoading}
 className="border-white/40 text-white hover:bg-white/10 font-bold gap-1.5"
 >
 <ArrowRightLeft className="w-4 h-4" /> Comparador Lado a Lado
 </Button>
 )}
 </div>
 </div>

 {wizardOpen && (
 <VehicleInspectionWizardModal
 vehicleId={vehicleId}
 vehiclePlate={vehiclePlate}
 vehicleModel={vehicleModel}
 currentKm={currentKm}
 contractId={contractId}
 driverId={driverId}
 driverName={driverName}
 onClose={() => setWizardOpen(false)}
 onSuccess={(newItem) => {
 setWizardOpen(false);
 setItems((curr) => [newItem, ...curr]);
 setExpanded(newItem.id);
 }}
 />
 )}

 {comparatorOpen && comparisonData && (
 <InspectionComparatorModal
 comparison={comparisonData}
 onClose={() => setComparatorOpen(false)}
 onSettle={() => {
 setComparatorOpen(false);
 void load();
 }}
 />
 )}

 <div className="rounded-xl border p-4 space-y-4">
 {formDraft.notice && <p role="status" className="text-xs text-graphite-500">{formDraft.notice}</p>}
 <div className="flex flex-wrap items-center justify-between gap-2">
 <div><h4 className="font-bold flex items-center gap-2"><ClipboardCheck className="w-4 h-4"/>Nova vistoria</h4><p className="text-xs text-graphite-500">Entrada e saída usam exatamente o mesmo checklist.</p></div>
 <div className="flex gap-2">
 <Button size="sm" variant={type==='ENTRY'?'primary':'outline'} onClick={()=>setType('ENTRY')}>Entrada</Button>
 <Button size="sm" variant={type==='EXIT'?'primary':'outline'} onClick={()=>setType('EXIT')}>Saída</Button>
 </div>
 </div>
 <div className="grid gap-3 sm:grid-cols-2">
 <Input label="Quilometragem" type="number" value={odometer} onChange={e=>setOdometer(e.target.value)}/>
 <Input label="Combustível (%)" type="number" min="0" max="100" value={fuelLevel} onChange={e=>setFuelLevel(e.target.value)}/>
 </div>
 <div className="rounded-xl border p-3 space-y-3">
 <p className="text-xs font-semibold text-graphite-700 dark:text-graphite-200">Pneus e bateria — estado na vistoria</p>
 <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
 <Input label="Marca dos pneus *" value={tireBrand} onChange={e=>setTireBrand(e.target.value)}/>
 <Input label="Modelo dos pneus *" value={tireModel} onChange={e=>setTireModel(e.target.value)}/>
 <Input label="Medida / dimensões dos pneus *" value={tireMeasure} onChange={e=>setTireMeasure(e.target.value)} placeholder="Ex.: 195/55 R15"/>
 <Input label="Marca da bateria *" value={batteryBrand} onChange={e=>setBatteryBrand(e.target.value)}/>
 <Input label="Modelo da bateria *" value={batteryModel} onChange={e=>setBatteryModel(e.target.value)}/>
 </div>
 </div>
 <div>
 <p className="text-xs font-semibold text-graphite-700 dark:text-graphite-200 mb-2">Checklist ({checked}/{ITEMS.length})</p>
 <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
 {ITEMS.map(([key,label])=><label key={key} className="flex items-center gap-2 rounded-lg border p-2 text-xs">
 <input type="checkbox" checked={checklist[key]} onChange={e=>setChecklist(v=>({...v,[key]:e.target.checked}))}/>
 <span>{label}</span>
 </label>)}
 </div>
 </div>
 <div className="space-y-2">
 <div className="flex flex-wrap items-center justify-between gap-2">
 <p className="text-xs font-semibold text-graphite-700 dark:text-graphite-200">Vistoria técnica ({technicalCompleted}/{TECHNICAL_ITEMS.length})</p>
 <strong className="text-xs">{resultPreview?resultLabel(resultPreview):'Resultado pendente'}</strong>
 </div>
 <div className="grid gap-2 sm:grid-cols-2">
 {TECHNICAL_ITEMS.map(([key,label])=><label key={key} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg border p-2 text-xs">
 <span>{label}{CRITICAL_KEYS.has(key)?' • crítico':''}</span>
 <select
 aria-label={label}
 value={technicalChecklist[key]||''}
 onChange={e=>setTechnicalChecklist(current=>({...current,[key]:e.target.value as VehicleInspectionItemStatus}))}
 className="rounded-md border border-graphite-300 bg-white px-2 py-1 text-xs dark:border-graphite-700 dark:bg-graphite-900"
 >
 <option value="">Avaliar...</option>
 {TECHNICAL_OPTIONS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
 </select>
 </label>)}
 </div>
 {resultPreview==='BLOCKED_FOR_RENTAL'&&<p className="rounded-lg border border-error-border bg-error-bg p-2 text-xs font-semibold text-error-text">Falha crítica: ao salvar, o veículo será bloqueado para locação. O desbloqueio nunca é automático.</p>}
 </div>
 <div><label className="text-xs font-semibold text-graphite-700 dark:text-graphite-200">Observações</label><textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-graphite-300 bg-white p-3 text-sm dark:border-graphite-700 dark:bg-graphite-900"/></div>
 {error&&<p className="rounded-lg bg-error-bg p-2 text-xs text-error-text">{error}</p>}
 <Button onClick={()=>void create()} disabled={loading} className="gap-2"><Plus className="w-4 h-4"/>{loading?'Salvando...':'Salvar vistoria'}</Button>
 </div>

 <div className="space-y-2">
 <h4 className="font-bold text-sm">Histórico de vistorias</h4>
 {items.length===0?<p className="rounded-xl border p-5 text-center text-xs text-graphite-500">Nenhuma vistoria registrada.</p>:items.map(item=><div key={item.id} className="rounded-xl border p-3 space-y-3">
 <button type="button" onClick={()=>setExpanded(expanded===item.id?null:item.id)} className="w-full text-left">
 <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
 <div><strong>{item.inspectionType==='ENTRY'?'Vistoria de entrada':'Vistoria de saída'}</strong><p className="text-graphite-500">{new Date(item.inspectionDate).toLocaleString('pt-BR')} • {resultLabel(item.result)}</p></div>
 <div className="text-right"><strong>{item.odometer.toLocaleString('pt-BR')} KM</strong><p className="text-graphite-500">Combustível: {item.fuelLevel}%</p></div>
 </div>
 </button>
 {expanded===item.id&&<div className="space-y-3 border-t pt-3">
 {item.inspectionType === 'ENTRY' && item.contractId && (
 <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-badge-plum-t1-border bg-badge-plum-t1-bg/20 p-2.5">
 <div className="text-xs">
 <p className="font-bold text-badge-plum-t1-text">Vistoria de devolução vinculada a contrato</p>
 <p className="text-[11px] text-graphite-500">Compare lado a lado com a vistoria de entrega para apurar desvios de KM, combustível e avarias.</p>
 </div>
 <Button
 size="sm"
 variant="outline"
 onClick={() => void openComparator(item.contractId)}
 isLoading={comparatorLoading}
 className="text-xs gap-1 font-semibold"
 >
 <ArrowRightLeft className="w-3.5 h-3.5" /> Comparar com Entrega
 </Button>
 </div>
 )}

 {Array.isArray(item.photos) && item.photos.length > 0 && (
 <div className="space-y-2">
 <p className="text-xs font-semibold text-graphite-700 dark:text-graphite-200 flex items-center gap-1.5">
 <Camera className="w-4 h-4 text-graphite-500" /> Fotos Registradas por Ângulo ({item.photos.length})
 </p>
 <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
 {item.photos.map((photo: any, pIdx: number) => (
 <div
 key={pIdx}
 onClick={() => photo.url && setPreviewImage({ url: photo.url, label: photo.label || photo.slot || 'Foto de vistoria' })}
 className="group relative aspect-[4/3] rounded-lg border border-graphite-200 dark:border-graphite-700 bg-graphite-100 dark:bg-graphite-800 overflow-hidden cursor-pointer hover:shadow-md transition-all"
 >
 {photo.url ? (
 <img src={photo.url} alt={photo.label || photo.slot} className="h-full w-full object-cover group-hover:scale-105 transition-transform" />
 ) : (
 <div className="flex items-center justify-center h-full text-[10px] text-graphite-400">Sem imagem</div>
 )}
 <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-1.5">
 <p className="text-[10px] font-bold text-white truncate">{photo.label || photo.slot}</p>
 </div>
 </div>
 ))}
 </div>
 </div>
 )}

 {(item.driverSignatureUrl || item.signatureRefused || item.isRemoteDropoff) && (
 <div className="rounded-lg border border-graphite-200 dark:border-graphite-800 p-3 space-y-1.5 bg-graphite-50/50 dark:bg-graphite-900/40 text-xs">
 <p className="font-semibold text-graphite-700 dark:text-graphite-200">Formalização & Assinatura</p>
 {item.driverSignatureUrl && (
 <div className="flex flex-wrap items-center gap-3">
 <img
 src={item.driverSignatureUrl}
 alt="Assinatura do condutor"
 className="h-12 border rounded bg-white p-1 max-w-[160px] object-contain cursor-pointer shadow-sm"
 onClick={() => setPreviewImage({ url: item.driverSignatureUrl!, label: 'Assinatura do condutor' })}
 />
 <span className="text-[11px] text-success-text font-medium flex items-center gap-1">
 <CheckCircle2 className="w-3.5 h-3.5" /> Assinado pelo condutor
 </span>
 </div>
 )}
 {item.signatureRefused && (
 <div className="text-warning-text font-medium text-[11px] flex items-center gap-1">
 <AlertTriangle className="w-3.5 h-3.5" /> Assinatura recusada: {item.signatureRefusalReason || 'Sem justificativa informada'}
 </div>
 )}
 {item.isRemoteDropoff && (
 <div className="text-info-text text-[11px]">
 Devolução remota / via guincho (assinatura presencial dispensada).
 </div>
 )}
 </div>
 )}

 {Array.isArray(item.damages) && item.damages.length > 0 && (
 <div className="rounded-lg border border-graphite-200 dark:border-graphite-800 p-3 space-y-1.5 text-xs">
 <p className="font-semibold text-graphite-700 dark:text-graphite-200 flex items-center gap-1 text-error-text">
 <AlertTriangle className="w-3.5 h-3.5" /> Avarias registradas ({item.damages.length})
 </p>
 <div className="grid gap-1 sm:grid-cols-2">
 {item.damages.map((d: any, dIdx: number) => (
 <div key={dIdx} className="flex justify-between rounded bg-graphite-50 dark:bg-graphite-800 px-2 py-1 text-[11px]">
 <span>{d.partName || d.partKey}: {d.damageType || 'Avaria'}</span>
 <strong className="text-error-text font-mono">R$ {(Number(d.repairCost) || 0).toFixed(2)}</strong>
 </div>
 ))}
 </div>
 </div>
 )}

 <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3 text-xs">{ITEMS.map(([key,label])=><div key={key} className="flex justify-between rounded bg-graphite-50 px-2 py-1 dark:bg-graphite-800"><span>{label}</span><strong>{item.checklist[key]?'OK':'Não'}</strong></div>)}</div>
 {item.equipmentSnapshot&&<div className="rounded-lg border p-3 text-xs"><p className="mb-2 font-semibold">Pneus e bateria registrados</p><div className="grid gap-1 sm:grid-cols-2"><p><strong>Pneus:</strong> {item.equipmentSnapshot.tireBrand} {item.equipmentSnapshot.tireModel} — {item.equipmentSnapshot.tireMeasure}</p><p><strong>Bateria:</strong> {item.equipmentSnapshot.batteryBrand} {item.equipmentSnapshot.batteryModel}</p></div></div>}
 {item.technicalChecklist&&<div className="space-y-2"><p className="text-xs font-semibold">Resultado técnico: {resultLabel(item.result)}</p><div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3 text-xs">{TECHNICAL_ITEMS.map(([key,label])=><div key={key} className="flex justify-between rounded bg-graphite-50 px-2 py-1 dark:bg-graphite-800"><span>{label}</span><strong>{TECHNICAL_OPTIONS.find(option=>option.value===item.technicalChecklist?.[key])?.label||'—'}</strong></div>)}</div></div>}
 {item.notes&&<p className="text-xs text-graphite-600 dark:text-graphite-300">{item.notes}</p>}

 <div className="flex items-center gap-2 rounded-lg bg-graphite-50 dark:bg-graphite-800/60 p-2.5 text-[11px] text-graphite-500">
 <Shield className="w-4 h-4 text-info-icon flex-shrink-0" />
 <span>Evidências e fotos protegidas por 90 dias após o encerramento do contrato (resguardo probatório de devolução).</span>
 </div>

 <div className="rounded-lg border p-3 space-y-3">
 <p className="text-xs font-semibold">Anexos e documentos complementares</p>
 <FileUpload entityType="VehicleInspection" entityId={item.id} documentType="INSPECTION_MEDIA" multiple allowedTypes={['image/jpeg','image/jpg','image/png','image/webp','video/mp4']} maxSizeMB={20} onUploadComplete={()=>void load()}/>
 <AttachmentList entityType="VehicleInspection" entityId={item.id}/>
 </div>
 </div>}
 </div>)}
 </div>

 {previewImage && (
 <div
 className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
 onClick={() => setPreviewImage(null)}
 >
 <div
 className="relative max-w-4xl max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-graphite-900 overflow-hidden shadow-2xl"
 onClick={(e) => e.stopPropagation()}
 >
 <div className="flex items-center justify-between border-b p-3">
 <span className="font-bold text-sm text-graphite-800 dark:text-graphite-200">{previewImage.label}</span>
 <button
 type="button"
 onClick={() => setPreviewImage(null)}
 className="rounded-lg p-1 text-graphite-400 hover:bg-graphite-100 dark:hover:bg-graphite-800"
 >
 <X className="w-5 h-5" />
 </button>
 </div>
 <div className="p-2 overflow-auto flex items-center justify-center max-h-[80vh]">
 <img src={previewImage.url} alt={previewImage.label} className="max-h-[75vh] w-auto rounded object-contain" />
 </div>
 </div>
 </div>
 )}
 </div>;
}
