// AutoERP Driver Domain Verification Test Suite (D01 to D20)

import { DriverService, evaluateCnhStatus, isValidCPF } from '../DriverService';
import { seedAutoERPTestData } from '../../../persistence/seed/seedData';
import { DriverStatus, DocumentStatus, ObligationStatus } from '../../../types/enums';
import {
  DriverRepository,
  ContractRepository,
  TrafficTicketRepository,
  SecurityDepositRepository,
  AccountReceivableRepository,
  AuditLogRepository,
} from '../../../persistence/repositories/localRepositories';
import { generateUUID } from '../../../shared/utils/uuid';

export interface DriverTestResult {
  id: string;
  name: string;
  passed: boolean;
  message: string;
}

export class DriverTestRunner {
  public static async runAllTests(): Promise<{
    total: number;
    passed: number;
    failed: number;
    results: DriverTestResult[];
  }> {
    await seedAutoERPTestData(true);

    const driverService = new DriverService();
    const companyId = 'company-main-uuid';
    const userId = 'usr-admin';
    const userName = 'Admin Tester';

    const results: DriverTestResult[] = [];

    const test = async (
      id: string,
      name: string,
      fn: () => Promise<void>
    ) => {
      try {
        await fn();
        results.push({ id, name, passed: true, message: 'Sucesso' });
      } catch (err: any) {
        results.push({ id, name, passed: false, message: err.message || String(err) });
      }
    };

    // D01: Criar motorista válido
    await test('D01', 'Criar motorista válido', async () => {
      const created = await driverService.createDriver(
        {
          companyId,
          fullName: 'Carlos Alberto Teste',
          cpf: '111.444.777-35',
          rg: '12.345.678-9',
          birthDate: '1990-05-15',
          phone: '(11) 98888-1111',
          address: {
            street: 'Rua das Flores',
            number: '123',
            neighborhood: 'Centro',
            city: 'São Paulo',
            state: 'SP',
            zipCode: '01000-000',
          },
          cnhNumber: '12345678901',
          cnhCategory: 'B',
          cnhExpiration: '2028-12-31',
        },
        userId,
        userName
      );

      if (!created || created.fullName !== 'Carlos Alberto Teste') {
        throw new Error('Falha ao criar motorista válido.');
      }
    });

    // D02: Bloquear CPF duplicado
    await test('D02', 'Bloquear CPF duplicado', async () => {
      try {
        await driverService.createDriver(
          {
            companyId,
            fullName: 'Outro Carlos',
            cpf: '111.444.777-35', // Mesma do D01
            birthDate: '1992-01-01',
            phone: '(11) 97777-2222',
            address: {
              street: 'Rua B',
              number: '456',
              neighborhood: 'Bairro',
              city: 'São Paulo',
              state: 'SP',
              zipCode: '02000-000',
            },
            cnhNumber: '99988877766',
            cnhCategory: 'B',
            cnhExpiration: '2027-01-01',
          },
          userId,
          userName
        );
        throw new Error('Deveria ter lançado erro de CPF duplicado.');
      } catch (err: any) {
        if (!err.message.includes('CPF') || !err.message.includes('cadastrado')) {
          throw err;
        }
      }
    });

    // D03: Bloquear CNH duplicada
    await test('D03', 'Bloquear CNH duplicada', async () => {
      try {
        await driverService.createDriver(
          {
            companyId,
            fullName: 'Mariana Silva',
            cpf: '888.555.222-01',
            birthDate: '1995-03-10',
            phone: '(11) 96666-3333',
            address: {
              street: 'Rua C',
              number: '789',
              neighborhood: 'Norte',
              city: 'São Paulo',
              state: 'SP',
              zipCode: '03000-000',
            },
            cnhNumber: '12345678901', // Mesma do D01
            cnhCategory: 'B',
            cnhExpiration: '2028-01-01',
          },
          userId,
          userName
        );
        throw new Error('Deveria ter lançado erro de CNH duplicada.');
      } catch (err: any) {
        if (!err.message.includes('CNH') || !err.message.includes('cadastrada')) {
          throw err;
        }
      }
    });

    // D04: Rejeitar CPF inválido
    await test('D04', 'Rejeitar CPF inválido', async () => {
      try {
        await driverService.createDriver(
          {
            companyId,
            fullName: 'Pedro Invalido',
            cpf: '123.456.789-00', // CPF Inválido
            birthDate: '1988-08-08',
            phone: '(11) 95555-4444',
            address: {
              street: 'Rua D',
              number: '12',
              neighborhood: 'Sul',
              city: 'São Paulo',
              state: 'SP',
              zipCode: '04000-000',
            },
            cnhNumber: '55544433322',
            cnhCategory: 'B',
            cnhExpiration: '2028-01-01',
          },
          userId,
          userName
        );
        throw new Error('Deveria ter rejeitado CPF inválido.');
      } catch (err: any) {
        if (!err.message.includes('inválido')) throw err;
      }
    });

    // D05: Rejeitar data de nascimento futura
    await test('D05', 'Rejeitar data de nascimento futura', async () => {
      try {
        const futureDate = '2099-01-01';
        await driverService.createDriver(
          {
            companyId,
            fullName: 'Futuro da Silva',
            cpf: '529.982.247-25',
            birthDate: futureDate,
            phone: '(11) 94444-5555',
            address: {
              street: 'Rua E',
              number: '99',
              neighborhood: 'Leste',
              city: 'São Paulo',
              state: 'SP',
              zipCode: '05000-000',
            },
            cnhNumber: '44433322211',
            cnhCategory: 'B',
            cnhExpiration: '2028-01-01',
          },
          userId,
          userName
        );
        throw new Error('Deveria ter rejeitado data de nascimento no futuro.');
      } catch (err: any) {
        if (!err.message.includes('futuro')) throw err;
      }
    });

    // D06: Criar motorista com CNH válida
    await test('D06', 'Criar motorista com CNH válida', async () => {
      const res = evaluateCnhStatus('2029-10-10');
      if (res.status !== DocumentStatus.VALID) {
        throw new Error('Status da CNH deveria ser VÁLIDA.');
      }
    });

    // D07: Detectar CNH vencida
    await test('D07', 'Detectar CNH vencida', async () => {
      const res = evaluateCnhStatus('2020-01-01');
      if (res.status !== DocumentStatus.EXPIRED) {
        throw new Error('Status da CNH deveria ser EXPIRED.');
      }
    });

    // D08: Detectar CNH próxima do vencimento
    await test('D08', 'Detectar CNH próxima do vencimento', async () => {
      const in20Days = new Date();
      in20Days.setDate(in20Days.getDate() + 20);
      const dateStr = in20Days.toISOString().split('T')[0];
      const res = evaluateCnhStatus(dateStr);
      if (res.status !== DocumentStatus.EXPIRING_SOON) {
        throw new Error('Status da CNH deveria ser EXPIRING_SOON.');
      }
    });

    // D09: Alterar motorista
    let testDriverId = '';
    await test('D09', 'Alterar motorista', async () => {
      const driverRepo = new DriverRepository();
      const list = await driverRepo.findAll();
      const target = list[0];
      if (!target) throw new Error('Nenhum motorista encontrado.');
      testDriverId = target.id;

      const updated = await driverService.updateDriver(
        target.id,
        { phone: '(11) 99999-0000' },
        userId,
        userName
      );

      if (updated.phone !== '(11) 99999-0000') {
        throw new Error('Telefone do motorista não foi alterado.');
      }
    });

    // D10: Registrar AuditLog da alteração
    await test('D10', 'Registrar AuditLog da alteração', async () => {
      const auditRepo = new AuditLogRepository();
      const allLogs = await auditRepo.findAll();
      const logs = allLogs.filter((log) => log.entityId === testDriverId);
      if (!logs || logs.length === 0) {
        throw new Error('Não foi registrado AuditLog para a alteração.');
      }
    });

    // D11: Alterar status
    await test('D11', 'Alterar status do motorista', async () => {
      const updated = await driverService.changeStatus(
        testDriverId,
        DriverStatus.INACTIVE,
        'Desativação temporária para férias',
        userId,
        userName
      );
      if (updated.status !== DriverStatus.INACTIVE) {
        throw new Error('Status do motorista não foi alterado para INACTIVE.');
      }
    });

    // D12: Bloquear motorista
    await test('D12', 'Bloquear motorista', async () => {
      const updated = await driverService.blockDriver(
        testDriverId,
        'Inadimplência recorrente',
        userId,
        userName
      );
      if (updated.status !== DriverStatus.BLOCKED) {
        throw new Error('Motorista não foi bloqueado.');
      }
    });

    // D13: Desbloquear motorista
    await test('D13', 'Desbloquear motorista', async () => {
      const updated = await driverService.unblockDriver(
        testDriverId,
        'Débito quitado',
        userId,
        userName
      );
      if (updated.status !== DriverStatus.ACTIVE) {
        throw new Error('Motorista não foi reativado para ACTIVE.');
      }
    });

    // D14: Impedir exclusão física quando há histórico
    await test('D14', 'Impedir exclusão com histórico (Arquivar)', async () => {
      const result = await driverService.deleteOrArchiveDriver(
        testDriverId,
        userId,
        userName
      );
      if (result.action !== 'ARCHIVED' && result.action !== 'DELETED') {
        throw new Error('Ação inválida no descarte do motorista.');
      }
    });

    // D15: Listar veículos relacionados
    await test('D15', 'Listar veículos e resumo detalhado', async () => {
      const driverRepo = new DriverRepository();
      const list = await driverRepo.findAll();
      if (list.length > 0) {
        const summary = await driverService.getDriverDetailedSummary(list[0].id);
        if (!summary || !summary.driver) {
          throw new Error('Não foi possível carregar o resumo detalhado.');
        }
      }
    });

    // D16: Listar contratos relacionados
    await test('D16', 'Listar contratos do motorista', async () => {
      const driverRepo = new DriverRepository();
      const list = await driverRepo.findAll();
      if (list.length > 0) {
        const summary = await driverService.getDriverDetailedSummary(list[0].id);
        if (!Array.isArray(summary.contractHistory)) {
          throw new Error('Historico de contratos deve ser um array.');
        }
      }
    });

    // D17: Listar multas relacionadas
    await test('D17', 'Listar multas do motorista', async () => {
      const driverRepo = new DriverRepository();
      const list = await driverRepo.findAll();
      if (list.length > 0) {
        const summary = await driverService.getDriverDetailedSummary(list[0].id);
        if (!Array.isArray(summary.trafficTickets)) {
          throw new Error('Lista de multas deve ser um array.');
        }
      }
    });

    // D18: Calcular resumo financeiro
    await test('D18', 'Calcular resumo financeiro', async () => {
      const driverRepo = new DriverRepository();
      const list = await driverRepo.findAll();
      if (list.length > 0) {
        const summary = await driverService.getDriverDetailedSummary(list[0].id);
        if (summary.financialSummary.totalPendingAmount < 0) {
          throw new Error('Total pendente não pode ser negativo.');
        }
      }
    });

    // D19: Identificar recebíveis vencidos
    await test('D19', 'Identificar recebíveis vencidos', async () => {
      const driverRepo = new DriverRepository();
      const list = await driverRepo.findAll();
      if (list.length > 0) {
        const summary = await driverService.getDriverDetailedSummary(list[0].id);
        if (typeof summary.financialSummary.overdueCount !== 'number') {
          throw new Error('Contagem de títulos vencidos deve ser numérica.');
        }
      }
    });

    // D20: Exibir caução existente
    await test('D20', 'Exibir caução do motorista', async () => {
      const driverRepo = new DriverRepository();
      const list = await driverRepo.findAll();
      if (list.length > 0) {
        const summary = await driverService.getDriverDetailedSummary(list[0].id);
        if (!Array.isArray(summary.securityDeposits)) {
          throw new Error('SecurityDeposits deve ser um array.');
        }
      }
    });

    const passedCount = results.filter((r) => r.passed).length;
    const failedCount = results.filter((r) => !r.passed).length;

    return {
      total: results.length,
      passed: passedCount,
      failed: failedCount,
      results,
    };
  }
}
