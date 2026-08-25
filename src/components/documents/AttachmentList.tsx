import React, { useEffect, useState } from 'react';
import type { FileAttachment } from '../../types/entities/audit';
import { AttachmentClient } from '../../api/attachmentClient';
import { DocumentAiClient } from '../../api/documentAiClient';
import { useAuth } from '../../hooks/useAuth';
import { Bot, Download, Eye, File, Trash2, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';

interface AttachmentListProps {
  entityType?: string;
  entityId?: string;
  attachments?: FileAttachment[];
  onRefresh?: () => void;
  showFilters?: boolean;
  onDocumentAiRequested?: () => void;
}

const DOCUMENT_AI_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const DOCUMENT_AI_WRITE_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'OPERATIONAL']);

export function AttachmentList({
  entityType,
  entityId,
  attachments: initialAttachments,
  onRefresh,
  onDocumentAiRequested,
}: AttachmentListProps) {
  const { user } = useAuth();
  const [attachments, setAttachments] = useState<FileAttachment[]>(initialAttachments || []);
  const [loading, setLoading] = useState(!initialAttachments);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<{ url: string; type: string; name: string } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [requestingExtractionId, setRequestingExtractionId] = useState<string | null>(null);
  const [documentAiMessage, setDocumentAiMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const canRequestDocumentAi =
    DOCUMENT_AI_WRITE_ROLES.has(user.role.toUpperCase()) ||
    user.permissions.includes('*') ||
    user.permissions.includes('PROCESS_DOCUMENT_AI');

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

  const getAvailableAttachment = (id: string): FileAttachment | undefined =>
    attachments.find((item) => item.id === id && item.storageProvider === 'SERVER_FS' && item.contentState === 'AVAILABLE');

  const handlePreview = async (id: string) => {
    const item = getAvailableAttachment(id);
    if (!item) {
      alert('O conteúdo deste registro legado não está disponível no storage do servidor.');
      return;
    }
    try {
      const blob = await AttachmentClient.content(id);
      if (!blob.type.startsWith('image/') && blob.type !== 'application/pdf') {
        await handleDownload(id);
        return;
      }
      const url = URL.createObjectURL(blob);
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

  const handleExtractionRequest = async (attachment: FileAttachment) => {
    const eligible =
      attachment.storageProvider === 'SERVER_FS' &&
      attachment.contentState === 'AVAILABLE' &&
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
        text: 'Extração registrada na fila. O processamento automático permanece desativado.',
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

  if (loading) return <div className="text-sm text-gray-500">Carregando documentos...</div>;
  if (error) return <div className="text-sm text-red-500">{error}</div>;

  return (
    <div className="space-y-4">
      {documentAiMessage && (
        <div className={`rounded-md border p-3 text-sm ${
          documentAiMessage.kind === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
            : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200'
        }`}>
          {documentAiMessage.text}
        </div>
      )}
      {attachments.length === 0 ? (
        <div className="text-center p-6 border rounded-lg bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <File className="h-8 w-8 mx-auto text-gray-400 mb-2" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum documento anexado.</p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-200 dark:divide-gray-700 border rounded-lg overflow-hidden">
          {attachments.map((att) => {
            const serverAvailable = att.storageProvider === 'SERVER_FS' && att.contentState === 'AVAILABLE';
            const documentAiEligible = serverAvailable && DOCUMENT_AI_MIME_TYPES.has(att.mimeType);
            return (
              <li key={att.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <div className="flex items-center space-x-3 truncate">
                  <File className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  <div className="truncate">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{att.fileName}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className="text-xs text-gray-500">{att.documentType || 'Documento'}</span>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs text-gray-500">{(att.fileSize / 1024).toFixed(1)} KB</span>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs text-gray-500">{new Date(att.createdAt).toLocaleDateString()}</span>
                      {!serverAvailable && <span className="text-xs text-amber-600">· Conteúdo legado não migrado</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2 ml-4 flex-shrink-0">
                  {canRequestDocumentAi && documentAiEligible && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleExtractionRequest(att)}
                      isLoading={requestingExtractionId === att.id}
                      disabled={requestingExtractionId !== null}
                      title="Solicitar extração assistida"
                    >
                      <Bot className="h-4 w-4" />
                      <span className="sr-only">Solicitar extração assistida</span>
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => void handlePreview(att.id)} disabled={!serverAvailable} title="Visualizar">
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void handleDownload(att.id)} disabled={!serverAvailable} title="Baixar">
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteId(att.id)} className="text-red-500 hover:text-red-700" title="Arquivar">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {previewData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
              <h3 className="font-medium">{previewData.name}</h3>
              <button onClick={() => setPreviewData(null)} className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-auto bg-gray-100 dark:bg-black/50 flex items-center justify-center min-h-[300px]">
              {previewData.type.startsWith('image/') ? (
                <img src={previewData.url} alt={previewData.name} className="max-w-full max-h-full object-contain" />
              ) : (
                <iframe src={previewData.url} title={previewData.name} className="w-full h-[70vh] border-0" />
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
    </div>
  );
}
