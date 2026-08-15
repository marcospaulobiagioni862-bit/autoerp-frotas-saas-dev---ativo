import React, { useState, useRef } from 'react';
import { Button } from '../ui/Button';
import { UploadCloud, File, AlertCircle, X } from 'lucide-react';
import { AttachmentService } from '../../domain/services/AttachmentService';
import { useAuth } from '../../hooks/useAuth';

interface FileUploadProps {
  entityType: string;
  entityId: string;
  documentType: string;
  onUploadComplete?: (attachment: any) => void;
  maxSizeMB?: number;
  allowedTypes?: string[];
  multiple?: boolean;
}

export function FileUpload({ 
  entityType, 
  entityId, 
  documentType, 
  onUploadComplete,
  maxSizeMB = 10,
  allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'],
  multiple = false
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const attachmentService = new AttachmentService();

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const processFile = async (file: File) => {
    if (!allowedTypes.includes(file.type)) {
      throw new Error(`Tipo não permitido: ${file.name}`);
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      throw new Error(`Arquivo excede ${maxSizeMB}MB: ${file.name}`);
    }

    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // extract base64 part
        const base64 = result.split(',')[1] || result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!user) {
      setError("Usuário não autenticado.");
      return;
    }

    setIsUploading(true);
    setError(null);
    
    try {
      const filesArray = Array.from(files);
      const toProcess = multiple ? filesArray : [filesArray[0]];

      for (const file of toProcess) {
        const base64 = await processFile(file);
        
        const attachment = await attachmentService.upload({
          companyId: user.companyId,
          entityType,
          entityId,
          documentType,
          fileName: file.name,
          mimeType: file.type,
          dataBase64: base64,
          userId: user.id,
          userName: user.name,
          userContext: user
        });

        if (onUploadComplete) {
          onUploadComplete(attachment);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Erro no upload.');
    } finally {
      setIsUploading(false);
      setIsDragging(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleUpload(e.dataTransfer.files);
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleUpload(e.target.files);
  };

  return (
    <div className="w-full">
      <div 
        className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center transition-colors cursor-pointer
          ${isDragging ? 'border-primary bg-primary/5' : 'border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800'}
          ${isUploading ? 'opacity-50 pointer-events-none' : ''}
        `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <UploadCloud className={`h-10 w-10 mb-3 ${isDragging ? 'text-primary' : 'text-gray-400'}`} />
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-1 text-center font-medium">
          {isUploading ? 'Enviando...' : 'Arraste arquivos aqui ou clique para selecionar'}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          Formatos suportados: {allowedTypes.map(t => t.split('/')[1]).join(', ').toUpperCase()} (Max {maxSizeMB}MB)
        </p>
        <input 
          type="file" 
          ref={fileInputRef}
          className="hidden" 
          onChange={onChange}
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
