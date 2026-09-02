import React, { useState } from 'react';
import { FileText } from 'lucide-react';
import { FileUpload } from '../documents/FileUpload';
import { AttachmentList } from '../documents/AttachmentList';

interface VehicleCrlvImportPanelProps {
  vehicleId: string;
}

export const VehicleCrlvImportPanel: React.FC<VehicleCrlvImportPanelProps> = ({ vehicleId }) => {
  const [uploadCount, setUploadCount] = useState(0);

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
        <div>
          <h4 className="font-bold text-blue-900">Importar CRLV</h4>
          <p className="mt-1 text-[11px] text-blue-800">
            Envie o CRLV como documento do veículo. O arquivo original será preservado e a extração pela IA continuará como proposta para revisão humana; nenhum dado do veículo é alterado automaticamente.
          </p>
        </div>
      </div>
      <FileUpload
        entityType="Vehicle"
        entityId={vehicleId}
        documentType="CRLV"
        onUploadComplete={() => setUploadCount((value) => value + 1)}
      />
      <div key={uploadCount}>
        <AttachmentList entityType="Vehicle" entityId={vehicleId} />
      </div>
    </div>
  );
};
