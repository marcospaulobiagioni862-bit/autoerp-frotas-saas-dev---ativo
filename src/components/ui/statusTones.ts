/**
 * Fonte única de tom por estado (AUTOERP-91, fase 6).
 *
 * Antes deste arquivo, cada tela escolhia a cor do seu selo na mão — eram 363
 * pinturas diretas espalhadas, e por isso "disponível" era verde numa tela e
 * azul em outra. Aqui o estado define o tom uma vez só.
 *
 * A lógica, que vale mais que a tabela: **matiz é a família, intensidade é a
 * gravidade dentro da família.** Quem opera aprende quatro famílias, não
 * dezenove cores:
 *
 *   petrol   → carro em operação, gerando receita
 *   plum     → carro parado (quanto mais sólido, mais grave)
 *   graphite → encerrado, não pede ação
 *   navy     → cobrança em aberto (cor da casa, não é alerta)
 *   crimson  → vencido: é perigo, e é o único matiz repetido entre famílias
 *
 * Verde fica reservado à mensagem de sucesso, por isso "em operação" é petrol
 * e não verde. Dourado não aparece aqui — é ornamento, nunca informação.
 */

export type BadgeTone =
  | 'badge-petrol-t1' | 'badge-petrol-t2' | 'badge-petrol-s1'
  | 'badge-plum-ol' | 'badge-plum-t1' | 'badge-plum-t2' | 'badge-plum-t3'
  | 'badge-plum-s1' | 'badge-plum-s2'
  | 'badge-graphite-ol' | 'badge-graphite-t1' | 'badge-graphite-t2'
  | 'badge-navy-ol' | 'badge-navy-t1' | 'badge-navy-t2'
  | 'badge-crimson-s2';

/**
 * Classes por tom, ESCRITAS POR EXTENSO de proposito. O Tailwind v4 gera as
 * classes varrendo o codigo-fonte: uma classe montada em tempo de execucao
 * (`bg-${tom}-bg`) nao e encontrada pela varredura e o selo sairia sem estilo
 * nenhum. Por isso o mapa literal, e nao interpolacao.
 */
const TONE_CLASSES: Record<BadgeTone, string> = {
  'badge-petrol-t1': 'bg-badge-petrol-t1-bg text-badge-petrol-t1-text border border-badge-petrol-t1-border',
  'badge-petrol-t2': 'bg-badge-petrol-t2-bg text-badge-petrol-t2-text border border-badge-petrol-t2-border',
  'badge-petrol-s1': 'bg-badge-petrol-s1-bg text-badge-petrol-s1-text border border-badge-petrol-s1-border',
  'badge-plum-ol': 'bg-badge-plum-ol-bg text-badge-plum-ol-text border border-badge-plum-ol-border',
  'badge-plum-t1': 'bg-badge-plum-t1-bg text-badge-plum-t1-text border border-badge-plum-t1-border',
  'badge-plum-t2': 'bg-badge-plum-t2-bg text-badge-plum-t2-text border border-badge-plum-t2-border',
  'badge-plum-t3': 'bg-badge-plum-t3-bg text-badge-plum-t3-text border border-badge-plum-t3-border',
  'badge-plum-s1': 'bg-badge-plum-s1-bg text-badge-plum-s1-text border border-badge-plum-s1-border',
  'badge-plum-s2': 'bg-badge-plum-s2-bg text-badge-plum-s2-text border border-badge-plum-s2-border',
  'badge-graphite-ol': 'bg-badge-graphite-ol-bg text-badge-graphite-ol-text border border-badge-graphite-ol-border',
  'badge-graphite-t1': 'bg-badge-graphite-t1-bg text-badge-graphite-t1-text border border-badge-graphite-t1-border',
  'badge-graphite-t2': 'bg-badge-graphite-t2-bg text-badge-graphite-t2-text border border-badge-graphite-t2-border',
  'badge-navy-ol': 'bg-badge-navy-ol-bg text-badge-navy-ol-text border border-badge-navy-ol-border',
  'badge-navy-t1': 'bg-badge-navy-t1-bg text-badge-navy-t1-text border border-badge-navy-t1-border',
  'badge-navy-t2': 'bg-badge-navy-t2-bg text-badge-navy-t2-text border border-badge-navy-t2-border',
  'badge-crimson-s2': 'bg-badge-crimson-s2-bg text-badge-crimson-s2-text border border-badge-crimson-s2-border',
};

export function toneClasses(tone: BadgeTone): string {
  return TONE_CLASSES[tone] ?? TONE_CLASSES['badge-graphite-t1'];
}

/** Situação do veículo (12 estados). */
export const VEHICLE_TONES: Record<string, BadgeTone> = {
  AVAILABLE: 'badge-petrol-t1',
  RESERVED: 'badge-petrol-t2',
  RENTED: 'badge-petrol-s1',
  INSPECTION: 'badge-plum-ol',
  DOCUMENTATION_PENDING: 'badge-plum-t1',
  WAITING_MAINTENANCE: 'badge-plum-t2',
  MAINTENANCE: 'badge-plum-t3',
  DAMAGED: 'badge-plum-s1',
  BLOCKED: 'badge-plum-s2',
  INACTIVE: 'badge-graphite-t2',
  SOLD: 'badge-graphite-t1',
  ARCHIVED: 'badge-graphite-ol',
};

/** Situação de cobrança (7 estados). */
export const OBLIGATION_TONES: Record<string, BadgeTone> = {
  PENDING: 'badge-navy-t1',
  PARTIALLY_PAID: 'badge-navy-t2',
  RENEGOTIATED: 'badge-navy-ol',
  OVERDUE: 'badge-crimson-s2',
  PAID: 'badge-petrol-t1',
  CANCELLED: 'badge-graphite-t1',
  WRITTEN_OFF: 'badge-graphite-t2',
};

/**
 * Escala de vencimento (8 níveis). Não são oito cores soltas: é uma progressão
 * em três faixas — cinza (nada a fazer), laranja (programar ação), vermelho
 * (prazo final). A luminância cai a cada passo no modo claro e sobe no escuro,
 * então a urgência se lê antes do rótulo.
 */
export type DueLevel = 'd90' | 'd60' | 'd30' | 'd15' | 'd7' | 'd1' | 'today' | 'overdue';

const DUE_CLASSES: Record<DueLevel, string> = {
  d90: 'bg-due-d90-bg text-due-d90-text border border-due-d90-border',
  d60: 'bg-due-d60-bg text-due-d60-text border border-due-d60-border',
  d30: 'bg-due-d30-bg text-due-d30-text border border-due-d30-border',
  d15: 'bg-due-d15-bg text-due-d15-text border border-due-d15-border',
  d7: 'bg-due-d7-bg text-due-d7-text border border-due-d7-border',
  d1: 'bg-due-d1-bg text-due-d1-text border border-due-d1-border',
  today: 'bg-due-today-bg text-due-today-text border border-due-today-border',
  overdue: 'bg-due-overdue-bg text-due-overdue-text border border-due-overdue-border',
};

export function dueClasses(level: DueLevel): string {
  return DUE_CLASSES[level] ?? DUE_CLASSES.d90;
}

/** Ícone lucide fixo por nível — o sinal para quem não distingue cor. */
export const DUE_ICONS: Record<DueLevel, string> = {
  d90: 'CalendarClock',
  d60: 'CalendarClock',
  d30: 'CalendarClock',
  d15: 'Clock',
  d7: 'Clock',
  d1: 'AlarmClock',
  today: 'TriangleAlert',
  overdue: 'OctagonAlert',
};

/** Converte o estágio que o backend já calcula (D90…POST_DUE) no nível visual. */
export function dueLevelFromStage(stage: string): DueLevel | undefined {
  const mapa: Record<string, DueLevel> = {
    D90: 'd90', D60: 'd60', D30: 'd30', D15: 'd15',
    D7: 'd7', D1: 'd1', DUE_TODAY: 'today', POST_DUE: 'overdue',
  };
  return mapa[stage];
}

/** Mensagem de resultado: 4 tipos, cada um com ícone próprio e fixo. */
export type ResultKind = 'success' | 'error' | 'warning' | 'info';

export const RESULT_ICONS: Record<ResultKind, string> = {
  success: 'CircleCheck',
  error: 'CircleX',
  warning: 'TriangleAlert',
  info: 'Info',
};

const RESULT_CLASSES: Record<ResultKind, string> = {
  success: 'bg-success-bg text-success-text border border-success-border',
  error: 'bg-error-bg text-error-text border border-error-border',
  warning: 'bg-warning-bg text-warning-text border border-warning-border',
  info: 'bg-info-bg text-info-text border border-info-border',
};

export function resultClasses(kind: ResultKind): string {
  return RESULT_CLASSES[kind] ?? RESULT_CLASSES.info;
}
