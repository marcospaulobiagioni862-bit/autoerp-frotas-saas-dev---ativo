import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Download, Eye, FileText } from 'lucide-react';
import { AttachmentClient } from '../../api/attachmentClient';
import { DriverClient } from '../../api/driverClient';
import type { Driver, FileAttachment } from '../../types/entities';
import { DocumentStatus } from '../../types/enums';
import { evaluateCnhCompliance } from '../../shared/utils/civilDate';
import { Button } from '../ui/Button';
import { DocumentPreviewModal } from '../documents/DocumentPreviewModal';

interface DriverCnhDocumentCardProps {
  driverId: string;
  refreshKey?: string | number;
}

function dateLabel(value?: string): string {
  if (!value) return 'não informada';
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString('pt-BR') : value;
}

export function DriverCnhDocumentCard({ driverId, refreshKey }: DriverCnhDocumentCardProps) {
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
  }, [driverId, refreshKey]);

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
  const cnhEval = driver?.cnhExpiration ? evaluateCnhCompliance(driver.cnhExpiration) : null;
  const isExpired = cnhEval?.status === DocumentStatus.EXPIRED;
  const isExpiring = cnhEval?.status === DocumentStatus.EXPIRING_SOON;

  const cardBorderClass = isExpired
    ? (cnhEval?.inGracePeriod
      ? 'border-warning-border bg-warning-bg  '
      : 'border-error-border bg-error-bg  ')
    : isExpiring
    ? 'border-warning-border bg-warning-bg  '
    : 'border-success-border bg-success-bg  ';

  const iconColorClass = isExpired
    ? (cnhEval?.inGracePeriod ? 'text-warning-icon' : 'text-error-icon')
    : isExpiring
    ? 'text-warning-icon'
    : 'text-success-icon';

  const statusBadge = cnhEval ? (
    isExpired ? (
      cnhEval.inGracePeriod ? (
        <span className="inline-flex items-center gap-1 rounded bg-warning-bg px-1.5 py-0.5 text-[10px] font-medium text-warning-text  ">
          <Clock className="h-3 w-3" /> Vencida ({cnhEval.graceDaysRemaining}d de tolerância CTB)
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 rounded bg-error-bg px-1.5 py-0.5 text-[10px] font-medium text-error-text  ">
          <AlertTriangle className="h-3 w-3" /> Vencida há {Math.abs(cnhEval.daysToExpiration)}d
        </span>
      )
    ) : isExpiring ? (
      <span className="inline-flex items-center gap-1 rounded bg-warning-bg px-1.5 py-0.5 text-[10px] font-medium text-warning-text  ">
        <Clock className="h-3 w-3" /> Vence em {cnhEval.daysToExpiration}d
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 rounded bg-success-bg px-1.5 py-0.5 text-[10px] font-medium text-success-text  ">
        <CheckCircle2 className="h-3 w-3" /> Válida ({cnhEval.daysToExpiration}d restantes)
      </span>
    )
  ) : null;

  if (loading) {
    return <div className="rounded-lg border p-3 text-xs text-graphite-500">Carregando CNH vigente…</div>;
  }

  if (!attachment) {
    return (
      <div className="rounded-lg border border-warning-border bg-warning-bg p-3 text-xs text-warning-text   ">
        <div className="flex items-center gap-2">
          <strong>CNH — arquivo vigente pendente</strong>
          {statusBadge}
        </div>
        <div className="mt-1">Validade cadastrada: {dateLabel(driver?.cnhExpiration)} • EAR: {earLabel}</div>
        {error && <div className="mt-1 text-error-icon">{error}</div>}
      </div>
    );
  }

  return (
    <>
      <div className={`flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between ${cardBorderClass}`}>
        <div className="flex min-w-0 items-center gap-3">
          <FileText className={`h-5 w-5 shrink-0 ${iconColorClass}`} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">CNH vigente</span>
              {statusBadge}
            </div>
            <div className="truncate text-[11px] text-graphite-500">
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
        {error && <div className="text-xs text-error-icon sm:basis-full">{error}</div>}
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
