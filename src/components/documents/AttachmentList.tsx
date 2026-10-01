import React, { useEffect, useState } from 'react';
import { documentTypeLabel } from '../../shared/utils/documentTypeLabel';
import type { FileAttachment } from '../../types/entities/audit';
import { AttachmentClient } from '../../api/attachmentClient';
import { DocumentAiClient, type DocumentAiAttachmentStatus, type DocumentAiExtractionHistoryItem } from '../../api/documentAiClient';
import { useAuth } from '../../hooks/useAuth';
import { Archive, Bot, Download, Eye, File, History, Printer, RotateCcw, Send, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';

interface AttachmentListProps {
  entityType?: string;
  entityId?: string;
  attachments?: FileAttachment[];
  onRefresh?: () => void;
  showFilters?: boolean;
  onDocumentAiRequested?: () => void;
  attachmentStatuses?: Record<string, DocumentAiAttachmentStatus>;
  attachmentStatusesUnavailable?: boolean;
  showPdfActions?: boolean;
  protectLatestDriverCnh?: boolean;
  showProtectedDriverCnh?: boolean;
  excludeAttachmentIds?: string[];
  showDocumentAiControls?: boolean;
  showExpirationState?: boolean;
  contextLabels?: Record<string, string>;
}

const DOCUMENT_AI_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const DOCUMENT_AI_WRITE_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'OPERATIONAL']);

function expirationLabel(expirationDate?: string): { text: string; className: string } | null {
  if (!expirationDate) return null;
  const expiration = Date.parse(`${expirationDate}T00:00:00Z`);
  if (!Number.isFinite(expiration)) return null;
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((expiration - today) / 86_400_000);
  const dateLabel = new Date(`${expirationDate}T00:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  if (days < 0) return { text: `Vencido · ${dateLabel}`, className: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' };
  if (days <= 7) return { text: `Vence em ${days}d · ${dateLabel}`, className: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' };
  if (days <= 15) return { text: `Vence em ${days}d · ${dateLabel}`, className: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' };
  return { text: `Válido · ${dateLabel}`, className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' };
}

function extractionStatusLabel(status: DocumentAiAttachmentStatus['status']): { text: string; className: string } {
  if (status === 'PENDING') return { text: 'Na fila', className: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' };
  if (status === 'PROCESSING') return { text: 'Processando', className: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' };
  if (status === 'REVIEW_REQUIRED') return { text: 'Revisar extração', className: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300' };
  if (status === 'APPROVED') return { text: 'Extração aprovada', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' };
  if (status === 'REJECTED') return { text: 'Extração rejeitada', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' };
  return { text: 'Extração falhou', className: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' };
}

export function AttachmentList({
  entityType,
  entityId,
  attachments: initialAttachments,
  onRefresh,
  onDocumentAiRequested,
  attachmentStatuses = {},
  attachmentStatusesUnavailable = false,
  showPdfActions = false,
  protectLatestDriverCnh = false,
  showProtectedDriverCnh = false,
  excludeAttachmentIds = [],
  showDocumentAiControls = true,
  showExpirationState = true,
  contextLabels = {},
}: AttachmentListProps) {
  const { user } = useAuth();
  const [attachments, setAttachments] = useState<FileAttachment[]>(initialAttachments || []);
  const [loading, setLoading] = useState(!initialAttachments);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<{ url: string; type: string; name: string } | null>(null);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [permanentDeleteId, setPermanentDeleteId] = useState<string | null>(null);
  const [requestingExtractionId, setRequestingExtractionId] = useState<string | null>(null);
  const [documentAiMessage, setDocumentAiMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [historyAttachmentId, setHistoryAttachmentId] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<DocumentAiExtractionHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const canRequestDocumentAi =
    DOCUMENT_AI_WRITE_ROLES.has(user.role.toUpperCase()) ||
    user.permissions.includes('*') ||
    user.permissions.includes('PROCESS_DOCUMENT_AI');

  const canDeletePermanently =
    user.role.toUpperCase() === 'ADMIN' ||
    user.permissions.includes('*') ||
    user.permissions.includes('DELETE_ATTACHMENT');

  const fetchAttachments = async () => {
    if (!entityType || !entityId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await AttachmentClient.list({ entityType, entityId });
      setAttachments(data.filter((item) => !item.isArchived));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar anexos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialAttachments) {
      setAttachments(initialAttachments);
      setLoading(false);
    } else if (entityType && entityId) {
      void fetchAttachments();
    }
  }, [initialAttachments, entityType, entityId]);

  useEffect(() => () => {
    if (previewData?.url) URL.revokeObjectURL(previewData.url);
  }, [previewData]);

  const closePreview = () => {
    setPreviewData(null);
    setPreviewZoom(1);
  };

  const hasAvailableContent = (item: FileAttachment): boolean =>
    (item.storageProvider === 'SERVER_FS' || item.storageProvider === 'R2') && item.contentState === 'AVAILABLE';

  const getAvailableAttachment = (id: string): FileAttachment | undefined =>
    attachments.find((item) => item.id === id && hasAvailableContent(item));

  const latestDriverCnhId = protectLatestDriverCnh && entityType === 'Driver'
    ? attachments
        .filter((item) => !item.isArchived && String(item.documentType || '').toUpperCase() === 'CNH' && hasAvailableContent(item))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.id
    : undefined;

  const excludedAttachmentIds = new Set(excludeAttachmentIds);
  const visibleAttachments = (protectLatestDriverCnh && entityType === 'Driver' && !showProtectedDriverCnh
    ? attachments.filter((item) => String(item.documentType || '').toUpperCase() !== 'CNH')
    : attachments
  ).filter((item) => !excludedAttachmentIds.has(item.id));

  const handlePreview = async (id: string) => {
    const item = getAvailableAttachment(id);
    if (!item) {
      alert('O arquivo está cadastrado no ERP, mas o conteúdo não está disponível no armazenamento.');
      return;
    }
    try {
      const blob = await AttachmentClient.content(id);
      if (!blob.type.startsWith('image/') && blob.type !== 'application/pdf') {
        await handleDownload(id);
        return;
      }
      const url = URL.createObjectURL(blob);
      setPreviewZoom(1);
      setPreviewData({ url, type: blob.type, name: item.fileName });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao carregar arquivo.');
    }
  };

  const handleDownload = async (id: string) => {
    const item = getAvailableAttachment(id);
    if (!item) {
      alert('O conteúdo deste registro legado não está disponível no storage do servidor.');
      return;
    }
    try {
      const blob = await AttachmentClient.content(id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = item.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao baixar arquivo.');
    }
  };

  const handlePrintPdf = async (id: string) => {
    const item = getAvailableAttachment(id);
    if (!item || item.mimeType !== 'application/pdf') return;
    try {
      const blob = await AttachmentClient.content(id);
      const url = URL.createObjectURL(blob);
      const frame = document.createElement('iframe');
      frame.style.position = 'fixed';
      frame.style.right = '0';
      frame.style.bottom = '0';
      frame.style.width = '0';
      frame.style.height = '0';
      frame.style.border = '0';
      frame.src = url;
      document.body.appendChild(frame);
      frame.onload = () => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        window.setTimeout(() => {
          frame.remove();
          URL.revokeObjectURL(url);
        }, 60_000);
      };
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao imprimir PDF.');
    }
  };

  const handleSharePdf = async (id: string) => {
    const item = getAvailableAttachment(id);
    if (!item || item.mimeType !== 'application/pdf') return;
    try {
      const blob = await AttachmentClient.content(id);
      const file = new File([blob], item.fileName, { type: 'application/pdf' });
      const shareData = { files: [file], title: item.fileName };
      if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
        await navigator.share(shareData);
        return;
      }
      await handleDownload(id);
      alert('O navegador não oferece envio direto de arquivos. O PDF foi baixado para você anexar no canal desejado.');
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      alert(err instanceof Error ? err.message : 'Erro ao enviar PDF.');
    }
  };

  const handleExtractionRequest = async (attachment: FileAttachment) => {
    const eligible =
      hasAvailableContent(attachment) &&
      DOCUMENT_AI_MIME_TYPES.has(attachment.mimeType);
    if (!canRequestDocumentAi || !eligible) return;
    setRequestingExtractionId(attachment.id);
    setDocumentAiMessage(null);
    try {
      await DocumentAiClient.create({
        attachmentId: attachment.id,
        idempotencyKey: `document-ai:${attachment.id}`,
      });
      setDocumentAiMessage({
        kind: 'success',
        text: 'Extração registrada na fila de processamento documental.',
      });
      onDocumentAiRequested?.();
    } catch (err: unknown) {
      setDocumentAiMessage({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Erro ao solicitar extração documental.',
      });
    } finally {
      setRequestingExtractionId(null);
    }
  };

  const handleExtractionHistory = async (attachmentId: string) => {
    if (historyAttachmentId === attachmentId) {
      setHistoryAttachmentId(null);
      setHistoryItems([]);
      setHistoryError(null);
      return;
    }
    setHistoryAttachmentId(attachmentId);
    setHistoryItems([]);
    setHistoryError(null);
    setHistoryLoading(true);
    try {
      setHistoryItems(await DocumentAiClient.attachmentHistory(attachmentId));
    } catch (err: unknown) {
      setHistoryError(err instanceof Error ? err.message : 'Histórico de extração indisponível.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleArchive = async () => {
    if (!deleteId) return;
    try {
      await AttachmentClient.archive(deleteId);
      setDeleteId(null);
      if (onRefresh) onRefresh();
      else if (entityType && entityId) await fetchAttachments();
      else setAttachments((current) => current.filter((item) => item.id !== deleteId));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao arquivar documento.');
    }
  };

  const handlePermanentDelete = async () => {
    if (!permanentDeleteId) return;
    const targetId = permanentDeleteId;
    try {
      const result = await AttachmentClient.deletePermanently(targetId);
      setPermanentDeleteId(null);
      if (!result.storageRemoved) {
        alert('O registro foi excluído, mas a limpeza física do arquivo ficou pendente no storage.');
      }
      if (onRefresh) onRefresh();
      else if (entityType && entityId) await fetchAttachments();
      else setAttachments((current) => current.filter((item) => item.id !== targetId));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir documento definitivamente.');
    }
  };

  if (loading) return <div className="text-sm text-gray-500">Carregando documentos...</div>;
  if (error && attachments.length === 0) return <div role="alert" className="text-sm text-red-500">{error}</div>;

  return (
    <div className="space-y-4">
      {error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error} Os anexos já carregados continuam disponíveis abaixo.
        </div>
      )}
      {showDocumentAiControls && attachmentStatusesUnavailable && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Estados de extração temporariamente indisponíveis. Os documentos continuam acessíveis.
        </div>
      )}
      {showDocumentAiControls && documentAiMessage && (
        <div className={`rounded-md border p-3 text-sm ${
          documentAiMessage.kind === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
            : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200'
        }`}>
          {documentAiMessage.text}
        </div>
      )}
      {visibleAttachments.length === 0 ? (
        <div className="text-center p-6 border rounded-lg bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <File className="h-8 w-8 mx-auto text-gray-400 mb-2" />
          <p className="text-sm text-gray-500 dark:text-gray-400">{protectLatestDriverCnh && entityType === 'Driver' ? 'Nenhum outro documento anexado.' : 'Nenhum documento anexado.'}</p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-200 dark:divide-gray-700 border rounded-lg overflow-hidden">
          {visibleAttachments.map((att) => {
            const contentAvailable = hasAvailableContent(att);
            const documentAiEligible = contentAvailable && DOCUMENT_AI_MIME_TYPES.has(att.mimeType);
            const extractionStatus = showDocumentAiControls ? attachmentStatuses[att.id] : undefined;
            const extractionBadge = extractionStatus ? extractionStatusLabel(extractionStatus.status) : null;
            const expirationBadge = showExpirationState ? expirationLabel(att.expirationDate) : null;
            const contextLabel = contextLabels[att.id];
            return (
              <li key={att.id} className="p-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <div className="flex min-w-0 items-center space-x-3 truncate">
                  <File className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  <div className="truncate">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{att.fileName}</p>
                    {contextLabel && <p className="mt-0.5 truncate text-xs text-gray-500">{contextLabel}</p>}
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className="text-xs text-gray-500">{documentTypeLabel(att.documentType)}</span>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs text-gray-500">{(att.fileSize / 1024).toFixed(1)} KB</span>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs text-gray-500">Cadastrado em {new Date(att.createdAt).toLocaleDateString('pt-BR')}</span>
                      {!contentAvailable && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-950 dark:text-red-300">Arquivo indisponível no armazenamento</span>}
                      {expirationBadge && (
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${expirationBadge.className}`}>
                          {expirationBadge.text}
                        </span>
                      )}
                      {extractionBadge && (
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${extractionBadge.className}`}>
                          {extractionBadge.text}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1 sm:ml-4 sm:flex-shrink-0">
                  {showDocumentAiControls && extractionStatus && (
                    <Button variant="ghost" size="sm" onClick={() => void handleExtractionHistory(att.id)} title="Histórico sanitizado da extração">
                      <History className="h-4 w-4" />
                      <span className="sr-only">Histórico sanitizado da extração</span>
                    </Button>
                  )}
                  {showDocumentAiControls && canRequestDocumentAi && documentAiEligible && !extractionStatus && (
                    <Button variant="ghost" size="sm" onClick={() => void handleExtractionRequest(att)} isLoading={requestingExtractionId === att.id} disabled={requestingExtractionId !== null} title="Solicitar extração assistida">
                      <Bot className="h-4 w-4" />
                      <span className="sr-only">Solicitar extração assistida</span>
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => void handlePreview(att.id)} disabled={!contentAvailable} title="Visualizar"><Eye className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => void handleDownload(att.id)} disabled={!contentAvailable} title="Baixar"><Download className="h-4 w-4" /></Button>
                  {showPdfActions && att.mimeType === 'application/pdf' && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => void handlePrintPdf(att.id)} disabled={!contentAvailable} title="Imprimir PDF"><Printer className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => void handleSharePdf(att.id)} disabled={!contentAvailable} title="Enviar PDF"><Send className="h-4 w-4" /></Button>
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteId(att.id)}
                    disabled={att.id === latestDriverCnhId}
                    className="text-amber-500 hover:text-amber-700 disabled:text-slate-400"
                    title={att.id === latestDriverCnhId ? 'CNH vigente: substitua pelo fluxo Nova CNH / Renovar CNH' : 'Arquivar'}
                  ><Archive className="h-4 w-4" /></Button>
                  {canDeletePermanently && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPermanentDeleteId(att.id)}
                      disabled={att.id === latestDriverCnhId}
                      className="text-red-500 hover:text-red-700 disabled:text-slate-400"
                      title={att.id === latestDriverCnhId ? 'CNH vigente: exclusão permanente bloqueada' : 'Excluir definitivamente'}
                    ><Trash2 className="h-4 w-4" /></Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {historyAttachmentId && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-900/40">
          <div className="mb-2 flex items-center gap-2 font-medium text-slate-800 dark:text-slate-100"><History className="h-4 w-4" /> Histórico sanitizado da extração</div>
          {historyLoading ? <p className="text-slate-500">Carregando histórico...</p> : historyError ? <p className="text-red-600 dark:text-red-300">{historyError}</p> : historyItems.length === 0 ? <p className="text-slate-500">Nenhum evento sanitizado disponível para este anexo.</p> : (
            <ol className="space-y-1 text-slate-600 dark:text-slate-300">{historyItems.map((item, index) => <li key={`${item.updatedAt}-${index}`}>{item.status} · tentativa {item.attemptCount} · {new Date(item.updatedAt).toLocaleString('pt-BR')}{item.failureCode ? ` · ${item.failureCode}` : ''}</li>)}</ol>
          )}
        </div>
      )}

      {previewData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-5xl max-h-[92vh] flex flex-col">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex flex-wrap justify-between items-center gap-3">
              <h3 className="font-medium truncate">{previewData.name}</h3>
              <div className="flex items-center gap-1">
                {previewData.type.startsWith('image/') && <>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setPreviewZoom((value) => Math.max(0.5, Number((value - 0.25).toFixed(2))))} disabled={previewZoom <= 0.5} title="Diminuir zoom"><ZoomOut className="h-4 w-4" /></Button>
                  <span className="min-w-14 text-center text-xs text-gray-500">{Math.round(previewZoom * 100)}%</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setPreviewZoom((value) => Math.min(4, Number((value + 0.25).toFixed(2))))} disabled={previewZoom >= 4} title="Aumentar zoom"><ZoomIn className="h-4 w-4" /></Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setPreviewZoom(1)} title="Restaurar zoom"><RotateCcw className="h-4 w-4" /></Button>
                </>}
                <button onClick={closePreview} className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300" title="Fechar"><X className="h-5 w-5" /></button>
              </div>
            </div>
            <div className="p-4 flex-1 overflow-auto bg-gray-100 dark:bg-black/50 min-h-[300px]">
              {previewData.type.startsWith('image/') ? (
                <div className="min-h-full min-w-full flex items-start justify-center">
                  <img src={previewData.url} alt={previewData.name} className="object-contain transition-transform origin-top" style={{ transform: `scale(${previewZoom})`, maxWidth: previewZoom <= 1 ? '100%' : 'none' }} />
                </div>
              ) : (
                <iframe src={previewData.url} title={previewData.name} className="w-full h-[72vh] border-0" />
              )}
            </div>
          </div>
        </div>
      )}

      {deleteId && (
        <ConfirmDialog
          isOpen={!!deleteId}
          title="Arquivar Documento"
          description="Tem certeza que deseja arquivar este documento? Os bytes não serão apagados nesta etapa."
          onConfirm={() => void handleArchive()}
          onCancel={() => setDeleteId(null)}
          confirmText="Arquivar"
          cancelText="Cancelar"
          type="danger"
        />
      )}

      {permanentDeleteId && (
        <ConfirmDialog
          isOpen={!!permanentDeleteId}
          title="Excluir Documento Definitivamente"
          description="Esta ação é permanente. O ERP bloqueará a exclusão se o documento estiver vinculado a cadastro, contrato, documento operacional ou extração ativa/aprovada."
          onConfirm={() => void handlePermanentDelete()}
          onCancel={() => setPermanentDeleteId(null)}
          confirmText="Excluir definitivamente"
          cancelText="Cancelar"
          type="danger"
        />
      )}
    </div>
  );
}
