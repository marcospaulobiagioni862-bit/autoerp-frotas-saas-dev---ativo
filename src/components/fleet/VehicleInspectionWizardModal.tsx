import React, { useState, useRef } from 'react';
import {
  VehicleInspectionClient,
  type VehicleInspectionType,
  type VehicleInspection,
  type VehicleInspectionChecklist,
  type VehicleInspectionTechnicalChecklist,
  type VehicleInspectionTechnicalKey,
  type VehicleInspectionItemStatus,
  type InspectionPhotoSlotKey,
  type InspectionPhotoSlot,
  type InspectionDamageItem,
  type InspectionWashType,
} from '../../api/vehicleInspectionClient';
import { compressImage } from '../../utils/imageCompressor';
import { InspectionCarDamageDiagram } from './InspectionCarDamageDiagram';
import { Button } from '../ui/Button';
import {
  X,
  Camera,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  UploadCloud,
  FileText,
  Clock,
  Shield,
  Truck,
} from 'lucide-react';

interface VehicleInspectionWizardModalProps {
  vehicleId: string;
  vehiclePlate: string;
  vehicleModel: string;
  currentKm: number;
  contractId?: string;
  driverId?: string;
  driverName?: string;
  initialType?: VehicleInspectionType;
  onClose: () => void;
  onSuccess: (inspection: VehicleInspection) => void;
}

const ITEMS = [
  ['keyMain', 'Chave principal'],
  ['keySpare', 'Chave reserva'],
  ['crlvPrinted', 'CRLV impresso'],
  ['phoneHolder', 'Suporte celular'],
  ['jack', 'Macaco'],
  ['triangle', 'Triângulo'],
  ['wheelWrench', 'Chave de roda'],
  ['spareTire', 'Estepe'],
  ['seatCover', 'Capa de banco'],
  ['ownerManual', 'Manual'],
  ['floorMats', 'Tapetes'],
  ['multimedia', 'Multimídia'],
] as const;

const TECHNICAL_ITEMS: [VehicleInspectionTechnicalKey, string][] = [
  ['tires', 'Pneus e rodas (crítico)'],
  ['brakes', 'Freios (crítico)'],
  ['steering', 'Direção (crítico)'],
  ['safety', 'Itens de segurança (crítico)'],
  ['glassMirrors', 'Vidros e retrovisores'],
  ['bodyPaint', 'Carroceria e pintura'],
  ['interior', 'Interior e bancos'],
  ['dashboard', 'Painel e instrumentos'],
  ['lighting', 'Iluminação e faróis'],
  ['suspension', 'Suspensão'],
  ['engine', 'Motor'],
  ['transmission', 'Transmissão'],
];

const PHOTO_SLOTS: Array<{ key: InspectionPhotoSlotKey; label: string; required: boolean }> = [
  { key: 'DASHBOARD', label: 'Painel aceso (KM & Tanque)', required: true },
  { key: 'FRONT', label: 'Frente do veículo', required: true },
  { key: 'REAR', label: 'Traseira do veículo', required: true },
  { key: 'RIGHT', label: 'Lateral Direita', required: true },
  { key: 'LEFT', label: 'Lateral Esquerda', required: true },
  { key: 'SPARE_TIRE', label: 'Estepe & Kit de Ferramentas', required: true },
];

export function VehicleInspectionWizardModal({
  vehicleId,
  vehiclePlate,
  vehicleModel,
  currentKm,
  contractId,
  driverId,
  driverName,
  initialType = 'EXIT',
  onClose,
  onSuccess,
}: VehicleInspectionWizardModalProps) {
  const [step, setStep] = useState<number>(1);
  const [type, setType] = useState<VehicleInspectionType>(initialType);
  const [isRemoteDropoff, setIsRemoteDropoff] = useState(false);

  // Passo 2: Painel
  const [odometer, setOdometer] = useState(String(currentKm));
  const [fuelLevel, setFuelLevel] = useState(100);

  // Passo 3: Fotos por ângulo
  const [photos, setPhotos] = useState<Record<InspectionPhotoSlotKey, { dataUrl: string; file?: File }>>({
    DASHBOARD: { dataUrl: '' },
    FRONT: { dataUrl: '' },
    REAR: { dataUrl: '' },
    RIGHT: { dataUrl: '' },
    LEFT: { dataUrl: '' },
    SPARE_TIRE: { dataUrl: '' },
  });
  const [uploadingSlot, setUploadingSlot] = useState<InspectionPhotoSlotKey | null>(null);

  // Passo 4: Pneus e Equipamentos
  const [tireBrand, setTireBrand] = useState('Pirelli');
  const [tireModelText, setTireModelText] = useState('Cinturato P1');
  const [tireMeasure, setTireMeasure] = useState('185/65 R15');
  const [batteryBrand, setBatteryBrand] = useState('Moura');
  const [batteryModelText, setBatteryModelText] = useState('60Ah');
  const [checklist, setChecklist] = useState<Record<string, boolean>>(
    Object.fromEntries(ITEMS.map(([k]) => [k, true]))
  );
  const [technicalChecklist, setTechnicalChecklist] = useState<
    Record<VehicleInspectionTechnicalKey, VehicleInspectionItemStatus>
  >(Object.fromEntries(TECHNICAL_ITEMS.map(([k]) => [k, 'OK'])) as any);

  // Passo 5: Carroceria, Avarias e Higienização
  const [damages, setDamages] = useState<InspectionDamageItem[]>([]);
  const [washType, setWashType] = useState<InspectionWashType>('NONE');
  const [isInsuranceClaim, setIsInsuranceClaim] = useState(false);

  // Passo 6: Fechamento & Assinatura
  const [notes, setNotes] = useState('');
  const [signatureRefused, setSignatureRefused] = useState(false);
  const [signatureRefusalReason, setSignatureRefusalReason] = useState('');
  const [signatureDataUrl, setSignatureDataUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Captura e compressão de foto
  const handlePhotoCapture = async (slot: InspectionPhotoSlotKey, file: File) => {
    setUploadingSlot(slot);
    try {
      const compressed = await compressImage(file, { maxWidth: 1920, maxHeight: 1080, quality: 0.82 });
      setPhotos((prev) => ({
        ...prev,
        [slot]: { dataUrl: compressed.dataUrl, file: compressed.file },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao processar foto');
    } finally {
      setUploadingSlot(null);
    }
  };

  // Canvas de assinatura
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    if (canvasRef.current) {
      setSignatureDataUrl(canvasRef.current.toDataURL('image/png'));
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureDataUrl('');
  };

  // Envio final da vistoria
  const handleComplete = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const km = Number(odometer);
      if (!Number.isInteger(km) || km < currentKm) {
        throw new Error('A KM informada não pode ser menor que a KM atual do veículo.');
      }

      const photoList: InspectionPhotoSlot[] = (
        Object.entries(photos) as Array<[InspectionPhotoSlotKey, { dataUrl: string; file?: File }]>
      ).map(([key, item]) => ({
        slot: key,
        label: PHOTO_SLOTS.find((s) => s.key === key)?.label || key,
        url: item.dataUrl || undefined,
        timestamp: new Date().toISOString(),
      }));

      const created = await VehicleInspectionClient.create(vehicleId, {
        inspectionType: type,
        odometer: km,
        fuelLevel,
        contractId,
        driverId,
        checklist: checklist as unknown as VehicleInspectionChecklist,
        technicalChecklist: technicalChecklist as unknown as VehicleInspectionTechnicalChecklist,
        equipmentSnapshot: {
          tireBrand: tireBrand.trim(),
          tireModel: tireModelText.trim(),
          tireMeasure: tireMeasure.trim(),
          batteryBrand: batteryBrand.trim(),
          batteryModel: batteryModelText.trim(),
        },
        photos: photoList,
        damages,
        washType,
        washCost: washType === 'HEAVY' ? 80 : washType === 'ODOR_SMOKE' ? 250 : 0,
        isRemoteDropoff,
        insuranceClaimRequired: isInsuranceClaim,
        notes: notes.trim() || undefined,
        signedAt: new Date().toISOString(),
        driverSignatureUrl: signatureDataUrl || undefined,
        signatureRefused,
        signatureRefusalReason: signatureRefused ? signatureRefusalReason.trim() : undefined,
      });

      onSuccess(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar vistoria.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-2 sm:p-4 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl max-h-[96vh] flex flex-col rounded-2xl bg-white shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Cabeçalho do Stepper */}
        <div className="flex items-center justify-between border-b border-slate-100 p-4 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-violet-600 px-2 py-0.5 text-[11px] font-bold text-white">
                Passo {step} de 6
              </span>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                {step === 1 && '1. Identificação Operacional'}
                {step === 2 && '2. Painel (KM e Combustível)'}
                {step === 3 && '3. Ângulos Obrigatórios (360°)'}
                {step === 4 && '4. Pneus, Bateria & Ferramentas'}
                {step === 5 && '5. Carroceria & Avarias'}
                {step === 6 && '6. Fechamento & Assinatura'}
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {vehiclePlate} • {vehicleModel} {driverName ? `| ${driverName}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barra de Progresso */}
        <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800">
          <div
            className="h-full bg-violet-600 transition-all duration-300"
            style={{ width: `${(step / 6) * 100}%` }}
          />
        </div>

        {/* Corpo do Passo a Passo */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-400">
              {error}
            </div>
          )}

          {/* PASSO 1: Operação e Modalidade */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Tipo de Vistoria
                </label>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <button
                    type="button"
                    onClick={() => setType('EXIT')}
                    className={`rounded-xl border p-4 text-left transition-all ${
                      type === 'EXIT'
                        ? 'border-violet-600 bg-violet-50/60 ring-2 ring-violet-500/30 dark:bg-violet-950/20'
                        : 'border-slate-200 hover:border-slate-300 dark:border-slate-800'
                    }`}
                  >
                    <span className="font-bold text-sm block text-slate-900 dark:text-white">
                      Entrega (Saída / Check-out)
                    </span>
                    <span className="text-xs text-slate-500 mt-1 block">
                      Início da locação e entrega da chave ao condutor.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setType('ENTRY')}
                    className={`rounded-xl border p-4 text-left transition-all ${
                      type === 'ENTRY'
                        ? 'border-violet-600 bg-violet-50/60 ring-2 ring-violet-500/30 dark:bg-violet-950/20'
                        : 'border-slate-200 hover:border-slate-300 dark:border-slate-800'
                    }`}
                  >
                    <span className="font-bold text-sm block text-slate-900 dark:text-white">
                      Devolução (Entrada / Check-in)
                    </span>
                    <span className="text-xs text-slate-500 mt-1 block">
                      Encerramento da posse, acerto de caução e avarias.
                    </span>
                  </button>
                </div>
              </div>

              {type === 'ENTRY' && (
                <div className="rounded-xl border border-slate-200 p-3.5 space-y-2 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Truck className="w-4 h-4 text-slate-600" /> Modalidade de Devolução
                  </span>
                  <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={isRemoteDropoff}
                      onChange={(e) => setIsRemoteDropoff(e.target.checked)}
                      className="rounded border-slate-300 text-violet-600"
                    />
                    <span>
                      Devolução remota / Guincho / Sem condutor presente (dispensa assinatura presencial)
                    </span>
                  </label>
                </div>
              )}
            </div>
          )}

          {/* PASSO 2: Painel, KM e Combustível */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Odômetro Atual (KM) *
                  </label>
                  <input
                    type="number"
                    min={currentKm}
                    value={odometer}
                    onChange={(e) => setOdometer(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 font-mono text-base font-bold dark:border-slate-700 dark:bg-slate-900"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">KM mínima registrada: {currentKm} km</p>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Nível de Combustível ({fuelLevel}%) *
                  </label>
                  <div className="grid grid-cols-5 gap-1.5 mt-1">
                    {[0, 25, 50, 75, 100].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setFuelLevel(val)}
                        className={`rounded-lg py-2.5 text-xs font-bold transition-all ${
                          fuelLevel === val
                            ? 'bg-violet-600 text-white shadow-sm'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {val}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Foto do Painel */}
              <div className="rounded-xl border border-slate-200 p-4 space-y-3 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-violet-600" /> Foto do Painel (Ignição Ligada) *
                  </span>
                  {photos.DASHBOARD.dataUrl && (
                    <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Registrada
                    </span>
                  )}
                </div>

                {photos.DASHBOARD.dataUrl ? (
                  <div className="relative aspect-video rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800">
                    <img
                      src={photos.DASHBOARD.dataUrl}
                      alt="Painel"
                      className="h-full w-full object-cover"
                    />
                    <label className="absolute bottom-2 right-2 rounded-lg bg-black/60 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur cursor-pointer hover:bg-black/80">
                      Tirar outra foto
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handlePhotoCapture('DASHBOARD', f);
                        }}
                      />
                    </label>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 p-8 text-center cursor-pointer hover:border-violet-500 hover:bg-violet-50/30 dark:border-slate-700">
                    <Camera className="w-8 h-8 text-slate-400 mb-2" />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Abrir Câmera e Fotografar Painel
                    </span>
                    <span className="text-[11px] text-slate-500 mt-1">
                      Mostrando odômetro digital e ponteiro de combustível
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handlePhotoCapture('DASHBOARD', f);
                      }}
                    />
                  </label>
                )}
              </div>
            </div>
          )}

          {/* PASSO 3: Ângulos Obrigatórios */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">
                Fotografe os 4 ângulos externos do veículo e o estepe/kit de ferramentas. Todas as fotos são obrigatórias.
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                {PHOTO_SLOTS.filter((s) => s.key !== 'DASHBOARD').map((slot) => {
                  const hasPhoto = Boolean(photos[slot.key].dataUrl);
                  return (
                    <div
                      key={slot.key}
                      className="rounded-xl border border-slate-200 p-3 space-y-2 dark:border-slate-800"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {slot.label}
                        </span>
                        {hasPhoto ? (
                          <span className="text-emerald-600 font-semibold flex items-center gap-1 text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5" /> OK
                          </span>
                        ) : (
                          <span className="text-amber-500 font-semibold text-[11px]">Pendente</span>
                        )}
                      </div>

                      {hasPhoto ? (
                        <div className="relative aspect-[4/3] rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800">
                          <img
                            src={photos[slot.key].dataUrl}
                            alt={slot.label}
                            className="h-full w-full object-cover"
                          />
                          <label className="absolute bottom-1.5 right-1.5 rounded-md bg-black/60 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur cursor-pointer">
                            Alterar
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) void handlePhotoCapture(slot.key, f);
                              }}
                            />
                          </label>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 p-6 text-center cursor-pointer hover:border-violet-500 dark:border-slate-700">
                          <Camera className="w-6 h-6 text-slate-400 mb-1" />
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Capturar Foto
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) void handlePhotoCapture(slot.key, f);
                            }}
                          />
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* PASSO 4: Pneus, Bateria e Ferramentas */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 p-3.5 space-y-3 dark:border-slate-800">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Pneus e Bateria — Evidência de Fraude/Troca
                </p>
                <div className="grid gap-2 sm:grid-cols-3 text-xs">
                  <div>
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Marca Pneus *</label>
                    <input
                      type="text"
                      value={tireBrand}
                      onChange={(e) => setTireBrand(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Modelo Pneus *</label>
                    <input
                      type="text"
                      value={tireModelText}
                      onChange={(e) => setTireModelText(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Medida Pneus *</label>
                    <input
                      type="text"
                      value={tireMeasure}
                      onChange={(e) => setTireMeasure(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Marca Bateria *</label>
                    <input
                      type="text"
                      value={batteryBrand}
                      onChange={(e) => setBatteryBrand(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Modelo Bateria *</label>
                    <input
                      type="text"
                      value={batteryModelText}
                      onChange={(e) => setBatteryModelText(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900"
                    />
                  </div>
                </div>
              </div>

              {/* Itens e Acessórios */}
              <div>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">
                  Acessórios e Ferramentas Físicas
                </p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {ITEMS.map(([key, label]) => (
                    <label
                      key={key}
                      className="flex items-center gap-2 rounded-lg border p-2 text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <input
                        type="checkbox"
                        checked={checklist[key]}
                        onChange={(e) => setChecklist((v) => ({ ...v, [key]: e.target.checked }))}
                        className="rounded border-slate-300 text-violet-600"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* PASSO 5: Carroceria, Avarias e Higienização */}
          {step === 5 && (
            <div className="space-y-4">
              <InspectionCarDamageDiagram
                damages={damages}
                onAddDamage={(d) => setDamages((prev) => [...prev, { ...d, id: `dmg-${Date.now()}` }])}
                onRemoveDamage={(id) => setDamages((prev) => prev.filter((d) => d.id !== id))}
              />

              {/* Taxa de Higienização */}
              <div className="rounded-xl border border-slate-200 p-3.5 space-y-2 dark:border-slate-800">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Estado de Higienização e Limpeza
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { key: 'NONE', label: 'Limpo / OK', cost: 0 },
                    { key: 'STANDARD', label: 'Lavagem Simples', cost: 0 },
                    { key: 'HEAVY', label: 'Lama / Barro (R$ 80)', cost: 80 },
                    { key: 'ODOR_SMOKE', label: 'Odor Cigarro / Mancha (R$ 250)', cost: 250 },
                  ].map((w) => (
                    <button
                      key={w.key}
                      type="button"
                      onClick={() => setWashType(w.key as any)}
                      className={`rounded-lg p-2 text-xs font-semibold text-center transition-all ${
                        washType === w.key
                          ? 'bg-violet-600 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bifurcação de Sinistro / Seguro */}
              <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3.5 space-y-2 dark:border-rose-900/60 dark:bg-rose-950/20">
                <label className="flex items-center gap-2 text-xs font-bold text-rose-900 dark:text-rose-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isInsuranceClaim}
                    onChange={(e) => setIsInsuranceClaim(e.target.checked)}
                    className="rounded border-rose-400 text-rose-600"
                  />
                  <Shield className="w-4 h-4 text-rose-600" />
                  <span>Avaria Estrutural Grave / Acionar Sinistro e Coparticipação de Seguro</span>
                </label>
                {isInsuranceClaim && (
                  <p className="text-[11px] text-rose-700 dark:text-rose-300">
                    O laudo exigirá a anexação do Boletim de Ocorrência (B.O.) e cobrará a franquia de coparticipação estipulada em contrato.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* PASSO 6: Fechamento, Assinatura e Observações */}
          {step === 6 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Observações Gerais do Laudo
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: Veículo entregue higienizado, pneus novos..."
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                />
              </div>

              {/* Assinatura ou Recusa */}
              {!isRemoteDropoff ? (
                <div className="rounded-xl border border-slate-200 p-3.5 space-y-3 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Assinatura Digital do Condutor
                    </span>
                    <label className="flex items-center gap-1.5 text-xs text-rose-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={signatureRefused}
                        onChange={(e) => setSignatureRefused(e.target.checked)}
                        className="rounded border-rose-300 text-rose-600"
                      />
                      <span>Condutor recusou assinar</span>
                    </label>
                  </div>

                  {signatureRefused ? (
                    <div>
                      <label className="text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                        Motivo da recusa / contestação apontada pelo motorista *
                      </label>
                      <input
                        type="text"
                        value={signatureRefusalReason}
                        onChange={(e) => setSignatureRefusalReason(e.target.value)}
                        placeholder="Ex: Motorista não concordou com a cobrança do risco no parachoque..."
                        className="mt-1 w-full rounded-lg border border-rose-300 p-2 text-xs dark:border-rose-800 dark:bg-slate-900"
                      />
                    </div>
                  ) : (
                    <div>
                      <div className="relative rounded-lg border border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60 overflow-hidden">
                        <canvas
                          ref={canvasRef}
                          width={480}
                          height={160}
                          className="w-full touch-none cursor-crosshair bg-white dark:bg-slate-950"
                          onMouseDown={startDrawing}
                          onMouseMove={draw}
                          onMouseUp={stopDrawing}
                          onMouseLeave={stopDrawing}
                          onTouchStart={startDrawing}
                          onTouchMove={draw}
                          onTouchEnd={stopDrawing}
                        />
                        <button
                          type="button"
                          onClick={clearSignature}
                          className="absolute top-2 right-2 rounded bg-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300"
                        >
                          Limpar
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">
                        Assine com o dedo ou caneta na caixa acima dando o de acordo.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 text-xs text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/20 dark:text-blue-300">
                  Devolução remota / via guincho selecionada: a assinatura presencial foi dispensada. O laudo com as fotos será enviado automaticamente por WhatsApp.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rodapé com Navegação */}
        <div className="flex items-center justify-between border-t border-slate-100 p-4 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
          {step > 1 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStep((s) => s - 1)}
              className="gap-1 text-xs"
            >
              <ChevronLeft className="w-4 h-4" /> Voltar
            </Button>
          ) : (
            <div />
          )}

          {step < 6 ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                if (step === 2 && (!odometer || Number(odometer) < currentKm)) {
                  setError('Odômetro não pode ser menor que o atual.');
                  return;
                }
                if (step === 2 && !photos.DASHBOARD.dataUrl) {
                  setError('A foto do painel é obrigatória.');
                  return;
                }
                if (step === 3) {
                  const missing = PHOTO_SLOTS.find((s) => !photos[s.key].dataUrl);
                  if (missing) {
                    setError(`A foto '${missing.label}' é obrigatória.`);
                    return;
                  }
                }
                setError(null);
                setStep((s) => s + 1);
              }}
              className="gap-1 text-xs"
            >
              Avançar <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={() => void handleComplete()}
              disabled={submitting}
              className="gap-1 text-xs bg-emerald-600 hover:bg-emerald-700"
            >
              <CheckCircle2 className="w-4 h-4" />
              {submitting ? 'Salvando Vistoria...' : 'Concluir e Salvar Vistoria'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
