import React, { useState } from 'react';
import { ModalContainer } from '../ui/ModalContainer';
import { AttachmentList } from './AttachmentList';
import { FileUpload } from './FileUpload';
import { MaintenanceCrlvHandoffPanel } from '../maintenance/MaintenanceCrlvHandoffPanel';

interface AttachmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: string;
  entityId: string;
  documentType: string;
  title: string;
  documentTypeOptions?: Array<{ value:string; label:string }>;
}

export function AttachmentModal({ isOpen, onClose, entityType, entityId, documentType, title, documentTypeOptions }: AttachmentModalProps) {
  const [uploadCount, setUploadCount] = useState(0);
  const [selectedDocumentType, setSelectedDocumentType] = useState(documentType);

  if (!isOpen) return null;

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} title={title} maxWidth="max-w-2xl">
      <div className="space-y-6">
        <div>
          <h4 className="text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">Fazer Upload</h4>
          {documentTypeOptions&&documentTypeOptions.length>0&&<label className="mb-3 block text-xs font-semibold text-slate-600 dark:text-slate-300">Tipo do anexo
            <select className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm dark:border-slate-700 dark:bg-slate-900" value={selectedDocumentType} onChange={e=>setSelectedDocumentType(e.target.value)}>
              {documentTypeOptions.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>}
          <FileUpload 
            entityType={entityType}
            entityId={entityId}
            documentType={selectedDocumentType}
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
        {entityType === 'MaintenanceWorkOrder' && (
          <div key={`maintenance-crlv-${uploadCount}`}>
            <MaintenanceCrlvHandoffPanel workOrderId={entityId} />
          </div>
        )}
      </div>
    </ModalContainer>
  );
}