import React, { useEffect, useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { FileUpload } from '../documents/FileUpload';
import { AttachmentList } from '../documents/AttachmentList';
import { AttachmentClient } from '../../api/attachmentClient';
import { DocumentAiClient, type DocumentAiExtraction } from '../../api/documentAiClient';
import { VehicleClient } from '../../api/vehicleClient';
import type { Vehicle } from '../../types/entities';

interface VehicleCrlvImportPanelProps {
  vehicleId: string;
}

type ReviewField = {
  extractionKey: string;
  vehicleKey?: keyof Vehicle;
  label: string;
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
  { extractionKey: 'ownerName', label: 'Titular no CRLV' },
] as const;

function visibleValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return '—';
}

export const VehicleCrlvImportPanel: React.FC<VehicleCrlvImportPanelProps> = ({ vehicleId }) => {
  const [uploadCount, setUploadCount] = useState(0);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [approvedExtraction, setApprovedExtraction] = useState<DocumentAiExtraction | null>(null);
  const [selectedFields, setSelectedFields] = useState<Set<string>>(() => new Set());
  const [loadingReview, setLoadingReview] = useState(true);
  const [reviewError, setReviewError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingReview(true);
    setReviewError(null);

    Promise.all([
      VehicleClient.get(vehicleId),
      AttachmentClient.list({ entityType: 'Vehicle', entityId: vehicleId }),
      DocumentAiClient.list('APPROVED'),
    ])
      .then(([currentVehicle, attachments, approvedExtractions]) => {
        if (cancelled) return;
        const crlvAttachmentIds = new Set(
          attachments
            .filter((attachment) => !attachment.isArchived && attachment.documentType === 'CRLV')
            .map((attachment) => attachment.id),
        );
        const matching = approvedExtractions
          .filter((extraction) =>
            extraction.status === 'APPROVED' &&
            extraction.detectedDocumentType === 'CRLV' &&
            crlvAttachmentIds.has(extraction.attachmentId),
          )
          .sort((a, b) => Date.parse(b.approvedAt || b.updatedAt) - Date.parse(a.approvedAt || a.updatedAt));

        setVehicle(currentVehicle);
        setApprovedExtraction(matching[0] || null);
        setSelectedFields(new Set());
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setVehicle(null);
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

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 space-y-4">
      <div className="flex items-start gap-2">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
        <div>
          <h4 className="font-bold text-blue-900">Importar CRLV</h4>
          <p className="mt-1 text-[11px] text-blue-800">
            Envie o CRLV como documento do veículo. O arquivo original será preservado e a extração pela IA continuará como proposta para revisão humana; nenhum dado do veículo é alterado automaticamente.
          </p>
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
          <h5 className="font-bold text-slate-900">Revisão do CRLV aprovado</h5>
          <p className="text-[11px] text-slate-500">Compare o cadastro atual com os valores aprovados na revisão humana antes de qualquer aplicação.</p>
        </div>

        {loadingReview ? (
          <p className="text-xs text-slate-500">Carregando comparação...</p>
        ) : reviewError ? (
          <p className="text-xs text-red-600">{reviewError}</p>
        ) : !vehicle || !approvedExtraction ? (
          <p className="text-xs text-amber-700">Nenhum CRLV aprovado para este veículo. Faça a extração e conclua a revisão humana primeiro.</p>
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
            <button
              type="button"
              disabled
              className="rounded-md bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-500 cursor-not-allowed"
              title="A aplicação server-side autoritativa será habilitada na próxima etapa segura."
            >
              Aplicar selecionados ({selectedFields.size})
            </button>
            <p className="text-[11px] text-slate-500">A seleção é apenas para conferência nesta etapa; nenhum valor é enviado ao cadastro do veículo.</p>
          </>
        )}
      </div>
    </div>
  );
};