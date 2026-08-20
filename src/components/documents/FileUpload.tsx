import React, { useState, useRef } from 'react';
import { UploadCloud, AlertCircle, X } from 'lucide-react';
import { AttachmentClient, type AttachmentUploadInput } from '../../api/attachmentClient';

interface FileUploadProps {
  entityType: string;
  entityId: string;
  documentType: string;
  onUploadComplete?: (attachment: any) => void;
  maxSizeMB?: number;
  allowedTypes?: string[];
  multiple?: boolean;
}

const SERVER_ENTITY_TYPES = new Set(['Vehicle', 'Driver', 'Contract', 'HealthAndEmergency', 'TrafficTicket']);

export function FileUpload({
  entityType,
  entityId,
  documentType,
  onUploadComplete,
  maxSizeMB = 10,
  allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  multiple = false,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): void => {
    if (!SERVER_ENTITY_TYPES.has(entityType)) {
      throw new Error(`Anexos para ${entityType} ainda não foram migrados para o servidor.`);
    }
    if (!allowedTypes.includes(file.type)) throw new Error(`Tipo não permitido: ${file.name}`);
    if (file.size <= 0) throw new Error(`Arquivo vazio: ${file.name}`);
    if (file.size > maxSizeMB * 1024 * 1024) throw new Error(`Arquivo excede ${maxSizeMB}MB: ${file.name}`);
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    setError(null);
    try {
      const filesArray = Array.from(files);
      const toProcess = multiple ? filesArray : [filesArray[0]];
      for (const file of toProcess) {
        validateFile(file);
        const attachment = await AttachmentClient.upload({
          entityType: entityType as AttachmentUploadInput['entityType'],
          entityId,
          documentType,
          fileName: file.name,
          mimeType: file.type,
          content: file,
        });
        onUploadComplete?.(attachment);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro no upload.');
    } finally {
      setIsUploading(false);
      setIsDragging(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="w-full">
      <div
        className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center transition-colors cursor-pointer
          ${isDragging ? 'border-primary bg-primary/5' : 'border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800'}
          ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
        onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => { event.preventDefault(); void handleUpload(event.dataTransfer.files); }}
        onClick={() => fileInputRef.current?.click()}
      >
        <UploadCloud className={`h-10 w-10 mb-3 ${isDragging ? 'text-primary' : 'text-gray-400'}`} />
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-1 text-center font-medium">
          {isUploading ? 'Enviando...' : 'Arraste arquivos aqui ou clique para selecionar'}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          Formatos suportados: {allowedTypes.map((type) => type.split('/')[1]).join(', ').toUpperCase()} (Max {maxSizeMB}MB)
        </p>
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={(event) => void handleUpload(event.target.files)}
          accept={allowedTypes.join(',')}
          multiple={multiple}
        />
      </div>

      {error && (
        <div className="mt-3 text-sm text-red-600 bg-red-50 p-3 rounded-md flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
