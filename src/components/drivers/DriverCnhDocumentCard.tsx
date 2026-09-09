import React, { useEffect, useState } from 'react';
import { Download, Eye, FileText } from 'lucide-react';
import { AttachmentClient } from '../../api/attachmentClient';
import { DriverClient } from '../../api/driverClient';
import type { Driver, FileAttachment } from '../../types/entities';
import { Button } from '../ui/Button';
import { DocumentPreviewModal } from '../documents/DocumentPreviewModal';

interface DriverCnhDocumentCardProps {
  driverId: string;
}

function dateLabel(value?: string): string {
  if (!value) return 'não informada';
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString('pt-BR') : value;
}

export function DriverCnhDocumentCard({ driverId }: DriverCnhDocumentCardProps) {
  const [attachment, setAttachment] = useState<FileAttachment | null>(null);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setAttachment(null);
    setDriver(null);
    void Promise.all([
      AttachmentClient.list({ entityType: 'Driver', entityId: driverId }),
      DriverClient.get(driverId),
    ])
      .then(([items, loadedDriver]) => {
        if (cancelled) return;
        const current = items
          .filter((item) =>
            !item.isArchived &&
            String(item.documentType || '').toUpperCase() === 'CNH' &&
            item.contentState === 'AVAILABLE'
          )
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] || null;
        setAttachment(current);
        setDriver(loadedDriver);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Não foi possível carregar a CNH.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [driverId]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const openPreview = async () => {
    if (!attachment) return;
    setError(null);
    try {
      const blob = await AttachmentClient.content(attachment.id);
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return URL.createObjectURL(blob);
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível abrir a CNH.');
    }
  };

  const downloadOriginal = async () => {
    if (!attachment) return;
    setError(null);
    try {
      const blob = await AttachmentClient.content(attachment.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = attachment.fileName || 'CNH';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível baixar a CNH.');
    }
  };

  const earLabel = driver?.cnhEar === true ? 'Sim' : driver?.cnhEar === false ? 'Não' : 'Pendente';

  if (loading) {
    return <div className="rounded-lg border p-3 text-xs text-slate-500">Carregando CNH vigente…</div>;
  }

  if (!attachment) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
        <strong>CNH — arquivo vigente pendente</strong>
        <div className="mt-1">Validade cadastrada: {dateLabel(driver?.cnhExpiration)} • EAR: {earLabel}</div>
        {error && <div className="mt-1 text-rose-600">{error}</div>}
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 dark:border-emerald-900 dark:bg-emerald-950/20 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <FileText className="h-5 w-5 shrink-0 text-emerald-600" />
          <div className="min-w-0">
            <div className="text-sm font-semibold">CNH vigente</div>
            <div className="truncate text-[11px] text-slate-500">
              Validade: {dateLabel(driver?.cnhExpiration)} • EAR: {earLabel}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => void openPreview()}>
            <Eye className="mr-1 h-4 w-4" />Ver
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => void downloadOriginal()}>
            <Download className="mr-1 h-4 w-4" />Baixar
          </Button>
        </div>
        {error && <div className="text-xs text-rose-600 sm:basis-full">{error}</div>}
      </div>
      {previewUrl && attachment && (
        <DocumentPreviewModal
          url={previewUrl}
          type={attachment.mimeType}
          name={attachment.fileName}
          onClose={() => setPreviewUrl((current) => {
            if (current) URL.revokeObjectURL(current);
            return null;
          })}
        />
      )}
    </>
  );
}
