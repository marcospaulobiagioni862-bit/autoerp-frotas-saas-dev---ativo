import React, { useState, useEffect } from 'react';
import { FileAttachment } from '../../types/entities/audit';
import { AttachmentService } from '../../domain/services/AttachmentService';
import { useAuth } from '../../hooks/useAuth';
import { File, Download, Eye, Trash2, ShieldAlert, ArchiveRestore, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { ConfirmDialog } from '../ui/ConfirmDialog';

interface AttachmentListProps {
  entityType?: string;
  entityId?: string;
  attachments?: FileAttachment[];
  onRefresh?: () => void;
  showFilters?: boolean;
}

export function AttachmentList({ entityType, entityId, attachments: initialAttachments, onRefresh, showFilters = false }: AttachmentListProps) {
  const [attachments, setAttachments] = useState<FileAttachment[]>(initialAttachments || []);
  const [loading, setLoading] = useState(!initialAttachments);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const attachmentService = new AttachmentService();

  const [previewData, setPreviewData] = useState<{ url: string; type: string; name: string } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (initialAttachments) {
      setAttachments(initialAttachments);
      setLoading(false);
    } else if (entityType && entityId && user) {
      fetchAttachments();
    }
  }, [initialAttachments, entityType, entityId, user]);

  const fetchAttachments = async () => {
    if (!user || !entityType || !entityId) return;
    setLoading(true);
    try {
      const data = await attachmentService.findByEntity(user.companyId, entityType, entityId);
      setAttachments(data.filter(a => !a.isArchived));
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar anexos.');
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async (id: string) => {
    if (!user) return;
    try {
      const doc = await attachmentService.getAttachment(id, user);
      if (doc.mimeType.startsWith('image/') || doc.mimeType === 'application/pdf') {
        const url = `data:${doc.mimeType};base64,${doc.rawBase64}`;
        setPreviewData({ url, type: doc.mimeType, name: doc.fileName });
      } else {
        handleDownload(id); // auto-download if not previewable
      }
    } catch (err: any) {
      alert(err.message || 'Erro ao carregar arquivo.');
    }
  };

  const handleDownload = async (id: string) => {
    if (!user) return;
    try {
      const doc = await attachmentService.getAttachment(id, user);
      const url = `data:${doc.mimeType};base64,${doc.rawBase64}`;
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err: any) {
      alert(err.message || 'Erro ao baixar arquivo.');
    }
  };

  const handleDelete = async () => {
    if (!user || !deleteId) return;
    try {
      await attachmentService.archive(deleteId, user);
      setDeleteId(null);
      if (onRefresh) onRefresh();
      else if (entityType && entityId) fetchAttachments();
      else setAttachments(attachments.filter(a => a.id !== deleteId));
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir.');
    }
  };

  if (loading) return <div className="text-sm text-gray-500">Carregando documentos...</div>;
  if (error) return <div className="text-sm text-red-500">{error}</div>;

  return (
    <div className="space-y-4">
      {attachments.length === 0 ? (
        <div className="text-center p-6 border rounded-lg bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <File className="h-8 w-8 mx-auto text-gray-400 mb-2" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum documento anexado.</p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-200 dark:divide-gray-700 border rounded-lg overflow-hidden">
          {attachments.map((att) => (
            <li key={att.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <div className="flex items-center space-x-3 truncate">
                <div className="flex-shrink-0">
                  <File className="h-5 w-5 text-gray-400" />
                </div>
                <div className="truncate">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {att.fileName}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className="text-xs text-gray-500">{att.documentType || 'Documento'}</span>
                    <span className="text-xs text-gray-400">·</span>
                    <span className="text-xs text-gray-500">{(att.fileSize / 1024).toFixed(1)} KB</span>
                    <span className="text-xs text-gray-400">·</span>
                    <span className="text-xs text-gray-500">{new Date(att.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2 ml-4 flex-shrink-0">
                <Button variant="ghost" size="sm" onClick={() => handlePreview(att.id)} title="Visualizar">
                  <Eye className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDownload(att.id)} title="Baixar">
                  <Download className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDeleteId(att.id)} className="text-red-500 hover:text-red-700" title="Excluir">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Preview Modal */}
      {previewData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
              <h3 className="font-medium">{previewData.name}</h3>
              <div className="flex space-x-2">
                <a 
                  href={previewData.url} 
                  download={previewData.name}
                  className="px-3 py-1.5 text-sm font-medium bg-primary text-white rounded-md hover:bg-primary/90 flex items-center"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Baixar
                </a>
                <button onClick={() => setPreviewData(null)} className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="p-4 flex-1 overflow-auto bg-gray-100 dark:bg-black/50 flex items-center justify-center min-h-[300px]">
              {previewData.type.startsWith('image/') ? (
                <img src={previewData.url} alt={previewData.name} className="max-w-full max-h-full object-contain" />
              ) : previewData.type === 'application/pdf' ? (
                <iframe src={previewData.url} title={previewData.name} className="w-full h-[70vh] border-0" />
              ) : (
                <div className="text-center">
                  <File className="h-12 w-12 mx-auto text-gray-400 mb-2" />
                  <p>Visualização não disponível para este tipo de arquivo.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteId && (
        <ConfirmDialog
          isOpen={!!deleteId}
          title="Excluir Documento"
          description="Tem certeza que deseja arquivar este documento? Ele poderá ser restaurado se necessário (soft delete)."
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
          confirmText="Excluir"
          cancelText="Cancelar"
          type="danger"
        />
      )}
    </div>
  );
}
