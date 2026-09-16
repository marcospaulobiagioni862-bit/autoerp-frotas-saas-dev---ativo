import { TrafficTicketRepository, VehicleRepository, DriverRepository, ContractRepository, AccountReceivableRepository, AccountPayableRepository, FinancialTransactionRepository, AuditLogRepository } from '../../persistence/repositories/localRepositories';
import { TrafficTicket } from '../../types/entities';
import { TicketResponsibility, TicketStatus, OriginType, AuditAction, ObligationStatus } from '../../types/enums';
import { FinanceEngine } from '../finance/FinanceEngine';
import { generateUUID } from '../../shared/utils/uuid';
import { AuditLogger } from '../../shared/utils/auditLogger';
import { IdempotencyService } from './IdempotencyService';

export interface CreateTrafficTicketDTO {
  companyId: string;
  vehicleId: string;
  autoNumber: string;
  organName?: string;
  infractionCode: string;
  description: string;
  infractionDate: string;
  dueDate: string;
  discountDueDate?: string;
  originalAmount: number;
  discountedAmount?: number;
  points?: number;
  responsibility: TicketResponsibility;
  driverId?: string;
  notes?: string;
}

export interface UpdateTrafficTicketDTO {
  autoNumber?: string;
  organName?: string;
  infractionCode?: string;
  description?: string;
  infractionDate?: string;
  dueDate?: string;
  discountDueDate?: string;
  originalAmount?: number;
  discountedAmount?: number;
  points?: number;
  notes?: string;
}

export class TrafficTicketService {
  private ticketRepo = new TrafficTicketRepository();
  private vehicleRepo = new VehicleRepository();
  private driverRepo = new DriverRepository();
  private contractRepo = new ContractRepository();
  private receivableRepo = new AccountReceivableRepository();
  private payableRepo = new AccountPayableRepository();
  private transactionRepo = new FinancialTransactionRepository();

  public async createTicket(
    dto: CreateTrafficTicketDTO,
    userId: string,
    userName: string
  ): Promise<TrafficTicket> {
    if (!dto.vehicleId) {
      throw new Error('Veículo é obrigatório para cadastrar uma multa.');
    }

    const vehicle = await this.vehicleRepo.findById(dto.vehicleId);
    if (!vehicle) {
      throw new Error('Veículo informado não foi encontrado.');
    }

    if (!dto.autoNumber || dto.autoNumber.trim() === '') {
      throw new Error('Número do auto de infração é obrigatório.');
    }

    if (!dto.originalAmount || dto.originalAmount <= 0) {
      throw new Error('Valor da multa deve ser maior que zero.');
    }

    const existingAuto = await this.ticketRepo.findByAutoNumber(dto.autoNumber.trim());
    if (existingAuto) {
      throw new Error(`Auto de infração ${dto.autoNumber} já cadastrado no sistema.`);
    }

    let assignedDriverId = dto.driverId;
    let assignedContractId: string | undefined;

    if (assignedDriverId) {
      const driver = await this.driverRepo.findById(assignedDriverId);
      if (!driver) {
        throw new Error('Motorista informado não foi encontrado.');
      }
    } else {
      // Buscar contrato ativo/histórico do veículo na data da infração
      const contracts = await this.contractRepo.findAll({ vehicleId: dto.vehicleId });
      const matchingContracts = contracts.filter((c) => {
        const start = c.startDate;
        const end = c.endDate || '9999-12-31';
        return dto.infractionDate >= start && dto.infractionDate <= end && c.status !== 'CANCELLED';
      });

      if (matchingContracts.length === 1) {
        assignedContractId = matchingContracts[0].id;
        assignedDriverId = matchingContracts[0].driverId;
      } else if (matchingContracts.length > 1) {
        // Conflito de contratos sobrepostos: não atribuir arbitrariamente
        assignedContractId = undefined;
        assignedDriverId = undefined;
      }
    }

    let initialStatus = TicketStatus.PENDING_IDENTIFICATION;
    if (dto.responsibility === TicketResponsibility.DRIVER && assignedDriverId) {
      initialStatus = TicketStatus.IDENTIFIED;
    } else if (dto.responsibility === TicketResponsibility.COMPANY) {
      initialStatus = TicketStatus.IDENTIFIED;
    }

    const newTicket: TrafficTicket = {
      id: generateUUID(),
      companyId: dto.companyId,
      vehicleId: dto.vehicleId,
      driverId: assignedDriverId,
      contractId: assignedContractId,
      autoNumber: dto.autoNumber.trim().toUpperCase(),
      organName: dto.organName || 'DETRAN',
      infractionCode: dto.infractionCode,
      description: dto.description,
      infractionDate: dto.infractionDate,
      dueDate: dto.dueDate,
      discountDueDate: dto.discountDueDate,
      originalAmount: dto.originalAmount,
      discountedAmount: dto.discountedAmount,
      points: dto.points || 0,
      responsibility: dto.responsibility,
      status: initialStatus,
      notes: dto.notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const created = await this.ticketRepo.create(newTicket);

    await AuditLogger.logAction(
      dto.companyId,
      'TrafficTicket',
      created.id,
      AuditAction.CREATE,
      userId,
      userName,
      null,
      created
    );

    // Gerar obrigação financeira automaticamente se houver responsabilidade definida
    if (
      (dto.responsibility === TicketResponsibility.DRIVER && assignedDriverId) ||
      dto.responsibility === TicketResponsibility.COMPANY
    ) {
      return await this.generateFinancialObligation(created.id, userId, userName);
    }

    return created;
  }

  public async generateFinancialObligation(
    ticketId: string,
    userId: string,
    userName: string
  ): Promise<TrafficTicket> {
    return IdempotencyService.executeWithLock(`ticket_obligation_${ticketId}`, async () => {
      const ticket = await this.ticketRepo.findById(ticketId);
      if (!ticket) {
        throw new Error('Multa não encontrada.');
      }

      const todayStr = new Date().toISOString().split('T')[0];
      const useDiscount =
        ticket.discountedAmount &&
        ticket.discountedAmount > 0 &&
        ticket.discountDueDate &&
        ticket.discountDueDate >= todayStr;

      const finalAmount = useDiscount ? ticket.discountedAmount! : ticket.originalAmount;

      if (ticket.responsibility === TicketResponsibility.DRIVER) {
        if (!ticket.driverId) {
          throw new Error('Motorista deve ser identificado antes de gerar cobrança ao motorista.');
        }

        // Evitar duplicidade se já houver receivableId ativo
        if (ticket.receivableId) {
          const existingRec = await this.receivableRepo.findById(ticket.receivableId);
          if (existingRec && existingRec.status !== ObligationStatus.CANCELLED) {
            return ticket;
          }
        }

        const receivables = await FinanceEngine.createReceivable({
          companyId: ticket.companyId,
          originType: OriginType.TRAFFIC_TICKET_DRIVER,
          originId: ticket.id,
          vehicleId: ticket.vehicleId,
          driverId: ticket.driverId,
          contractId: ticket.contractId,
          categoryId: 'cat-fines',
          description: `Multa de Trânsito Auto ${ticket.autoNumber} - ${ticket.description}`,
          totalAmount: finalAmount,
          dueDate: ticket.dueDate,
          competenceDate: ticket.infractionDate,
          userId,
          userName,
        });

        if (receivables.length > 0) {
          ticket.receivableId = receivables[0].id;
          ticket.status = TicketStatus.CHARGED_DRIVER;
          ticket.updatedAt = new Date().toISOString();
          await this.ticketRepo.update(ticket.id, ticket);
        }
      } else if (ticket.responsibility === TicketResponsibility.COMPANY) {
        // Evitar duplicidade se já houver payableId ativo
        if (ticket.payableId) {
          const existingPay = await this.payableRepo.findById(ticket.payableId);
          if (existingPay && existingPay.status !== ObligationStatus.CANCELLED) {
            return ticket;
          }
        }

        const payables = await FinanceEngine.createPayable({
          companyId: ticket.companyId,
          originType: OriginType.TRAFFIC_TICKET_COMPANY,
          originId: ticket.id,
          vehicleId: ticket.vehicleId,
          contractId: ticket.contractId,
          categoryId: 'cat-fines-exp',
          description: `Pagamento Multa Trânsito Auto ${ticket.autoNumber} - ${ticket.description}`,
          totalAmount: finalAmount,
          dueDate: ticket.dueDate,
          competenceDate: ticket.infractionDate,
          userId,
          userName,
        });

        if (payables.length > 0) {
          ticket.payableId = payables[0].id;
          ticket.status = TicketStatus.PAID_BY_COMPANY;
          ticket.updatedAt = new Date().toISOString();
          await this.ticketRepo.update(ticket.id, ticket);
        }
      }

      return ticket;
    });
  }

  public async assignDriverAndResponsibility(
    ticketId: string,
    driverId: string | undefined,
    responsibility: TicketResponsibility,
    userId: string,
    userName: string
  ): Promise<TrafficTicket> {
    const ticket = await this.ticketRepo.findById(ticketId);
    if (!ticket) {
      throw new Error('Multa não encontrada.');
    }

    const prevTicket = { ...ticket };

    if (driverId) {
      const driver = await this.driverRepo.findById(driverId);
      if (!driver) {
        throw new Error('Motorista não encontrado.');
      }
    }

    // 1. Tratar vínculo de RECEIVABLE anterior (se houver)
    if (ticket.receivableId) {
      const rec = await this.receivableRepo.findById(ticket.receivableId);
      if (rec && rec.status !== ObligationStatus.CANCELLED) {
        // Se já possui valores recebidos / baixa parcial ou total, estornar transações financeiras
        if (rec.paidAmount > 0 || rec.status === ObligationStatus.PAID || rec.status === ObligationStatus.PARTIALLY_PAID) {
          const txs = await this.transactionRepo.findByReceivableId(rec.id);
          for (const tx of txs) {
            if (!tx.isReversed) {
              await FinanceEngine.reverseTransaction(
                ticket.companyId,
                tx.id,
                tx.amount,
                `Alteração de responsabilidade da multa ${ticket.autoNumber}`,
                userId,
                userName
              );
            }
          }
        }
        await FinanceEngine.cancelReceivable(
          ticket.companyId,
          ticket.receivableId,
          'Alteração de responsabilidade da multa',
          userId,
          userName
        );
      }
      ticket.receivableId = undefined;
    }

    // 2. Tratar vínculo de PAYABLE anterior (se houver)
    if (ticket.payableId) {
      const pay = await this.payableRepo.findById(ticket.payableId);
      if (pay && pay.status !== ObligationStatus.CANCELLED) {
        // Se já possui valores pagos / baixa parcial ou total, estornar transações financeiras
        if (pay.paidAmount > 0 || pay.status === ObligationStatus.PAID || pay.status === ObligationStatus.PARTIALLY_PAID) {
          const txs = await this.transactionRepo.findByPayableId(pay.id);
          for (const tx of txs) {
            if (!tx.isReversed) {
              await FinanceEngine.reverseTransaction(
                ticket.companyId,
                tx.id,
                tx.amount,
                `Alteração de responsabilidade da multa ${ticket.autoNumber}`,
                userId,
                userName
              );
            }
          }
        }
        await FinanceEngine.cancelPayable(
          ticket.companyId,
          ticket.payableId,
          'Alteração de responsabilidade da multa',
          userId,
          userName
        );
      }
      ticket.payableId = undefined;
    }

    // 3. Tratar vínculo de NIC PAYABLE anterior (se houver)
    if (ticket.nicPayableId) {
      const nicPay = await this.payableRepo.findById(ticket.nicPayableId);
      if (nicPay && nicPay.status !== ObligationStatus.CANCELLED) {
        if (nicPay.paidAmount > 0 || nicPay.status === ObligationStatus.PAID || nicPay.status === ObligationStatus.PARTIALLY_PAID) {
          const txs = await this.transactionRepo.findByPayableId(nicPay.id);
          for (const tx of txs) {
            if (!tx.isReversed) {
              await FinanceEngine.reverseTransaction(
                ticket.companyId,
                tx.id,
                tx.amount,
                `Identificação de condutor em multa NIC ${ticket.autoNumber}`,
                userId,
                userName
              );
            }
          }
        }
        await FinanceEngine.cancelPayable(
          ticket.companyId,
          ticket.nicPayableId,
          'Condutor identificado dentro do prazo',
          userId,
          userName
        );
      }
      ticket.nicPayableId = undefined;
    }

    ticket.driverId = driverId;
    ticket.responsibility = responsibility;
    if (responsibility === TicketResponsibility.DRIVER && driverId) {
      ticket.status = TicketStatus.IDENTIFIED;
    } else if (responsibility === TicketResponsibility.COMPANY) {
      ticket.status = TicketStatus.IDENTIFIED;
    } else {
      ticket.status = TicketStatus.PENDING_IDENTIFICATION;
    }

    ticket.updatedAt = new Date().toISOString();
    await this.ticketRepo.update(ticket.id, ticket);

    await AuditLogger.logAction(
      ticket.companyId,
      'TrafficTicket',
      ticket.id,
      AuditAction.UPDATE,
      userId,
      userName,
      prevTicket,
      ticket
    );

    // Regenerar obrigação financeira conforme nova responsabilidade
    if (
      (responsibility === TicketResponsibility.DRIVER && driverId) ||
      responsibility === TicketResponsibility.COMPANY
    ) {
      return await this.generateFinancialObligation(ticket.id, userId, userName);
    }

    return ticket;
  }

  public async appealTicket(
    ticketId: string,
    notes: string,
    userId: string,
    userName: string
  ): Promise<TrafficTicket> {
    const ticket = await this.ticketRepo.findById(ticketId);
    if (!ticket) {
      throw new Error('Multa não encontrada.');
    }

    const prev = { ...ticket };
    ticket.status = TicketStatus.APPEALED;
    ticket.notes = (ticket.notes ? ticket.notes + '\n' : '') + `[RECURSO]: ${notes}`;
    ticket.updatedAt = new Date().toISOString();

    await this.ticketRepo.update(ticket.id, ticket);

    await AuditLogger.logAction(
      ticket.companyId,
      'TrafficTicket',
      ticket.id,
      AuditAction.UPDATE,
      userId,
      userName,
      prev,
      ticket
    );

    return ticket;
  }

  public async cancelTicket(
    ticketId: string,
    reason: string,
    userId: string,
    userName: string
  ): Promise<TrafficTicket> {
    const ticket = await this.ticketRepo.findById(ticketId);
    if (!ticket) {
      throw new Error('Multa não encontrada.');
    }

    const prev = { ...ticket };

    if (ticket.receivableId) {
      const rec = await this.receivableRepo.findById(ticket.receivableId);
      if (rec && rec.status !== ObligationStatus.CANCELLED) {
        if (rec.paidAmount > 0 || rec.status === ObligationStatus.PAID || rec.status === ObligationStatus.PARTIALLY_PAID) {
          throw new Error('Não é possível cancelar diretamente uma multa com valores já recebidos. Realize o estorno dos recebimentos ou alteração de responsabilidade primeiro.');
        }
        await FinanceEngine.cancelReceivable(
          ticket.companyId,
          ticket.receivableId,
          `Multa cancelada: ${reason}`,
          userId,
          userName
        );
      }
    }

    if (ticket.payableId) {
      const pay = await this.payableRepo.findById(ticket.payableId);
      if (pay && pay.status !== ObligationStatus.CANCELLED) {
        if (pay.paidAmount > 0 || pay.status === ObligationStatus.PAID || pay.status === ObligationStatus.PARTIALLY_PAID) {
          throw new Error('Não é possível cancelar diretamente uma multa com valores já pagos. Realize o estorno dos pagamentos ou alteração de responsabilidade primeiro.');
        }
        await FinanceEngine.cancelPayable(
          ticket.companyId,
          ticket.payableId,
          `Multa cancelada: ${reason}`,
          userId,
          userName
        );
      }
    }

    ticket.status = TicketStatus.CANCELLED;
    ticket.notes = (ticket.notes ? ticket.notes + '\n' : '') + `[CANCELAMENTO]: ${reason}`;
    ticket.updatedAt = new Date().toISOString();

    await this.ticketRepo.update(ticket.id, ticket);

    await AuditLogger.logAction(
      ticket.companyId,
      'TrafficTicket',
      ticket.id,
      AuditAction.CANCEL,
      userId,
      userName,
      prev,
      ticket
    );

    return ticket;
  }

  public async updateTicket(
    ticketId: string,
    dto: UpdateTrafficTicketDTO,
    userId: string,
    userName: string
  ): Promise<TrafficTicket> {
    const ticket = await this.ticketRepo.findById(ticketId);
    if (!ticket) {
      throw new Error('Multa não encontrada.');
    }

    const prev = { ...ticket };

    if (dto.autoNumber && dto.autoNumber.trim().toUpperCase() !== ticket.autoNumber) {
      const existing = await this.ticketRepo.findByAutoNumber(dto.autoNumber.trim());
      if (existing && existing.id !== ticket.id) {
        throw new Error(`Auto de infração ${dto.autoNumber} já cadastrado.`);
      }
      ticket.autoNumber = dto.autoNumber.trim().toUpperCase();
    }

    if (dto.originalAmount !== undefined) {
      if (dto.originalAmount <= 0) {
        throw new Error('Valor da multa deve ser maior que zero.');
      }
      ticket.originalAmount = dto.originalAmount;
    }

    if (dto.organName !== undefined) ticket.organName = dto.organName;
    if (dto.infractionCode !== undefined) ticket.infractionCode = dto.infractionCode;
    if (dto.description !== undefined) ticket.description = dto.description;
    if (dto.infractionDate !== undefined) ticket.infractionDate = dto.infractionDate;
    if (dto.dueDate !== undefined) ticket.dueDate = dto.dueDate;
    if (dto.discountDueDate !== undefined) ticket.discountDueDate = dto.discountDueDate;
    if (dto.discountedAmount !== undefined) ticket.discountedAmount = dto.discountedAmount;
    if (dto.points !== undefined) ticket.points = dto.points;
    if (dto.notes !== undefined) ticket.notes = dto.notes;

    ticket.updatedAt = new Date().toISOString();
    await this.ticketRepo.update(ticket.id, ticket);

    await AuditLogger.logAction(
      ticket.companyId,
      'TrafficTicket',
      ticket.id,
      AuditAction.UPDATE,
      userId,
      userName,
      prev,
      ticket
    );

    return ticket;
  }

  public async archiveTicket(
    ticketId: string,
    userId: string,
    userName: string
  ): Promise<{ action: 'archived' | 'deleted' }> {
    const ticket = await this.ticketRepo.findById(ticketId);
    if (!ticket) {
      throw new Error('Multa não encontrada.');
    }

    const hasFinancials = ticket.receivableId || ticket.payableId;

    if (hasFinancials) {
      ticket.status = TicketStatus.CANCELLED;
      ticket.updatedAt = new Date().toISOString();
      await this.ticketRepo.update(ticket.id, ticket);

      await AuditLogger.logAction(
        ticket.companyId,
        'TrafficTicket',
        ticket.id,
        AuditAction.ARCHIVE,
        userId,
        userName,
        null,
        { archived: true }
      );

      return { action: 'archived' };
    } else {
      await this.ticketRepo.delete(ticket.id);

      await AuditLogger.logAction(
        ticket.companyId,
        'TrafficTicket',
        ticket.id,
        AuditAction.DELETE,
        userId,
        userName,
        ticket,
        null
      );

      return { action: 'deleted' };
    }
  }

  public async processNICPenalty(
    ticketId: string,
    nicAmount?: number,
    userId: string = 'system',
    userName: string = 'System'
  ): Promise<TrafficTicket> {
    return IdempotencyService.executeWithLock(`ticket_nic_${ticketId}`, async () => {
      const ticket = await this.ticketRepo.findById(ticketId);
      if (!ticket) {
        throw new Error('Multa não encontrada.');
      }

      if (ticket.responsibility === TicketResponsibility.DRIVER && ticket.driverId) {
        throw new Error('Multa com condutor identificado não é elegível para penalidade NIC.');
      }

      if (ticket.status === TicketStatus.CANCELLED) {
        throw new Error('Multa cancelada não pode gerar penalidade NIC.');
      }

      // Check idempotency: if nicPayableId exists and is valid, return ticket
      if (ticket.nicPayableId) {
        const existingNicPay = await this.payableRepo.findById(ticket.nicPayableId);
        if (existingNicPay && existingNicPay.status !== ObligationStatus.CANCELLED) {
          return ticket;
        }
      }

      const penaltyVal = nicAmount || ticket.nicAmount || ticket.originalAmount;

      const payables = await FinanceEngine.createPayable({
        companyId: ticket.companyId,
        originType: OriginType.TRAFFIC_TICKET_COMPANY,
        originId: ticket.id,
        vehicleId: ticket.vehicleId,
        contractId: ticket.contractId,
        categoryId: 'cat-fines-exp',
        description: `Penalidade NIC (Não Identificação de Condutor) - Auto ${ticket.autoNumber}`,
        totalAmount: penaltyVal,
        dueDate: ticket.dueDate,
        competenceDate: ticket.infractionDate,
        idempotencyKey: IdempotencyService.buildKey(
          OriginType.TRAFFIC_TICKET_COMPANY,
          `${ticket.id}_NIC`,
          1,
          ticket.infractionDate,
          ticket.companyId
        ),
        userId,
        userName,
      });

      if (payables.length > 0) {
        ticket.nicPayableId = payables[0].id;
        ticket.nicAmount = penaltyVal;
        ticket.updatedAt = new Date().toISOString();
        await this.ticketRepo.update(ticket.id, ticket);
      }

      return ticket;
    });
  }

  public async processPendingNICPenalties(
    companyId: string,
    userId: string = 'system',
    userName: string = 'System'
  ): Promise<TrafficTicket[]> {
    if (!companyId) {
      throw new Error('companyId é obrigatório para processar NIC.');
    }
    const tickets = await this.ticketRepo.findAll({ companyId });
    const pendingTickets = tickets.filter(
      (t) =>
        t.companyId === companyId &&
        t.status === TicketStatus.PENDING_IDENTIFICATION &&
        !t.driverId &&
        t.responsibility !== TicketResponsibility.DRIVER
    );

    const processed: TrafficTicket[] = [];
    for (const ticket of pendingTickets) {
      const res = await this.processNICPenalty(ticket.id, undefined, userId, userName);
      processed.push(res);
    }
    return processed;
  }
}
