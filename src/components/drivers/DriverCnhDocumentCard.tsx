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

export function DriverCnhDocumentCard({ driverId }: DriverCnhDocumentCardProps) {
  const [attachment, setAttachment] = useState<FileAttachment | null>(null);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null); setAttachment(null); setDriver(null);
    void Promise.all([
      AttachmentClient.list({ entityType: 'Driver', entityId: driverId }),
      DriverClient.get(driverId),
    ])
      .then(([items, loadedDriver]) => {
        if (cancelled) return;
        const cnh = items
          .filter((item) => !item.isArchived && String(item.documentType || '').toUpperCase() === 'CNH' && item.contentState === 'AVAILABLE')
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] || null;
        setAttachment(cnh);
        setDriver(loadedDriver);
      })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Não foi possível carregar a CNH.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [driverId]);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const openPreview = async () => {
    if (!attachment) return;
    setError(null);
    try {
      const blob = await AttachmentClient.content(attachment.id);
      setPreviewUrl((current) => { if (current) URL.revokeObjectURL(current); return URL.createObjectURL(blob); });
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

  const earLabel = driver?.cnhEar === true ? 'Sim' : driver?.cnhEar === false ? 'Não' : 'Pendente de confirmação';

  if (loading) return <div className="rounded-xl border p-4 text-xs text-slate-500">Carregando CNH vigente…</div>;
  if (!attachment) return <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"><strong>CNH vigente não localizada.</strong><div className="mt-1">O cadastro possui dados de CNH, mas o arquivo original não está disponível nos anexos do motorista.</div><div className="mt-2"><strong>Atividade remunerada (EAR):</strong> {earLabel}</div>{error && <div className="mt-2 text-rose-600">{error}</div>}</div>;

  return <>
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3"><FileText className="h-6 w-6 shrink-0 text-emerald-600" /><div className="min-w-0"><strong className="block text-sm">CNH vigente</strong><span className="block truncate text-xs text-slate-500">{attachment.fileName}</span><span className="block text-[11px] text-slate-500"><strong>Atividade remunerada (EAR):</strong> {earLabel}</span><span className="text-[11px] text-slate-400">Arquivo original preservado; o QR Code permanece visível no documento.</span></div></div>
        <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={openPreview}><Eye className="mr-1 h-4 w-4" />Visualizar / Zoom</Button><Button type="button" size="sm" variant="outline" onClick={downloadOriginal}><Download className="mr-1 h-4 w-4" />Baixar original</Button></div>
      </div>
      {error && <div className="mt-2 text-xs text-rose-600">{error}</div>}
    </div>
    {previewUrl && <DocumentPreviewModal url={previewUrl} type={attachment.mimeType} name={attachment.fileName} onClose={() => setPreviewUrl((current) => { if (current) URL.revokeObjectURL(current); return null; })} />}
  </>;
}
