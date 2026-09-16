import React, { useState, useRef } from 'react';
import { AttachmentService, ALLOWED_FILE_TYPES, MAX_FILE_SIZE } from '../../domain/services/AttachmentService';
import { useAuth } from '../../hooks/useAuth';
import { UploadCloud, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';

interface FileUploadProps {
  entityType: string;
  entityId: string;
  documentType?: string;
  onUploadSuccess?: () => void;
}

export function FileUpload({ entityType, entityId, documentType = 'GENERAL', onUploadSuccess }: FileUploadProps) {
  const { user } = useAuth();
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const attachmentService = new AttachmentService();

  const handleFile = async (file: File) => {
    if (!user) return;
    setError(null);
    setSuccess(false);

    if (file.size > MAX_FILE_SIZE) {
      setError('Arquivo muito grande. O limite máximo é 10MB.');
      return;
    }

    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = (reader.result as string).split(',')[1] || (reader.result as string);
          await attachmentService.upload({
            companyId: user.companyId,
            entityType,
            entityId,
            documentType,
            fileName: file.name,
            mimeType: file.type || 'application/octet-stream',
            dataBase64: base64Data,
            userId: user.userId || user.id,
            userName: user.name || 'User',
            userContext: {
              userId: user.userId || user.id,
              role: user.role || 'ADMIN',
              active: true,
              companyId: user.companyId,
            },
          });
          setSuccess(true);
          if (onUploadSuccess) onUploadSuccess();
        } catch (e: any) {
          setError(e.message || 'Erro ao enviar o arquivo.');
        } finally {
          setUploading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (e: any) {
      setError(e.message || 'Erro ao processar o arquivo.');
      setUploading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="w-full space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
          dragOver ? 'border-blue-500 bg-blue-50/50' : 'border-slate-300 hover:border-slate-400 bg-slate-50/50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleFile(e.target.files[0]);
            }
          }}
        />
        {uploading ? (
          <div className="flex flex-col items-center text-blue-600 gap-2">
            <Loader2 className="w-8 h-8 animate-spin" />
            <span className="text-sm font-medium">Fazendo upload do anexo...</span>
          </div>
        ) : (
          <>
            <UploadCloud className="w-8 h-8 text-slate-400" />
            <div className="text-sm font-medium text-slate-700">
              Clique ou arraste um arquivo para anexar
            </div>
            <div className="text-xs text-slate-400">PDF, Imagens (JPG, PNG, WebP) até 10MB</div>
          </>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-200">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 p-3 rounded-lg border border-emerald-200">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>Anexo enviado com sucesso!</span>
        </div>
      )}
    </div>
  );
}
