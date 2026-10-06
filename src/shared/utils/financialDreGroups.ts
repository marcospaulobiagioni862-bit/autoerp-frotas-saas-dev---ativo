export const FINANCIAL_DRE_GROUPS = {
  REVENUE: 'Receitas operacionais',
  MAINTENANCE: 'Manutenção e peças',
  INSURANCE: 'Seguros',
  TRACKER: 'Rastreamento',
  TRAFFIC_TICKETS: 'Multas de trânsito',
  DOCUMENTATION: 'Documentação e licenciamento',
  FINANCING: 'Financiamento',
  ADMINISTRATIVE: 'Despesas administrativas',
  PAYROLL: 'Folha e encargos',
  TAXES: 'Tributos',
  OTHER_COSTS: 'Outros custos',
  SECURITY_DEPOSIT: 'Caução (fora do DRE)',
} as const;
export type FinancialDreGroup = keyof typeof FINANCIAL_DRE_GROUPS;
export function isFinancialDreGroup(value: unknown): value is FinancialDreGroup {
  return typeof value === 'string' && Object.hasOwn(FINANCIAL_DRE_GROUPS, value);
}
export function isDreGroupCompatible(type: string, group: FinancialDreGroup): boolean {
  return group === 'SECURITY_DEPOSIT' || (group === 'REVENUE' ? type !== 'EXPENSE' : type !== 'INCOME');
}

export const DEFAULT_FINANCIAL_CATEGORIES: ReadonlyArray<{name: string; type: 'INCOME' | 'EXPENSE' | 'BOTH'; dreGroup: FinancialDreGroup}> = [
  {name: 'Locação de veículos', type: 'INCOME', dreGroup: 'REVENUE'},
  {name: 'KM excedente', type: 'INCOME', dreGroup: 'REVENUE'},
  {name: 'Ressarcimentos', type: 'INCOME', dreGroup: 'REVENUE'},
  {name: 'Outras receitas', type: 'INCOME', dreGroup: 'REVENUE'},
  {name: 'Manutenção', type: 'EXPENSE', dreGroup: 'MAINTENANCE'},
  {name: 'Peças e pneus', type: 'EXPENSE', dreGroup: 'MAINTENANCE'},
  {name: 'Seguros', type: 'EXPENSE', dreGroup: 'INSURANCE'},
  {name: 'Rastreamento', type: 'EXPENSE', dreGroup: 'TRACKER'},
  {name: 'Multas de trânsito', type: 'EXPENSE', dreGroup: 'TRAFFIC_TICKETS'},
  {name: 'IPVA e licenciamento', type: 'EXPENSE', dreGroup: 'DOCUMENTATION'},
  {name: 'Financiamento', type: 'EXPENSE', dreGroup: 'FINANCING'},
  {name: 'Despesas administrativas', type: 'EXPENSE', dreGroup: 'ADMINISTRATIVE'},
  {name: 'Folha e encargos', type: 'EXPENSE', dreGroup: 'PAYROLL'},
  {name: 'Tributos', type: 'EXPENSE', dreGroup: 'TAXES'},
  {name: 'Outras despesas', type: 'EXPENSE', dreGroup: 'OTHER_COSTS'},
  {name: 'Caução', type: 'BOTH', dreGroup: 'SECURITY_DEPOSIT'},
];
