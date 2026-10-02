import {
  FinancialAccountType,
  FinancialCategoryType,
  SecurityDepositStatus,
  SecurityDepositMovementType,
  ObligationStatus,
  TransactionType,
  OriginType,
  RecurringFrequency,
  StatementEntryStatus,
  StatementDirection,
  FinancialPeriodStatus,
} from '../enums';
import type { FinancialDreGroup } from '../../shared/utils/financialDreGroups';

export interface FinancialAccount {
  id: string; // UUID
  companyId: string;
  name: string; // e.g. "Caixa Geral", "Nubank Empresa"
  type: FinancialAccountType;
  institution?: string;
  accountNumber?: string;
  agency?: string;
  pixKey?: string;
  initialBalance: number;
  currentBalance: number;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export interface PaymentMethod {
  id: string; // UUID
  companyId: string;
  name: string; // e.g. "PIX", "Boleto", "Cartão de Crédito", "Dinheiro"
  code: string;
  active: boolean;
  requiresFinancialAccount: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialCategory {
  id: string; // UUID
  companyId: string;
  name: string;
  type: FinancialCategoryType;
  parentId?: string; // For hierarchy (e.g., Despesas -> Veículos -> Manutenção)
  dreGroup?: FinancialDreGroup | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SecurityDeposit {
  id: string; // UUID
  companyId: string;
  contractId: string;
  driverId: string;
  vehicleId: string;
  originalAmount: number;
  receivedAmount: number;
  usedAmount: number;
  returnedAmount: number;
  status: SecurityDepositStatus;
  receivedAt?: string;
  returnedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SecurityDepositMovement {
  id: string; // UUID
  securityDepositId: string;
  companyId: string;
  type: SecurityDepositMovementType;
  amount: number;
  date: string;
  financialTransactionId?: string;
  receivableId?: string;
  description: string;
  createdById: string;
  createdAt: string;
}

export interface AccountReceivable {
  id: string; // UUID
  companyId: string;
  originType: OriginType;
  originId: string; // Id of contract, ticket, km record, etc.
  vehicleId?: string;
  driverId?: string;
  contractId?: string;
  categoryId: string;
  description: string;
  originalAmount: number;
  discountAmount: number;
  fineAmount: number;
  interestAmount: number;
  additionalAmount?: number;
  updatedAmount: number; // original + fine + interest - discount
  paidAmount: number; // Sum of effective transactions
  balanceAmount: number; // updatedAmount - paidAmount
  totalAmount?: number;
  dueDate: string;
  competenceDate: string; // For accrual DRE
  status: ObligationStatus;
  installmentGroupId?: string;
  installmentNumber?: number;
  totalInstallments?: number;
  renegotiationId?: string;
  idempotencyKey: string; // originType + originId + installmentNumber
  cancelledAt?: string;
  cancelReason?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccountPayable {
  id: string; // UUID
  companyId: string;
  originType: OriginType;
  originId: string; // Id of maintenance, insurance, ticket, supplier bill
  vehicleId?: string; // Direct expense of vehicle (IPVA, maintenance, etc.)
  supplierId?: string;
  driverId?: string;
  contractId?: string;
  categoryId: string;
  description: string;
  originalAmount: number;
  discountAmount: number;
  fineAmount: number;
  interestAmount: number;
  additionalAmount?: number;
  updatedAmount: number;
  paidAmount: number;
  balanceAmount: number;
  totalAmount?: number;
  dueDate: string;
  competenceDate: string; // For accrual DRE
  status: ObligationStatus;
  installmentGroupId?: string;
  installmentNumber?: number;
  totalInstallments?: number;
  renegotiationId?: string;
  idempotencyKey: string;
  cancelledAt?: string;
  cancelReason?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialTransaction {
  id: string; // UUID
  companyId: string;
  financialAccountId: string; // Source account
  destinationAccountId?: string; // Destination account (for TRANSFER type)
  receivableId?: string;
  payableId?: string;
  type: TransactionType; // INCOME / EXPENSE / REVERSAL / TRANSFER
  amount: number;
  paymentMethodId: string;
  transactionDate: string; // Cash flow date
  competenceDate: string; // Accrual DRE date
  description: string;
  isReversed: boolean;
  reversalTransactionId?: string; // Points to opposite transaction
  vehicleId?: string; // Cost center vehicle
  driverId?: string;
  supplierId?: string;
  createdById: string;
  idempotencyKey?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringRule {
  id: string; // UUID
  companyId: string;
  originType: OriginType;
  originId?: string;
  description: string;
  amount: number;
  frequency: RecurringFrequency;
  startDate: string;
  endDate?: string;
  nextGenerationDate: string;
  lastGeneratedReference?: string;
  categoryId: string;
  vehicleId?: string;
  driverId?: string;
  supplierId?: string;
  paymentMethodId?: string;
  status: 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'COMPLETED';
  createdAt: string;
  updatedAt: string;
}

export interface BankStatementEntry {
  id: string; // UUID
  companyId: string;
  financialAccountId: string;
  externalId?: string; // External transaction/bank ID
  date: string; // YYYY-MM-DD
  description: string;
  amount: number;
  direction: StatementDirection; // CREDIT / DEBIT
  documentNumber?: string;
  importSource: string; // 'MANUAL' | 'CSV' | 'IMPORT'
  status: StatementEntryStatus; // UNMATCHED | SUGGESTED | MATCHED | IGNORED | REVERSED
  matchedTransactionId?: string;
  matchedAt?: string;
  matchedBy?: string;
  correlationId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialPeriod {
  id: string; // UUID
  companyId: string;
  year?: number;
  month?: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  status: FinancialPeriodStatus; // OPEN | CLOSED
  closedAt?: string;
  closedBy?: string;
  reopenedAt?: string;
  reopenedBy?: string;
  reopenReason?: string;
  correlationId?: string;
  createdAt: string;
  updatedAt: string;
}
