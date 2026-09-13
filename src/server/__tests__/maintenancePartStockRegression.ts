import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(file:string)=>fs.readFileSync(path.join(root,file),'utf8');
const migration=read('drizzle/0072_maintenance_part_stock_movements.sql');
const authority=read('src/server/maintenancePartStockAuthority.ts');
const routes=read('src/server/maintenancePartStockRoutes.ts');
const archiveRoutes=read('src/server/maintenanceArchiveRoutes.ts');
const client=read('src/api/maintenanceClient.ts');
function expect(condition:boolean,message:string):void{if(!condition)throw new Error(message);}

expect(migration.includes('CREATE TABLE IF NOT EXISTS part_stock_movements'),'movement ledger missing');
expect(migration.includes('UNIQUE(company_id,idempotency_key)'),'idempotency constraint missing');
expect(migration.includes('ENABLE ROW LEVEL SECURITY')&&migration.includes('tenant_isolation_part_stock_movements'),'tenant RLS missing');
expect(migration.includes("movement_type IN ('ENTRY','USE_WORK_ORDER','ADJUSTMENT_IN','ADJUSTMENT_OUT','RETURN','LOSS','REVERSAL')"),'movement types incomplete');
expect(migration.includes('consume_work_order_parts_on_completion')&&migration.includes("NEW.status = 'COMPLETED'"),'OS completion stock hook missing');
expect(migration.includes('INSUFFICIENT_PART_STOCK')&&migration.includes('PART_ARCHIVED'),'stock guards missing');
expect(migration.includes('SUM(wop.quantity)'),'duplicate part aggregation missing');
expect(authority.includes('findByIdForCompanyWithLock')&&authority.includes('next<0'),'manual stock locking/negative guard missing');
expect(authority.includes("['ADJUSTMENT_IN','ADJUSTMENT_OUT','LOSS']")&&authority.includes('Motivo obrigatório'),'reason rule missing');
expect(routes.includes("GET")===false && routes.includes("/api/maintenance/parts/:id/movements"),'stock routes missing');
expect(archiveRoutes.includes('registerMaintenancePartStockRoutes(app)'),'stock routes not composed into maintenance API');
expect(client.includes('listPartMovements')&&client.includes('movePartStock'),'stock client missing');
console.log('maintenancePartStockRegression: ok');
