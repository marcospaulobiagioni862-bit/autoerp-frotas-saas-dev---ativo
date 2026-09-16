import React, { useState, useEffect } from 'react';
import { AttachmentService } from '../../domain/services/AttachmentService';
import { useAuth } from '../../hooks/useAuth';
import { FileAttachment } from '../../types/entities/audit';
import { File, Download, Eye, Trash2, ShieldAlert, ArchiveRestore, X } from 'lucide-react';
import { Button } from '../ui/Button';

interface AttachmentListProps {
  entityType?: string;
  entityId?: string;
  onRefresh?: () => void;
}

export function AttachmentList({ entityType, entityId, onRefresh }: AttachmentListProps) {
  const { user } = useAuth();
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<FileAttachment | null>(null);

  const attachmentService = new AttachmentService();

  const loadAttachments = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      let data: FileAttachment[] = [];
      if (entityType && entityId) {
        data = await attachmentService.findByEntity(user.companyId, entityType, entityId);
      } else {
        data = await attachmentService.findAll(user.companyId);
      }
      setAttachments(data.filter(a => !a.isArchived));
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar anexos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAttachments();
  }, [user, entityType, entityId]);

  const handleDelete = async (id: string) => {
    if (!user || !confirm('Deseja realmente remover este anexo?')) return;
    try {
      await attachmentService.archiveAttachment(
        user.companyId,
        id,
        user.userId || user.id,
        user.name || 'User',
        'Removido pelo usuário',
        {
          userId: user.userId || user.id,
          role: user.role || 'ADMIN',
          active: true,
          companyId: user.companyId,
        }
      );
      loadAttachments();
      if (onRefresh) onRefresh();
    } catch (e: any) {
      alert(e.message || 'Erro ao remover anexo.');
    }
  };

  if (loading) {
    return <div className="text-sm text-slate-500 py-3">Carregando anexos...</div>;
  }

  if (attachments.length === 0) {
    return (
      <div className="text-center py-6 border border-dashed rounded-lg text-sm text-slate-400">
        Nenhum documento anexado.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {attachments.map((att) => (
        <div
          key={att.id}
          className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg hover:border-slate-300 transition-colors shadow-xs"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg shrink-0">
              <File className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">{att.fileName}</p>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>{att.documentType}</span>
                <span>•</span>
                <span>{(att.fileSize / 1024).toFixed(1)} KB</span>
                <span>•</span>
                <span>{new Date(att.createdAt).toLocaleDateString('pt-BR')}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPreviewItem(att)}
              title="Visualizar"
            >
              <Eye className="w-4 h-4 text-slate-600" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDelete(att.id)}
              title="Excluir"
            >
              <Trash2 className="w-4 h-4 text-red-500" />
            </Button>
          </div>
        </div>
      ))}

      {previewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 space-y-4 shadow-xl">
            <div className="flex justify-between items-center pb-3 border-b">
              <h3 className="font-semibold text-lg text-slate-800">{previewItem.fileName}</h3>
              <button
                onClick={() => setPreviewItem(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg text-xs space-y-1 text-slate-600">
              <p><strong>Tipo:</strong> {previewItem.documentType}</p>
              <p><strong>Tamanho:</strong> {(previewItem.fileSize / 1024).toFixed(1)} KB</p>
              <p><strong>MIME:</strong> {previewItem.mimeType}</p>
              <p><strong>Checksum (SHA-256):</strong> {previewItem.checksumSha256 || 'N/A'}</p>
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setPreviewItem(null)}>
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
