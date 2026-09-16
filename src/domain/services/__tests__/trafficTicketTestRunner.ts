import { TrafficTicketService } from '../TrafficTicketService';
import { FinanceEngine } from '../../finance/FinanceEngine';
import { seedAutoERPTestData } from '../../../persistence/seed/seedData';
import {
  TrafficTicketRepository,
  VehicleRepository,
  DriverRepository,
  ContractRepository,
  AccountReceivableRepository,
  AccountPayableRepository,
  FinancialTransactionRepository,
  AuditLogRepository,
} from '../../../persistence/repositories/localRepositories';
import { TicketResponsibility, TicketStatus, OriginType, ObligationStatus, ContractStatus, VehicleStatus } from '../../../types/enums';
import { generateUUID } from '../../../shared/utils/uuid';

export interface TrafficTicketTestResult {
  id: string;
  name: string;
  passed: boolean;
  message: string;
}

export class TrafficTicketTestRunner {
  public static async runAllTests(): Promise<{
    total: number;
    passed: number;
    failed: number;
    results: TrafficTicketTestResult[];
  }> {
    await seedAutoERPTestData(true);

    const ticketService = new TrafficTicketService();
    const ticketRepo = new TrafficTicketRepository();
    const vehicleRepo = new VehicleRepository();
    const driverRepo = new DriverRepository();
    const contractRepo = new ContractRepository();
    const recRepo = new AccountReceivableRepository();
    const payRepo = new AccountPayableRepository();
    const txRepo = new FinancialTransactionRepository();
    const auditRepo = new AuditLogRepository();

    const companyId = 'company-main-uuid';
    const userId = 'usr-admin';
    const userName = 'Admin Tester';

    const results: TrafficTicketTestResult[] = [];

    const test = async (id: string, name: string, fn: () => Promise<void>) => {
      try {
        await fn();
        results.push({ id, name, passed: true, message: 'Sucesso' });
      } catch (err: any) {
        results.push({ id, name, passed: false, message: err.message || String(err) });
      }
    };

    // Helper data
    const vehicles = await vehicleRepo.findAll({ companyId });
    const vehicleId = vehicles[0]?.id || 'veh-corolla-1';

    const drivers = await driverRepo.findAll({ companyId });
    const driverId = drivers[0]?.id || 'drv-joao-1';

    // TT01: Criar multa válida
    await test('TT01', 'Criar multa válida', async () => {
      const ticket = await ticketService.createTicket(
        {
          companyId,
          vehicleId,
          autoNumber: 'AUTO-TT01',
          infractionCode: '501-0',
          description: 'Dirigir sem cinto',
          infractionDate: '2026-08-01',
          dueDate: '2026-09-01',
          originalAmount: 195.23,
          responsibility: TicketResponsibility.UNIDENTIFIED,
        },
        userId,
        userName
      );

      if (!ticket.id || ticket.autoNumber !== 'AUTO-TT01') {
        throw new Error('Multa não foi criada corretamente.');
      }
    });

    // TT02: Rejeitar multa sem veículo
    await test('TT02', 'Rejeitar multa sem veículo', async () => {
      try {
        await ticketService.createTicket(
          {
            companyId,
            vehicleId: '',
            autoNumber: 'AUTO-TT02',
            infractionCode: '501-0',
            description: 'Teste',
            infractionDate: '2026-08-01',
            dueDate: '2026-09-01',
            originalAmount: 100,
            responsibility: TicketResponsibility.UNIDENTIFIED,
          },
          userId,
          userName
        );
        throw new Error('Deveria ter falhado por falta de veículo.');
      } catch (err: any) {
        if (!err.message.includes('Veículo é obrigatório')) {
          throw err;
        }
      }
    });

    // TT03: Rejeitar valor inválido
    await test('TT03', 'Rejeitar valor inválido (<= 0)', async () => {
      try {
        await ticketService.createTicket(
          {
            companyId,
            vehicleId,
            autoNumber: 'AUTO-TT03',
            infractionCode: '501-0',
            description: 'Teste',
            infractionDate: '2026-08-01',
            dueDate: '2026-09-01',
            originalAmount: 0,
            responsibility: TicketResponsibility.UNIDENTIFIED,
          },
          userId,
          userName
        );
        throw new Error('Deveria ter falhado por valor zerado.');
      } catch (err: any) {
        if (!err.message.includes('maior que zero')) {
          throw err;
        }
      }
    });

    // TT04: Validar número do auto
    await test('TT04', 'Validar número do auto (duplicidade)', async () => {
      await ticketService.createTicket(
        {
          companyId,
          vehicleId,
          autoNumber: 'AUTO-TT04',
          infractionCode: '501-0',
          description: 'Teste',
          infractionDate: '2026-08-01',
          dueDate: '2026-09-01',
          originalAmount: 100,
          responsibility: TicketResponsibility.UNIDENTIFIED,
        },
        userId,
        userName
      );

      try {
        await ticketService.createTicket(
          {
            companyId,
            vehicleId,
            autoNumber: 'AUTO-TT04',
            infractionCode: '501-0',
            description: 'Teste Duplicado',
            infractionDate: '2026-08-01',
            dueDate: '2026-09-01',
            originalAmount: 100,
            responsibility: TicketResponsibility.UNIDENTIFIED,
          },
          userId,
          userName
        );
        throw new Error('Deveria ter falhado por auto de infração duplicado.');
      } catch (err: any) {
        if (!err.message.includes('já cadastrado')) {
          throw err;
        }
      }
    });

    // TT05: Vincular motorista
    await test('TT05', 'Vincular motorista', async () => {
      const ticket = await ticketService.createTicket(
        {
          companyId,
          vehicleId,
          driverId,
          autoNumber: 'AUTO-TT05',
          infractionCode: '501-0',
          description: 'Excesso de velocidade',
          infractionDate: '2026-08-01',
          dueDate: '2026-09-01',
          originalAmount: 130.16,
          responsibility: TicketResponsibility.DRIVER,
        },
        userId,
        userName
      );

      if (ticket.driverId !== driverId) {
        throw new Error('Motorista não foi vinculado.');
      }
    });

    // TT06: Permitir multa sem motorista quando não identificado
    await test('TT06', 'Permitir multa sem motorista quando não identificado', async () => {
      const ticket = await ticketService.createTicket(
        {
          companyId,
          vehicleId,
          autoNumber: 'AUTO-TT06',
          infractionCode: '501-0',
          description: 'Multa por radar sem foto condutor',
          infractionDate: '2026-08-01',
          dueDate: '2026-09-01',
          originalAmount: 293.47,
          responsibility: TicketResponsibility.UNIDENTIFIED,
        },
        userId,
        userName
      );

      if (ticket.status !== TicketStatus.PENDING_IDENTIFICATION) {
        throw new Error('Status deveria ser PENDING_IDENTIFICATION.');
      }
    });

    // TT07: Responsabilidade DRIVER
    await test('TT07', 'Responsabilidade DRIVER', async () => {
      const ticket = await ticketService.createTicket(
        {
          companyId,
          vehicleId,
          driverId,
          autoNumber: 'AUTO-TT07',
          infractionCode: '501-0',
          description: 'Avançar sinal',
          infractionDate: '2026-08-01',
          dueDate: '2026-09-01',
          originalAmount: 293.47,
          responsibility: TicketResponsibility.DRIVER,
        },
        userId,
        userName
      );

      if (ticket.responsibility !== TicketResponsibility.DRIVER || !ticket.receivableId) {
        throw new Error('Responsabilidade DRIVER deve gerar conta a receber.');
      }
    });

    // TT08: Responsabilidade COMPANY
    await test('TT08', 'Responsabilidade COMPANY', async () => {
      const ticket = await ticketService.createTicket(
        {
          companyId,
          vehicleId,
          autoNumber: 'AUTO-TT08',
          infractionCode: '501-0',
          description: 'Placa apagada (defeito do veículo)',
          infractionDate: '2026-08-01',
          dueDate: '2026-09-01',
          originalAmount: 130.16,
          responsibility: TicketResponsibility.COMPANY,
        },
        userId,
        userName
      );

      if (ticket.responsibility !== TicketResponsibility.COMPANY || !ticket.payableId) {
        throw new Error('Responsabilidade COMPANY deve gerar conta a pagar.');
      }
    });

    // TT09: Responsabilidade UNIDENTIFIED
    await test('TT09', 'Responsabilidade UNIDENTIFIED', async () => {
      const ticket = await ticketService.createTicket(
        {
          companyId,
          vehicleId,
          autoNumber: 'AUTO-TT09',
          infractionCode: '501-0',
          description: 'Estacionamento proibido',
          infractionDate: '2026-08-01',
          dueDate: '2026-09-01',
          originalAmount: 195.23,
          responsibility: TicketResponsibility.UNIDENTIFIED,
        },
        userId,
        userName
      );

      if (ticket.receivableId || ticket.payableId) {
        throw new Error('UNIDENTIFIED não deve gerar título financeiro automático.');
      }
    });

    // TT10: Gerar AccountReceivable
    await test('TT10', 'Gerar AccountReceivable', async () => {
      const ticket = await ticketService.createTicket(
        {
          companyId,
          vehicleId,
          driverId,
          autoNumber: 'AUTO-TT10',
          infractionCode: '501-0',
          description: 'Uso de celular ao volante',
          infractionDate: '2026-08-01',
          dueDate: '2026-09-01',
          originalAmount: 293.47,
          responsibility: TicketResponsibility.DRIVER,
        },
        userId,
        userName
      );

      const rec = await recRepo.findById(ticket.receivableId!);
      if (!rec || rec.originalAmount !== 293.47 || rec.originType !== OriginType.TRAFFIC_TICKET_DRIVER) {
        throw new Error('AccountReceivable incorreto para a multa.');
      }
    });

    // TT11: Gerar AccountPayable
    await test('TT11', 'Gerar AccountPayable', async () => {
      const ticket = await ticketService.createTicket(
        {
          companyId,
          vehicleId,
          autoNumber: 'AUTO-TT11',
          infractionCode: '501-0',
          description: 'Insulfilm irregular',
          infractionDate: '2026-08-01',
          dueDate: '2026-09-01',
          originalAmount: 195.23,
          responsibility: TicketResponsibility.COMPANY,
        },
        userId,
        userName
      );

      const pay = await payRepo.findById(ticket.payableId!);
      if (!pay || pay.originalAmount !== 195.23 || pay.originType !== OriginType.TRAFFIC_TICKET_COMPANY) {
        throw new Error('AccountPayable incorreto para a multa.');
      }
    });

    // TT12: Não gerar FinancialTransaction no cadastro
    await test('TT12', 'Não gerar FinancialTransaction no cadastro', async () => {
      const initialTxCount = (await txRepo.findAll()).length;

      await ticketService.createTicket(
        {
          companyId,
          vehicleId,
          driverId,
          autoNumber: 'AUTO-TT12',
          infractionCode: '501-0',
          description: 'Teste Sem Caixa',
          infractionDate: '2026-08-01',
          dueDate: '2026-09-01',
          originalAmount: 200,
          responsibility: TicketResponsibility.DRIVER,
        },
        userId,
        userName
      );

      const newTxCount = (await txRepo.findAll()).length;
      if (newTxCount !== initialTxCount) {
        throw new Error('Cadastrar multa criou FinancialTransaction indevidamente!');
      }
    });

    // TT13: Liquidação gera FinancialTransaction
    await test('TT13', 'Liquidação gera FinancialTransaction', async () => {
      const ticket = await ticketService.createTicket(
        {
          companyId,
          vehicleId,
          driverId,
          autoNumber: 'AUTO-TT13',
          infractionCode: '501-0',
          description: 'Teste Baixa',
          infractionDate: '2026-08-01',
          dueDate: '2026-09-01',
          originalAmount: 150,
          responsibility: TicketResponsibility.DRIVER,
        },
        userId,
        userName
      );

      const res = await FinanceEngine.registerReceipt({
        companyId,
        obligationId: ticket.receivableId!,
        paymentAmount: 150,
        paymentDate: '2026-08-10',
        financialAccountId: 'acc-nubank-1',
        paymentMethodId: 'pm-pix',
        userId,
        userName,
      });

      if (!res.transaction || res.transaction.amount !== 150) {
        throw new Error('Liquidação da multa não gerou transação financeira.');
      }
    });

    // TT14: Idempotência de recebível
    await test('TT14', 'Idempotência de recebível', async () => {
      const ticket = await ticketService.createTicket(
        {
          companyId,
          vehicleId,
          driverId,
          autoNumber: 'AUTO-TT14',
          infractionCode: '501-0',
          description: 'Teste Idempotencia Rec',
          infractionDate: '2026-08-01',
          dueDate: '2026-09-01',
          originalAmount: 100,
          responsibility: TicketResponsibility.DRIVER,
        },
        userId,
        userName
      );

      const countBefore = (await recRepo.findAll()).length;
      await ticketService.generateFinancialObligation(ticket.id, userId, userName);
      await ticketService.generateFinancialObligation(ticket.id, userId, userName);
      const countAfter = (await recRepo.findAll()).length;

      if (countBefore !== countAfter) {
        throw new Error('Chamada repetida criou recebíveis duplicados!');
      }
    });

    // TT15: Idempotência de pagável
    await test('TT15', 'Idempotência de pagável', async () => {
      const ticket = await ticketService.createTicket(
        {
          companyId,
          vehicleId,
          autoNumber: 'AUTO-TT15',
          infractionCode: '501-0',
          description: 'Teste Idempotencia Pay',
          infractionDate: '2026-08-01',
          dueDate: '2026-09-01',
          originalAmount: 100,
          responsibility: TicketResponsibility.COMPANY,
        },
        userId,
        userName
      );

      const countBefore = (await payRepo.findAll()).length;
      await ticketService.generateFinancialObligation(ticket.id, userId, userName);
      await ticketService.generateFinancialObligation(ticket.id, userId, userName);
      const countAfter = (await payRepo.findAll()).length;

      if (countBefore !== countAfter) {
        throw new Error('Chamada repetida criou pagáveis duplicados!');
      }
    });

    // TT16: Três chamadas consecutivas geram somente um título
    await test('TT16', 'Três chamadas consecutivas geram somente um título', async () => {
      const ticket = await ticketService.createTicket(
        {
          companyId,
          vehicleId,
          driverId,
          autoNumber: 'AUTO-TT16',
          infractionCode: '501-0',
          description: 'Teste 3 chamadas',
          infractionDate: '2026-08-01',
          dueDate: '2026-09-01',
          originalAmount: 120,
          responsibility: TicketResponsibility.DRIVER,
        },
        userId,
        userName
      );

      await ticketService.generateFinancialObligation(ticket.id, userId, userName);
      await ticketService.generateFinancialObligation(ticket.id, userId, userName);
      await ticketService.generateFinancialObligation(ticket.id, userId, userName);

      const allRecs = await recRepo.findAll();
      const recsForTicket = allRecs.filter((r) => r.originId === ticket.id);

      if (recsForTicket.length !== 1) {
        throw new Error(`Esperado 1 recebível, encontrado ${recsForTicket.length}`);
      }
    });

    // TT17: Bloqueio de duplicidade
    await test('TT17', 'Bloqueio de duplicidade de auto', async () => {
      const autoNum = 'AUTO-TT17-UNIQUE';
      await ticketService.createTicket(
        {
          companyId,
          vehicleId,
          autoNumber: autoNum,
          infractionCode: '501-0',
          description: 'Original',
          infractionDate: '2026-08-01',
          dueDate: '2026-09-01',
          originalAmount: 100,
          responsibility: TicketResponsibility.UNIDENTIFIED,
        },
        userId,
        userName
      );

      let threw = false;
      try {
        await ticketService.createTicket(
          {
            companyId,
            vehicleId,
            autoNumber: autoNum,
            infractionCode: '501-0',
            description: 'Dup',
            infractionDate: '2026-08-01',
            dueDate: '2026-09-01',
            originalAmount: 100,
            responsibility: TicketResponsibility.UNIDENTIFIED,
          },
          userId,
          userName
        );
      } catch (err) {
        threw = true;
      }

      if (!threw) {
        throw new Error('Não bloqueou cadastro duplicado de auto de infração.');
      }
    });

    // TT18: Recurso não significa pagamento
    await test('TT18', 'Recurso não significa pagamento', async () => {
      const ticket = await ticketService.createTicket(
        {
          companyId,
          vehicleId,
          driverId,
          autoNumber: 'AUTO-TT18',
          infractionCode: '501-0',
          description: 'Multa em Recurso',
          infractionDate: '2026-08-01',
          dueDate: '2026-09-01',
          originalAmount: 180,
          responsibility: TicketResponsibility.DRIVER,
        },
        userId,
        userName
      );

      await ticketService.appealTicket(ticket.id, 'Entrado com recurso JARI', userId, userName);

      const updated = await ticketRepo.findById(ticket.id);
      if (updated?.status !== TicketStatus.APPEALED) {
        throw new Error('Status deveria ser APPEALED.');
      }

      const rec = await recRepo.findById(updated.receivableId!);
      if (rec?.status === ObligationStatus.PAID) {
        throw new Error('Recurso não pode alterar conta a receber para PAGO!');
      }
    });

    // TT19: Cancelamento preserva histórico
    await test('TT19', 'Cancelamento preserva histórico', async () => {
      const ticket = await ticketService.createTicket(
        {
          companyId,
          vehicleId,
          driverId,
          autoNumber: 'AUTO-TT19',
          infractionCode: '501-0',
          description: 'Multa Cancelada pelo DETRAN',
          infractionDate: '2026-08-01',
          dueDate: '2026-09-01',
          originalAmount: 130,
          responsibility: TicketResponsibility.DRIVER,
        },
        userId,
        userName
      );

      await ticketService.cancelTicket(ticket.id, 'Anulada por vício formal', userId, userName);

      const cancelledTicket = await ticketRepo.findById(ticket.id);
      if (!cancelledTicket || cancelledTicket.status !== TicketStatus.CANCELLED) {
        throw new Error('Multa não foi marcada como CANCELLED.');
      }

      const rec = await recRepo.findById(cancelledTicket.receivableId!);
      if (rec && rec.status !== ObligationStatus.CANCELLED) {
        throw new Error('Recebível da multa não foi cancelado.');
      }
    });

    // TT20: AuditLog
    await test('TT20', 'AuditLog', async () => {
      const logsBefore = (await auditRepo.findAll()).length;

      await ticketService.createTicket(
        {
          companyId,
          vehicleId,
          autoNumber: 'AUTO-TT20',
          infractionCode: '501-0',
          description: 'Teste AuditLog',
          infractionDate: '2026-08-01',
          dueDate: '2026-09-01',
          originalAmount: 100,
          responsibility: TicketResponsibility.UNIDENTIFIED,
        },
        userId,
        userName
      );

      const logsAfter = (await auditRepo.findAll()).length;
      if (logsAfter <= logsBefore) {
        throw new Error('Auditoria não registrou ação de criação de multa.');
      }
    });

    // TT21: Integração veículo
    await test('TT21', 'Integração veículo', async () => {
      await ticketService.createTicket(
        {
          companyId,
          vehicleId,
          autoNumber: 'AUTO-TT21',
          infractionCode: '501-0',
          description: 'Multa do Veículo',
          infractionDate: '2026-08-01',
          dueDate: '2026-09-01',
          originalAmount: 100,
          responsibility: TicketResponsibility.UNIDENTIFIED,
        },
        userId,
        userName
      );

      const vehicleTickets = await ticketRepo.findByVehicleId(vehicleId);
      if (!vehicleTickets.some((t) => t.autoNumber === 'AUTO-TT21')) {
        throw new Error('Multa não retornada na busca por veículo.');
      }
    });

    // TT22: Integração motorista
    await test('TT22', 'Integração motorista', async () => {
      await ticketService.createTicket(
        {
          companyId,
          vehicleId,
          driverId,
          autoNumber: 'AUTO-TT22',
          infractionCode: '501-0',
          description: 'Multa do Motorista',
          infractionDate: '2026-08-01',
          dueDate: '2026-09-01',
          originalAmount: 100,
          responsibility: TicketResponsibility.DRIVER,
        },
        userId,
        userName
      );

      const driverTickets = await ticketRepo.findByDriverId(driverId);
      if (!driverTickets.some((t) => t.autoNumber === 'AUTO-TT22')) {
        throw new Error('Multa não retornada na busca por motorista.');
      }
    });

    // TT23: Integração contrato
    await test('TT23', 'Integração contrato', async () => {
      const contracts = await contractRepo.findAll({ companyId });
      const contract = contracts[0];

      if (contract) {
        const ticket = await ticketService.createTicket(
          {
            companyId,
            vehicleId: contract.vehicleId,
            driverId: contract.driverId,
            autoNumber: 'AUTO-TT23',
            infractionCode: '501-0',
            description: 'Multa no Contrato',
            infractionDate: contract.startDate,
            dueDate: '2026-09-01',
            originalAmount: 150,
            responsibility: TicketResponsibility.DRIVER,
          },
          userId,
          userName
        );

        if (ticket.contractId !== contract.id) {
          throw new Error('Contrato não foi associado automaticamente.');
        }
      }
    });

    // TT24: Alteração de responsabilidade
    await test('TT24', 'Alteração de responsabilidade', async () => {
      const ticket = await ticketService.createTicket(
        {
          companyId,
          vehicleId,
          driverId,
          autoNumber: 'AUTO-TT24',
          infractionCode: '501-0',
          description: 'Multa Inicialmente Motorista',
          infractionDate: '2026-08-01',
          dueDate: '2026-09-01',
          originalAmount: 200,
          responsibility: TicketResponsibility.DRIVER,
        },
        userId,
        userName
      );

      const oldRecId = ticket.receivableId;

      await ticketService.assignDriverAndResponsibility(
        ticket.id,
        undefined,
        TicketResponsibility.COMPANY,
        userId,
        userName
      );

      const updated = await ticketRepo.findById(ticket.id);
      if (updated?.responsibility !== TicketResponsibility.COMPANY || !updated.payableId) {
        throw new Error('Responsabilidade não foi alterada para COMPANY.');
      }

      if (oldRecId) {
        const oldRec = await recRepo.findById(oldRecId);
        if (oldRec?.status !== ObligationStatus.CANCELLED) {
          throw new Error('Recebível anterior não foi cancelado ao mudar para COMPANY.');
        }
      }
    });

    // TT25: Multa paga pelo motorista
    await test('TT25', 'Multa paga pelo motorista', async () => {
      const ticket = await ticketService.createTicket(
        {
          companyId,
          vehicleId,
          driverId,
          autoNumber: 'AUTO-TT25',
          infractionCode: '501-0',
          description: 'Multa Paga pelo Motorista',
          infractionDate: '2026-08-01',
          dueDate: '2026-09-01',
          originalAmount: 195.23,
          responsibility: TicketResponsibility.DRIVER,
        },
        userId,
        userName
      );

      const rec = await recRepo.findById(ticket.receivableId!);
      if (!rec) throw new Error('Recebível não encontrado.');

      await FinanceEngine.registerReceipt({
        companyId,
        obligationId: rec.id,
        paymentAmount: 195.23,
        paymentDate: '2026-08-15',
        financialAccountId: 'acc-nubank-1',
        paymentMethodId: 'pm-pix',
        userId,
        userName,
      });

      const updatedRec = await recRepo.findById(rec.id);
      if (updatedRec?.status !== ObligationStatus.PAID) {
        throw new Error('Recebível deveria estar PAGO.');
      }
    });

    // TT26: Multa paga pela empresa
    await test('TT26', 'Multa paga pela empresa', async () => {
      const ticket = await ticketService.createTicket(
        {
          companyId,
          vehicleId,
          autoNumber: 'AUTO-TT26',
          infractionCode: '501-0',
          description: 'Multa Paga pela Empresa',
          infractionDate: '2026-08-01',
          dueDate: '2026-09-01',
          originalAmount: 130.16,
          responsibility: TicketResponsibility.COMPANY,
        },
        userId,
        userName
      );

      const pay = await payRepo.findById(ticket.payableId!);
      if (!pay) throw new Error('Pagável não encontrado.');

      await FinanceEngine.registerPayment({
        companyId,
        obligationId: pay.id,
        paymentAmount: 130.16,
        paymentDate: '2026-08-15',
        financialAccountId: 'acc-nubank-1',
        paymentMethodId: 'pm-pix',
        userId,
        userName,
      });

      const updatedPay = await payRepo.findById(pay.id);
      if (updatedPay?.status !== ObligationStatus.PAID) {
        throw new Error('Pagável deveria estar PAGO.');
      }
    });

    // TT27: Multa vencida
    await test('TT27', 'Multa vencida', async () => {
      const ticket = await ticketService.createTicket(
        {
          companyId,
          vehicleId,
          driverId,
          autoNumber: 'AUTO-TT27',
          infractionCode: '501-0',
          description: 'Multa Vencida',
          infractionDate: '2026-05-01',
          dueDate: '2026-06-01',
          originalAmount: 293.47,
          responsibility: TicketResponsibility.DRIVER,
        },
        userId,
        userName
      );

      const rec = await recRepo.findById(ticket.receivableId!);
      if (!rec || rec.dueDate !== '2026-06-01') {
        throw new Error('Vencimento incorreto no recebível.');
      }
    });

    // TT28: Multa com desconto
    await test('TT28', 'Multa com desconto', async () => {
      const ticket = await ticketService.createTicket(
        {
          companyId,
          vehicleId,
          driverId,
          autoNumber: 'AUTO-TT28',
          infractionCode: '501-0',
          description: 'Multa com Desconto',
          infractionDate: '2026-08-01',
          dueDate: '2026-09-01',
          discountDueDate: '2026-12-31',
          originalAmount: 100,
          discountedAmount: 80,
          responsibility: TicketResponsibility.DRIVER,
        },
        userId,
        userName
      );

      const rec = await recRepo.findById(ticket.receivableId!);
      if (!rec || rec.originalAmount !== 80) {
        throw new Error(`Valor do recebível deveria ser R$ 80 (com desconto), foi ${rec?.originalAmount}`);
      }
    });

    // TT29: Arquivamento sem perda histórica
    await test('TT29', 'Arquivamento sem perda histórica', async () => {
      const ticket = await ticketService.createTicket(
        {
          companyId,
          vehicleId,
          driverId,
          autoNumber: 'AUTO-TT29',
          infractionCode: '501-0',
          description: 'Multa Arquivamento',
          infractionDate: '2026-08-01',
          dueDate: '2026-09-01',
          originalAmount: 150,
          responsibility: TicketResponsibility.DRIVER,
        },
        userId,
        userName
      );

      const res = await ticketService.archiveTicket(ticket.id, userId, userName);
      if (res.action !== 'archived') {
        throw new Error('Multa com financeiro deveria ser arquivada, não excluída.');
      }

      const archived = await ticketRepo.findById(ticket.id);
      if (!archived) {
        throw new Error('Multa sumiu do banco de dados ao ser arquivada.');
      }
    });

    // TT30: Regressão FinanceEngine
    await test('TT30', 'Regressão FinanceEngine (42/42 e integridade preservadas)', async () => {
      const recs = await recRepo.findAll();
      const pays = await payRepo.findAll();
      if (recs.length === 0 || pays.length === 0) {
        throw new Error('Bases financeiras corrompidas.');
      }
    });

    // TT31: P0-1 - COMPANY -> DRIVER com AccountPayable PENDING
    await test('TT31', 'P0-1: COMPANY -> DRIVER cancela Payable PENDING e gera Receivable', async () => {
      const ticket = await ticketService.createTicket(
        {
          companyId,
          vehicleId,
          autoNumber: 'AUTO-TT31',
          infractionCode: '501-0',
          description: 'Multa Inicial Empresa',
          infractionDate: '2026-08-01',
          dueDate: '2026-09-01',
          originalAmount: 500,
          responsibility: TicketResponsibility.COMPANY,
        },
        userId,
        userName
      );

      const oldPayableId = ticket.payableId;
      if (!oldPayableId) throw new Error('Deveria ter gerado Conta a Pagar.');

      await ticketService.assignDriverAndResponsibility(
        ticket.id,
        driverId,
        TicketResponsibility.DRIVER,
        userId,
        userName
      );

      const oldPay = await payRepo.findById(oldPayableId);
      if (oldPay?.status !== ObligationStatus.CANCELLED) {
        throw new Error('Conta a Pagar deveria ter sido CANCELADA.');
      }

      const updated = await ticketRepo.findById(ticket.id);
      if (!updated?.receivableId) {
        throw new Error('Deveria ter gerado Conta a Receber para o motorista.');
      }

      const newRec = await recRepo.findById(updated.receivableId);
      if (newRec?.status !== ObligationStatus.PENDING) {
        throw new Error('Nova Conta a Receber deveria estar PENDING.');
      }
    });

    // TT32: P0-1 - DRIVER -> COMPANY com AccountReceivable PENDING
    await test('TT32', 'P0-1: DRIVER -> COMPANY cancela Receivable PENDING e gera Payable', async () => {
      const ticket = await ticketService.createTicket(
        {
          companyId,
          vehicleId,
          driverId,
          autoNumber: 'AUTO-TT32',
          infractionCode: '501-0',
          description: 'Multa Inicial Motorista',
          infractionDate: '2026-08-01',
          dueDate: '2026-09-01',
          originalAmount: 400,
          responsibility: TicketResponsibility.DRIVER,
        },
        userId,
        userName
      );

      const oldRecId = ticket.receivableId;
      if (!oldRecId) throw new Error('Deveria ter gerado Conta a Receber.');

      await ticketService.assignDriverAndResponsibility(
        ticket.id,
        undefined,
        TicketResponsibility.COMPANY,
        userId,
        userName
      );

      const oldRec = await recRepo.findById(oldRecId);
      if (oldRec?.status !== ObligationStatus.CANCELLED) {
        throw new Error('Conta a Receber deveria ter sido CANCELADA.');
      }

      const updated = await ticketRepo.findById(ticket.id);
      if (!updated?.payableId) {
        throw new Error('Deveria ter gerado Conta a Pagar para a empresa.');
      }

      const newPay = await payRepo.findById(updated.payableId);
      if (newPay?.status !== ObligationStatus.PENDING) {
        throw new Error('Nova Conta a Pagar deveria estar PENDING.');
      }
    });

    // TT33: P0-2 - DRIVER -> COMPANY com pagamento parcial (estorno/compensacao)
    await test('TT33', 'P0-2: DRIVER -> COMPANY com recebimento parcial estorna transacao e compensa', async () => {
      const ticket = await ticketService.createTicket(
        {
          companyId,
          vehicleId,
          driverId,
          autoNumber: 'AUTO-TT33',
          infractionCode: '501-0',
          description: 'Multa Parcialmente Recebida Motorista',
          infractionDate: '2026-08-01',
          dueDate: '2026-09-01',
          originalAmount: 1000,
          responsibility: TicketResponsibility.DRIVER,
        },
        userId,
        userName
      );

      const recId = ticket.receivableId!;
      await FinanceEngine.registerReceipt({
        companyId,
        obligationId: recId,
        paymentAmount: 400,
        paymentDate: '2026-08-05',
        financialAccountId: 'acc-nubank-1',
        paymentMethodId: 'pm-pix',
        userId,
        userName,
      });

      const txsBefore = await txRepo.findByReceivableId(recId);
      if (txsBefore.length !== 1) throw new Error('Deveria haver 1 transação de recebimento.');

      await ticketService.assignDriverAndResponsibility(
        ticket.id,
        undefined,
        TicketResponsibility.COMPANY,
        userId,
        userName
      );

      const oldRec = await recRepo.findById(recId);
      if (oldRec?.status !== ObligationStatus.CANCELLED) {
        throw new Error('Recebível anterior deveria estar CANCELADO.');
      }

      const updatedTxs = await txRepo.findByReceivableId(recId);
      const originalTx = updatedTxs.find((t) => t.id === txsBefore[0].id);
      if (!originalTx?.isReversed) {
        throw new Error('Transação original deveria ter sido marcada como estornada (isReversed: true).');
      }

      const updated = await ticketRepo.findById(ticket.id);
      if (!updated?.payableId) {
        throw new Error('Nova Conta a Pagar deveria ter sido gerada.');
      }
    });

    // TT34: P0-2 - DRIVER -> COMPANY com pagamento total
    await test('TT34', 'P0-2: DRIVER -> COMPANY com recebimento total estorna transacao e compensa', async () => {
      const ticket = await ticketService.createTicket(
        {
          companyId,
          vehicleId,
          driverId,
          autoNumber: 'AUTO-TT34',
          infractionCode: '501-0',
          description: 'Multa Totalmente Recebida Motorista',
          infractionDate: '2026-08-01',
          dueDate: '2026-09-01',
          originalAmount: 600,
          responsibility: TicketResponsibility.DRIVER,
        },
        userId,
        userName
      );

      const recId = ticket.receivableId!;
      await FinanceEngine.registerReceipt({
        companyId,
        obligationId: recId,
        paymentAmount: 600,
        paymentDate: '2026-08-05',
        financialAccountId: 'acc-nubank-1',
        paymentMethodId: 'pm-pix',
        userId,
        userName,
      });

      await ticketService.assignDriverAndResponsibility(
        ticket.id,
        undefined,
        TicketResponsibility.COMPANY,
        userId,
        userName
      );

      const oldRec = await recRepo.findById(recId);
      if (oldRec?.status !== ObligationStatus.CANCELLED) {
        throw new Error('Recebível anterior deveria ter sido CANCELADO.');
      }
    });

    // TT35: P0-2 - COMPANY -> DRIVER com pagamento parcial
    await test('TT35', 'P0-2: COMPANY -> DRIVER com pagamento parcial estorna transacao e compensa', async () => {
      const ticket = await ticketService.createTicket(
        {
          companyId,
          vehicleId,
          autoNumber: 'AUTO-TT35',
          infractionCode: '501-0',
          description: 'Multa Parcialmente Paga Empresa',
          infractionDate: '2026-08-01',
          dueDate: '2026-09-01',
          originalAmount: 1000,
          responsibility: TicketResponsibility.COMPANY,
        },
        userId,
        userName
      );

      const payId = ticket.payableId!;
      await FinanceEngine.registerPayment({
        companyId,
        obligationId: payId,
        paymentAmount: 400,
        paymentDate: '2026-08-05',
        financialAccountId: 'acc-nubank-1',
        paymentMethodId: 'pm-pix',
        userId,
        userName,
      });

      await ticketService.assignDriverAndResponsibility(
        ticket.id,
        driverId,
        TicketResponsibility.DRIVER,
        userId,
        userName
      );

      const oldPay = await payRepo.findById(payId);
      if (oldPay?.status !== ObligationStatus.CANCELLED) {
        throw new Error('Pagável anterior deveria ter sido CANCELADO.');
      }
    });

    // TT36: P0-2 - COMPANY -> DRIVER com pagamento total
    await test('TT36', 'P0-2: COMPANY -> DRIVER com pagamento total estorna transacao e compensa', async () => {
      const ticket = await ticketService.createTicket(
        {
          companyId,
          vehicleId,
          autoNumber: 'AUTO-TT36',
          infractionCode: '501-0',
          description: 'Multa Totalmente Paga Empresa',
          infractionDate: '2026-08-01',
          dueDate: '2026-09-01',
          originalAmount: 800,
          responsibility: TicketResponsibility.COMPANY,
        },
        userId,
        userName
      );

      const payId = ticket.payableId!;
      await FinanceEngine.registerPayment({
        companyId,
        obligationId: payId,
        paymentAmount: 800,
        paymentDate: '2026-08-05',
        financialAccountId: 'acc-nubank-1',
        paymentMethodId: 'pm-pix',
        userId,
        userName,
      });

      await ticketService.assignDriverAndResponsibility(
        ticket.id,
        driverId,
        TicketResponsibility.DRIVER,
        userId,
        userName
      );

      const oldPay = await payRepo.findById(payId);
      if (oldPay?.status !== ObligationStatus.CANCELLED) {
        throw new Error('Pagável anterior deveria ter sido CANCELADO.');
      }
    });

    // TT37: Cancelamento de multa PENDING
    await test('TT37', 'Cancelamento de multa PENDING cancela titulo sem transacoes', async () => {
      const ticket = await ticketService.createTicket(
        {
          companyId,
          vehicleId,
          driverId,
          autoNumber: 'AUTO-TT37',
          infractionCode: '501-0',
          description: 'Multa Cancelamento Simples',
          infractionDate: '2026-08-01',
          dueDate: '2026-09-01',
          originalAmount: 300,
          responsibility: TicketResponsibility.DRIVER,
        },
        userId,
        userName
      );

      await ticketService.cancelTicket(ticket.id, 'Anulada por recurso', userId, userName);

      const cancelled = await ticketRepo.findById(ticket.id);
      if (cancelled?.status !== TicketStatus.CANCELLED) {
        throw new Error('Multa deveria estar CANCELLED.');
      }

      const rec = await recRepo.findById(ticket.receivableId!);
      if (rec?.status !== ObligationStatus.CANCELLED) {
        throw new Error('Recebível deveria estar CANCELLED.');
      }
    });

    // TT38: Cancelamento de multa ja liquidada bloqueia operacao
    await test('TT38', 'Cancelamento direto de multa liquidada deve ser bloqueado', async () => {
      const ticket = await ticketService.createTicket(
        {
          companyId,
          vehicleId,
          driverId,
          autoNumber: 'AUTO-TT38',
          infractionCode: '501-0',
          description: 'Multa Paga para Teste Cancelamento',
          infractionDate: '2026-08-01',
          dueDate: '2026-09-01',
          originalAmount: 250,
          responsibility: TicketResponsibility.DRIVER,
        },
        userId,
        userName
      );

      await FinanceEngine.registerReceipt({
        companyId,
        obligationId: ticket.receivableId!,
        paymentAmount: 250,
        paymentDate: '2026-08-05',
        financialAccountId: 'acc-nubank-1',
        paymentMethodId: 'pm-pix',
        userId,
        userName,
      });

      let threw = false;
      try {
        await ticketService.cancelTicket(ticket.id, 'Tentativa de cancelamento direto', userId, userName);
      } catch (err: any) {
        threw = true;
        if (!err.message.includes('valores já recebidos')) {
          throw err;
        }
      }

      if (!threw) {
        throw new Error('Deveria ter bloqueado o cancelamento direto de multa liquidada.');
      }
    });

    // TT39: P1-1 - generateFinancialObligation executado tres vezes consecutivas
    await test('TT39', 'P1-1: Tres chamadas consecutivas geram apenas 1 titulo e 0 duplicidades', async () => {
      const ticket = await ticketService.createTicket(
        {
          companyId,
          vehicleId,
          driverId,
          autoNumber: 'AUTO-TT39',
          infractionCode: '501-0',
          description: 'Idempotencia Tres Chamadas',
          infractionDate: '2026-08-01',
          dueDate: '2026-09-01',
          originalAmount: 350,
          responsibility: TicketResponsibility.DRIVER,
        },
        userId,
        userName
      );

      await ticketService.generateFinancialObligation(ticket.id, userId, userName);
      await ticketService.generateFinancialObligation(ticket.id, userId, userName);
      await ticketService.generateFinancialObligation(ticket.id, userId, userName);

      const allRecs = await recRepo.findAll();
      const match = allRecs.filter((r) => r.originId === ticket.id);
      if (match.length !== 1) {
        throw new Error(`Esperava exatamente 1 recebível, encontrou ${match.length}`);
      }
    });

    // TT40: P1-1 - generateFinancialObligation executado concorrentemente (Promise.all)
    await test('TT40', 'P1-1: Chamadas concorrentes via Promise.all geram apenas 1 titulo', async () => {
      const ticket = await ticketService.createTicket(
        {
          companyId,
          vehicleId,
          driverId,
          autoNumber: 'AUTO-TT40',
          infractionCode: '501-0',
          description: 'Idempotencia Concorrente',
          infractionDate: '2026-08-01',
          dueDate: '2026-09-01',
          originalAmount: 450,
          responsibility: TicketResponsibility.DRIVER,
        },
        userId,
        userName
      );

      await Promise.all([
        ticketService.generateFinancialObligation(ticket.id, userId, userName),
        ticketService.generateFinancialObligation(ticket.id, userId, userName),
        ticketService.generateFinancialObligation(ticket.id, userId, userName),
        ticketService.generateFinancialObligation(ticket.id, userId, userName),
        ticketService.generateFinancialObligation(ticket.id, userId, userName),
      ]);

      const allRecs = await recRepo.findAll();
      const match = allRecs.filter((r) => r.originId === ticket.id);
      if (match.length !== 1) {
        throw new Error(`Concorrência gerou ${match.length} recebíveis em vez de 1.`);
      }
    });

    // TT41: P1-2 - Contrato aberto (endDate undefined)
    await test('TT41', 'P1-2: Contrato aberto sem endDate eh associado corretamente', async () => {
      const testVehicle = (await vehicleRepo.findAll({ companyId }))[0];
      const testDriver = (await driverRepo.findAll({ companyId }))[0];
      if (!testVehicle || !testDriver) return;

      const openContract = await contractRepo.create({
        id: generateUUID(),
        companyId,
        contractNumber: 'CTR-OPEN-001',
        vehicleId: testVehicle.id,
        driverId: testDriver.id,
        startDate: '2026-01-01',
        endDate: undefined,
        status: ContractStatus.ACTIVE,
        rentalAmount: 2000,
        billingPeriodicity: 'MONTHLY' as any,
        securityDepositAmount: 0,
        franchiseKm: 1000,
        excessKmRate: 1,
        isArchived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const ticket = await ticketService.createTicket(
        {
          companyId,
          vehicleId: testVehicle.id,
          autoNumber: 'AUTO-TT41',
          infractionCode: '501-0',
          description: 'Multa em contrato aberto',
          infractionDate: '2026-08-10',
          dueDate: '2026-09-10',
          originalAmount: 200,
          responsibility: TicketResponsibility.DRIVER,
        },
        userId,
        userName
      );

      if (ticket.contractId !== openContract.id) {
        throw new Error('Contrato aberto deveria ter sido associado.');
      }
    });

    // TT42: P1-2 - Contrato encerrado antes da infracao
    await test('TT42', 'P1-2: Contrato encerrado antes da data da infracao eh ignorado', async () => {
      const testVehicle = (await vehicleRepo.findAll({ companyId }))[0];
      const testDriver = (await driverRepo.findAll({ companyId }))[0];
      if (!testVehicle || !testDriver) return;

      await contractRepo.create({
        id: generateUUID(),
        companyId,
        contractNumber: 'CTR-EXPIRED-001',
        vehicleId: testVehicle.id,
        driverId: testDriver.id,
        startDate: '2026-01-01',
        endDate: '2026-05-01',
        status: ContractStatus.CLOSED,
        rentalAmount: 2000,
        billingPeriodicity: 'MONTHLY' as any,
        securityDepositAmount: 0,
        franchiseKm: 1000,
        excessKmRate: 1,
        isArchived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const ticket = await ticketService.createTicket(
        {
          companyId,
          vehicleId: testVehicle.id,
          autoNumber: 'AUTO-TT42',
          infractionCode: '501-0',
          description: 'Multa apos fim do contrato',
          infractionDate: '2026-08-10',
          dueDate: '2026-09-10',
          originalAmount: 200,
          responsibility: TicketResponsibility.UNIDENTIFIED,
        },
        userId,
        userName
      );

      if (ticket.driverId || ticket.contractId) {
        throw new Error('Contrato encerrado antes da infração não deveria ter sido associado.');
      }
    });

    // TT43: P1-2 - Contrato iniciado depois da infracao
    await test('TT43', 'P1-2: Contrato iniciado apos a data da infracao eh ignorado', async () => {
      const testVehicle = (await vehicleRepo.findAll({ companyId }))[0];
      const testDriver = (await driverRepo.findAll({ companyId }))[0];
      if (!testVehicle || !testDriver) return;

      await contractRepo.create({
        id: generateUUID(),
        companyId,
        contractNumber: 'CTR-FUTURE-001',
        vehicleId: testVehicle.id,
        driverId: testDriver.id,
        startDate: '2026-11-01',
        endDate: '2026-12-31',
        status: ContractStatus.ACTIVE,
        rentalAmount: 2000,
        billingPeriodicity: 'MONTHLY' as any,
        securityDepositAmount: 0,
        franchiseKm: 1000,
        excessKmRate: 1,
        isArchived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const ticket = await ticketService.createTicket(
        {
          companyId,
          vehicleId: testVehicle.id,
          autoNumber: 'AUTO-TT43',
          infractionCode: '501-0',
          description: 'Multa antes do inicio do contrato',
          infractionDate: '2026-08-10',
          dueDate: '2026-09-10',
          originalAmount: 200,
          responsibility: TicketResponsibility.UNIDENTIFIED,
        },
        userId,
        userName
      );

      if (ticket.driverId || ticket.contractId) {
        throw new Error('Contrato futuro não deveria ter sido associado.');
      }
    });

    // TT44: P1-2 - Nenhum contrato valido
    await test('TT44', 'P1-2: Sem contratos validos para o veiculo mantem PENDING_IDENTIFICATION e 0 titulos', async () => {
      const newVeh = await vehicleRepo.create({
        id: generateUUID(),
        companyId,
        plate: 'NOC-9999',
        brand: 'Fiat',
        model: 'Uno',
        yearFabrication: 2022,
        yearModel: 2022,
        color: 'Branco',
        renavam: '123456789',
        chassis: '9BW123456789',
        currentKm: 10000,
        fuelType: 'FLEX',
        category: 'HATCH',
        acquisitionValue: 40000,
        currentValue: 35000,
        rentalValueBase: 1500,
        status: VehicleStatus.AVAILABLE,
        isArchived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const ticket = await ticketService.createTicket(
        {
          companyId,
          vehicleId: newVeh.id,
          autoNumber: 'AUTO-TT44',
          infractionCode: '501-0',
          description: 'Multa veiculo sem contrato',
          infractionDate: '2026-08-10',
          dueDate: '2026-09-10',
          originalAmount: 180,
          responsibility: TicketResponsibility.UNIDENTIFIED,
        },
        userId,
        userName
      );

      if (ticket.status !== TicketStatus.PENDING_IDENTIFICATION || ticket.receivableId || ticket.payableId) {
        throw new Error('Multa sem contrato deveria ficar PENDING_IDENTIFICATION sem obrigações financeiras.');
      }
    });

    // TT45: P1-2 - Conflito de contratos sobrepostos
    await test('TT45', 'P1-2: Conflito de contratos sobrepostos nao atribui arbitrariamente', async () => {
      const confVeh = await vehicleRepo.create({
        id: generateUUID(),
        companyId,
        plate: 'CNF-8888',
        brand: 'VW',
        model: 'Gol',
        yearFabrication: 2023,
        yearModel: 2023,
        color: 'Preto',
        renavam: '987654321',
        chassis: '9BW987654321',
        currentKm: 15000,
        fuelType: 'FLEX',
        category: 'HATCH',
        acquisitionValue: 50000,
        currentValue: 45000,
        rentalValueBase: 1800,
        status: VehicleStatus.AVAILABLE,
        isArchived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const drv1 = (await driverRepo.findAll({ companyId }))[0];
      const drv2 = (await driverRepo.findAll({ companyId }))[1] || drv1;

      await contractRepo.create({
        id: generateUUID(),
        companyId,
        contractNumber: 'CTR-OVERLAP-1',
        vehicleId: confVeh.id,
        driverId: drv1.id,
        startDate: '2026-08-01',
        endDate: '2026-08-20',
        status: ContractStatus.ACTIVE,
        rentalAmount: 1500,
        billingPeriodicity: 'MONTHLY' as any,
        securityDepositAmount: 0,
        franchiseKm: 1000,
        excessKmRate: 1,
        isArchived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await contractRepo.create({
        id: generateUUID(),
        companyId,
        contractNumber: 'CTR-OVERLAP-2',
        vehicleId: confVeh.id,
        driverId: drv2.id,
        startDate: '2026-08-10',
        endDate: '2026-08-30',
        status: ContractStatus.ACTIVE,
        rentalAmount: 1500,
        billingPeriodicity: 'MONTHLY' as any,
        securityDepositAmount: 0,
        franchiseKm: 1000,
        excessKmRate: 1,
        isArchived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const ticket = await ticketService.createTicket(
        {
          companyId,
          vehicleId: confVeh.id,
          autoNumber: 'AUTO-TT45',
          infractionCode: '501-0',
          description: 'Multa em periodo de sobreposicao de contratos',
          infractionDate: '2026-08-15',
          dueDate: '2026-09-15',
          originalAmount: 250,
          responsibility: TicketResponsibility.UNIDENTIFIED,
        },
        userId,
        userName
      );

      if (ticket.driverId || ticket.contractId) {
        throw new Error('Múltiplos contratos sobrepostos não devem ter atribuição automática arbitrária.');
      }
    });

    return {
      total: results.length,
      passed: results.filter((r) => r.passed).length,
      failed: results.filter((r) => !r.passed).length,
      results,
    };
  }
}
