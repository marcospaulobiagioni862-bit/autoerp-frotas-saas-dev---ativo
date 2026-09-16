export interface DriverFinancialSummary {
  driverId: string;
  fullName: string;
  cpf: string;
  currentVehiclePlate?: string;
  totalCharged: number;
  totalPaid: number;
  currentBalanceDue: number; // Inadimplência ou Crédito
  overdueCount: number;
  overdueAmount: number;
  securityDepositStatus: string;
  securityDepositAmount: number;
}

export interface DelinquencyReport {
  periodStart: string;
  periodEnd: string;
  totalPendingAmount: number;
  totalOverdueAmount: number;
  overdueCount: number;
  delinquentDrivers: DriverFinancialSummary[];
}
