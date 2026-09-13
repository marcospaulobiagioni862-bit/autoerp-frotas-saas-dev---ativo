import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(file:string)=>fs.readFileSync(path.join(root,file),'utf8');
const migration=read('drizzle/0072_maintenance_part_stock_movements.sql');
const authority=read('src/server/maintenancePartStockAuthority.ts');
const routes=read('src/server/maintenancePartStockRoutes.ts');
const maintenanceRoutes=read('src/server/maintenanceRoutes.ts');
const archiveRoutes=read('src/server/maintenanceArchiveRoutes.ts');
const client=read('src/api/maintenanceClient.ts');
const catalog=read('src/components/maintenance/PartStockCatalog.tsx');
const management=read('src/components/maintenance/MaintenanceManagement.tsx');
function expect(condition:boolean,message:string):void{if(!condition)throw new Error(message);}

expect(migration.includes('CREATE TABLE IF NOT EXISTS part_stock_movements'),'movement ledger missing');
expect(migration.includes('UNIQUE(company_id,idempotency_key)'),'idempotency constraint missing');
expect(migration.includes('ENABLE ROW LEVEL SECURITY')&&migration.includes('tenant_isolation_part_stock_movements'),'tenant RLS missing');
expect(migration.includes("movement_type IN ('ENTRY','USE_WORK_ORDER','ADJUSTMENT_IN','ADJUSTMENT_OUT','RETURN','LOSS','REVERSAL')"),'movement types incomplete');
expect(migration.includes('validate_work_order_part_stock_selection')&&migration.includes('BEFORE INSERT OR UPDATE OF part_id,quantity'),'server-side stock validation at OS selection missing');
expect(migration.includes('consume_work_order_parts_on_completion')&&migration.includes("NEW.status = 'COMPLETED'"),'OS completion stock hook missing');
expect(migration.includes('INSUFFICIENT_PART_STOCK')&&migration.includes('PART_ARCHIVED'),'stock guards missing');
expect(migration.includes('SUM(wop.quantity)'),'duplicate part aggregation missing');
expect(authority.includes('findByIdForCompanyWithLock')&&authority.includes('next<0'),'manual stock locking/negative guard missing');
expect(authority.includes("type==='ADJUSTMENT_IN'||type==='ADJUSTMENT_OUT'||type==='LOSS'")&&authority.includes('Motivo obrigatório'),'reason rule missing');
expect(authority.includes('static reverse(')&&authority.includes("key=`reverse:${movementId}`")&&authority.includes("movementType==='REVERSAL'"),'auditable idempotent reversal missing');
expect(routes.includes('/api/maintenance/parts/:id/movements')&&routes.includes('/:movementId/reverse'),'stock routes missing');
expect(maintenanceRoutes.includes("Use stock movements to change current stock")&&maintenanceRoutes.includes("currentStock:0")&&maintenanceRoutes.includes("movementType:'ENTRY'"),'silent current stock edits or unaudited opening stock still allowed');
expect(maintenanceRoutes.includes('INSUFFICIENT_PART_STOCK:')&&maintenanceRoutes.includes('PART_ARCHIVED:'),'database stock conflicts not mapped');
expect(archiveRoutes.includes('registerMaintenancePartStockRoutes(app)'),'stock routes not composed into maintenance API');
expect(client.includes('listPartMovements')&&client.includes('movePartStock')&&client.includes('reversePartStock'),'stock client missing');
expect(catalog.includes('Movimentar estoque')&&catalog.includes('Ver histórico')&&catalog.includes('Editar cadastro')&&catalog.includes("'Arquivar':'Desarquivar'"),'catalog stock actions missing');
expect(catalog.includes('Baixo estoque')&&catalog.includes('Sem estoque')&&catalog.includes('Última movimentação'),'catalog status or latest movement missing');
expect(management.includes("<PartStockCatalog parts={parts}"),'stock catalog not integrated into maintenance screen');
console.log('maintenancePartStockRegression: ok');
