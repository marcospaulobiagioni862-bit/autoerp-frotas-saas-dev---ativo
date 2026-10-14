import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import express, { type Request, type Response as ExpressResponse, type NextFunction } from 'express';
import { registerVehicleRoutes } from '../vehicleRoutes';
import { registerVehicleLifecycleRoutes } from '../vehicleLifecycleRoutes';
import { UnitOfWork } from '../../db/uow';
import { VehicleStatus } from '../../types/enums';
import type { Vehicle } from '../../types/entities';
import type { AuthenticatedPrincipal } from '../auth';

class InMemoryVehicleRepository {
  private vehicles: Map<string, Vehicle> = new Map();

  setVehicle(vehicle: Vehicle) {
    this.vehicles.set(vehicle.id, { ...vehicle });
  }

  async findByIdForCompany(companyId: string, id: string): Promise<Vehicle | null> {
    const v = this.vehicles.get(id);
    return v && v.companyId === companyId ? { ...v } : null;
  }

  async findByIdForCompanyWithLock(companyId: string, id: string): Promise<Vehicle | null> {
    return this.findByIdForCompany(companyId, id);
  }

  async updateForCompany(companyId: string, id: string, patch: Partial<Vehicle>): Promise<Vehicle | null> {
    const existing = this.vehicles.get(id);
    if (!existing || existing.companyId !== companyId) return null;
    const updated = { ...existing, ...patch };
    this.vehicles.set(id, updated);
    return { ...updated };
  }

  async deleteForCompany(id: string, companyId: string): Promise<boolean> {
    const existing = this.vehicles.get(id);
    if (!existing || existing.companyId !== companyId) return false;
    this.vehicles.delete(id);
    return true;
  }
}

class InMemoryContractRepo {
  async findActiveByVehicle(_companyId: string, _vehicleId: string) {
    return null;
  }
}

class InMemoryWorkOrderRepo {
  async hasBlockingWorkOrder(_companyId: string, _vehicleId: string, _id: string) {
    return false;
  }
}

class InMemoryAuditLogRepo {
  public logs: any[] = [];
  async create(item: any) {
    this.logs.push(item);
    return item;
  }
}

async function runVehicleRestoreAndDeleteIntegration() {
  console.log('--- Iniciando Teste de Integração: Exclusão Segura e Retorno ao Estoque (PH-029) ---');
  const companyId = 'company-test-restore-delete';
  const vehicleRepo = new InMemoryVehicleRepository();
  const contractRepo = new InMemoryContractRepo();
  const workOrderRepo = new InMemoryWorkOrderRepo();
  const auditRepo = new InMemoryAuditLogRepo();

  let mockHistoricalCounts: Record<string, number> = {
    contracts_cnt: 0,
    ar_cnt: 0,
    ap_cnt: 0,
    tt_cnt: 0,
    wo_cnt: 0,
    ft_cnt: 0,
    ins_cnt: 0,
    toll_cnt: 0,
    sd_cnt: 0,
  };

  const executedRawQueries: string[] = [];

  // Mock UnitOfWork
  const origRun = UnitOfWork.run;
  (UnitOfWork as any).run = async (_cid: string, fn: (ctx: any) => Promise<any>) => {
    const fakeCtx = {
      getVehicleRepo: () => vehicleRepo,
      getContractRepo: () => contractRepo,
      getWorkOrderRepo: () => workOrderRepo,
      getAuditLogRepo: () => auditRepo,
      getRawTransaction: () => ({
        execute: async (query: any) => {
          let queryString = '';
          if (typeof query === 'string') {
            queryString = query;
          } else if (query?.queryChunks) {
            queryString = query.queryChunks.map((c: any) => c?.value ? (Array.isArray(c.value) ? c.value.join(' ') : String(c.value)) : '').join(' ');
          } else {
            queryString = JSON.stringify(query);
          }
          executedRawQueries.push(queryString);
          if (queryString.includes('contracts_cnt')) {
            return { rows: [{ ...mockHistoricalCounts }] };
          }
          return { rows: [] };
        },
      }),
    };
    return fn(fakeCtx);
  };

  const app = express();
  app.use(express.json());

  let currentPrincipal: AuthenticatedPrincipal = {
    userId: 'user-001',
    companyId,
    name: 'Admin Frotas',
    role: 'ADMIN',
    permissions: ['*'],
  };

  app.use((req: Request, _res: ExpressResponse, next: NextFunction) => {
    (req as Request & { principal?: AuthenticatedPrincipal }).principal = { ...currentPrincipal };
    next();
  });

  registerVehicleRoutes(app);
  registerVehicleLifecycleRoutes(app);

  const server: Server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Validar 403 Forbidden em DELETE quando usuário não possui permissão
    console.log('[1/5] Testando 403 Forbidden em DELETE para usuário sem permissão...');
    const testVeh1: Vehicle = {
      id: 'veh-del-1',
      companyId,
      plate: 'ABC1D23',
      renavam: '12345678901',
      chassis: '9BWAG45U6PT063001',
      brand: 'VW',
      model: 'Gol',
      color: 'Branco',
      fuelType: 'Flex',
      category: 'Padrão',
      currentKm: 10000,
      acquisitionValue: 50000,
      currentValue: 45000,
      rentalValueBase: 1500,
      yearFabrication: 2022,
      yearModel: 2023,
      status: VehicleStatus.AVAILABLE,
      isArchived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    vehicleRepo.setVehicle(testVeh1);

    currentPrincipal = {
      userId: 'user-op',
      companyId,
      name: 'Operador Readonly',
      role: 'OPERATIONAL',
      permissions: ['VIEW_VEHICLE'],
    };

    const resForbidden = await fetch(`${baseUrl}/api/fleet/vehicles/${testVeh1.id}`, {
      method: 'DELETE',
    });
    assert.equal(resForbidden.status, 403, `Esperado 403 ao deletar sem permissão, obteve ${resForbidden.status}`);
    console.log('✓ 403 Forbidden validado com sucesso para usuário sem DELETE_VEHICLE.');

    // 2. Validar 409 Conflict em DELETE quando veículo tem histórico comercial/financeiro
    console.log('[2/5] Testando 409 Conflict em DELETE para veículo com histórico (contratos/CRs/multas)...');
    currentPrincipal = {
      userId: 'user-admin',
      companyId,
      name: 'Admin Frotas',
      role: 'ADMIN',
      permissions: ['*'],
    };

    mockHistoricalCounts = {
      contracts_cnt: 1,
      ar_cnt: 2,
      ap_cnt: 0,
      tt_cnt: 1,
      wo_cnt: 0,
      ft_cnt: 0,
      ins_cnt: 0,
      toll_cnt: 0,
      sd_cnt: 0,
    };

    const resConflict = await fetch(`${baseUrl}/api/fleet/vehicles/${testVeh1.id}`, {
      method: 'DELETE',
    });
    assert.equal(resConflict.status, 409, `Esperado 409 ao tentar deletar veículo com histórico, obteve ${resConflict.status}`);
    const conflictBody = await resConflict.json() as any;
    assert.match(conflictBody.error, /não é possível excluir definitivamente/i);
    // Garantir que veículo continua existindo no banco
    const stillExists = await vehicleRepo.findByIdForCompany(companyId, testVeh1.id);
    assert.ok(stillExists, 'Veículo não deve ser removido quando há registros vinculados');
    console.log('✓ 409 Conflict validado com sucesso: bloqueio rigoroso contra exclusão de veículo com histórico.');

    // 3. Validar 200 OK em DELETE quando veículo foi cadastrado por engano (sem histórico comercial)
    console.log('[3/5] Testando 200 OK em DELETE para veículo sem histórico (cadastro por engano)...');
    mockHistoricalCounts = {
      contracts_cnt: 0,
      ar_cnt: 0,
      ap_cnt: 0,
      tt_cnt: 0,
      wo_cnt: 0,
      ft_cnt: 0,
      ins_cnt: 0,
      toll_cnt: 0,
      sd_cnt: 0,
    };

    const resSuccessDelete = await fetch(`${baseUrl}/api/fleet/vehicles/${testVeh1.id}`, {
      method: 'DELETE',
    });
    assert.equal(resSuccessDelete.status, 200, `Esperado 200 ao deletar veículo sem histórico, obteve ${resSuccessDelete.status}`);
    const successBody = await resSuccessDelete.json() as any;
    assert.equal(successBody.success, true);
    // Garantir que foi removido do repositório
    const deletedVeh = await vehicleRepo.findByIdForCompany(companyId, testVeh1.id);
    assert.equal(deletedVeh, null, 'Veículo sem histórico deve ser removido com sucesso');
    // Garantir que as tabelas operacionais foram limpas para evitar órfãos
    assert.ok(executedRawQueries.some((q) => q.includes('vehicle_lifecycle_events')), 'Deveria limpar vehicle_lifecycle_events');
    assert.ok(executedRawQueries.some((q) => q.includes('vehicle_km_records')), 'Deveria limpar vehicle_km_records');
    assert.ok(executedRawQueries.some((q) => q.includes('vehicle_inspections')), 'Deveria limpar vehicle_inspections');
    assert.ok(executedRawQueries.some((q) => q.includes('vehicle_document_intakes')), 'Deveria limpar vehicle_document_intakes');
    assert.ok(executedRawQueries.some((q) => q.includes('vehicle_ownership_history')), 'Deveria limpar vehicle_ownership_history');
    console.log('✓ 200 OK validado: exclusão segura sem deixar órfãos nas tabelas operacionais.');

    // 4. Validar 201 OK em restore de veículo SOLD e de veículo ARCHIVED
    console.log('[4/5] Testando 201 OK ao restaurar veículo SOLD e veículo ARCHIVED (FGL6I36)...');
    const soldVehicle: Vehicle = {
      id: 'veh-sold-1',
      companyId,
      plate: 'FGL6I36',
      renavam: '99887766554',
      chassis: '9BWAG45U6PT099999',
      brand: 'Fiat',
      model: 'Mobi',
      color: 'Preto',
      fuelType: 'Flex',
      category: 'Econômico',
      currentKm: 35000,
      acquisitionValue: 40000,
      currentValue: 38000,
      rentalValueBase: 1200,
      yearFabrication: 2021,
      yearModel: 2022,
      status: VehicleStatus.SOLD,
      isArchived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    vehicleRepo.setVehicle(soldVehicle);

    const resRestoreSold = await fetch(`${baseUrl}/api/fleet/vehicles/${soldVehicle.id}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restoreDate: '2026-10-14',
        reason: 'Recompra / retorno de veículo vendido ao estoque ativo',
      }),
    });
    assert.equal(resRestoreSold.status, 201, `Esperado 201 ao restaurar veículo SOLD, obteve ${resRestoreSold.status}`);
    const restoredSold = await vehicleRepo.findByIdForCompany(companyId, soldVehicle.id);
    assert.equal(restoredSold?.status, VehicleStatus.AVAILABLE, 'Status do veículo após restore deve ser AVAILABLE');
    assert.equal(restoredSold?.isArchived, false, 'isArchived deve ser false');

    // Testar com veículo ARCHIVED
    const archivedVehicle: Vehicle = {
      id: 'veh-archived-1',
      companyId,
      plate: 'ARC1A23',
      renavam: '11223344556',
      chassis: '9BWAG45U6PT088888',
      brand: 'Chevrolet',
      model: 'Onix',
      color: 'Prata',
      fuelType: 'Flex',
      category: 'Padrão',
      currentKm: 25000,
      acquisitionValue: 55000,
      currentValue: 52000,
      rentalValueBase: 1600,
      yearFabrication: 2022,
      yearModel: 2023,
      status: VehicleStatus.ARCHIVED,
      isArchived: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    vehicleRepo.setVehicle(archivedVehicle);

    const resRestoreArchived = await fetch(`${baseUrl}/api/fleet/vehicles/${archivedVehicle.id}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restoreDate: '2026-10-14',
        reason: 'Reativação de veículo arquivado',
      }),
    });
    assert.equal(resRestoreArchived.status, 201, `Esperado 201 ao restaurar veículo ARCHIVED, obteve ${resRestoreArchived.status}`);
    const restoredArchived = await vehicleRepo.findByIdForCompany(companyId, archivedVehicle.id);
    assert.equal(restoredArchived?.status, VehicleStatus.AVAILABLE, 'Status do veículo arquivado após restore deve ser AVAILABLE');
    assert.equal(restoredArchived?.isArchived, false, 'isArchived deve ser false');
    console.log('✓ 201 OK validado: veículos SOLD e ARCHIVED retornam com sucesso ao estoque como AVAILABLE.');

    // 5. Validar 409 Conflict ao tentar restaurar veículo que já está AVAILABLE
    console.log('[5/5] Testando 409 Conflict ao tentar restaurar veículo que já está AVAILABLE...');
    const resAlreadyAvailable = await fetch(`${baseUrl}/api/fleet/vehicles/${restoredArchived!.id}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restoreDate: '2026-10-14',
        reason: 'Tentativa redundante',
      }),
    });
    assert.equal(resAlreadyAvailable.status, 409, `Esperado 409 para veículo já AVAILABLE, obteve ${resAlreadyAvailable.status}`);
    const alreadyAvailableBody = await resAlreadyAvailable.json() as any;
    assert.match(alreadyAvailableBody.error, /only a sold or archived vehicle can return to stock/i);
    console.log('✓ 409 Conflict validado: bloqueia tentativa de retorno de veículo já ativo.');

    console.log('\n--- TODOS OS 5 CASOS DE TESTE PASSARAM COM SUCESSO! ---');
  } finally {
    (UnitOfWork as any).run = origRun;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    process.exit(0);
  }
}

runVehicleRestoreAndDeleteIntegration().catch((err) => {
  console.error('FALHA NO TESTE DE INTEGRAÇÃO:', err);
  process.exit(1);
});
