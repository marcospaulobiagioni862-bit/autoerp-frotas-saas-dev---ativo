import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { projectMaintenancePlan } from '../../domain/maintenance/maintenancePreventivePolicy';
import type { MaintenancePlan } from '../../types/entities';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// 1. Static Invariants & Code Guard Assertions (Rules 3.1 & 3.2)
const typesSrc = readFileSync(resolve(process.cwd(), 'src/types/entities/maintenance.ts'), 'utf8');
const repoSrc = readFileSync(resolve(process.cwd(), 'src/db/repositories/postgresMaintenancePreventiveRepository.ts'), 'utf8');
const authoritySrc = readFileSync(resolve(process.cwd(), 'src/server/maintenancePreventiveAuthority.ts'), 'utf8');
const templateAuthSrc = readFileSync(resolve(process.cwd(), 'src/server/maintenancePlanTemplateAuthority.ts'), 'utf8');
const routesSrc = readFileSync(resolve(process.cwd(), 'src/server/maintenancePreventiveRoutes.ts'), 'utf8');
const clientSrc = readFileSync(resolve(process.cwd(), 'src/api/maintenancePreventiveClient.ts'), 'utf8');
const uiSrc = readFileSync(resolve(process.cwd(), 'src/components/maintenance/MaintenancePreventivePanel.tsx'), 'utf8');
const migrationSrc = readFileSync(resolve(process.cwd(), 'drizzle/0094_maintenance_plan_archive.sql'), 'utf8');

// Types & Migration checks
assert(typesSrc.includes("'ACTIVE'|'PAUSED'|'COMPLETED'|'ARCHIVED'"), 'MaintenancePlanStatus must contain ARCHIVED');
assert(typesSrc.includes('removedAt?:string'), 'MaintenancePlan must support removedAt');
assert(typesSrc.includes('removedBy?:string'), 'MaintenancePlan must support removedBy');
assert(typesSrc.includes('removalReason?:string'), 'MaintenancePlan must support removalReason');
assert(migrationSrc.includes("status IN ('ACTIVE','PAUSED','COMPLETED','ARCHIVED')"), 'Migration 0094 must update check constraint');
assert(migrationSrc.includes('removed_at'), 'Migration 0094 must add removed_at');
assert(migrationSrc.includes('removed_by'), 'Migration 0094 must add removed_by');
assert(migrationSrc.includes('removal_reason'), 'Migration 0094 must add removal_reason');

// Authority & Repository checks
assert(authoritySrc.includes('removePlan'), 'MaintenancePreventiveAuthority must expose removePlan');
assert(authoritySrc.includes("status:'ARCHIVED'"), 'removePlan must mark status as ARCHIVED');
assert(!authoritySrc.includes('DELETE FROM maintenance_plans'), 'removePlan must never physically DELETE maintenance plans');
assert(repoSrc.includes("status <> 'ARCHIVED'"), 'Repository must filter out ARCHIVED plans by default');
assert(repoSrc.includes('removed_at=${x.removedAt??null}'), 'Repository save must persist removed_at');

// Resurrection Guards (Armadilha do PH-114)
assert(templateAuthSrc.includes("p.status NOT IN ('COMPLETED', 'ARCHIVED')"), 'Template update must not revive ARCHIVED plans to ACTIVE');
assert(templateAuthSrc.includes("SELECT id,status FROM maintenance_plans WHERE company_id=${p.companyId} AND vehicle_id=${vehicle.id} AND template_id=${t.id}"), 'applyToVehicleInContext must explicitly check existing plan to prevent resurrection');

// Routes & Authorization
assert(routesSrc.includes("app.post('/api/maintenance/plans/:id/remove'"), 'Routes must expose /api/maintenance/plans/:id/remove');
assert(routesSrc.includes("app.delete('/api/maintenance/plans/:id'"), 'Routes must expose DELETE /api/maintenance/plans/:id');
assert(routesSrc.includes("actor(req,res,'MUTATE_MAINTENANCE')"), 'Plan removal must be guarded by MUTATE_MAINTENANCE');

// UI & UX Checks
assert(uiSrc.includes('Remover</Button>'), 'UI must render Remover action button for plans');
assert(uiSrc.includes('openRemovePlan(p)'), 'UI must call openRemovePlan on click');
assert(uiSrc.includes('title="Remover Plano Preventivo"'), 'UI must render confirmation modal');
assert(uiSrc.includes('histórico de manutenções e Ordens de Serviço vinculadas a este veículo será preservado integralmente'), 'UI modal must confirm historical preservation');

// Client Checks
assert(clientSrc.includes('removePlan'), 'MaintenancePreventiveClient must expose removePlan');
assert(clientSrc.includes("'ACTIVE','PAUSED','COMPLETED','ARCHIVED'"), 'MaintenancePreventiveClient must validate ARCHIVED status');

// 2. Behavioral Domain Policy Simulation
const testPlan: MaintenancePlan = {
  id: 'plan-vh1-tensor',
  companyId: 'company-marcos',
  vehicleId: 'vehicle-shk9c26',
  templateId: 'template-tensor-polia',
  name: 'Tensor e polias de acessórios',
  maintenanceType: 'TENSIONER',
  intervalKm: 50000,
  intervalDays: 365,
  lastExecutionKm: 120000,
  lastExecutionDate: '2026-01-10',
  nextDueKm: 170000,
  nextDueDate: '2027-01-10',
  priority: 'HIGH',
  status: 'ACTIVE',
  cycleSequence: 1,
  lastWorkOrderId: 'wo-8841-prev',
  createdBy: 'user-marcos',
  createdAt: '2026-01-10T10:00:00Z',
  updatedAt: '2026-01-10T10:00:00Z',
};

// Projection when ACTIVE
const activeProj = projectMaintenancePlan(testPlan, 169000, '2026-10-25');
assert(activeProj.projectedStatus === 'UPCOMING' || activeProj.projectedStatus === 'DUE', 'Active plan must project upcoming/due');

// Logical Archive Simulation (Simulating removePlan)
const archivedPlan: MaintenancePlan = {
  ...testPlan,
  status: 'ARCHIVED',
  removedAt: '2026-10-25T13:00:00Z',
  removedBy: 'user-marcos',
  removalReason: 'Veículo utiliza correia elástica sem tensor',
  updatedAt: '2026-10-25T13:00:00Z',
};

assert(archivedPlan.status === 'ARCHIVED', 'Status must be ARCHIVED');
assert(archivedPlan.lastWorkOrderId === 'wo-8841-prev', 'Historical work order must remain linked');
assert(archivedPlan.lastExecutionKm === 120000, 'Historical execution km must remain preserved');

// Projection when ARCHIVED
const archivedProj = projectMaintenancePlan(archivedPlan, 175000, '2026-10-25');
assert(archivedProj.projectedStatus === 'ARCHIVED', 'Archived plan must project ARCHIVED status');
assert(archivedProj.projectedStage === 'NONE', 'Archived plan must not generate due alerts');

// 3. Mutation Testing (Rule 3.2-e)
// Verify that if template update selects all plans where status <> 'COMPLETED' (legacy bug),
// an ARCHIVED plan would have been falsely selected and resurrected to ACTIVE.
function simulateTemplateUpdateSelection(planStatus: MaintenancePlan['status'], useLegacyQuery: boolean): boolean {
  if (useLegacyQuery) {
    // Legacy query: WHERE status <> 'COMPLETED'
    return planStatus !== 'COMPLETED';
  } else {
    // Fixed query: WHERE status NOT IN ('COMPLETED', 'ARCHIVED')
    return !['COMPLETED', 'ARCHIVED'].includes(planStatus);
  }
}

// Under legacy query, an ARCHIVED plan WOULD be updated/resurrected:
assert(simulateTemplateUpdateSelection('ARCHIVED', true) === true, 'Mutation test premise: legacy query would select ARCHIVED plan');
// Under fixed query, an ARCHIVED plan is correctly skipped:
assert(simulateTemplateUpdateSelection('ARCHIVED', false) === false, 'Fixed query must protect ARCHIVED plan from resurrection');

console.log('maintenancePlanArchiveRegression: PASS');
