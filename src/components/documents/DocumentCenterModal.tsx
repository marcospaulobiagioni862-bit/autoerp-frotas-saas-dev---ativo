import React from 'react';
import { ModalContainer } from '../ui/ModalContainer';
import { DocumentCenter } from './DocumentCenter';

export interface DocumentCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  perspective: 'VEHICLE' | 'DRIVER' | 'CONTRACT';
  entityId: string;
  entityLabel?: string;
}

export const DocumentCenterModal: React.FC<DocumentCenterModalProps> = ({
  isOpen,
  onClose,
  perspective,
  entityId,
  entityLabel,
}) => {
  if (!isOpen) return null;

  const perspectiveTitle = {
    VEHICLE: `Central de Documentos — Veículo ${entityLabel || ''}`,
    DRIVER: `Central de Documentos — Motorista ${entityLabel || ''}`,
    CONTRACT: `Central de Documentos — Contrato ${entityLabel || ''}`,
  }[perspective];

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="6xl">
      <div className="p-4 sm:p-6 space-y-4 max-h-[88vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-graphite-200 dark:border-graphite-800">
          <div>
            <h2 className="text-xl font-bold text-graphite-900 dark:text-graphite-100">{perspectiveTitle}</h2>
            <p className="text-xs text-graphite-500">
              Visualização unificada sobre o grafo de relacionamento (veículo, motorista e contrato).
            </p>
          </div>
        </div>
        <DocumentCenter
          initialPerspective={perspective}
          initialEntityId={entityId}
          isModal={true}
          onClose={onClose}
        />
      </div>
    </ModalContainer>
  );
};
