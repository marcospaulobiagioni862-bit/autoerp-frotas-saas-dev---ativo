import React, { useEffect, useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { FileUpload } from '../documents/FileUpload';
import { AttachmentList } from '../documents/AttachmentList';
import { AttachmentClient } from '../../api/attachmentClient';
import { DocumentAiClient, type DocumentAiExtraction } from '../../api/documentAiClient';
import { VehicleClient } from '../../api/vehicleClient';
import type { Vehicle } from '../../types/entities';
import { FleetComplianceService } from '../../domain/services/FleetComplianceService';

interface VehicleCrlvImportPanelProps {
  vehicleId: string;
}

type ReviewField = {
  extractionKey: string;
  vehicleKey?: keyof Vehicle;
  label: string;
};

type CompletionField = {
  vehicleKey: keyof Vehicle;
  label: string;
  isComplete: (value: unknown) => boolean;
};

const REVIEW_FIELDS: readonly ReviewField[] = [
  { extractionKey: 'plate', vehicleKey: 'plate', label: 'Placa' },
  { extractionKey: 'renavam', vehicleKey: 'renavam', label: 'RENAVAM' },
  { extractionKey: 'chassis', vehicleKey: 'chassis', label: 'Chassi' },
  { extractionKey: 'brand', vehicleKey: 'brand', label: 'Marca' },
  { extractionKey: 'model', vehicleKey: 'model', label: 'Modelo' },
  { extractionKey: 'manufactureYear', vehicleKey: 'yearFabrication', label: 'Ano fabricação' },
  { extractionKey: 'modelYear', vehicleKey: 'yearModel', label: 'Ano modelo' },
  { extractionKey: 'fuel', vehicleKey: 'fuelType', label: 'Combustível' },
  { extractionKey: 'ownerName', vehicleKey: 'ownerName', label: 'Nome do Titular' },
  { extractionKey: 'ownerDocument', vehicleKey: 'ownerDocument', label: 'CPF/CNPJ do Titular' },
  { extractionKey: 'crlvExerciseYear', vehicleKey: 'crlvExerciseYear', label: 'Exercício CRLV' },
] as const;

const positiveNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0;
const nonEmptyText = (value: unknown) => typeof value === 'string' && value.trim().length > 0;

const POST_CRLV_COMPLETION_FIELDS: readonly CompletionField[] = [
  { vehicleKey: 'color', label: 'Cor', isComplete: nonEmptyText },
  { vehicleKey: 'category', label: 'Categoria', isComplete: nonEmptyText },
  { vehicleKey: 'currentKm', label: 'KM atual', isComplete: (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 },
  { vehicleKey: 'acquisitionValue', label: 'Valor de aquisição', isComplete: positiveNumber },
  { vehicleKey: 'currentValue', label: 'Valor comercial atual', isComplete: positiveNumber },
  { vehicleKey: 'rentalValueBase', label: 'Valor de aluguel semanal', isComplete: positiveNumber },
] as const;

function visibleValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return '—';
}

function comparableValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim().toLocaleUpperCase('pt-BR');
}

export const VehicleCrlvImportPanel: React.FC<VehicleCrlvImportPanelProps> = ({ vehicleId }) => {
  const [uploadCount, setUploadCount] = useState(0);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [hasCrlvAttachment, setHasCrlvAttachment] = useState(false);
  const [approvedExtraction, setApprovedExtraction] = useState<DocumentAiExtraction | null>(null);
  const [selectedFields, setSelectedFields] = useState<Set<string>>(() => new Set());
  const [loadingReview, setLoadingReview] = useState(true);
  const [applying, setApplying] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [applyNotice, setApplyNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingReview(true);
    setReviewError(null);
    setApplyNotice(null);

    Promise.all([
      VehicleClient.get(vehicleId),
      AttachmentClient.list({ entityType: 'Vehicle', entityId: vehicleId }),
      DocumentAiClient.list(),
    ])
      .then(([currentVehicle, attachments, approvedExtractions]) => {
        if (cancelled) return;
        const activeCrlvAttachments = attachments.filter(
          (attachment) => !attachment.isArchived && attachment.documentType === 'CRLV',
        );
        const crlvAttachmentIds = new Set(activeCrlvAttachments.map((attachment) => attachment.id));
        const matching = approvedExtractions
          .filter((extraction) =>
            crlvAttachmentIds.has(extraction.attachmentId) &&
            FleetComplianceService.isCrlvExtractionEligible(extraction, currentVehicle),
          )
          .sort((a, b) => Date.parse(b.approvedAt || b.createdAt || b.updatedAt) - Date.parse(a.approvedAt || a.createdAt || a.updatedAt));

        setVehicle(currentVehicle);
        setHasCrlvAttachment(activeCrlvAttachments.length > 0);
        setApprovedExtraction(matching[0] || null);
        setSelectedFields(new Set());
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setVehicle(null);
          setHasCrlvAttachment(false);
          setApprovedExtraction(null);
          setReviewError(error instanceof Error ? error.message : 'Não foi possível carregar a revisão do CRLV.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingReview(false);
      });

    return () => {
      cancelled = true;
    };
  }, [vehicleId, uploadCount]);

  const reviewedValues = useMemo(() => {
    if (!approvedExtraction) return {} as Record<string, unknown>;
    return {
      ...approvedExtraction.proposedFields,
      ...(approvedExtraction.corrections || {}),
    };
  }, [approvedExtraction]);

  const toggleField = (field: string) => {
    setSelectedFields((current) => {
      const next = new Set(current);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  };

  const selectableApprovedFields = useMemo(
    () => REVIEW_FIELDS
      .filter((field) =>
        Boolean(field.vehicleKey) &&
        (typeof reviewedValues[field.extractionKey] === 'string' || typeof reviewedValues[field.extractionKey] === 'number'),
      )
      .map((field) => field.extractionKey),
    [reviewedValues],
  );

  const appliedApprovedFields = useMemo(() => {
    if (!vehicle) return [] as string[];
    return REVIEW_FIELDS
      .filter((field) => {
        if (!field.vehicleKey) return false;
        const extracted = reviewedValues[field.extractionKey];
        if (typeof extracted !== 'string' && typeof extracted !== 'number') return false;
        return comparableValue(vehicle[field.vehicleKey]) === comparableValue(extracted);
      })
      .map((field) => field.extractionKey);
  }, [reviewedValues, vehicle]);

  const missingCompletionFields = useMemo(() => {
    if (!vehicle) return POST_CRLV_COMPLETION_FIELDS;
    return POST_CRLV_COMPLETION_FIELDS.filter((field) => !field.isComplete(vehicle[field.vehicleKey]));
  }, [vehicle]);

  const allApprovedApplied = selectableApprovedFields.length > 0 && selectableApprovedFields.every((field) => appliedApprovedFields.includes(field));
  const completionReady = Boolean(vehicle) && missingCompletionFields.length === 0;
  const stepCrlvSent = hasCrlvAttachment;
  const stepReviewed = stepCrlvSent && Boolean(approvedExtraction);
  const stepApplied = stepReviewed && allApprovedApplied;
  const stepCompletion = stepApplied && completionReady;
  const completedSteps = [stepCrlvSent, stepReviewed, stepApplied, stepCompletion].filter(Boolean).length;
  const progressPercent = completedSteps * 25;

  const applyFields = async (fields: string[]) => {
    if (!approvedExtraction || fields.length === 0 || applying) return;
    setApplying(true);
    setReviewError(null);
    setApplyNotice(null);
    try {
      const result = await VehicleClient.applyApprovedCrlv(vehicleId, approvedExtraction.id, fields);
      setVehicle(result.item);
      setSelectedFields(new Set());
      setApplyNotice(`${result.appliedFields.length} campo(s) copiado(s) do CRLV para o cadastro do veículo.`);
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : 'Não foi possível copiar os dados do CRLV.');
    } finally {
      setApplying(false);
    }
  };

  const applySelected = async () => {
    if (!approvedExtraction || selectedFields.size === 0 || applying) return;
    await applyFields(Array.from(selectedFields));
  };

  const applyAllApproved = async () => {
    await applyFields(selectableApprovedFields);
  };

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 space-y-4">
      <div className="flex items-start gap-2">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
        <div>
          <h4 className="font-bold text-blue-900">Importar CRLV</h4>
          <p className="mt-1 text-[11px] text-blue-800">
            Envie o CRLV como documento do veículo. O arquivo original será preservado e os dados extraídos pela IA podem ser aplicados ao cadastro do veículo.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-blue-200 bg-white p-3 space-y-2" aria-label="Progresso do cadastro pós-CRLV">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="font-semibold text-slate-800">Progresso CRLV → cadastro completo</span>
          <span className="font-bold text-blue-700">{progressPercent}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full bg-blue-600 transition-all" style={{ width: `${progressPercent}%` }} />
        </div>
        <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-600 sm:grid-cols-4">
          <span>{stepCrlvSent ? '✓' : '○'} CRLV enviado</span>
          <span>{stepReviewed ? '✓' : '○'} Leitura IA concluída</span>
          <span>{stepApplied ? '✓' : '○'} Dados aplicados</span>
          <span>{stepCompletion ? '✓' : '○'} Campos essenciais</span>
        </div>
      </div>

      <FileUpload
        entityType="Vehicle"
        entityId={vehicleId}
        documentType="CRLV"
        onUploadComplete={() => setUploadCount((value) => value + 1)}
      />
      <div key={uploadCount}>
        <AttachmentList entityType="Vehicle" entityId={vehicleId} />
      </div>

      <div className="rounded-lg border border-blue-200 bg-white p-3 space-y-3">
        <div>
          <h5 className="font-bold text-slate-900">Dados do CRLV extraído</h5>
          <p className="text-[11px] text-slate-500">Compare o cadastro atual com os valores lidos pela IA do CRLV antes de aplicar ao veículo.</p>
        </div>

        {loadingReview ? (
          <p className="text-xs text-slate-500">Carregando comparação...</p>
        ) : reviewError ? (
          <p className="text-xs text-red-600">{reviewError}</p>
        ) : !vehicle || !approvedExtraction ? (
          <p className="text-xs text-amber-700">Nenhum CRLV extraído para este veículo. Envie o documento do CRLV para realizar a leitura dos dados.</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="p-2">Aplicar</th>
                    <th className="p-2">Campo</th>
                    <th className="p-2">Valor atual</th>
                    <th className="p-2">Valor lido</th>
                  </tr>
                </thead>
                <tbody>
                  {REVIEW_FIELDS.map((field) => {
                    const extracted = reviewedValues[field.extractionKey];
                    const current = field.vehicleKey ? vehicle[field.vehicleKey] : undefined;
                    const selectable = Boolean(field.vehicleKey) && (typeof extracted === 'string' || typeof extracted === 'number');
                    return (
                      <tr key={field.extractionKey} className="border-t">
                        <td className="p-2">
                          {selectable ? (
                            <input
                              type="checkbox"
                              aria-label={`Selecionar ${field.label}`}
                              checked={selectedFields.has(field.extractionKey)}
                              onChange={() => toggleField(field.extractionKey)}
                            />
                          ) : '—'}
                        </td>
                        <td className="p-2 font-medium">{field.label}</td>
                        <td className="p-2 font-mono">{visibleValue(current)}</td>
                        <td className="p-2 font-mono">{visibleValue(extracted)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={applying || selectableApprovedFields.length === 0}
                onClick={applyAllApproved}
                className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
              >
                {applying ? 'Copiando...' : `Copiar todos os dados extraídos (${selectableApprovedFields.length})`}
              </button>
              <button
                type="button"
                disabled={applying || selectedFields.size === 0}
                onClick={applySelected}
                className="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
              >
                {applying ? 'Copiando...' : `Copiar selecionados (${selectedFields.size})`}
              </button>
            </div>
            <p className="text-[11px] text-slate-500">Os dados lidos do CRLV podem ser copiados para o cadastro do veículo. O servidor relê o CRLV e aplica somente os campos autorizados.</p>
            {applyNotice && <p className="text-xs font-medium text-emerald-700">{applyNotice}</p>}
          </>
        )}
      </div>

      {vehicle && approvedExtraction && (
        <div className={`rounded-lg border p-3 space-y-2 ${completionReady ? 'border-emerald-200 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h5 className="font-bold text-slate-900">Etapa obrigatória: completar dados que não vêm no CRLV</h5>
              <p className="text-[11px] text-slate-600">A IA não deve inventar valores operacionais ou patrimoniais. Confira e edite esses dados manualmente no cadastro do veículo.</p>
            </div>
            <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-slate-700">
              {POST_CRLV_COMPLETION_FIELDS.length - missingCompletionFields.length}/{POST_CRLV_COMPLETION_FIELDS.length} preenchidos
            </span>
          </div>
          <div className="grid gap-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
            {POST_CRLV_COMPLETION_FIELDS.map((field) => {
              const complete = field.isComplete(vehicle[field.vehicleKey]);
              return (
                <div key={field.vehicleKey} className="rounded-md border bg-white px-2 py-1.5">
                  <span className={complete ? 'font-semibold text-emerald-700' : 'font-semibold text-amber-800'}>{complete ? '✓' : '○'} {field.label}</span>
                  <span className="ml-1 text-slate-500">{complete ? visibleValue(vehicle[field.vehicleKey]) : 'pendente'}</span>
                </div>
              );
            })}
          </div>
          {!completionReady && <p className="text-[11px] font-medium text-amber-800">Cadastro pós-CRLV ainda incompleto. Use “Registrar KM” para o odômetro e “Editar Veículo” para os demais campos pendentes.</p>}
          {completionReady && <p className="text-[11px] font-medium text-emerald-800">Campos essenciais preenchidos. Confirme os valores antes de considerar o cadastro concluído.</p>}
          <p className="text-[10px] text-slate-500">FIPE será tratada como consulta externa separada: não substituirá automaticamente o valor de aquisição nem o valor comercial informado pelo operador.</p>
        </div>
      )}
    </div>
  );
};