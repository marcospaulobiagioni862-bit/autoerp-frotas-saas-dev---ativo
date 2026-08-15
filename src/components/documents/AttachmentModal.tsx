import React, { useState } from 'react';
import { ModalContainer } from '../ui/ModalContainer';
import { AttachmentList } from './AttachmentList';
import { FileUpload } from './FileUpload';

interface AttachmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: string;
  entityId: string;
  documentType: string;
  title: string;
}

export function AttachmentModal({ isOpen, onClose, entityType, entityId, documentType, title }: AttachmentModalProps) {
  const [uploadCount, setUploadCount] = useState(0);

  if (!isOpen) return null;

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} title={title} maxWidth="max-w-2xl">
      <div className="space-y-6">
        <div>
          <h4 className="text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">Fazer Upload</h4>
          <FileUpload 
            entityType={entityType}
            entityId={entityId}
            documentType={documentType}
            onUploadComplete={() => {
              setUploadCount(prev => prev + 1);
            }}
            multiple={true}
          />
        </div>
        <div>
          <h4 className="text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">Anexos Existentes</h4>
          <div key={uploadCount}><AttachmentList entityType={entityType} entityId={entityId} /></div>
        </div>
      </div>
    </ModalContainer>
  );
}
