import React, { useEffect, useMemo, useState } from 'react';
import { Download, Eye, FileClock, FileText, Trash2 } from 'lucide-react';
import { AttachmentClient } from '../../api/attachmentClient';
import { DriverClient } from '../../api/driverClient';
import type { Driver, FileAttachment } from '../../types/entities';
import { Button } from '../ui/Button';
import { DocumentPreviewModal } from '../documents/DocumentPreviewModal';

interface DriverCnhDocumentCardProps {
  driverId: string;
}

export function DriverCnhDocumentCard({ driverId }: DriverCnhDocumentCardProps) {
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<FileAttachment | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null); setAttachments([]); setDriver(null);
    void Promise.all([
      AttachmentClient.list({ entityType: 'Driver', entityId: driverId }),
      DriverClient.get(driverId),
    ])
      .then(([items, loadedDriver]) => {
        if (cancelled) return;
        const cnh = items
          .filter((item) => !item.isArchived && String(item.documentType || '').toUpperCase() === 'CNH' && item.contentState === 'AVAILABLE')
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setAttachments(cnh);
        setDriver(loadedDriver);
      })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Não foi possível carregar a CNH.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [driverId]);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const attachment = attachments[0] || null;
  const history = useMemo(() => attachments.slice(1, 2), [attachments]);

  const openPreview = async (target: FileAttachment) => {
    setError(null);
    try {
      const blob = await AttachmentClient.content(target.id);
      setPreviewAttachment(target);
      setPreviewUrl((current) => { if (current) URL.revokeObjectURL(current); return URL.createObjectURL(blob); });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível abrir a CNH.');
    }
  };

  const downloadOriginal = async (target: FileAttachment) => {
    setError(null);
    try {
      const blob = await AttachmentClient.content(target.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = target.fileName || 'CNH';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível baixar a CNH.');
    }
  };

  const removePrevious = async (target: FileAttachment) => {
    if (!window.confirm('Excluir esta CNH anterior da ficha? A CNH vigente não será afetada.')) return;
    setError(null);
    try {
      await AttachmentClient.archive(target.id);
      setAttachments((current) => current.filter((item) => item.id !== target.id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível excluir a CNH anterior.');
    }
  };

  const closePreview = () => {
    setPreviewUrl((current) => { if (current) URL.revokeObjectURL(current); return null; });
    setPreviewAttachment(null);
  };

  const earLabel = driver?.cnhEar === true ? 'Sim' : driver?.cnhEar === false ? 'Não' : 'Pendente de confirmação';

  if (loading) return <div className="rounded-xl border p-4 text-xs text-slate-500">Carregando CNH vigente…</div>;
  if (!attachment) return <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"><strong>CNH vigente não localizada.</strong><div className="mt-1">O cadastro possui dados de CNH, mas o arquivo original não está disponível nos anexos do motorista.</div><div className="mt-2"><strong>Atividade remunerada (EAR):</strong> {earLabel}</div>{error && <div className="mt-2 text-rose-600">{error}</div>}</div>;

  return <>
    <div className="space-y-3">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3"><FileText className="h-6 w-6 shrink-0 text-emerald-600" /><div className="min-w-0"><strong className="block text-sm">CNH vigente</strong><span className="block truncate text-xs text-slate-500">{attachment.fileName}</span><span className="block text-[11px] text-slate-500"><strong>Atividade remunerada (EAR):</strong> {earLabel}</span><span className="text-[11px] text-slate-400">Arquivo original preservado; o QR Code permanece visível no documento.</span></div></div>
          <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => openPreview(attachment)}><Eye className="mr-1 h-4 w-4" />Visualizar / Zoom</Button><Button type="button" size="sm" variant="outline" onClick={() => downloadOriginal(attachment)}><Download className="mr-1 h-4 w-4" />Baixar original</Button></div>
        </div>
        {error && <div className="mt-2 text-xs text-rose-600">{error}</div>}
      </div>

      {history.length > 0 && <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><FileClock className="h-4 w-4" />Última CNH anterior</div>
        <div className="space-y-2">
          {history.map((item) => <div key={item.id} className="flex flex-col gap-2 rounded-lg border border-slate-100 p-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0"><div className="truncate text-xs font-medium">{item.fileName}</div><div className="text-[11px] text-slate-500">Última versão anterior · preservada em {new Date(item.createdAt).toLocaleDateString('pt-BR')}</div></div>
            <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => openPreview(item)}><Eye className="mr-1 h-4 w-4" />Visualizar</Button><Button type="button" size="sm" variant="outline" onClick={() => downloadOriginal(item)}><Download className="mr-1 h-4 w-4" />Baixar</Button><Button type="button" size="sm" variant="danger" onClick={() => void removePrevious(item)}><Trash2 className="mr-1 h-4 w-4" />Excluir</Button></div>
          </div>)}
        </div>
      </div>}
    </div>
    {previewUrl && previewAttachment && <DocumentPreviewModal url={previewUrl} type={previewAttachment.mimeType} name={previewAttachment.fileName} onClose={closePreview} />}
  </>;
}
