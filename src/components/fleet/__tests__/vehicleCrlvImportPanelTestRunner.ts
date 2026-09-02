import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const panelSource = readFileSync(new URL('../VehicleCrlvImportPanel.tsx', import.meta.url), 'utf8');
const detailsSource = readFileSync(new URL('../VehicleDetailsModal.tsx', import.meta.url), 'utf8');

assert(panelSource.includes('Importar CRLV'), 'vehicle documents must expose an explicit CRLV import action');
assert(panelSource.includes('entityType="Vehicle"'), 'CRLV import must persist under Vehicle authority');
assert(panelSource.includes('documentType="CRLV"'), 'CRLV import must classify the attachment as CRLV');
assert(panelSource.includes('nenhum dado do veículo é alterado automaticamente'), 'CRLV import must explain human-review authority');
assert(panelSource.includes('<AttachmentList entityType="Vehicle" entityId={vehicleId} />'), 'CRLV import must reuse the authorized attachment/Document AI surface');
assert(!panelSource.includes('VehicleClient.update'), 'CRLV upload must not mutate vehicle data automatically');
assert(detailsSource.includes('<VehicleCrlvImportPanel vehicleId={vehicle.id}/>'), 'vehicle details must expose the CRLV import panel');
assert(detailsSource.includes('documentType="VEHICLE_DOCUMENT"'), 'generic vehicle document upload must remain available');

console.log('Vehicle CRLV import panel PASS');
