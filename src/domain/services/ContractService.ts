import {
  ContractRepository,
  VehicleRepository,
  DriverRepository,
  AccountReceivableRepository,
  SecurityDepositRepository,
  AuditLogRepository,
  RecurringRuleRepository,
} from '../../persistence/repositories/localRepositories';
import { Contract, Vehicle, Driver, AccountReceivable, SecurityDeposit, AuditLog, RecurringRule } from '../../types/entities';
import { calculatePeriodRef } from '../finance/RecurringProcessingService';
import {
  ContractStatus,
  VehicleStatus,
  DriverStatus,
  ObligationStatus,
  OriginType,
  AuditAction,
  DocumentStatus,
  RecurringFrequency,
} from '../../types/enums';
import { FinanceEngine } from '../finance/FinanceEngine';
import { evaluateCnhStatus } from './DriverService';
import { generateUUID } from '../../shared/utils/uuid';
import { AuditLogger } from '../../shared/utils/auditLogger';

export interface CreateContractParams {
  companyId: string;
  contractNumber?: string;
  vehicleId: string;
  driverId: string;
  startDate: string;
  endDate?: string;
  rentalAmount: number;
  billingPeriodicity: RecurringFrequency;
  billingDueDayOfWeek?: number;
  billingDueDayOfMonth?: number;
  securityDepositAmount: number;
  franchiseKm?: number;
  excessKmRate?: number;
  paymentMethodId?: string;
  templateId?: string;
  notes?: string;
  status?: ContractStatus;
  userId: string;
  userName: string;
}

export interface UpdateContractParams {
  contractNumber?: string;
  vehicleId?: string;
  driverId?: string;
  startDate?: string;
  endDate?: string;
  rentalAmount?: number;
  billingPeriodicity?: RecurringFrequency;
  billingDueDayOfWeek?: number;
  billingDueDayOfMonth?: number;
  securityDepositAmount?: number;
  franchiseKm?: number;
  excessKmRate?: number;
  paymentMethodId?: string;
  notes?: string;
  status?: ContractStatus;
  userId: string;
  userName: string;
}

export interface ActivateContractParams {
  companyId: string;
  contractId: string;
  userId: string;
  userName: string;
  justification?: string;
  generateInitialCharge?: boolean;
}

export interface CloseContractParams {
  companyId: string;
  contractId: string;
  closeDate?: string;
  notes?: string;
  userId: string;
  userName: string;
}

export interface RenewContractParams {
  companyId: string;
  oldContractId: string;
  newStartDate: string;
  newEndDate?: string;
  rentalAmount?: number;
  securityDepositAmount?: number;
  billingPeriodicity?: RecurringFrequency;
  activateImmediately?: boolean;
  userId: string;
  userName: string;
}

export interface ContractFinancialSummary {
  rentalAmount: number;
  totalBilled: number;
  totalPaid: number;
  totalOverdue: number;
  pendingBalance: number;
  depositStatus: string;
  depositAmount: number;
  depositPaidAmount: number;
  receivablesCount: number;
}

export class ContractService {
  private contractRepo = new ContractRepository();
  private vehicleRepo = new VehicleRepository();
  private driverRepo = new DriverRepository();
  private receivableRepo = new AccountReceivableRepository();
  private depositRepo = new SecurityDepositRepository();
  private auditRepo = new AuditLogRepository();
  private recurringRuleRepo = new RecurringRuleRepository();

  /**
   * Valida disponibilidade do veículo em determinado período
   */
  async validateVehicleAvailability(
    vehicleId: string,
    startDate: string,
    endDate?: string,
    excludeContractId?: string,
    companyId?: string
  ): Promise<{ available: boolean; reason?: string }> {
    const vehicle = await this.vehicleRepo.findById(vehicleId);
    if (!vehicle) {
      return { available: false, reason: 'Veículo não encontrado' };
    }

    if (companyId && vehicle.companyId !== companyId) {
      return { available: false, reason: 'Veículo não pertence à empresa da operação.' };
    }

    if (vehicle.isArchived) {
      return { available: false, reason: 'Veículo está arquivado e não pode receber novo contrato' };
    }

    if (vehicle.status !== VehicleStatus.AVAILABLE) {
      return {
        available: false,
        reason: `Veículo está com status ${vehicle.status} e não está disponível para novo contrato`,
      };
    }

    // Verificar contratos ativos concorrentes (escopados por companyId quando informado)
    const contracts = companyId
      ? await this.contractRepo.findAll({ companyId, vehicleId })
      : await this.contractRepo.findAll({ vehicleId });
    const activeContracts = contracts.filter(
      (c) =>
        c.id !== excludeContractId &&
        c.status === ContractStatus.ACTIVE &&
        !c.isArchived &&
        (!companyId || c.companyId === companyId)
    );

    for (const activeC of activeContracts) {
      // Checar sobreposição de datas
      const activeStart = activeC.startDate;
      const activeEnd = activeC.endDate || '9999-12-31';
      const reqStart = startDate;
      const reqEnd = endDate || '9999-12-31';

      if (reqStart <= activeEnd && reqEnd >= activeStart) {
        return {
          available: false,
          reason: `Veículo já possui contrato ativo (${activeC.contractNumber}) no período conflitante`,
        };
      }
    }

    return { available: true };
  }

  /**
   * Valida elegibilidade do motorista
   */
  async validateDriverEligibility(
    driverId: string,
    startDate: string,
    endDate?: string,
    excludeContractId?: string,
    companyId?: string
  ): Promise<{ eligible: boolean; reason?: string }> {
    const driver = await this.driverRepo.findById(driverId);
    if (!driver) {
      return { eligible: false, reason: 'Motorista não encontrado' };
    }

    if (companyId && driver.companyId !== companyId) {
      return { eligible: false, reason: 'Motorista não pertence à empresa da operação.' };
    }

    if (driver.status === DriverStatus.INACTIVE || driver.status === DriverStatus.BLOCKED || driver.isArchived) {
      return { eligible: false, reason: `Motorista está ${driver.status} e não pode vincular contrato` };
    }

    // CNH Expiration check
    const cnhEval = evaluateCnhStatus(driver.cnhExpiration);
    if (cnhEval.status === DocumentStatus.EXPIRED) {
      return { eligible: false, reason: 'CNH do motorista está vencida' };
    }

    // Checar sobreposição de contratos ativos do motorista (escopados por companyId quando informado)
    const contracts = companyId
      ? await this.contractRepo.findAll({ companyId, driverId })
      : await this.contractRepo.findAll({ driverId });
    const activeContracts = contracts.filter(
      (c) =>
        c.id !== excludeContractId &&
        c.status === ContractStatus.ACTIVE &&
        !c.isArchived &&
        (!companyId || c.companyId === companyId)
    );

    for (const activeC of activeContracts) {
      const activeStart = activeC.startDate;
      const activeEnd = activeC.endDate || '9999-12-31';
      const reqStart = startDate;
      const reqEnd = endDate || '9999-12-31';

      if (reqStart <= activeEnd && reqEnd >= activeStart) {
        return {
          available: false,
          reason: `Motorista já possui contrato ativo (${activeC.contractNumber}) no mesmo período`,
        } as any;
      }
    }

    return { eligible: true };
  }

  /**
   * Criar novo contrato
   */
  async createContract(params: CreateContractParams): Promise<Contract> {
    if (!params.vehicleId) {
      throw new Error('Veículo é obrigatório para criação do contrato');
    }
    if (!params.driverId) {
      throw new Error('Motorista é obrigatório para criação do contrato');
    }
    if (params.rentalAmount <= 0) {
      throw new Error('O valor do aluguel deve ser maior que zero');
    }
    if (params.startDate && params.endDate && params.startDate > params.endDate) {
      throw new Error('A data inicial não pode ser maior que a data final');
    }

    const vehicle = await this.vehicleRepo.findById(params.vehicleId);
    if (!vehicle) throw new Error('Veículo não encontrado');
    if (vehicle.companyId !== params.companyId) throw new Error('Veículo não pertence à empresa da operação.');

    const driver = await this.driverRepo.findById(params.driverId);
    if (!driver) throw new Error('Motorista não encontrado');
    if (driver.companyId !== params.companyId) throw new Error('Motorista não pertence à empresa da operação.');

    let contractNumber = params.contractNumber?.trim();
    if (!contractNumber) {
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const randStr = Math.floor(1000 + Math.random() * 9000);
      contractNumber = `CNT-${dateStr}-${randStr}`;
    }

    const allContracts = await this.contractRepo.findAll({ companyId: params.companyId });
    const numberExists = allContracts.some((c) => c.contractNumber.toUpperCase() === contractNumber!.toUpperCase());
    if (numberExists) throw new Error(`O número de contrato ${contractNumber} já existe`);

    const requestedStatus = params.status || ContractStatus.DRAFT;

    if (requestedStatus === ContractStatus.ACTIVE) {
      const vehCheck = await this.validateVehicleAvailability(params.vehicleId, params.startDate, params.endDate, undefined, params.companyId);
      if (!vehCheck.available) throw new Error(vehCheck.reason);
      const drvCheck = await this.validateDriverEligibility(params.driverId, params.startDate, params.endDate, undefined, params.companyId);
      if (!drvCheck.eligible) throw new Error(drvCheck.reason);
    }

    const now = new Date().toISOString();
    const newContract: Contract = {
      id: generateUUID(), companyId: params.companyId, contractNumber, vehicleId: params.vehicleId, driverId: params.driverId,
      startDate: params.startDate, endDate: params.endDate, status: requestedStatus, rentalAmount: params.rentalAmount,
      billingPeriodicity: params.billingPeriodicity, billingDueDayOfWeek: params.billingDueDayOfWeek || 1,
      billingDueDayOfMonth: params.billingDueDayOfMonth || 1, securityDepositAmount: params.securityDepositAmount || 0,
      franchiseKm: params.franchiseKm || 1500, excessKmRate: params.excessKmRate || 0.5,
      paymentMethodId: params.paymentMethodId, templateId: params.templateId, notes: params.notes,
      isArchived: false, createdAt: now, updatedAt: now,
    };

    const saved = await this.contractRepo.create(newContract);
    if (requestedStatus === ContractStatus.ACTIVE) await this.postActivateActions(saved, params.userId, params.userName, true);
    await AuditLogger.logAction(params.companyId, 'Contract', saved.id, AuditAction.CREATE, params.userId, params.userName, null, saved);
    return saved;
  }

  async updateContract(id: string, params: UpdateContractParams): Promise<Contract> {
    const contract = await this.contractRepo.findById(id);
    if (!contract) throw new Error('Contrato não encontrado');
    if (contract.status === ContractStatus.CLOSED || contract.status === ContractStatus.CANCELLED) {
      throw new Error(`Não é possível editar um contrato com status ${contract.status}`);
    }

    if (params.vehicleId !== undefined) {
      const vehicle = await this.vehicleRepo.findById(params.vehicleId);
      if (!vehicle) throw new Error('Veículo não encontrado');
      if (vehicle.companyId !== contract.companyId) throw new Error('Veículo não pertence à empresa da operação.');
    }
    if (params.driverId !== undefined) {
      const driver = await this.driverRepo.findById(params.driverId);
      if (!driver) throw new Error('Motorista não encontrado');
      if (driver.companyId !== contract.companyId) throw new Error('Motorista não pertence à empresa da operação.');
    }

    const previousState = { ...contract };
    const updates: Partial<Contract> = { updatedAt: new Date().toISOString() };
    if (params.contractNumber !== undefined) updates.contractNumber = params.contractNumber;
    if (params.vehicleId !== undefined) updates.vehicleId = params.vehicleId;
    if (params.driverId !== undefined) updates.driverId = params.driverId;
    if (params.startDate !== undefined) updates.startDate = params.startDate;
    if (params.endDate !== undefined) updates.endDate = params.endDate;
    if (params.rentalAmount !== undefined) updates.rentalAmount = params.rentalAmount;
    if (params.billingPeriodicity !== undefined) updates.billingPeriodicity = params.billingPeriodicity;
    if (params.billingDueDayOfWeek !== undefined) updates.billingDueDayOfWeek = params.billingDueDayOfWeek;
    if (params.billingDueDayOfMonth !== undefined) updates.billingDueDayOfMonth = params.billingDueDayOfMonth;
    if (params.securityDepositAmount !== undefined) updates.securityDepositAmount = params.securityDepositAmount;
    if (params.franchiseKm !== undefined) updates.franchiseKm = params.franchiseKm;
    if (params.excessKmRate !== undefined) updates.excessKmRate = params.excessKmRate;
    if (params.paymentMethodId !== undefined) updates.paymentMethodId = params.paymentMethodId;
    if (params.notes !== undefined) updates.notes = params.notes;

    const updated = await this.contractRepo.update(id, updates);
    await AuditLogger.logAction(contract.companyId, 'Contract', id, AuditAction.UPDATE, params.userId, params.userName, previousState, updated);
    return updated;
  }

  async activateContract(params: ActivateContractParams): Promise<Contract> {
    const contract = await this.contractRepo.findById(params.contractId);
    if (!contract) throw new Error('Contrato não encontrado');
    if (contract.companyId !== params.companyId) throw new Error('Contrato não pertence à empresa da operação.');
    if (contract.status === ContractStatus.ACTIVE) return contract;
    if (contract.status === ContractStatus.CLOSED || contract.status === ContractStatus.CANCELLED) {
      throw new Error(`Contrato com status ${contract.status} não pode ser ativado`);
    }

    const vehicle = await this.vehicleRepo.findById(contract.vehicleId);
    if (!vehicle || vehicle.companyId !== params.companyId) throw new Error('Veículo não pertence à empresa da operação.');

    const vehCheck = await this.validateVehicleAvailability(contract.vehicleId, contract.startDate, contract.endDate, contract.id, params.companyId);
    if (!vehCheck.available) throw new Error(`Não é possível ativar contrato: ${vehCheck.reason}`);

    const driver = await this.driverRepo.findById(contract.driverId);
    if (!driver || driver.companyId !== params.companyId) throw new Error('Motorista não pertence à empresa da operação.');
    const drvCheck = await this.validateDriverEligibility(contract.driverId, contract.startDate, contract.endDate, contract.id, params.companyId);
    if (!drvCheck.eligible) throw new Error(`Não é possível ativar contrato: ${drvCheck.reason}`);
    if (!contract.rentalAmount || contract.rentalAmount <= 0) throw new Error('Valor do aluguel do contrato é inválido para ativação');

    const previousState = { ...contract };
    const updatedContract = await this.contractRepo.update(contract.id, { status: ContractStatus.ACTIVE, updatedAt: new Date().toISOString() });
    await this.postActivateActions(updatedContract, params.userId, params.userName, params.generateInitialCharge);
    await AuditLogger.logAction(contract.companyId, 'Contract', contract.id, AuditAction.UPDATE, params.userId, params.userName, previousState, updatedContract);
    return updatedContract;
  }

  private async postActivateActions(contract: Contract, userId: string, userName: string, generateInitialCharge: boolean = true): Promise<void> {
    const vehicle = await this.vehicleRepo.findById(contract.vehicleId);
    if (!vehicle || vehicle.companyId !== contract.companyId) throw new Error('Veículo não pertence à empresa da operação.');
    const driver = await this.driverRepo.findById(contract.driverId);
    if (!driver || driver.companyId !== contract.companyId) throw new Error('Motorista não pertence à empresa da operação.');

    await this.vehicleRepo.update(contract.vehicleId, {
      status: VehicleStatus.RENTED, currentDriverId: contract.driverId, currentContractId: contract.id, updatedAt: new Date().toISOString(),
    });
    await this.driverRepo.update(contract.driverId, {
      currentVehicleId: contract.vehicleId, currentContractId: contract.id, updatedAt: new Date().toISOString(),
    });

    const existingRules = await this.recurringRuleRepo.findAll({ companyId: contract.companyId });
    const existingContractRule = existingRules.find((r) => r.originId === contract.id && r.status === 'ACTIVE');
    if (!existingContractRule) {
      await this.recurringRuleRepo.create({
        id: generateUUID(), companyId: contract.companyId, originType: OriginType.CONTRACT_RENT, originId: contract.id,
        description: `Aluguel Recorrente - Contrato ${contract.contractNumber}`, amount: contract.rentalAmount,
        frequency: contract.billingPeriodicity, startDate: contract.startDate, endDate: contract.endDate,
        nextGenerationDate: contract.startDate, categoryId: 'cat-rent-inc', vehicleId: contract.vehicleId,
        driverId: contract.driverId, paymentMethodId: contract.paymentMethodId, status: 'ACTIVE',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
    }

    if (generateInitialCharge) {
      await FinanceEngine.createReceivable({
        companyId: contract.companyId, originType: OriginType.CONTRACT_RENT, originId: contract.id,
        vehicleId: contract.vehicleId, driverId: contract.driverId, contractId: contract.id, categoryId: 'cat-rent-inc',
        description: `Aluguel Contrato ${contract.contractNumber} (${contract.billingPeriodicity})`, totalAmount: contract.rentalAmount,
        dueDate: contract.startDate, competenceDate: contract.startDate, userId, userName,
      });
    }
  }

  async closeContract(params: CloseContractParams): Promise<Contract> {
    const contract = await this.contractRepo.findById(params.contractId);
    if (!contract) throw new Error('Contrato não encontrado');
    if (contract.companyId !== params.companyId) throw new Error('Contrato não pertence à empresa da operação.');
    if (contract.status === ContractStatus.CLOSED || contract.status === ContractStatus.FINISHED) return contract;

    const previousState = { ...contract };
    const closeDateStr = params.closeDate || new Date().toISOString().slice(0, 10);
    const updatedContract = await this.contractRepo.update(contract.id, {
      status: ContractStatus.CLOSED,
      endDate: contract.endDate && contract.endDate < closeDateStr ? contract.endDate : closeDateStr,
      notes: params.notes ? `${contract.notes || ''}\n[Encerramento]: ${params.notes}` : contract.notes,
      updatedAt: new Date().toISOString(),
    });

    const vehContracts = await this.contractRepo.findAll({ companyId: contract.companyId, vehicleId: contract.vehicleId });
    const otherActive = vehContracts.filter((c) => c.id !== contract.id && c.status === ContractStatus.ACTIVE && !c.isArchived);
    if (otherActive.length === 0) {
      const veh = await this.vehicleRepo.findById(contract.vehicleId);
      if (veh && veh.companyId === contract.companyId) {
        await this.vehicleRepo.update(contract.vehicleId, { status: VehicleStatus.AVAILABLE, currentDriverId: undefined, currentContractId: undefined, updatedAt: new Date().toISOString() });
      }
    }

    const driver = await this.driverRepo.findById(contract.driverId);
    if (driver && driver.companyId === contract.companyId && driver.currentContractId === contract.id) {
      await this.driverRepo.update(contract.driverId, { currentVehicleId: undefined, currentContractId: undefined, updatedAt: new Date().toISOString() });
    }

    const rules = await this.recurringRuleRepo.findAll({ companyId: contract.companyId });
    const contractRules = rules.filter((r) => r.originId === contract.id && r.status === 'ACTIVE');
    for (const rule of contractRules) await this.recurringRuleRepo.update(rule.id, { status: 'COMPLETED', updatedAt: new Date().toISOString() });

    await AuditLogger.logAction(contract.companyId, 'Contract', contract.id, AuditAction.UPDATE, params.userId, params.userName, previousState, updatedContract);
    return updatedContract;
  }

  async cancelContract(contractId: string, reason: string, userId: string, userName: string): Promise<Contract> {
    const contract = await this.contractRepo.findById(contractId);
    if (!contract) throw new Error('Contrato não encontrado');
    if (contract.status === ContractStatus.CANCELLED) return contract;

    const previousState = { ...contract };
    const updatedContract = await this.contractRepo.update(contract.id, {
      status: ContractStatus.CANCELLED, notes: `${contract.notes || ''}\n[Cancelamento]: ${reason}`, updatedAt: new Date().toISOString(),
    });

    const vehContracts = await this.contractRepo.findAll({ companyId: contract.companyId, vehicleId: contract.vehicleId });
    const otherActive = vehContracts.filter((c) => c.id !== contract.id && c.status === ContractStatus.ACTIVE && !c.isArchived);
    if (otherActive.length === 0) {
      const veh = await this.vehicleRepo.findById(contract.vehicleId);
      if (veh && veh.companyId === contract.companyId && veh.currentContractId === contract.id) {
        await this.vehicleRepo.update(contract.vehicleId, { status: VehicleStatus.AVAILABLE, currentDriverId: undefined, currentContractId: undefined, updatedAt: new Date().toISOString() });
      }
    }

    const driver = await this.driverRepo.findById(contract.driverId);
    if (driver && driver.companyId === contract.companyId && driver.currentContractId === contract.id) {
      await this.driverRepo.update(contract.driverId, { currentVehicleId: undefined, currentContractId: undefined, updatedAt: new Date().toISOString() });
    }

    const rules = await this.recurringRuleRepo.findAll({ companyId: contract.companyId });
    const contractRules = rules.filter((r) => r.originId === contract.id && r.status === 'ACTIVE');
    for (const rule of contractRules) await this.recurringRuleRepo.update(rule.id, { status: 'CANCELLED', updatedAt: new Date().toISOString() });

    await AuditLogger.logAction(contract.companyId, 'Contract', contract.id, AuditAction.CANCEL, userId, userName, previousState, updatedContract);
    return updatedContract;
  }

  async renewContract(params: RenewContractParams): Promise<{ oldContract: Contract; newContract: Contract }> {
    const oldContract = await this.contractRepo.findById(params.oldContractId);
    if (!oldContract) throw new Error('Contrato original não encontrado');
    if (oldContract.companyId !== params.companyId) throw new Error('Contrato não pertence à empresa da operação.');

    const vehicle = await this.vehicleRepo.findById(oldContract.vehicleId);
    if (!vehicle || vehicle.companyId !== params.companyId) throw new Error('Veículo não pertence à empresa da operação.');
    const driver = await this.driverRepo.findById(oldContract.driverId);
    if (!driver || driver.companyId !== params.companyId) throw new Error('Motorista não pertence à empresa da operação.');

    const closedOld = await this.closeContract({
      companyId: params.companyId, contractId: params.oldContractId, closeDate: params.newStartDate,
      notes: `Encerrado devido a renovação para novo período (${params.newStartDate})`, userId: params.userId, userName: params.userName,
    });

    const newContractNumber = `${oldContract.contractNumber}-R${Date.now().toString().slice(-4)}`;
    const newContract = await this.createContract({
      companyId: params.companyId, contractNumber: newContractNumber, vehicleId: oldContract.vehicleId, driverId: oldContract.driverId,
      startDate: params.newStartDate, endDate: params.newEndDate, rentalAmount: params.rentalAmount || oldContract.rentalAmount,
      billingPeriodicity: params.billingPeriodicity || oldContract.billingPeriodicity,
      securityDepositAmount: params.securityDepositAmount !== undefined ? params.securityDepositAmount : oldContract.securityDepositAmount,
      franchiseKm: oldContract.franchiseKm, excessKmRate: oldContract.excessKmRate,
      notes: `Renovação do Contrato ${oldContract.contractNumber}`, status: params.activateImmediately ? ContractStatus.ACTIVE : ContractStatus.DRAFT,
      userId: params.userId, userName: params.userName,
    });
    return { oldContract: closedOld, newContract };
  }

  async processContractRecurring(contractId: string, dueDate: string, userId: string, userName: string): Promise<AccountReceivable[]> {
    const contract = await this.contractRepo.findById(contractId);
    if (!contract) throw new Error('Contrato não encontrado');
    if (contract.status !== ContractStatus.ACTIVE) throw new Error(`Contrato deve estar ACTIVE para gerar cobrança recorrente. Status atual: ${contract.status}`);

    const vehicle = await this.vehicleRepo.findById(contract.vehicleId);
    if (!vehicle || vehicle.companyId !== contract.companyId) throw new Error('Veículo não pertence à empresa da operação.');
    const driver = await this.driverRepo.findById(contract.driverId);
    if (!driver || driver.companyId !== contract.companyId) throw new Error('Motorista não pertence à empresa da operação.');

    const periodRef = calculatePeriodRef(contract.billingPeriodicity, dueDate);
    return FinanceEngine.createReceivable({
      companyId: contract.companyId, originType: OriginType.CONTRACT_RENT, originId: contract.id,
      vehicleId: contract.vehicleId, driverId: contract.driverId, contractId: contract.id, categoryId: 'cat-rent-inc',
      description: `Aluguel Recorrente - Contrato ${contract.contractNumber}`, totalAmount: contract.rentalAmount,
      dueDate, competenceDate: periodRef, userId, userName,
    });
  }

  async getContractFinancialSummary(contractId: string): Promise<ContractFinancialSummary> {
    const contract = await this.contractRepo.findById(contractId);
    if (!contract) throw new Error('Contrato não encontrado');
    const allReceivables = await this.receivableRepo.findByContractId(contractId);
    const receivables = allReceivables.filter((r) => r.companyId === contract.companyId);
    const rawDeposit = await this.depositRepo.findByContractId(contractId);
    const deposit = rawDeposit && rawDeposit.companyId === contract.companyId ? rawDeposit : null;

    let totalBilled = 0, totalPaid = 0, totalOverdue = 0, pendingBalance = 0;
    const todayStr = new Date().toISOString().split('T')[0];
    receivables.forEach((r) => {
      const amount = r.updatedAmount || r.originalAmount;
      totalBilled += amount; totalPaid += r.paidAmount;
      if (r.status !== ObligationStatus.CANCELLED) {
        pendingBalance += r.balanceAmount;
        if (r.dueDate < todayStr && r.balanceAmount > 0) totalOverdue += r.balanceAmount;
      }
    });

    return {
      rentalAmount: contract.rentalAmount, totalBilled, totalPaid, totalOverdue, pendingBalance,
      depositStatus: deposit ? deposit.status : 'NÃO REGISTRADA',
      depositAmount: contract.securityDepositAmount || (deposit ? deposit.originalAmount : 0),
      depositPaidAmount: deposit ? deposit.receivedAmount : 0, receivablesCount: receivables.length,
    };
  }

  async getContractHistory(contractId: string): Promise<AuditLog[]> {
    const contract = await this.contractRepo.findById(contractId);
    const allLogs = await this.auditRepo.findAll();
    return allLogs
      .filter((log) => (!contract || log.companyId === contract.companyId) && (log.entityId === contractId || (log.entityName === 'Contract' && log.entityId === contractId)))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async deleteOrArchiveContract(contractId: string, userId: string, userName: string): Promise<{ action: 'archived' | 'deleted' }> {
    const contract = await this.contractRepo.findById(contractId);
    if (!contract) throw new Error('Contrato não encontrado');
    const allReceivables = await this.receivableRepo.findByContractId(contractId);
    const receivables = allReceivables.filter((r) => r.companyId === contract.companyId);
    const hasFinancials = receivables.length > 0;

    if (hasFinancials) {
      await this.contractRepo.update(contractId, { isArchived: true, status: ContractStatus.ARCHIVED, updatedAt: new Date().toISOString() });
      await AuditLogger.logAction(contract.companyId, 'Contract', contractId, AuditAction.ARCHIVE, userId, userName, contract, { ...contract, isArchived: true, status: ContractStatus.ARCHIVED });
      return { action: 'archived' };
    }

    await this.contractRepo.delete(contractId);
    await AuditLogger.logAction(contract.companyId, 'Contract', contractId, AuditAction.DELETE, userId, userName, contract, null);
    return { action: 'deleted' };
  }
}
