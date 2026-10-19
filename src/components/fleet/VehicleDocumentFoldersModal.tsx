import React, { useEffect, useState, useMemo } from 'react';
import {
  Folder,
  FolderOpen,
  FileText,
  Upload,
  RefreshCw,
  Video,
  Image,
  FileCheck,
  Shield,
  Radio,
  Receipt,
  Wrench,
  AlertCircle,
  Download,
  Trash2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { FileAttachment } from '../../types/entities';
import { AttachmentClient } from '../../api/attachmentClient';
import { ModalContainer } from '../ui/ModalContainer';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { FileUpload } from '../documents/FileUpload';
import {
  VEHICLE_DOCUMENT_FOLDERS,
  groupAttachmentsIntoVehicleFolders,
  type VehicleDocumentFolderDef,
} from './vehicleDocumentFolderDefinitions';

interface VehicleDocumentFoldersModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicleId: string;
  plate?: string;
  model?: string;
}

const FOLDER_ICONS: Record<string, React.ElementType> = {
  crlv: FileCheck,
  vistoria: FileText,
  vistoria_cautelar: Shield,
  checklist: Video,
  nf_entrada: Receipt,
  nf_saida: Receipt,
  atpv: FileCheck,
  rastreador: Radio,
  apolice_seguro: Shield,
  nf_pecas: Wrench,
  nf_servico: Wrench,
  outros: Folder,
};

export const VehicleDocumentFoldersModal: React.FC<VehicleDocumentFoldersModalProps> = ({
  isOpen,
  onClose,
  vehicleId,
  plate,
  model,
}) => {
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedFolderKey, setExpandedFolderKey] = useState<string | null>('crlv');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadAttachments = async () => {
    if (!vehicleId) return;
    setLoading(true);
    setError(null);
    try {
      const items = await AttachmentClient.listEntityGallery('Vehicle', vehicleId);
      setAttachments(items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar documentos do veículo.');
      setAttachments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && vehicleId) {
      void loadAttachments();
    }
  }, [isOpen, vehicleId]);

  const grouped = useMemo(() => {
    return groupAttachmentsIntoVehicleFolders(attachments);
  }, [attachments]);

  const toggleFolder = (key: string) => {
    setExpandedFolderKey((current) => (current === key ? null : key));
  };

  const handleDownload = async (attachment: FileAttachment) => {
    setActionLoading(attachment.id);
    try {
      const blob = await AttachmentClient.content(attachment.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao baixar anexo.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleArchive = async (attachment: FileAttachment) => {
    if (!window.confirm(`Deseja arquivar o documento "${attachment.fileName}"?`)) return;
    setActionLoading(attachment.id);
    try {
      await AttachmentClient.archive(attachment.id);
      await loadAttachments();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao arquivar anexo.');
    } finally {
      setActionLoading(null);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <ModalContainer
      isOpen={isOpen}
      onClose={onClose}
      title={`Pastas de Documentos — ${plate || 'Veículo'}${model ? ` (${model})` : ''}`}
      maxWidth="max-w-4xl"
    >
      <div className="space-y-4 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 dark:border-graphite-800">
          <div>
            <h3 className="text-sm font-bold text-graphite-900 dark:text-graphite-100">
              Documentos Organizados por Pasta
            </h3>
            <p className="text-[11px] text-graphite-500">
              Pastas específicas por tipo de documento. Checklists aceitam vídeos de até 50MB. Vistorias são unificadas com inspeções.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="neutral">
              {attachments.length} {attachments.length === 1 ? 'documento total' : 'documentos totais'}
            </Badge>
            <Button size="sm" variant="outline" onClick={loadAttachments} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-error-border bg-error-bg p-3 text-xs text-error-text flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading && attachments.length === 0 ? (
          <div className="p-8 text-center text-graphite-500">
            <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin text-graphite-400" />
            Carregando pastas e documentos do veículo...
          </div>
        ) : (
          <div className="space-y-2">
            {VEHICLE_DOCUMENT_FOLDERS.map((folderDef) => {
              const group = grouped[folderDef.key];
              const items = group?.items || [];
              const isExpanded = expandedFolderKey === folderDef.key;
              const Icon = FOLDER_ICONS[folderDef.key] || Folder;

              return (
                <div
                  key={folderDef.key}
                  className={`rounded-xl border transition-colors ${
                    isExpanded
                      ? 'border-accent-border bg-accent-surface/20 dark:border-accent-border/50'
                      : 'border-graphite-200 dark:border-graphite-800 bg-white dark:bg-graphite-900 hover:border-graphite-300'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleFolder(folderDef.key)}
                    className="w-full flex items-center justify-between p-3.5 text-left focus:outline-none"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`p-2 rounded-lg flex items-center justify-center ${
                          items.length > 0
                            ? 'bg-action-primary/10 text-action-primary'
                            : 'bg-graphite-100 dark:bg-graphite-800 text-graphite-400'
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <strong className="text-sm text-graphite-900 dark:text-graphite-100">
                            {folderDef.name}
                          </strong>
                          {folderDef.acceptsVideo && (
                            <Badge variant="info">Vídeo até 50MB</Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-graphite-500 truncate">
                          {folderDef.description}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge variant={items.length > 0 ? 'success' : 'neutral'}>
                        {items.length} {items.length === 1 ? 'arquivo' : 'arquivos'}
                      </Badge>
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-graphite-500" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-graphite-500" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="p-3 border-t border-graphite-100 dark:border-graphite-800/60 bg-graphite-50/50 dark:bg-graphite-900/50 space-y-3">
                      {/* File list */}
                      {items.length === 0 ? (
                        <p className="text-xs text-graphite-500 text-center py-2 italic">
                          Nenhum documento nesta pasta ainda.
                        </p>
                      ) : (
                        <div className="divide-y divide-graphite-100 dark:divide-graphite-800 border rounded-lg overflow-hidden bg-white dark:bg-graphite-900">
                          {items.map((item) => (
                            <div
                              key={item.id}
                              className="p-2.5 flex items-center justify-between gap-3 text-xs"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {item.mimeType.startsWith('video/') ? (
                                  <Video className="w-4 h-4 text-info-icon flex-shrink-0" />
                                ) : item.mimeType.startsWith('image/') ? (
                                  <Image className="w-4 h-4 text-success-icon flex-shrink-0" />
                                ) : (
                                  <FileText className="w-4 h-4 text-graphite-500 flex-shrink-0" />
                                )}
                                <div className="min-w-0">
                                  <p className="font-semibold text-graphite-900 dark:text-graphite-100 truncate">
                                    {item.fileName}
                                  </p>
                                  <p className="text-[10px] text-graphite-500">
                                    {new Date(item.createdAt).toLocaleDateString('pt-BR')} • {formatSize(item.fileSize)}
                                    {item.description ? ` • ${item.description}` : ''}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => void handleDownload(item)}
                                  disabled={actionLoading === item.id}
                                  title="Baixar arquivo"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => void handleArchive(item)}
                                  disabled={actionLoading === item.id}
                                  title="Arquivar arquivo"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-error-icon" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Upload section for this specific folder */}
                      <div className="rounded-lg border border-dashed border-graphite-300 dark:border-graphite-700 p-2.5 bg-white dark:bg-graphite-900">
                        <p className="text-[11px] font-semibold text-graphite-600 dark:text-graphite-300 mb-1.5 flex items-center gap-1">
                          <Upload className="w-3.5 h-3.5 text-action-primary" />
                          Enviar arquivo para a pasta {folderDef.name}
                        </p>
                        <FileUpload
                          entityType="Vehicle"
                          entityId={vehicleId}
                          documentType={folderDef.canonicalDocType}
                          maxSizeMB={folderDef.maxSizeMB || 10}
                          allowedTypes={
                            folderDef.acceptsVideo
                              ? ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']
                              : ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp']
                          }
                          multiple={true}
                          onUploadComplete={() => void loadAttachments()}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end pt-3 border-t dark:border-graphite-800">
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </ModalContainer>
  );
};
