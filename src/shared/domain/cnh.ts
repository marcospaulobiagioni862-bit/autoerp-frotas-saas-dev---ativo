export interface ColorRulesConfig {
  redDays: number;
  yellowDays: number;
  blueDays: number;
  greenDays: number;
}

export const defaultColorRules: ColorRulesConfig = {
  redDays: 5,
  yellowDays: 15,
  blueDays: 29,
  greenDays: 30
};

export interface CnhAlertInfo {
  diffDays: number;
  alertColor: 'red' | 'yellow' | 'blue' | 'green' | 'none';
  badgeClass: string;
  textClass: string;
  bgClass: string;
  label: string;
  isExpiring: boolean;
  isExpired: boolean;
}

export function getCnhAlert(cnhVenc: string, rules?: ColorRulesConfig): CnhAlertInfo {
  const activeRules = rules || defaultColorRules;

  if (!cnhVenc) {
    return {
      diffDays: 999,
      alertColor: 'none',
      badgeClass: 'px-2 py-0.5 rounded text-[10px] border bg-slate-100 text-slate-700 border-slate-200',
      textClass: 'text-slate-700',
      bgClass: 'bg-slate-50',
      label: 'Não informada',
      isExpiring: false,
      isExpired: false
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const venc = new Date(cnhVenc + 'T00:00:00');
  const diffTime = venc.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const isExpired = diffDays < 0;
  const isExpiring = diffDays >= 0 && diffDays <= activeRules.greenDays; // Expiring if less than green threshold

  let alertColor: 'red' | 'yellow' | 'blue' | 'green' | 'none' = 'none';
  let badgeClass = 'bg-slate-100 text-slate-700 border-slate-200';
  let textClass = 'text-slate-700';
  let bgClass = 'bg-slate-50';
  let label = '';

  if (isExpired) {
    alertColor = 'red';
    badgeClass = 'bg-rose-50 text-rose-700 border-rose-200 font-extrabold animate-pulse';
    textClass = 'text-rose-700 font-extrabold';
    bgClass = 'bg-rose-50/50';
    const absDays = Math.abs(diffDays);
    label = `Vencida há ${absDays} ${absDays === 1 ? 'dia' : 'dias'}`;
  } else if (diffDays <= activeRules.redDays) {
    alertColor = 'red';
    badgeClass = 'bg-rose-100 text-rose-800 border-rose-300 font-bold';
    textClass = 'text-rose-800 font-bold';
    bgClass = 'bg-rose-50/40';
    label = `Vence em ${diffDays} ${diffDays === 1 ? 'dia' : 'dias'} (Crítico)`;
  } else if (diffDays <= activeRules.yellowDays) {
    alertColor = 'yellow';
    badgeClass = 'bg-amber-100 text-amber-800 border-amber-300 font-bold';
    textClass = 'text-amber-800 font-bold';
    bgClass = 'bg-amber-50/40';
    label = `Vence em ${diffDays} dias`;
  } else if (diffDays <= activeRules.blueDays) {
    alertColor = 'blue';
    badgeClass = 'bg-blue-100 text-blue-800 border-blue-300 font-bold';
    textClass = 'text-blue-800 font-bold';
    bgClass = 'bg-blue-50/40';
    label = `Vence em ${diffDays} dias`;
  } else if (diffDays >= activeRules.greenDays) {
    alertColor = 'green';
    badgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold';
    textClass = 'text-emerald-800 font-bold';
    bgClass = 'bg-emerald-50/40';
    label = `Vence em ${diffDays} dias`;
  } else {
    alertColor = 'none';
    badgeClass = 'bg-slate-100 text-slate-600 border-slate-200';
    textClass = 'text-slate-600';
    bgClass = 'bg-transparent';
    label = `Vence em ${diffDays} dias`;
  }

  return {
    diffDays,
    alertColor,
    badgeClass: `px-2 py-0.5 rounded text-[10px] border ${badgeClass}`,
    textClass,
    bgClass,
    label,
    isExpiring,
    isExpired
  };
}
