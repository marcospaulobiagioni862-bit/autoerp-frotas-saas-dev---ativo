import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import express, { type Request, type Response as ExpressResponse, type NextFunction } from 'express';
import { registerVehicleRoutes } from '../vehicleRoutes';
import { UnitOfWork } from '../../db/uow';
import { VehicleStatus } from '../../types/enums';
import type { Vehicle, VehicleOwnershipHistory } from '../../types/entities';
import type { AuthenticatedPrincipal } from '../auth';

// In-memory repositories mock for clean isolated regression testing
class InMemoryVehicleRepository {
  private vehicles: Map<string, Vehicle> = new Map();
  private history: VehicleOwnershipHistory[] = [];

  async findByIdForCompany(companyId: string, id: string): Promise<Vehicle | null> {
    const v = this.vehicles.get(id);
    return v && v.companyId === companyId ? { ...v } : null;
  }

  async findByIdForCompanyWithLock(companyId: string, id: string): Promise<Vehicle | null> {
    return this.findByIdForCompany(companyId, id);
  }

  async findAllByCompany(companyId: string): Promise<Vehicle[]> {
    return Array.from(this.vehicles.values())
      .filter((v) => v.companyId === companyId)
      .map((v) => ({ ...v }));
  }

  async findByPlate(companyId: string, plate: string): Promise<Vehicle | null> {
    const v = Array.from(this.vehicles.values()).find(
      (item) => item.companyId === companyId && item.plate === plate,
    );
    return v ? { ...v } : null;
  }

  async findByRenavam(companyId: string, renavam: string): Promise<Vehicle | null> {
    const v = Array.from(this.vehicles.values()).find(
      (item) => item.companyId === companyId && item.renavam === renavam,
    );
    return v ? { ...v } : null;
  }

  async create(item: Vehicle): Promise<Vehicle> {
    this.vehicles.set(item.id, { ...item });
    return { ...item };
  }

  async updateForCompany(companyId: string, id: string, patch: Partial<Vehicle>): Promise<Vehicle | null> {
    const existing = this.vehicles.get(id);
    if (!existing || existing.companyId !== companyId) return null;
    const updated = { ...existing, ...patch };
    this.vehicles.set(id, updated);
    return { ...updated };
  }

  async createOwnershipHistory(entry: VehicleOwnershipHistory): Promise<VehicleOwnershipHistory> {
    this.history.push({ ...entry });
    return { ...entry };
  }

  async closeActiveOwnershipHistory(companyId: string, vehicleId: string, effectiveTo: string): Promise<void> {
    for (const h of this.history) {
      if (h.companyId === companyId && h.vehicleId === vehicleId && !h.effectiveTo) {
        h.effectiveTo = effectiveTo;
      }
    }
  }

  async getOwnershipHistoryForVehicle(companyId: string, vehicleId: string): Promise<VehicleOwnershipHistory[]> {
    return this.history
      .filter((h) => h.companyId === companyId && h.vehicleId === vehicleId)
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
      .map((h) => ({ ...h }));
  }
}

class InMemoryKmRecordRepo {
  async create(item: any) { return item; }
  async findByVehicleIdForCompany() { return []; }
}

class InMemoryAuditLogRepo {
  async create(item: any) { return item; }
}

async function runVehicleOwnershipSuite() {
  const companyId = 'company-test-ownership';
  const vehicleRepo = new InMemoryVehicleRepository();
  const kmRepo = new InMemoryKmRecordRepo();
  const auditRepo = new InMemoryAuditLogRepo();

  // Mock UnitOfWork
  const origRun = UnitOfWork.run;
  (UnitOfWork as any).run = async (_cid: string, fn: (ctx: any) => Promise<any>) => {
    const fakeCtx = {
      getVehicleRepo: () => vehicleRepo,
      getKmRecordRepo: () => kmRepo,
      getAuditLogRepo: () => auditRepo,
      getRawTransaction: () => ({
        execute: async () => ({ rows: [] }),
      }),
    };
    return fn(fakeCtx);
  };

  const app = express();
  app.use(express.json());

  let currentPrincipal: AuthenticatedPrincipal = {
    userId: 'user-001',
    companyId,
    name: 'Operador Frotas',
    role: 'ADMIN',
    permissions: ['*'],
  };

  app.use((req: Request, _res: ExpressResponse, next: NextFunction) => {
    (req as Request & { principal?: AuthenticatedPrincipal }).principal = { ...currentPrincipal };
    next();
  });

  registerVehicleRoutes(app);

  const server: Server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    console.log('1. Validando criação de veículo próprio (TRIFLEX)');
    const resCompany = await fetch(`${baseUrl}/api/fleet/vehicles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plate: 'ERE9I71',
        renavam: '12345678901',
        chassis: '9BWAG45U6PT063001',
        brand: 'VW',
        model: 'Gol',
        color: 'Branco',
        fuelType: 'Flex',
        currentKm: 15000,
        acquisitionValue: 50000,
        currentValue: 48000,
        rentalValueBase: 1800,
        yearFabrication: 2023,
        yearModel: 2024,
        category: 'Hatch / Sedan Compacto',
        ownerType: 'COMPANY',
        ownerName: 'TRIFLEX ASSISTENCIA TECNICA DE MAQUINAS',
        ownerDocument: '22.791.551/0001-53',
        crlvExerciseYear: 2026,
        registrationState: 'SP',
        registrationCity: 'Sorocaba',
      }),
    });

    assert.equal(resCompany.status, 201, `Expected 201, got ${resCompany.status}`);
    const dataCompany = await resCompany.json() as { item: Vehicle };
    const createdCompany = dataCompany.item;
    assert.equal(createdCompany.ownerType, 'COMPANY');
    assert.equal(createdCompany.possessionType, 'PROPRIO');
    assert.equal(createdCompany.sneCoverageStatus, 'COBERTO_CNPJ');
    assert.equal(createdCompany.crlvExerciseYear, 2026);
    assert.equal(createdCompany.registrationState, 'SP');

    console.log('2. Validando histórico temporal inicial do veículo cadastrado');
    const histCompanyRes = await fetch(`${baseUrl}/api/fleet/vehicles/${createdCompany.id}/ownership-history`);
    assert.equal(histCompanyRes.status, 200);
    const histData = await histCompanyRes.json() as { items: VehicleOwnershipHistory[] };
    assert.equal(histData.items.length, 1);
    assert.equal(histData.items[0].reason, 'CADASTRO_INICIAL');
    assert.equal(histData.items[0].ownerType, 'COMPANY');

    console.log('3. Validando criação de veículo financiado/leasing (Bradesco)');
    const resLeasing = await fetch(`${baseUrl}/api/fleet/vehicles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plate: 'EJJ2B56',
        renavam: '13194010121',
        chassis: '9BWAG45U6PT063086',
        brand: 'VW',
        model: 'Gol MPI',
        color: 'Prata',
        fuelType: 'Flex',
        currentKm: 25000,
        acquisitionValue: 60000,
        currentValue: 55000,
        rentalValueBase: 2000,
        yearFabrication: 2022,
        yearModel: 2023,
        category: 'Hatch / Sedan Compacto',
        ownerType: 'FINANCED_LEASING',
        ownerName: 'BANCO BRADESCO FINANCIAMENTOS SA',
        ownerDocument: '07.207.996/0001-50',
        financialRestriction: 'ARRENDAMENTO_MERCANTIL',
        financialInstitution: 'Banco Bradesco Financiamentos S.A.',
        crlvExerciseYear: 2026,
      }),
    });

    assert.equal(resLeasing.status, 201);
    const dataLeasing = await resLeasing.json() as { item: Vehicle };
    const createdLeasing = dataLeasing.item;
    assert.equal(createdLeasing.ownerType, 'FINANCED_LEASING');
    assert.equal(createdLeasing.financialRestriction, 'ARRENDAMENTO_MERCANTIL');
    assert.equal(createdLeasing.sneCoverageStatus, 'DESCOBERTO_BANCO_LEASING');

    console.log('4. Validando criação de veículo de sócio (Marcos)');
    const resPartner = await fetch(`${baseUrl}/api/fleet/vehicles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plate: 'TIO3C61',
        renavam: '11122233344',
        chassis: '9C6RG7720S0019999',
        brand: 'Triumph',
        model: 'Tiger 1200',
        color: 'Preto',
        fuelType: 'Gasolina',
        currentKm: 8000,
        acquisitionValue: 80000,
        currentValue: 75000,
        rentalValueBase: 3500,
        yearFabrication: 2023,
        yearModel: 2023,
        category: 'Moto / Motocicleta',
        ownerType: 'PARTNER',
        ownerName: 'MARCOS PAULO BIAGIONI ROCHA',
      }),
    });
    assert.equal(resPartner.status, 201);
    const dataPartner = await resPartner.json() as { item: Vehicle };
    assert.equal(dataPartner.item.ownerType, 'PARTNER');
    assert.equal(dataPartner.item.sneCoverageStatus, 'PENDENTE_CPF_TITULAR');

    console.log('5. Validando rejeição fail-closed de CPF inválido');
    const resBadCpf = await fetch(`${baseUrl}/api/fleet/vehicles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plate: 'BAD1A11',
        renavam: '99988877766',
        chassis: '9BWAG45U6PT063099',
        brand: 'Fiat',
        model: 'Uno',
        color: 'Branco',
        fuelType: 'Flex',
        currentKm: 10000,
        acquisitionValue: 30000,
        currentValue: 28000,
        rentalValueBase: 1200,
        yearFabrication: 2020,
        yearModel: 2020,
        category: 'Hatch / Sedan Compacto',
        ownerDocument: '111.111.111-11', // CPF repetido / inválido
      }),
    });
    assert.equal(resBadCpf.status, 400);
    const badData = await resBadCpf.json() as { error: string };
    assert.ok(badData.error.includes('CPF do proprietário inválido'));

    console.log('6. Validando transição de titularidade temporal (Caso UFI3B85: Bradesco -> Triflex)');
    const resMoto = await fetch(`${baseUrl}/api/fleet/vehicles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plate: 'UFI3B85',
        renavam: '01492585286',
        chassis: '9C6RG7720S0019929',
        brand: 'YAMAHA',
        model: 'FZ15 FAZER ABS',
        color: 'Cinza',
        fuelType: 'Flex',
        currentKm: 5000,
        acquisitionValue: 18000,
        currentValue: 17500,
        rentalValueBase: 1000,
        yearFabrication: 2025,
        yearModel: 2025,
        category: 'Moto / Motocicleta',
        ownerType: 'FINANCED_LEASING',
        ownerName: 'BANCO BRADESCO FINANCIAMENTOS SA',
        financialRestriction: 'ARRENDAMENTO_MERCANTIL',
      }),
    });
    assert.equal(resMoto.status, 201);
    const motoData = await resMoto.json() as { item: Vehicle };
    const motoId = motoData.item.id;

    // Quitação do financiamento: transferência para a TRIFLEX
    const resQuita = await fetch(`${baseUrl}/api/fleet/vehicles/${motoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerType: 'COMPANY',
        ownerName: 'TRIFLEX ASSISTENCIA TECNICA DE MAQUINAS',
        ownerDocument: '22791551000153',
        financialRestriction: 'NONE',
        ownershipChangeReason: 'QUITACAO_FINANCIAMENTO',
      }),
    });
    assert.equal(resQuita.status, 200);
    const quitaData = await resQuita.json() as { item: Vehicle };
    assert.equal(quitaData.item.ownerType, 'COMPANY');
    assert.equal(quitaData.item.sneCoverageStatus, 'COBERTO_CNPJ');

    // Verificar linha do tempo histórica da moto
    const histMotoRes = await fetch(`${baseUrl}/api/fleet/vehicles/${motoId}/ownership-history`);
    assert.equal(histMotoRes.status, 200);
    const histMotoData = await histMotoRes.json() as { items: VehicleOwnershipHistory[] };
    const items = histMotoData.items;
    assert.equal(items.length, 2, 'Deve ter 2 registros históricos');

    // Item mais recente: TRIFLEX ativo (sem effectiveTo)
    assert.equal(items[0].ownerType, 'COMPANY');
    assert.equal(items[0].reason, 'QUITACAO_FINANCIAMENTO');
    assert.equal(items[0].effectiveTo, undefined);

    // Item anterior: BRADESCO encerrado (com effectiveTo preenchido)
    assert.equal(items[1].ownerType, 'FINANCED_LEASING');
    assert.equal(items[1].reason, 'CADASTRO_INICIAL');
    assert.ok(items[1].effectiveTo, 'Registro anterior deve ter data de término de vigência');

    console.log('Vehicle Ownership & SNE Coverage Regression Suite: ALL TESTS PASS');
  } finally {
    server.close();
    server.closeAllConnections?.();
    (UnitOfWork as any).run = origRun;
    process.exit(0);
  }
}

runVehicleOwnershipSuite().catch((err) => {
  console.error('REGRESSION SUITE FAILED:', err);
  process.exit(1);
});
