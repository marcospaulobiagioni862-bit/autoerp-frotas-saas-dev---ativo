import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const authority = readFileSync(resolve(process.cwd(), 'src/server/maintenanceArchiveAuthority.ts'), 'utf8');
const routes = readFileSync(resolve(process.cwd(), 'src/server/maintenanceArchiveRoutes.ts'), 'utf8');
const client = readFileSync(resolve(process.cwd(), 'src/api/maintenanceClient.ts'), 'utf8');
const ui = readFileSync(resolve(process.cwd(), 'src/components/maintenance/MaintenanceManagement.tsx'), 'utf8');
const types = readFileSync(resolve(process.cwd(), 'src/types/entities/maintenance.ts'), 'utf8');

assert(types.includes("'ARCHIVED'"), 'work-order status must support logical archive');
assert(authority.includes("['COMPLETED', 'CANCELLED'].includes(before.status)"), 'only closed/cancelled work orders may be archived');
assert(authority.includes("status: 'ARCHIVED'"), 'archive must be a logical status transition');
assert(authority.includes('previousStatus: before.status'), 'archive audit must preserve prior status');
assert(authority.includes('archivedBy: principal.userId'), 'archive audit must preserve actor');
assert(authority.includes('reason,'), 'archive audit must preserve reason');
assert(!authority.includes('DELETE FROM'), 'archive must never physically delete work-order data');
assert(routes.includes("/api/maintenance/work-orders/:id/archive"), 'archive route must be exposed server-side');
assert(client.includes('archiveWorkOrder'), 'maintenance client must expose archive action');
assert(ui.includes('<option value="ARCHIVED">Arquivadas</option>'), 'UI must expose archived filter');
assert(ui.includes('MaintenanceClient.archiveWorkOrder'), 'UI archive action must call authoritative endpoint');
assert(ui.includes("['SOLD','INACTIVE','ARCHIVED'].includes(vehicleLifecycle[wo.vehicleId]||'')"), 'sold/archived vehicles must be recognized as historical');
assert(ui.includes("workOrderView==='ACTIVE'&&!archived"), 'historical/archive work orders must stay out of default operational queue');
assert(ui.includes('Veículo vendido/baixado'), 'historical vehicle state must be visible in history');
assert(ui.includes("['COMPLETED','ARCHIVED'].includes(wo.status) && payable"), 'archive must preserve payable access');

console.log('Maintenance work-order archive regression: PASS');
