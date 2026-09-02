import React, { useEffect, useMemo, useState } from 'react';
import { FileCheck2 } from 'lucide-react';
import { AttachmentClient } from '../../api/attachmentClient';
import { VehicleClient } from '../../api/vehicleClient';
import type { FileAttachment } from '../../types/entities';
import { Button } from '../ui/Button';

const CRLV_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

function eligibleForCrlvHandoff(item: FileAttachment): boolean {
  return !item.isArchived &&
    item.contentState === 'AVAILABLE' &&
    (item.storageProvider === 'SERVER_FS' || item.storageProvider === 'R2') &&
    CRLV_MIME_TYPES.has(item.mimeType);
}

export function MaintenanceCrlvHandoffPanel({ workOrderId }: { workOrderId: string }) {
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void AttachmentClient.list({ entityType: 'MaintenanceWorkOrder', entityId: workOrderId })
      .then((items) => {
        if (!cancelled) setAttachments(items);
      })
      .catch((error: unknown) => {
        if (!cancelled) setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Falha ao verificar anexos da OS.' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [workOrderId]);

  const eligible = useMemo(() => attachments.filter(eligibleForCrlvHandoff), [attachments]);

  const reuse = async (attachment: FileAttachment) => {
    setBusyId(attachment.id);
    setMessage(null);
    try {
      const result = await VehicleClient.reuseMaintenanceCrlv(workOrderId, attachment.id);
      setMessage({
        kind: 'success',
        text: result.reused
          ? 'Este arquivo já está disponível como CRLV na ficha do veículo. Abra Veículos > Documentos para revisar a extração.'
          : 'CRLV reutilizado na ficha do veículo sem novo upload. Abra Veículos > Documentos para solicitar ou revisar a extração.',
      });
    } catch (error: unknown) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Falha ao reutilizar CRLV no veículo.' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900 dark:bg-blue-950/20">
      <div className="flex items-start gap-3">
        <FileCheck2 className="mt-0.5 h-5 w-5 text-blue-600" />
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">CRLV anexado na manutenção</h4>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            Anexar aqui não altera o cadastro do veículo. Se um destes arquivos for o CRLV, reutilize os mesmos bytes na ficha do veículo, sem fazer outro upload.
          </p>

          {loading ? <p className="mt-3 text-xs text-slate-500">Verificando anexos elegíveis...</p> : eligible.length === 0 ? (
            <p className="mt-3 text-xs text-slate-500">Nenhum PDF ou imagem disponível nesta OS para reutilização como CRLV.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {eligible.map((attachment) => (
                <div key={attachment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-100 bg-white p-2 dark:border-blue-900 dark:bg-slate-950">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-100">{attachment.fileName}</p>
                    <p className="text-[11px] text-slate-500">{attachment.mimeType} · {(attachment.fileSize / 1024).toFixed(1)} KB</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busyId !== null}
                    isLoading={busyId === attachment.id}
                    onClick={() => void reuse(attachment)}
                  >
                    Usar este CRLV para revisar dados do veículo
                  </Button>
                </div>
              ))}
            </div>
          )}

          {message && (
            <div className={`mt-3 rounded-lg border p-2 text-xs ${message.kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200' : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200'}`}>
              {message.text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}