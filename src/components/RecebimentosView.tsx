import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  DollarSign,
  Search,
  Plus,
  Trash2,
  Pencil,
  X,
  CheckCircle,
  Calendar,
  AlertTriangle,
  User,
  CheckCircle2,
  RefreshCw,
  Percent,
  MessageSquare,
  Mail,
  AlertCircle,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Pagamento, Motorista, Veiculo, Contrato } from '../types';

interface RecebimentosViewProps {
  pagamentos: Pagamento[];
  motoristas: Motorista[];
  veiculos: Veiculo[];
  contratos: Contrato[];
  onAddRecebimento: (p: Pagamento) => void;
  onEditRecebimento: (p: Pagamento) => void;
  onDeleteRecebimento: (id: string, motivo: string) => void;
  onTriggerToast: (msg: string, type: 'success' | 'warning' | 'error') => void;
}

export default function RecebimentosView({
  pagamentos,
  motoristas,
  veiculos,
  contratos,
  onAddRecebimento,
  onEditRecebimento,
  onDeleteRecebimento,
  onTriggerToast
}: RecebimentosViewProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Todos' | 'Pago' | 'Pendente' | 'Atrasado' | 'Parcial'>('Todos');
  const [timeFilter, setTimeFilter] = useState<'Todos' | 'Diário' | 'Semanal' | 'Mensal' | 'Anual'>('Todos');
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  });
  const [categoriaFilter, setCategoriaFilter] = useState('Todos');
  const [formaFilter, setFormaFilter] = useState('Todos');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPagamento, setEditingPagamento] = useState<Pagamento | null>(null);

  // Global Default Overdue Rules
  const [globalMultaMora, setGlobalMultaMora] = useState(() => {
    return localStorage.getItem('auto_erp_global_multa_mora') || '2.0';
  });
  const [globalJurosDiario, setGlobalJurosDiario] = useState(() => {
    return localStorage.getItem('auto_erp_global_juros_diario') || '0.033';
  });
  const [isSettingsExpanded, setIsSettingsExpanded] = useState(false);

  // Interactive Payment (Quitação) Modal State
  const [quitarTarget, setQuitarTarget] = useState<Pagamento | null>(null);
  const [quitarIncludeInterest, setQuitarIncludeInterest] = useState(true);
  const [quitarForma, setQuitarForma] = useState('PIX');
  const [quitarValorFinal, setQuitarValorFinal] = useState<string>('');
  const [quitarObs, setQuitarObs] = useState('');

  // Archiving confirmation modal state
  const [archiveTargetId, setArchiveTargetId] = useState<string | null>(null);
  const [archiveMotivo, setArchiveMotivo] = useState('');

  // Form states
  const [motoristaCpf, setMotoristaCpf] = useState('');
  const [veiculoPlaca, setVeiculoPlaca] = useState('');
  const [periodo, setPeriodo] = useState('');
  const [valorOriginal, setValorOriginal] = useState('');
  const [vencimento, setVencimento] = useState('');
  const [status, setStatus] = useState<'Pago' | 'Pendente' | 'Atrasado'>('Pendente');
  
  // Custom Overdue rule form states for this specific payment
  const [multaMoraForm, setMultaMoraForm] = useState('2.0');
  const [jurosDiarioForm, setJurosDiarioForm] = useState('0.033');
  
  // Partial states
  const [paymentType, setPaymentType] = useState<'total' | 'parcial'>('total');
  const [valorPago, setValorPago] = useState('');
  const [taxaJuros, setTaxaJuros] = useState('0');
  
  // Installment states
  const [isParcelado, setIsParcelado] = useState(false);
  const [qtdParcelas, setQtdParcelas] = useState(1);
  const [valorTotal, setValorTotal] = useState('');
  const [valorParcela, setValorParcela] = useState('');
  const [installmentDates, setInstallmentDates] = useState<string[]>([]);

  // Recurring states
  const [isRecorrente, setIsRecorrente] = useState(false);
  const [frequenciaRecorrente, setFrequenciaRecorrente] = useState<'Diário' | 'Semanal' | 'Mensal' | 'Anual'>('Mensal');
  const [recorrenteQtd, setRecorrenteQtd] = useState<number>(12);

  const [forma, setForma] = useState('PIX');
  const [dataPagamento, setDataPagamento] = useState('');
  const [obs, setObs] = useState('');

  const [originalFormStateJson, setOriginalFormStateJson] = useState('');
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);
  const [showFutureReceivables, setShowFutureReceivables] = useState(false);

  const getSerializedFormState = () => {
    return JSON.stringify({
      motoristaCpf,
      periodo,
      valorOriginal: valorOriginal.trim(),
      vencimento,
      status,
      multaMoraForm,
      jurosDiarioForm,
      paymentType,
      valorPago: valorPago.trim(),
      taxaJuros,
      isParcelado,
      qtdParcelas,
      valorTotal: valorTotal.trim(),
      valorParcela: valorParcela.trim(),
      installmentDates,
      isRecorrente,
      frequenciaRecorrente,
      recorrenteQtd,
      forma,
      dataPagamento,
      obs: obs.trim()
    });
  };

  const getSerializedStateFromPagamento = (p: Pagamento | null, defaultDriverCpf = '') => {
    if (p) {
      return JSON.stringify({
        motoristaCpf: p.motoristaCpf,
        periodo: p.periodo,
        valorOriginal: (p.valorOriginal || p.valor).toString().trim(),
        vencimento: p.vencimento,
        status: p.status,
        multaMoraForm: p.multaMoraRate !== undefined ? p.multaMoraRate.toString() : globalMultaMora,
        jurosDiarioForm: p.jurosDiarioRate !== undefined ? p.jurosDiarioRate.toString() : globalJurosDiario,
        paymentType: p.saldoDevedor && p.saldoDevedor > 0 ? 'parcial' : 'total',
        valorPago: p.valorPago ? p.valorPago.toString().trim() : '',
        taxaJuros: p.taxaJuros ? p.taxaJuros.toString() : '0',
        isParcelado: !!(p.qtdParcelas && p.qtdParcelas > 1),
        qtdParcelas: p.qtdParcelas || 1,
        valorTotal: (p.valorTotal ? p.valorTotal.toString() : p.valor.toString()).trim(),
        valorParcela: (p.valorParcela ? p.valorParcela.toString() : p.valor.toString()).trim(),
        installmentDates: [p.vencimento],
        isRecorrente: p.isRecorrente || false,
        frequenciaRecorrente: p.frequenciaRecorrente || 'Mensal',
        recorrenteQtd: 12,
        forma: p.forma || 'PIX',
        dataPagamento: p.dataPagamento || '',
        obs: (p.obs || '').trim()
      });
    } else {
      return JSON.stringify({
        motoristaCpf: defaultDriverCpf,
        periodo: '',
        valorOriginal: '',
        vencimento: '',
        status: 'Pendente',
        multaMoraForm: globalMultaMora,
        jurosDiarioForm: globalJurosDiario,
        paymentType: 'total',
        valorPago: '',
        taxaJuros: '0',
        isParcelado: false,
        qtdParcelas: 1,
        valorTotal: '',
        valorParcela: '',
        installmentDates: [],
        isRecorrente: false,
        frequenciaRecorrente: 'Mensal',
        recorrenteQtd: 12,
        forma: 'PIX',
        dataPagamento: '',
        obs: ''
      });
    }
  };

  const isFormDirty = () => {
    return originalFormStateJson !== getSerializedFormState();
  };

  const handleCloseModalAttempt = () => {
    if (isFormDirty()) {
      setShowUnsavedConfirm(true);
    } else {
      setIsModalOpen(false);
    }
  };

  const handleConfirmDiscard = () => {
    setShowUnsavedConfirm(false);
    setIsModalOpen(false);
    onTriggerToast('As alterações não foram salvas pois você não confirmou as alterações!', 'warning');
  };

  const generateDefaultInstallmentDates = (baseDate: string, qty: number) => {
    if (!baseDate) return [];
    const dates: string[] = [];
    const parts = baseDate.split('-');
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1; // 0-indexed
    const day = parseInt(parts[2]);

    for (let i = 0; i < qty; i++) {
      const d = new Date(year, month + i, day);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      dates.push(`${yyyy}-${mm}-${dd}`);
    }
    return dates;
  };

  const generateRecurringDates = (baseDate: string, qty: number, freq: 'Diário' | 'Semanal' | 'Mensal' | 'Anual') => {
    if (!baseDate) return [];
    const dates: string[] = [];
    const parts = baseDate.split('-');
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1; // 0-indexed
    const day = parseInt(parts[2]);

    for (let i = 0; i < qty; i++) {
      let d: Date;
      if (freq === 'Diário') {
        d = new Date(year, month, day + i);
      } else if (freq === 'Semanal') {
        d = new Date(year, month, day + i * 7);
      } else if (freq === 'Anual') {
        d = new Date(year + i, month, day);
      } else { // Mensal
        d = new Date(year, month + i, day);
      }
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      dates.push(`${yyyy}-${mm}-${dd}`);
    }
    return dates;
  };

  const formatBRL = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const calculateLateInterestAndFine = (p: Pagamento) => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const venc = new Date(p.vencimento + 'T12:00:00');
    
    const timeDiff = today.getTime() - venc.getTime();
    const diasAtraso = Math.max(0, Math.floor(timeDiff / (1000 * 60 * 60 * 24)));

    const multaRate = p.multaMoraRate !== undefined ? p.multaMoraRate : parseFloat(globalMultaMora || '2.0');
    const jurosRate = p.jurosDiarioRate !== undefined ? p.jurosDiarioRate : parseFloat(globalJurosDiario || '0.033');

    const baseCalculo = p.saldoDevedor !== undefined && p.saldoDevedor > 0 ? p.saldoDevedor : (p.valorOriginal || p.valor);
    
    if (diasAtraso <= 0 || p.status === 'Pago') {
      return {
        diasAtraso: 0,
        multaValue: 0,
        jurosValue: 0,
        valorTotalAtualizado: baseCalculo,
        multaRate,
        jurosRate
      };
    }

    const multaValue = baseCalculo * (multaRate / 100);
    const jurosValue = baseCalculo * (jurosRate / 100) * diasAtraso;
    const valorTotalAtualizado = baseCalculo + multaValue + jurosValue;

    return {
      diasAtraso,
      multaValue,
      jurosValue,
      valorTotalAtualizado,
      multaRate,
      jurosRate
    };
  };

  // Only filter incoming payments (recebimentos - i.e. not marked as despesa)
  const recebimentosOnly = pagamentos.filter(p => !p.isDespesa);
  const despesasOnly = pagamentos.filter(p => p.isDespesa);

  // Helper to extract clean category name
  const getBaseCategoria = (periodoVal: string) => {
    return periodoVal
      .replace(/\s*\(\d+\/\d+\)$/, '') // remove parcel like (1/10)
      .replace(/\s*\(Recorrência\s*\d+\/\d+\)$/, '') // remove recurrence like (Recorrência 1/12)
      .trim();
  };

  const categoriasDisponiveis = Array.from(
    new Set(recebimentosOnly.map(p => getBaseCategoria(p.periodo)))
  ).filter(Boolean).sort();

  const formasDisponiveis = Array.from(
    new Set(recebimentosOnly.map(p => p.forma).filter(Boolean))
  ).sort();

  // Distinct available months for month-by-month filtering
  const availableMonthsList = useMemo(() => {
    const monthSet = new Set<string>();
    const now = new Date();
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    monthSet.add(currentMonthStr);

    recebimentosOnly.forEach(p => {
      if (p.vencimento && p.vencimento.length >= 7) {
        monthSet.add(p.vencimento.slice(0, 7));
      }
      if (p.dataPagamento && p.dataPagamento.length >= 7) {
        monthSet.add(p.dataPagamento.slice(0, 7));
      }
    });

    const sorted = Array.from(monthSet).sort().reverse();

    return sorted.map(m => {
      const [y, mNum] = m.split('-');
      const dateObj = new Date(parseInt(y, 10), parseInt(mNum, 10) - 1, 1);
      const monthName = dateObj.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      const formatted = monthName.charAt(0).toUpperCase() + monthName.slice(1);
      return { value: m, label: formatted };
    });
  }, [recebimentosOnly]);

  const handlePrevMonth = () => {
    if (!selectedMonth) return;
    const [y, m] = selectedMonth.split('-').map(Number);
    const prevDate = new Date(y, m - 2, 1);
    const newY = prevDate.getFullYear();
    const newM = String(prevDate.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${newY}-${newM}`);
  };

  const handleNextMonth = () => {
    if (!selectedMonth) return;
    const [y, m] = selectedMonth.split('-').map(Number);
    const nextDate = new Date(y, m, 1);
    const newY = nextDate.getFullYear();
    const newM = String(nextDate.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${newY}-${newM}`);
  };

  const matchesTimeFilter = (p: Pagamento) => {
    if (timeFilter === 'Todos') return true;
    const pDate = new Date(p.vencimento + 'T00:00:00');
    const today = new Date();
    today.setHours(0,0,0,0);

    if (timeFilter === 'Diário') {
      return pDate.getFullYear() === today.getFullYear() &&
             pDate.getMonth() === today.getMonth() &&
             pDate.getDate() === today.getDate();
    } else if (timeFilter === 'Semanal') {
      const diffTime = pDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 7;
    } else if (timeFilter === 'Mensal') {
      if (selectedMonth) {
        return p.vencimento.startsWith(selectedMonth) || (!!p.dataPagamento && p.dataPagamento.startsWith(selectedMonth));
      } else {
        return pDate.getFullYear() === today.getFullYear() &&
               pDate.getMonth() === today.getMonth();
      }
    } else if (timeFilter === 'Anual') {
      return pDate.getFullYear() === today.getFullYear();
    }
    return true;
  };

  // Recebimentos filtered for KPI calculations
  const filteredRecebimentosForKPI = recebimentosOnly.filter(p => {
    const mot = motoristas.find(m => m.cpf === p.motoristaCpf);
    const matchesSearch =
      !search ||
      p.id.toLowerCase().includes(search.toLowerCase()) ||
      p.periodo.toLowerCase().includes(search.toLowerCase()) ||
      p.motoristaCpf.includes(search) ||
      (mot && mot.nome.toLowerCase().includes(search.toLowerCase()));

    const matchesTime = matchesTimeFilter(p);
    const matchesCategoria = categoriaFilter === 'Todos' || getBaseCategoria(p.periodo) === categoriaFilter;
    const matchesForma = formaFilter === 'Todos' || p.forma === formaFilter;

    return matchesSearch && matchesTime && matchesCategoria && matchesForma;
  });

  // Despesas filtered for KPI calculations
  const filteredDespesasForKPI = despesasOnly.filter(p => {
    const mot = motoristas.find(m => m.cpf === p.motoristaCpf);
    const matchesSearch =
      !search ||
      p.id.toLowerCase().includes(search.toLowerCase()) ||
      p.periodo.toLowerCase().includes(search.toLowerCase()) ||
      p.obs?.toLowerCase().includes(search.toLowerCase()) ||
      (p.veiculoPlaca && p.veiculoPlaca.toLowerCase().includes(search.toLowerCase())) ||
      (mot && mot.nome.toLowerCase().includes(search.toLowerCase()));

    const matchesTime = matchesTimeFilter(p);
    return matchesSearch && matchesTime;
  });

  // KPIs de acordo com o filtro selecionado
  const totalRecebido = filteredRecebimentosForKPI.filter(p => p.status === 'Pago').reduce((sum, p) => sum + (p.valorPago !== undefined ? p.valorPago : p.valor), 0);
  const totalAReceber = filteredRecebimentosForKPI.filter(p => p.status === 'Pendente').reduce((sum, p) => sum + (p.saldoDevedor !== undefined ? p.saldoDevedor : p.valor), 0);
  const totalAtrasado = filteredRecebimentosForKPI.filter(p => p.status === 'Atrasado').reduce((sum, p) => sum + (p.saldoDevedor !== undefined ? p.saldoDevedor : p.valor), 0);
  const totalComVencimentoFiltro = filteredRecebimentosForKPI.reduce((sum, p) => sum + p.valor, 0);
  const totalSaldoDevedor = filteredRecebimentosForKPI.reduce((sum, p) => sum + (p.saldoDevedor || 0), 0);
  const totalPago = filteredDespesasForKPI.filter(p => p.status === 'Pago').reduce((sum, p) => sum + (p.valorPago !== undefined ? p.valorPago : p.valor), 0);

  const countRecebido = filteredRecebimentosForKPI.filter(p => p.status === 'Pago').length;
  const countAReceber = filteredRecebimentosForKPI.filter(p => p.status === 'Pendente').length;
  const countAtrasado = filteredRecebimentosForKPI.filter(p => p.status === 'Atrasado').length;

  // Helper to determine frequency of a payment
  const getPaymentFrequency = (p: Pagamento) => {
    if (p.frequenciaRecorrente) return p.frequenciaRecorrente;
    const contract = contratos.find(c => c.motoristaCpf === p.motoristaCpf && c.status === 'Ativo');
    if (contract) {
      if (contract.frequenciaRecorrente) return contract.frequenciaRecorrente;
      if (contract.frequencia) return contract.frequencia;
    }
    return 'Mensal';
  };

  const todayStr = new Date().toISOString().split('T')[0];

  const futureReceivablesList = recebimentosOnly.filter(p => {
    if (p.status === 'Pago') return false;
    if (p.vencimento < todayStr) return false;
    
    // Check if it is installment-based or recurring
    const isInstallment = p.qtdParcelas !== undefined && p.qtdParcelas > 1;
    const isRecurring = p.isRecorrente === true || p.frequenciaRecorrente !== undefined;
    
    return isInstallment || isRecurring;
  });

  const totalContasReceberFuturas = futureReceivablesList.reduce(
    (sum, p) => sum + (p.saldoDevedor !== undefined ? p.saldoDevedor : p.valor),
    0
  );

  const futureDiario = futureReceivablesList
    .filter(p => getPaymentFrequency(p) === 'Diário')
    .reduce((sum, p) => sum + (p.saldoDevedor !== undefined ? p.saldoDevedor : p.valor), 0);

  const futureSemanal = futureReceivablesList
    .filter(p => getPaymentFrequency(p) === 'Semanal')
    .reduce((sum, p) => sum + (p.saldoDevedor !== undefined ? p.saldoDevedor : p.valor), 0);

  const futureMensal = futureReceivablesList
    .filter(p => getPaymentFrequency(p) === 'Mensal')
    .reduce((sum, p) => sum + (p.saldoDevedor !== undefined ? p.saldoDevedor : p.valor), 0);

  const futureAnual = futureReceivablesList
    .filter(p => getPaymentFrequency(p) === 'Anual')
    .reduce((sum, p) => sum + (p.saldoDevedor !== undefined ? p.saldoDevedor : p.valor), 0);

  const getContractRate = (cpf: string) => {
    if (!cpf || !contratos) return '';
    const activeContract = contratos.find(c => c.motoristaCpf === cpf && c.status === 'Ativo');
    return activeContract ? activeContract.valor.toString() : '';
  };

  const handleMotoristaChange = (cpf: string) => {
    setMotoristaCpf(cpf);
    if (cpf) {
      const activeContract = contratos.find(c => c.motoristaCpf === cpf && c.status === 'Ativo');
      if (activeContract) {
        const rate = activeContract.valor.toString();
        const freq = activeContract.frequencia || 'Semanal';
        handleValorChange(rate);
        setPeriodo(`Aluguel ${freq}`);
        setVeiculoPlaca(activeContract.veiculoPlaca || '');
        setObs(`Cobrança de aluguel referente ao contrato ativo ${activeContract.id} (${freq})`);
      } else {
        const driver = motoristas.find(m => m.cpf === cpf);
        if (driver && driver.veiculoPlaca) {
          setVeiculoPlaca(driver.veiculoPlaca);
        } else {
          setVeiculoPlaca('');
        }
        handleValorChange('');
        setObs('');
      }
    } else {
      handleValorChange('');
      setPeriodo('');
      setVeiculoPlaca('');
      setObs('');
    }
  };

  const handleValorChange = (valStr: string) => {
    setValorOriginal(valStr);
    if (!isParcelado) {
      setValorTotal(valStr);
      setValorParcela(valStr);
    } else {
      setValorTotal(valStr);
      if (qtdParcelas > 0) {
        setValorParcela((parseFloat(valStr) / qtdParcelas).toFixed(2));
      }
    }
  };

  const handleQtyChange = (qtyVal: number) => {
    setQtdParcelas(qtyVal);
    const numericTotal = parseFloat(valorTotal) || parseFloat(valorOriginal) || 0;
    if (qtyVal > 0) {
      const perInstallment = (numericTotal / qtyVal).toFixed(2);
      setValorParcela(perInstallment);
    }
    if (vencimento) {
      const generated = generateDefaultInstallmentDates(vencimento, qtyVal);
      setInstallmentDates(generated);
    }
  };

  const handleBaseVencimentoChange = (dateVal: string) => {
    setVencimento(dateVal);
    if (isParcelado && qtdParcelas > 0) {
      const generated = generateDefaultInstallmentDates(dateVal, qtdParcelas);
      setInstallmentDates(generated);
    }
  };

  const handleInstallmentDateChange = (index: number, val: string) => {
    const updated = [...installmentDates];
    updated[index] = val;
    setInstallmentDates(updated);
    if (index === 0) {
      setVencimento(val);
    }
  };

  const openAddModal = () => {
    setEditingPagamento(null);
    setMotoristaCpf('');
    setVeiculoPlaca('');
    setPeriodo('');
    setValorOriginal('');
    setVencimento('');
    setPaymentType('total');
    setValorPago('');
    setTaxaJuros('0');
    setMultaMoraForm(globalMultaMora);
    setJurosDiarioForm(globalJurosDiario);
    setIsRecorrente(false);
    setFrequenciaRecorrente('Mensal');
    setDataPagamento('');
    setForma('PIX');
    setStatus('Pendente');
    setObs('');

    setIsParcelado(false);
    setQtdParcelas(1);
    setValorTotal('');
    setValorParcela('');
    setInstallmentDates([]);
    setRecorrenteQtd(12);
    
    // Iniciar formulário em branco para escolha obrigatória de motorista
    setMotoristaCpf('');
    setValorOriginal('');
    setValorTotal('');
    setValorParcela('');
    setObs('');
    setOriginalFormStateJson(getSerializedStateFromPagamento(null, ''));
    
    setIsModalOpen(true);
  };

  const openEditModal = (p: Pagamento) => {
    setEditingPagamento(p);
    setMotoristaCpf(p.motoristaCpf);
    setVeiculoPlaca(p.veiculoPlaca || '');
    setPeriodo(p.periodo);
    setValorOriginal((p.valorOriginal || p.valor).toString());
    setVencimento(p.vencimento);
    setPaymentType(p.saldoDevedor && p.saldoDevedor > 0 ? 'parcial' : 'total');
    setValorPago(p.valorPago ? p.valorPago.toString() : '');
    setTaxaJuros(p.taxaJuros ? p.taxaJuros.toString() : '0');
    setMultaMoraForm(p.multaMoraRate !== undefined ? p.multaMoraRate.toString() : globalMultaMora);
    setJurosDiarioForm(p.jurosDiarioRate !== undefined ? p.jurosDiarioRate.toString() : globalJurosDiario);
    setIsRecorrente(p.isRecorrente || false);
    setFrequenciaRecorrente(p.frequenciaRecorrente || 'Mensal');
    setDataPagamento(p.dataPagamento || '');
    setForma(p.forma || 'PIX');
    setStatus(p.status);
    setObs(p.obs || '');

    setIsParcelado(!!(p.qtdParcelas && p.qtdParcelas > 1));
    setQtdParcelas(p.qtdParcelas || 1);
    setValorTotal(p.valorTotal ? p.valorTotal.toString() : p.valor.toString());
    setValorParcela(p.valorParcela ? p.valorParcela.toString() : p.valor.toString());
    setInstallmentDates([p.vencimento]);
    setRecorrenteQtd(12);
    setOriginalFormStateJson(getSerializedStateFromPagamento(p));

    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    if (!motoristaCpf || !periodo || !valorOriginal || !vencimento) {
      onTriggerToast('Por favor, preencha todos os campos obrigatórios (*)', 'error');
      return;
    }

    const valOrig = parseFloat(valorOriginal) || 0;
    const valPaid = parseFloat(valorPago) || 0;
    const rateJuros = parseFloat(taxaJuros) || 0;
    const multaMoraRateNum = parseFloat(multaMoraForm) || 0;
    const jurosDiarioRateNum = parseFloat(jurosDiarioForm) || 0;

    let finalStatus = status;
    let finalSaldoDevedor = 0;
    let finalJurosAcumulado = 0;
    let finalValorFinal = valOrig;

    if (paymentType === 'parcial' && valPaid > 0) {
      finalSaldoDevedor = valOrig - valPaid;
      if (finalSaldoDevedor < 0) finalSaldoDevedor = 0;

      if (rateJuros > 0 && finalSaldoDevedor > 0) {
        finalJurosAcumulado = finalSaldoDevedor * (rateJuros / 100);
        finalSaldoDevedor += finalJurosAcumulado;
      }

      if (finalSaldoDevedor === 0) {
        finalStatus = 'Pago';
      } else {
        finalStatus = status === 'Pago' ? 'Pendente' : status;
      }
      finalValorFinal = valPaid;
    } else {
      if (status === 'Pago') {
        finalValorFinal = valOrig;
        finalSaldoDevedor = 0;
      }
    }

    if (editingPagamento) {
      const finalVal = isParcelado ? parseFloat(valorParcela) : valOrig;
      const finalDevedor = isParcelado ? (parseFloat(valorParcela) - valPaid) : finalSaldoDevedor;

      const pagamentoData: Pagamento = {
        ...editingPagamento,
        motoristaCpf,
        veiculoPlaca: veiculoPlaca || editingPagamento.veiculoPlaca,
        periodo: periodo.trim(),
        valor: finalVal,
        vencimento,
        dataPagamento: status === 'Pago' || valPaid > 0 ? (dataPagamento || new Date().toISOString().split('T')[0]) : undefined,
        forma: status === 'Pago' || valPaid > 0 ? forma : undefined,
        status: finalStatus,
        obs: obs.trim(),
        
        valorOriginal: isParcelado ? parseFloat(valorTotal) : valOrig,
        valorPago: valPaid > 0 ? valPaid : (status === 'Pago' ? finalVal : 0),
        saldoDevedor: finalDevedor < 0 ? 0 : finalDevedor,
        taxaJuros: rateJuros,
        valorJurosAcumulado: finalJurosAcumulado,
        multaMoraRate: multaMoraRateNum,
        jurosDiarioRate: jurosDiarioRateNum,

        isRecorrente: isRecorrente,
        frequenciaRecorrente: isRecorrente ? frequenciaRecorrente : undefined,
        qtdParcelas: isParcelado ? qtdParcelas : undefined,
        parcelaNumero: isParcelado ? editingPagamento.parcelaNumero || 1 : undefined,
        valorTotal: isParcelado ? parseFloat(valorTotal) : undefined,
        valorParcela: isParcelado ? parseFloat(valorParcela) : undefined,
        isDespesa: false
      };

      onEditRecebimento(pagamentoData);
      onTriggerToast(`Recebimento ${editingPagamento.id} atualizado!`, 'success');
    } else {
      if (isParcelado && qtdParcelas > 1) {
        const baseId = `#REC${Math.floor(Math.random() * 9000) + 1000}`;
        for (let i = 1; i <= qtdParcelas; i++) {
          const pagId = `${baseId}-${i}`;
          const dueDate = installmentDates[i - 1] || vencimento;
          
          const itemStatus = (status === 'Pago' && i > 1) ? 'Pendente' : status;
          const itemValPaid = itemStatus === 'Pago' ? (parseFloat(valorParcela) || 0) : 0;
          const itemDevedor = itemStatus === 'Pago' ? 0 : (parseFloat(valorParcela) || 0);
          const itemDataPagamento = itemStatus === 'Pago' ? (dataPagamento || new Date().toISOString().split('T')[0]) : undefined;
          const itemForma = forma;

          const pagData: Pagamento = {
            id: pagId,
            motoristaCpf,
            veiculoPlaca: veiculoPlaca || undefined,
            periodo: `${periodo} (${i}/${qtdParcelas})`,
            valor: parseFloat(valorParcela) || 0,
            vencimento: dueDate,
            dataPagamento: itemDataPagamento,
            forma: itemStatus === 'Pago' ? itemForma : undefined,
            status: itemStatus,
            obs: obs.trim(),
            isDespesa: false,
            
            valorOriginal: parseFloat(valorTotal) || 0,
            valorPago: itemValPaid,
            saldoDevedor: itemDevedor,
            taxaJuros: rateJuros,
            valorJurosAcumulado: 0,
            multaMoraRate: multaMoraRateNum,
            jurosDiarioRate: jurosDiarioRateNum,

            qtdParcelas,
            parcelaNumero: i,
            valorTotal: parseFloat(valorTotal) || 0,
            valorParcela: parseFloat(valorParcela) || 0
          };
          onAddRecebimento(pagData);
        }
        onTriggerToast(`Lançadas ${qtdParcelas} parcelas de recebimento com sucesso (ID base ${baseId})!`, 'success');
      } else if (isRecorrente && recorrenteQtd > 1) {
        const baseId = `#REC${Math.floor(Math.random() * 9000) + 1000}`;
        const recurringDates = generateRecurringDates(vencimento, recorrenteQtd, frequenciaRecorrente);
        for (let i = 1; i <= recorrenteQtd; i++) {
          const pagId = `${baseId}-R${i}`;
          const dueDate = recurringDates[i - 1] || vencimento;
          
          const itemStatus = (status === 'Pago' && i > 1) ? 'Pendente' : status;
          const itemValPaid = itemStatus === 'Pago' ? valOrig : 0;
          const itemDevedor = itemStatus === 'Pago' ? 0 : valOrig;
          const itemDataPagamento = itemStatus === 'Pago' ? (dataPagamento || new Date().toISOString().split('T')[0]) : undefined;
          const itemForma = forma;

          const pagData: Pagamento = {
            id: pagId,
            motoristaCpf,
            veiculoPlaca: veiculoPlaca || undefined,
            periodo: `${periodo} (Recorrência ${i}/${recorrenteQtd})`,
            valor: valOrig,
            vencimento: dueDate,
            dataPagamento: itemDataPagamento,
            forma: itemStatus === 'Pago' ? itemForma : undefined,
            status: itemStatus,
            obs: obs.trim(),
            isDespesa: false,
            isRecorrente: true,
            frequenciaRecorrente,
            
            valorOriginal: valOrig,
            valorPago: itemValPaid,
            saldoDevedor: itemDevedor,
            taxaJuros: rateJuros,
            valorJurosAcumulado: 0,
            multaMoraRate: multaMoraRateNum,
            jurosDiarioRate: jurosDiarioRateNum
          };
          onAddRecebimento(pagData);
        }
        onTriggerToast(`Lançados ${recorrenteQtd} recorrências de recebimento com sucesso (ID base ${baseId})!`, 'success');
      } else {
        const pagId = `#REC${Math.floor(Math.random() * 9000) + 1000}`;
        const pagData: Pagamento = {
          id: pagId,
          motoristaCpf,
          veiculoPlaca: veiculoPlaca || undefined,
          periodo: periodo.trim(),
          valor: valOrig,
          vencimento,
          dataPagamento: status === 'Pago' || valPaid > 0 ? (dataPagamento || new Date().toISOString().split('T')[0]) : undefined,
          forma: status === 'Pago' || valPaid > 0 ? forma : undefined,
          status: finalStatus,
          obs: obs.trim(),
          isDespesa: false,
          isRecorrente: isRecorrente,
          frequenciaRecorrente: isRecorrente ? frequenciaRecorrente : undefined,

          valorOriginal: valOrig,
          valorPago: valPaid > 0 ? valPaid : (status === 'Pago' ? valOrig : 0),
          saldoDevedor: finalSaldoDevedor,
          taxaJuros: rateJuros,
          valorJurosAcumulado: finalJurosAcumulado,
          multaMoraRate: multaMoraRateNum,
          jurosDiarioRate: jurosDiarioRateNum
        };
        onAddRecebimento(pagData);
        onTriggerToast(`Lançamento de contas a receber ${pagId} registrado com sucesso!`, 'success');
      }
    }

    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
    setArchiveTargetId(id);
    setArchiveMotivo('');
  };

  const confirmArchive = () => {
    if (!archiveTargetId) return;
    onDeleteRecebimento(archiveTargetId, archiveMotivo.trim() || 'Remoção via contas a receber');
    onTriggerToast(`Recebimento ${archiveTargetId} movido para o Arquivo Morto!`, 'success');
    setArchiveTargetId(null);
  };

  const handleQuickPayTotal = (p: Pagamento) => {
    const lateInfo = calculateLateInterestAndFine(p);
    setQuitarTarget(p);
    setQuitarIncludeInterest(lateInfo.diasAtraso > 0);
    setQuitarForma('PIX');
    
    const initialTotal = lateInfo.diasAtraso > 0 
      ? lateInfo.valorTotalAtualizado 
      : (p.saldoDevedor && p.saldoDevedor > 0 ? p.saldoDevedor : (p.valorOriginal || p.valor));
      
    setQuitarValorFinal(initialTotal.toFixed(2));
    setQuitarObs('');
  };

  const confirmQuickPay = () => {
    if (!quitarTarget) return;
    
    const today = new Date().toISOString().split('T')[0];
    const lateInfo = calculateLateInterestAndFine(quitarTarget);
    const finalValPaid = parseFloat(quitarValorFinal) || 0;
    
    let obsNotes = `Quitação de Recebimento via ${quitarForma}.`;
    if (lateInfo.diasAtraso > 0) {
      if (quitarIncludeInterest) {
        obsNotes += ` Aplicado multa de ${formatBRL(lateInfo.multaValue)} e juros de ${formatBRL(lateInfo.jurosValue)} por ${lateInfo.diasAtraso} dias em atraso.`;
      } else {
        obsNotes += ` Isento de juros/multas pelo operador (${lateInfo.diasAtraso} dias de atraso).`;
      }
    }
    if (quitarObs.trim()) {
      obsNotes += ` Obs: ${quitarObs.trim()}`;
    }

    const pago: Pagamento = {
      ...quitarTarget,
      status: 'Pago',
      dataPagamento: today,
      forma: quitarForma,
      valorPago: finalValPaid,
      saldoDevedor: 0,
      obs: quitarTarget.obs ? `${quitarTarget.obs} | ${obsNotes}` : obsNotes
    };
    
    onEditRecebimento(pago);
    onTriggerToast(`Recebimento ${quitarTarget.id} quitado com sucesso no valor de ${formatBRL(finalValPaid)} via ${quitarForma}!`, 'success');
    setQuitarTarget(null);
  };

  // Filtrar Lançamentos
  const filteredRecebimentos = filteredRecebimentosForKPI.filter(p => {
    let matchesStatus = true;
    if (statusFilter === 'Pago') matchesStatus = p.status === 'Pago';
    else if (statusFilter === 'Pendente') matchesStatus = p.status === 'Pendente' && (!p.saldoDevedor || p.saldoDevedor === 0);
    else if (statusFilter === 'Atrasado') matchesStatus = p.status === 'Atrasado';
    else if (statusFilter === 'Parcial') matchesStatus = (p.saldoDevedor !== undefined && p.saldoDevedor > 0);

    return matchesStatus;
  });

  const sortedRecebimentos = [...filteredRecebimentos].sort((a, b) => {
    const today = new Date().toISOString().split('T')[0];
    const aIsFuture = a.vencimento > today;
    const bIsFuture = b.vencimento > today;
    if (aIsFuture && !bIsFuture) return 1;
    if (!aIsFuture && bIsFuture) return -1;
    if (!aIsFuture && !bIsFuture) {
      return b.vencimento.localeCompare(a.vencimento);
    }
    return a.vencimento.localeCompare(b.vencimento);
  });

  const sendWhatsAppNotification = (p: Pagamento) => {
    const mot = motoristas.find(m => m.cpf === p.motoristaCpf);
    if (!mot) return;

    const baseVal = p.saldoDevedor !== undefined && p.saldoDevedor > 0 ? p.saldoDevedor : (p.valorOriginal || p.valor);
    const { diasAtraso, multaValue, jurosValue, valorTotalAtualizado, multaRate, jurosRate } = calculateLateInterestAndFine(p);

    let text = `Olá *${mot.nome}*,\n\nConsta em nosso sistema uma cobrança em aberto referente ao período *${p.periodo}* (vencimento em *${p.vencimento.split('-').reverse().join('/')}*).\n\n`;

    if (diasAtraso > 0 && p.status !== 'Pago') {
      text += `• Valor original: *${formatBRL(baseVal)}*\n`;
      text += `• Dias em atraso: *${diasAtraso} dia(s)*\n`;
      text += `• Multa por atraso (${multaRate}%): *${formatBRL(multaValue)}*\n`;
      text += `• Juros de mora (${jurosRate}%/dia): *${formatBRL(jurosValue)}*\n`;
      text += `👉 *Valor Total Atualizado com Acréscimos: ${formatBRL(valorTotalAtualizado)}*\n\n`;
    } else {
      text += `• Valor a pagar: *${formatBRL(baseVal)}*\n\n`;
    }

    text += `Por favor, efetue o pagamento via PIX e envie o comprovante para darmos baixa em seu cadastro.\n\nCaso já tenha efetuado, por favor desconsidere esta mensagem.`;

    const encodedText = encodeURIComponent(text);
    const telSanitized = (mot.tel || '').replace(/\D/g, '');
    const url = `https://api.whatsapp.com/send?phone=55${telSanitized}&text=${encodedText}`;
    window.open(url, '_blank');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
    >
      {/* Cards Financeiros de Contas a Receber */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
        <div 
          onClick={() => setStatusFilter(statusFilter === 'Pago' ? 'Todos' : 'Pago')}
          className={`bg-white p-4.5 rounded-xl border shadow-sm flex items-center justify-between gap-3 border-l-4 border-l-emerald-600 cursor-pointer transition-all hover:shadow-md ${
            statusFilter === 'Pago' ? 'ring-2 ring-emerald-500 bg-emerald-50/20' : 'border-slate-200/80'
          }`}
          title="Clique para filtrar apenas lançamentos pagos"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center text-lg font-bold shrink-0">
              💰
            </div>
            <div>
              <span className="text-xl font-extrabold text-slate-800 tracking-tight block leading-none mb-1">
                {formatBRL(totalRecebido)}
              </span>
              <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">
                Recebidos (Pagos)
              </span>
            </div>
          </div>
          <span className="bg-emerald-100 text-emerald-800 text-[11px] font-black px-2 py-0.5 rounded-full shrink-0">
            {countRecebido}
          </span>
        </div>

        <div 
          onClick={() => setStatusFilter(statusFilter === 'Pendente' ? 'Todos' : 'Pendente')}
          className={`bg-white p-4.5 rounded-xl border shadow-sm flex items-center justify-between gap-3 border-l-4 border-l-blue-600 cursor-pointer transition-all hover:shadow-md ${
            statusFilter === 'Pendente' ? 'ring-2 ring-blue-500 bg-blue-50/20' : 'border-slate-200/80'
          }`}
          title="Clique para filtrar apenas contas a receber pendentes"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-lg font-bold shrink-0">
              ⏳
            </div>
            <div>
              <span className="text-xl font-extrabold text-slate-800 tracking-tight block leading-none mb-1">
                {formatBRL(totalAReceber)}
              </span>
              <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">
                A Receber (Pendentes)
              </span>
            </div>
          </div>
          <span className="bg-blue-100 text-blue-800 text-[11px] font-black px-2 py-0.5 rounded-full shrink-0">
            {countAReceber}
          </span>
        </div>

        <div 
          onClick={() => setStatusFilter(statusFilter === 'Atrasado' ? 'Todos' : 'Atrasado')}
          className={`bg-white p-4.5 rounded-xl border shadow-sm flex items-center justify-between gap-3 border-l-4 border-l-rose-500 cursor-pointer transition-all hover:shadow-md ${
            statusFilter === 'Atrasado' ? 'ring-2 ring-rose-500 bg-rose-50/20' : 'border-slate-200/80'
          }`}
          title="Clique para filtrar apenas lançamentos em atraso"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center text-lg font-bold shrink-0">
              🚨
            </div>
            <div>
              <span className="text-xl font-extrabold text-slate-800 tracking-tight block leading-none mb-1">
                {formatBRL(totalAtrasado)}
              </span>
              <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">
                Vencidos (Atrasados)
              </span>
            </div>
          </div>
          <span className="bg-rose-100 text-rose-800 text-[11px] font-black px-2 py-0.5 rounded-full shrink-0">
            {countAtrasado}
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex flex-col justify-between gap-2.5 border-l-4 border-l-amber-500 min-h-[96px]">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center text-base font-bold shrink-0">
                {showFutureReceivables ? '🔮' : '📅'}
              </div>
              <div>
                <span className="text-lg font-extrabold text-slate-800 tracking-tight block leading-none mb-1">
                  {showFutureReceivables ? formatBRL(totalContasReceberFuturas) : formatBRL(totalComVencimentoFiltro)}
                </span>
                <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">
                  {showFutureReceivables ? 'Recebimentos Futuros' : 'Com Vencimento no Filtro'}
                </span>
              </div>
            </div>
            
            <button
              onClick={() => setShowFutureReceivables(!showFutureReceivables)}
              className="p-1 px-1.5 rounded-md bg-amber-50 hover:bg-amber-100 text-[8px] font-extrabold text-amber-700 transition-colors uppercase tracking-wider shrink-0 border border-amber-200/40 select-none cursor-pointer"
              title={showFutureReceivables ? "Mostrar Vencimento no Filtro" : "Mostrar Contas Futuras"}
            >
              {showFutureReceivables ? "Ver Filtro" : "Ver Futuras"}
            </button>
          </div>

          {showFutureReceivables ? (
            <div className="grid grid-cols-4 gap-0.5 pt-1.5 border-t border-slate-100 text-[9px] text-slate-500 font-semibold">
              <div className="text-center border-r border-slate-100">
                <span className="block text-[8px] uppercase tracking-wider text-slate-400 font-bold">Diário</span>
                <span className="font-extrabold text-slate-700">{formatBRL(futureDiario)}</span>
              </div>
              <div className="text-center border-r border-slate-100">
                <span className="block text-[8px] uppercase tracking-wider text-slate-400 font-bold">Semanal</span>
                <span className="font-extrabold text-slate-700">{formatBRL(futureSemanal)}</span>
              </div>
              <div className="text-center border-r border-slate-100">
                <span className="block text-[8px] uppercase tracking-wider text-slate-400 font-bold">Mensal</span>
                <span className="font-extrabold text-slate-700">{formatBRL(futureMensal)}</span>
              </div>
              <div className="text-center">
                <span className="block text-[8px] uppercase tracking-wider text-slate-400 font-bold">Anual</span>
                <span className="font-extrabold text-slate-700">{formatBRL(futureAnual)}</span>
              </div>
            </div>
          ) : (
            <div className="text-[9px] text-slate-400 font-medium italic pt-1.5 border-t border-slate-100 leading-tight">
              Soma das cobranças pendentes em atraso ou parciais.
            </div>
          )}
        </div>
      </div>

      {/* Recurrence Notice / Alerta de Cobrança */}
      <div className="bg-slate-900 text-slate-100 rounded-xl p-4.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-slate-800 shadow-sm">
        <div>
          <span className="bg-blue-600 text-white text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full inline-block mb-1.5">
            Cobrança Recorrente Automática 🔁
          </span>
          <p className="text-xs text-slate-300 font-semibold leading-relaxed">
            As cobranças recorrentes cadastradas geram automaticamente novos lançamentos nas contas a receber mensalmente. Você pode gerenciar os valores e regras diretamente nesta tela.
          </p>
        </div>
        <button
          onClick={openAddModal}
          className="bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs px-4 py-2 rounded-lg transition-all shadow-sm whitespace-nowrap shrink-0"
        >
          ➕ Configurar Recorrência
        </button>
      </div>

      {/* Configuração Geral de Juros e Multas por Atraso */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <button
          onClick={() => setIsSettingsExpanded(!isSettingsExpanded)}
          className="w-full px-5 py-3.5 bg-slate-50 flex items-center justify-between font-bold text-slate-700 text-xs tracking-wider uppercase hover:bg-slate-100/80 transition-colors"
        >
          <span className="flex items-center gap-2">
            ⚙️ Regras Globais de Cobranças em Atraso (Juros & Multa)
          </span>
          <span className="text-slate-400 font-bold text-[10px]">
            {isSettingsExpanded ? '▲ Recolher Configurações' : '▼ Expandir e Customizar'}
          </span>
        </button>
        {isSettingsExpanded && (
          <div className="p-5 border-t border-slate-100 bg-slate-50/20 grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-1">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Multa de Mora Padrão (%)
              </label>
              <div className="flex items-center gap-3">
                <div className="relative rounded-lg shadow-2xs w-36">
                  <input
                    type="number"
                    step="0.01"
                    value={globalMultaMora}
                    onChange={e => {
                      setGlobalMultaMora(e.target.value);
                      localStorage.setItem('auto_erp_global_multa_mora', e.target.value);
                    }}
                    className="w-full bg-white border border-slate-200 focus:border-emerald-500 focus:outline-none rounded-lg px-3 py-1.8 text-xs font-semibold"
                  />
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                    <span className="text-slate-400 text-xs font-bold">%</span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 leading-normal">
                  Multa única aplicada sobre o saldo devedor imediatamente no dia após o vencimento.
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Juros Diários de Mora (% ao dia)
              </label>
              <div className="flex items-center gap-3">
                <div className="relative rounded-lg shadow-2xs w-36">
                  <input
                    type="number"
                    step="0.001"
                    value={globalJurosDiario}
                    onChange={e => {
                      setGlobalJurosDiario(e.target.value);
                      localStorage.setItem('auto_erp_global_juros_diario', e.target.value);
                    }}
                    className="w-full bg-white border border-slate-200 focus:border-emerald-500 focus:outline-none rounded-lg px-3 py-1.8 text-xs font-semibold"
                  />
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                    <span className="text-slate-400 text-xs font-bold">% / dia</span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 leading-normal">
                  Taxa diária acumulada proporcionalmente pelos dias em atraso (por exemplo, 1% ao mês ≈ 0.033% ao dia).
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Barra de Pesquisa e Filtros */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-5 h-5 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Pesquisar recebimentos por motorista, placa, ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 text-sm shadow-2xs"
          />
        </div>

        <button
          onClick={openAddModal}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-4 py-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" /> Registrar Recebimento
        </button>
      </div>

      {/* Tabs de Filtro */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap gap-2">
          {(['Todos', 'Pago', 'Pendente', 'Atrasado', 'Parcial'] as const).map(tab => {
            const count = tab === 'Todos' 
              ? filteredRecebimentosForKPI.length 
              : tab === 'Pago' 
              ? countRecebido 
              : tab === 'Pendente' 
              ? countAReceber 
              : tab === 'Atrasado' 
              ? countAtrasado 
              : filteredRecebimentosForKPI.filter(p => (p.saldoDevedor || 0) > 0).length;

            return (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                  statusFilter === tab
                    ? 'bg-emerald-50 text-emerald-700 font-bold border-b-2 border-emerald-500 shadow-3xs'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                }`}
              >
                <span>
                  {tab === 'Todos' ? 'Todos os Lançamentos' : tab === 'Pago' ? 'Pagos (Recebidos)' : tab === 'Pendente' ? 'Pendentes (A Receber)' : tab === 'Atrasado' ? 'Em Atraso' : 'Com Saldo Devedor'}
                </span>
                <span className={`text-[10px] font-black px-2 py-0.2 rounded-full ${
                  statusFilter === tab 
                    ? 'bg-emerald-200 text-emerald-900' 
                    : 'bg-slate-200/70 text-slate-700'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Filtro por Período de Vencimento com Seletor Mês a Mês */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 w-fit border border-slate-200/60 shadow-3xs">
            <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest pl-2 pr-1 shrink-0">Filtro Período:</span>
            {(['Todos', 'Diário', 'Semanal', 'Mensal', 'Anual'] as const).map(timeTab => (
              <button
                key={timeTab}
                onClick={() => setTimeFilter(timeTab)}
                className={`px-2.5 py-1.2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  timeFilter === timeTab
                    ? 'bg-white text-emerald-700 font-black shadow-3xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {timeTab === 'Todos' ? 'Todos' : timeTab === 'Diário' ? 'Diário' : timeTab === 'Semanal' ? 'Semanal' : timeTab === 'Mensal' ? 'Mês a Mês' : 'Anual'}
              </button>
            ))}
          </div>

          {/* Seletor Mês a Mês quando Mensal/Mês a Mês estiver ativo */}
          {timeFilter === 'Mensal' && (
            <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200/90 p-1 rounded-xl text-xs font-semibold text-emerald-900 shadow-3xs animate-fadeIn">
              <div className="flex items-center gap-1 text-[11px] font-extrabold text-emerald-800 uppercase tracking-wider pl-1.5 pr-1">
                <Calendar className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Mês:</span>
              </div>

              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1 hover:bg-emerald-100/80 text-emerald-800 rounded-lg transition-colors cursor-pointer"
                title="Mês Anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="bg-white border border-emerald-300 rounded-lg px-2 py-1 text-xs font-extrabold text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer shadow-3xs"
              >
                {availableMonthsList.map(m => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>

              <input
                type="month"
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="bg-white border border-emerald-300 rounded-lg px-2 py-1 text-xs font-bold text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer shadow-3xs"
              />

              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1 hover:bg-emerald-100/80 text-emerald-800 rounded-lg transition-colors cursor-pointer"
                title="Próximo Mês"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filtros de Tipo de Pagamento */}
      <div className="bg-slate-50 border border-slate-200/80 p-3.5 rounded-xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1">
            📂 Tipo / Categoria de Recebimento
          </label>
          <select
            value={categoriaFilter}
            onChange={e => setCategoriaFilter(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs font-semibold text-slate-700 focus:outline-none focus:border-emerald-500 transition-all cursor-pointer"
          >
            <option value="Todos">Todos os tipos de recebimento ({categoriasDisponiveis.length})</option>
            {categoriasDisponiveis.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1">
            💳 Forma de Recebimento
          </label>
          <select
            value={formaFilter}
            onChange={e => setFormaFilter(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs font-semibold text-slate-700 focus:outline-none focus:border-emerald-500 transition-all cursor-pointer"
          >
            <option value="Todos">Todas as formas de recebimento ({formasDisponiveis.length})</option>
            {formasDisponiveis.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>

        <div>
          {(categoriaFilter !== 'Todos' || formaFilter !== 'Todos') ? (
            <button
              type="button"
              onClick={() => {
                setCategoriaFilter('Todos');
                setFormaFilter('Todos');
              }}
              className="text-xs font-bold text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50/50 px-3.5 py-2.5 rounded-lg border border-emerald-200 transition-all flex items-center justify-center gap-1 w-full cursor-pointer h-[38px]"
            >
              <X className="w-4 h-4" /> Limpar Filtros do Tipo de Pagamento
            </button>
          ) : (
            <div className="text-[10px] text-slate-400 font-medium italic pb-3 pl-1 text-center sm:text-left">
              Filtre por tipo de recebimento ou forma para refinamento
            </div>
          )}
        </div>
      </div>

      {/* Tabela de Recebimentos */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm tracking-tight uppercase flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-600" /> Contas a Receber (Controle de Aluguéis e Cobranças)
          </h3>
          <span className="bg-emerald-50 text-emerald-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
            {filteredRecebimentos.length} lançamentos
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse columns-divided">
            <thead>
              <tr className="bg-slate-50/50 text-slate-500 text-[10px] uppercase font-bold tracking-wider border-b border-slate-100">
                <th className="px-5 py-3.5">ID / Período</th>
                <th className="px-5 py-3.5">Motorista</th>
                <th className="px-5 py-3.5">Vencimento</th>
                <th className="px-5 py-3.5">Valor Original</th>
                <th className="px-5 py-3.5">Valor Pago / Saldo</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {sortedRecebimentos.length > 0 ? (
                sortedRecebimentos.map(p => {
                  const mot = motoristas.find(m => m.cpf === p.motoristaCpf);
                  const vencFormat = p.vencimento.split('-').reverse().join('/');
                  
                  // Resolve associated contract & vehicle
                  const activeContract = [...contratos]
                    .filter(c => c.motoristaCpf === p.motoristaCpf)
                    .sort((a, b) => b.inicio.localeCompare(a.inicio))[0];
                  const veicPlaca = p.veiculoPlaca || activeContract?.veiculoPlaca;
                  const veic = veiculos.find(v => v.placa === veicPlaca);
                  
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          {p.id}
                          {p.isRecorrente && (
                            <span className="bg-blue-100 text-blue-700 text-[8px] font-black px-1.5 py-0.2 rounded-full uppercase flex items-center gap-0.5" title={`Cobrança Recorrente: ${p.frequenciaRecorrente}`}>
                              <RefreshCw className="w-2 h-2 animate-spin-slow" /> {p.frequenciaRecorrente}
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-medium text-slate-600">{p.periodo}</div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-slate-800">{mot?.nome || 'Desconhecido'}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{p.motoristaCpf}</div>
                        {veicPlaca && (
                          <div className="text-[10px] bg-slate-50 text-slate-600 font-semibold px-1.5 py-0.5 rounded border border-slate-200 mt-1 inline-flex items-center gap-1">
                            <span>🚗</span>
                            <span>{veic ? `${veic.marca} ${veic.modelo} (${veicPlaca})` : veicPlaca}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">
                        <div className="flex items-center gap-1 text-xs font-semibold">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" /> {vencFormat}
                        </div>
                        {calculateLateInterestAndFine(p).diasAtraso > 0 && p.status !== 'Pago' && (
                          <div className="mt-1.5 text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded px-1.5 py-0.5 inline-flex items-center gap-0.5">
                            ⚠️ {calculateLateInterestAndFine(p).diasAtraso} dias atrasado
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 font-bold text-slate-800">
                        {formatBRL(p.valorOriginal || p.valor)}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-emerald-700 text-xs">
                          Pago: {formatBRL(p.valorPago || 0)}
                        </div>
                        {p.saldoDevedor && p.saldoDevedor > 0 ? (
                          <div className="text-[10px] text-rose-600 font-bold mt-0.5 bg-rose-50 border border-rose-100 rounded px-1.5 py-0.2 inline-block">
                            Saldo Devedor: {formatBRL(p.saldoDevedor)}
                            {p.taxaJuros && p.taxaJuros > 0 ? ` (c/ juros de ${p.taxaJuros}%)` : ''}
                          </div>
                        ) : p.status !== 'Pago' ? (
                          <div className="text-[10px] text-amber-600 font-semibold mt-0.5 bg-amber-50 border border-amber-100 rounded px-1.5 py-0.2 inline-block">
                            Aguardando Pagamento
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-400 italic">Sem saldo pendente</div>
                        )}

                        {(() => {
                          const late = calculateLateInterestAndFine(p);
                          if (late.diasAtraso <= 0 || p.status === 'Pago') return null;
                          return (
                            <div className="mt-2 p-2 bg-rose-50/40 border border-rose-200/50 rounded-lg space-y-1 text-xs max-w-[220px] shadow-3xs">
                              <div className="text-[9px] font-black text-rose-700 uppercase tracking-wider flex items-center justify-between">
                                <span>Ajuste por Atraso</span>
                                <span className="bg-rose-100 text-rose-800 text-[8px] font-bold px-1.2 rounded-full">REGRA</span>
                              </div>
                              <div className="text-[10px] text-slate-500 flex justify-between">
                                <span>Multa ({late.multaRate}%):</span>
                                <span className="font-semibold text-slate-600">+{formatBRL(late.multaValue)}</span>
                              </div>
                              <div className="text-[10px] text-slate-500 flex justify-between">
                                <span>Juros Diários ({late.jurosRate}%):</span>
                                <span className="font-semibold text-slate-600">+{formatBRL(late.jurosValue)}</span>
                              </div>
                              <div className="border-t border-rose-200/60 pt-0.5 mt-0.5 text-[10px] font-extrabold text-rose-700 flex justify-between">
                                <span>Total Corrigido:</span>
                                <span>{formatBRL(late.valorTotalAtualizado)}</span>
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-5 py-3.5">
                        {p.status === 'Pago' ? (
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200/60 text-[11px] font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Liquidado
                          </span>
                        ) : p.saldoDevedor && p.saldoDevedor > 0 ? (
                          <span className="bg-amber-50 text-amber-700 border border-amber-200/60 text-[11px] font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                            <Percent className="w-3 h-3 text-amber-500" /> Pago Parcial
                          </span>
                        ) : p.status === 'Atrasado' ? (
                          <span className="bg-rose-50 text-rose-700 border border-rose-200/60 text-[11px] font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-rose-500" /> Atrasado
                          </span>
                        ) : (
                          <span className="bg-amber-50 text-amber-700 border border-amber-200/60 text-[11px] font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-amber-500" /> Pendente
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          {p.status !== 'Pago' && (
                            <button
                              type="button"
                              onClick={() => handleQuickPayTotal(p)}
                              className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-extrabold text-xs px-2.5 py-1.5 rounded-lg transition-all shadow-2xs cursor-pointer"
                              title="Quitar Total"
                              aria-label="Quitar Total"
                            >
                              Quitar Total
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => sendWhatsAppNotification(p)}
                            className="min-w-[36px] min-h-[36px] p-2 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition-colors flex items-center justify-center border border-slate-200 cursor-pointer"
                            title="WhatsApp Cobrança"
                            aria-label="WhatsApp Cobrança"
                          >
                            <MessageSquare className="w-[18px] h-[18px] shrink-0" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(p)}
                            className="min-w-[36px] min-h-[36px] p-2 text-amber-700 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition-colors flex items-center justify-center border border-slate-200 cursor-pointer"
                            title="Editar"
                            aria-label="Editar"
                          >
                            <Pencil className="w-[18px] h-[18px] shrink-0" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(p.id)}
                            className="min-w-[36px] min-h-[36px] p-2 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors flex items-center justify-center border border-slate-200 cursor-pointer"
                            title="Excluir"
                            aria-label="Excluir"
                          >
                            <Trash2 className="w-[18px] h-[18px] shrink-0" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-slate-400 italic">
                    Nenhum recebimento encontrado com os filtros aplicados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL PARA LANÇAR OU EDITAR CONTAS A RECEBER */}
      <AnimatePresence>
        {isModalOpen && (
          <div 
            onClick={handleCloseModalAttempt}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs cursor-pointer"
          >
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[90vh] cursor-default"
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <h3 className="font-extrabold text-slate-900 text-sm tracking-tight uppercase">
                  {editingPagamento ? 'Editar Lançamento' : 'Novo Lançamento de Recebimento'}
                </h3>
                <button
                  onClick={handleCloseModalAttempt}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form Body */}
              <form onSubmit={handleSave} className="p-6 overflow-y-auto space-y-4 flex-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Motorista */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                      Motorista *
                    </label>
                    <select
                      value={motoristaCpf}
                      onChange={e => handleMotoristaChange(e.target.value)}
                      className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                      required
                    >
                      <option value="">Selecione o motorista...</option>
                      {motoristas.map(m => (
                        <option key={m.cpf} value={m.cpf}>
                          {m.nome} ({m.cpf})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Veículo */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                      Veículo (Placa)
                    </label>
                    <select
                      value={veiculoPlaca}
                      onChange={e => setVeiculoPlaca(e.target.value)}
                      className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                    >
                      <option value="">Nenhum / Selecione o veículo...</option>
                      {veiculos.map(v => (
                        <option key={v.placa} value={v.placa}>
                          {v.modelo} - {v.placa}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Periodo / Categoria */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                      Período / Categoria do Contrato *
                    </label>
                    <input
                      type="text"
                      list="periodo-aluguel-options"
                      placeholder="ex: Aluguel Diário, Aluguel Semanal, Aluguel Mensal..."
                      value={periodo}
                      onChange={e => setPeriodo(e.target.value)}
                      className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                      required
                    />
                    <datalist id="periodo-aluguel-options">
                      <option value="Aluguel Diário" />
                      <option value="Aluguel Semanal" />
                      <option value="Aluguel Mensal" />
                      <option value="Caução de Entrada" />
                      <option value="Coparticipação de Sinistro" />
                      <option value="Avaria / Danos ao Veículo" />
                      <option value="Multa de Trânsito (Motorista)" />
                    </datalist>
                  </div>

                  {/* Vencimento */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                      Data de Vencimento *
                    </label>
                    <input
                      type="date"
                      value={vencimento}
                      onChange={e => handleBaseVencimentoChange(e.target.value)}
                      className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                      required
                    />
                  </div>

                  {/* Status Inicial */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                      Status da Cobrança
                    </label>
                    <select
                      value={status}
                      onChange={e => setStatus(e.target.value as any)}
                      className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                    >
                      <option value="Pendente">Pendente</option>
                      <option value="Pago">Pago</option>
                      <option value="Atrasado">Atrasado</option>
                    </select>
                  </div>
                </div>

                {/* Configuração de Tipo de Lançamento (Único, Parcelado ou Recorrente) */}
                {!editingPagamento && (
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-slate-700 block uppercase tracking-wider">Tipo de Repetição / Faturamento</span>
                        <span className="text-[11px] text-slate-400">Selecione se é um recebimento único, parcelado ou recorrente</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsParcelado(false);
                          setIsRecorrente(false);
                          setValorParcela(valorOriginal);
                          setValorTotal(valorOriginal);
                        }}
                        className={`px-3 py-2 rounded-lg text-xs font-bold transition-all border text-center flex flex-col items-center justify-center gap-1 cursor-pointer ${
                          !isParcelado && !isRecorrente
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <span className="text-sm font-bold">📄</span>
                        <span>Único / À Vista</span>
                      </button>
                      
                      <button
                        type="button"
                        onClick={() => {
                          setIsParcelado(true);
                          setIsRecorrente(false);
                          const valNum = parseFloat(valorOriginal) || 0;
                          setValorTotal(valNum.toString());
                          setValorParcela((valNum / 2).toFixed(2));
                          const generated = generateDefaultInstallmentDates(vencimento || new Date().toISOString().split('T')[0], 2);
                          setInstallmentDates(generated);
                          setQtdParcelas(2);
                        }}
                        className={`px-3 py-2 rounded-lg text-xs font-bold transition-all border text-center flex flex-col items-center justify-center gap-1 cursor-pointer ${
                          isParcelado
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <span className="text-sm font-bold">📊</span>
                        <span>Parcelado</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsParcelado(false);
                          setIsRecorrente(true);
                          setRecorrenteQtd(12);
                        }}
                        className={`px-3 py-2 rounded-lg text-xs font-bold transition-all border text-center flex flex-col items-center justify-center gap-1 cursor-pointer ${
                          isRecorrente
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <span className="text-sm font-bold">🔁</span>
                        <span>Recorrente</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Campos de Valores e Datas Dinâmicos baseados no tipo */}
                {isParcelado ? (
                  <div className="border border-slate-200 rounded-xl p-4 space-y-4 bg-slate-50/50">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Valor Total (R$) *
                        </label>
                        <input
                          type="number"
                          placeholder="1000.00"
                          value={valorTotal}
                          onChange={e => handleValorChange(e.target.value)}
                          step="0.01"
                          min="0"
                          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 font-extrabold text-slate-800"
                          required
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Quantidade de Parcelas *
                        </label>
                        <input
                          type="number"
                          placeholder="3"
                          value={qtdParcelas}
                          onChange={e => handleQtyChange(parseInt(e.target.value) || 1)}
                          min="2"
                          max="72"
                          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 font-bold text-slate-800"
                          required
                          disabled={!!editingPagamento}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Valor de cada Parcela (R$) *
                        </label>
                        <input
                          type="number"
                          placeholder="333.33"
                          value={valorParcela}
                          onChange={e => setValorParcela(e.target.value)}
                          step="0.01"
                          min="0"
                          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 font-extrabold text-emerald-600"
                          required
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Vencimento da 1ª Parcela *
                        </label>
                        <input
                          type="date"
                          value={vencimento}
                          onChange={e => handleBaseVencimentoChange(e.target.value)}
                          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 font-semibold text-slate-700"
                          required
                        />
                      </div>
                    </div>

                    {/* Cronograma de Parcelas */}
                    {!editingPagamento && installmentDates.length > 0 && (
                      <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/80 space-y-2.5">
                        <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                          Cronograma de Vencimentos (Clique na data para ajustar)
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[160px] overflow-y-auto pr-1">
                          {installmentDates.map((dateVal, index) => (
                            <div key={index} className="flex items-center gap-2 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200/60 shadow-3xs">
                              <span className="text-[10px] font-bold text-slate-500 font-mono w-10 shrink-0">
                                #{index + 1}/{qtdParcelas}
                              </span>
                              <input
                                type="date"
                                value={dateVal}
                                onChange={e => handleInstallmentDateChange(index, e.target.value)}
                                className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none w-full"
                                required
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : isRecorrente ? (
                  <div className="border border-slate-200 rounded-xl p-4 space-y-4 bg-slate-50/50">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Valor de cada Recorrência (R$) *
                        </label>
                        <input
                          type="number"
                          placeholder="250.00"
                          value={valorOriginal}
                          onChange={e => handleValorChange(e.target.value)}
                          step="0.01"
                          min="0"
                          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 font-extrabold text-emerald-600"
                          required
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Vencimento do 1º Lançamento *
                        </label>
                        <input
                          type="date"
                          value={vencimento}
                          onChange={e => handleBaseVencimentoChange(e.target.value)}
                          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 font-semibold text-slate-700"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Frequência da Recorrência *
                        </label>
                        <select
                          value={frequenciaRecorrente}
                          onChange={e => setFrequenciaRecorrente(e.target.value as any)}
                          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 font-bold text-slate-700"
                        >
                          <option value="Diário">Diário</option>
                          <option value="Semanal">Semanal</option>
                          <option value="Mensal">Mensal</option>
                          <option value="Anual">Anual</option>
                        </select>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Quantidade de Repetições a Gerar *
                        </label>
                        <input
                          type="number"
                          placeholder="12"
                          value={recorrenteQtd}
                          onChange={e => setRecorrenteQtd(parseInt(e.target.value) || 12)}
                          min="1"
                          max="120"
                          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 font-bold text-slate-800"
                          required
                          disabled={!!editingPagamento}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl p-4 space-y-4 bg-slate-50/50">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Valor Cobrado (R$) *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="350.00"
                          value={valorOriginal}
                          onChange={e => handleValorChange(e.target.value)}
                          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 font-extrabold text-slate-800"
                          required
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Data de Vencimento *
                        </label>
                        <input
                          type="date"
                          value={vencimento}
                          onChange={e => handleBaseVencimentoChange(e.target.value)}
                          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 font-semibold text-slate-700"
                          required
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* PAGAMENTO PARCIAL OU TOTAL */}
                <div className="border border-slate-200 rounded-xl p-4 space-y-4 bg-slate-50/50">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                      Tipo de Quitação / Lançamento
                    </label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                        <input
                          type="radio"
                          name="paymentType"
                          checked={paymentType === 'total'}
                          onChange={() => setPaymentType('total')}
                          className="text-emerald-600 focus:ring-emerald-500"
                        />
                        <span>Quitação Total (Valor Integral)</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                        <input
                          type="radio"
                          name="paymentType"
                          checked={paymentType === 'parcial'}
                          onChange={() => setPaymentType('parcial')}
                          className="text-emerald-600 focus:ring-emerald-500"
                        />
                        <span>Quitação Parcial (Fica Saldo Devedor)</span>
                      </label>
                    </div>
                  </div>

                  {paymentType === 'parcial' && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 border-t border-slate-200 pt-3"
                    >
                      <div>
                        <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                          Valor Pago Agora (R$) *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="ex: 150.00"
                          value={valorPago}
                          onChange={e => setValorPago(e.target.value)}
                          className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2 text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          required={paymentType === 'parcial'}
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                          Definir Juros no Saldo Devedor (%)
                        </label>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.1"
                            placeholder="0.0"
                            value={taxaJuros}
                            onChange={e => setTaxaJuros(e.target.value)}
                            className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2 text-slate-800 font-bold text-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                          <span className="text-xs font-bold text-slate-500">%</span>
                        </div>
                      </div>

                      <div className="sm:col-span-2 text-[10px] text-amber-700 bg-amber-50 border border-amber-100 p-2.5 rounded-lg leading-relaxed">
                        <strong>Cálculo do Saldo Pendente:</strong><br />
                        O motorista pagará {formatBRL(parseFloat(valorPago) || 0)}. O saldo devedor restante será de {formatBRL((parseFloat(valorOriginal) || 0) - (parseFloat(valorPago) || 0) > 0 ? (parseFloat(valorOriginal) || 0) - (parseFloat(valorPago) || 0) : 0)} mais juros acumulados de {taxaJuros || 0}% incidentes.
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* Detalhes de pagamento se já quitado/parcial */}
                {(status === 'Pago' || paymentType === 'parcial') && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-100 pt-3">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                        Forma de Recebimento
                      </label>
                      <select
                        value={forma}
                        onChange={e => setForma(e.target.value)}
                        className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-700 focus:outline-none"
                      >
                        <option value="PIX">PIX</option>
                        <option value="Dinheiro">Dinheiro</option>
                        <option value="Transferência">Transferência Bancária</option>
                        <option value="Cartão de Crédito">Cartão de Crédito</option>
                        <option value="Boleto">Boleto Bancário</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                        Data do Pagamento
                      </label>
                      <input
                        type="date"
                        value={dataPagamento}
                        onChange={e => setDataPagamento(e.target.value)}
                        className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 font-semibold focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* REGRAS DE ATRASO INDIVIDUAIS */}
                <div className="border border-slate-200/80 rounded-xl p-4 bg-slate-50/50 space-y-3 shadow-3xs">
                  <div>
                    <span className="text-[11px] font-black text-slate-700 block uppercase tracking-wider">⚖️ Regras de Atraso e Juros de Mora</span>
                    <span className="text-[10px] text-slate-400">Configure as taxas de mora aplicadas caso este pagamento atrase</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 border-t border-slate-200/60 pt-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Multa de Mora (%)
                      </label>
                      <div className="relative rounded-lg shadow-3xs">
                        <input
                          type="number"
                          step="0.01"
                          value={multaMoraForm}
                          onChange={e => setMultaMoraForm(e.target.value)}
                          className="w-full bg-white border border-slate-200 focus:border-emerald-500 focus:outline-none rounded-lg px-3 py-2 text-xs font-semibold text-slate-800"
                          placeholder="2.0"
                        />
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                          <span className="text-slate-400 text-xs font-bold">%</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Juros Diário (% / dia)
                      </label>
                      <div className="relative rounded-lg shadow-3xs">
                        <input
                          type="number"
                          step="0.001"
                          value={jurosDiarioForm}
                          onChange={e => setJurosDiarioForm(e.target.value)}
                          className="w-full bg-white border border-slate-200 focus:border-emerald-500 focus:outline-none rounded-lg px-3 py-2 text-xs font-semibold text-slate-800"
                          placeholder="0.033"
                        />
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                          <span className="text-slate-400 text-[10px] font-bold">%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Observações */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Observações Internas
                  </label>
                  <textarea
                    rows={2}
                    value={obs}
                    onChange={e => setObs(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 font-medium focus:outline-none"
                    placeholder="Informações adicionais da cobrança..."
                  />
                </div>

                {/* Submit button */}
                <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleCloseModalAttempt}
                    className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-all shadow-sm"
                  >
                    Salvar Lançamento
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CONFIRM ARCHIVE MODAL */}
      <AnimatePresence>
        {archiveTargetId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200"
            >
              <div className="p-5">
                <div className="flex items-center gap-3 text-amber-600 font-bold text-base border-b border-slate-100 pb-3 mb-4">
                  <AlertCircle className="w-6 h-6 text-amber-500" />
                  Mover Recebimento para o Arquivo Morto?
                </div>
                <p className="text-slate-600 text-sm leading-relaxed mb-4">
                  Esta ação não exclui permanentemente o lançamento financeiro de receita, mas o move para o Arquivo Morto preservando o histórico de conciliação.
                </p>
                <div className="flex flex-col gap-1.5 mb-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Motivo do arquivamento *
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Contrato rescindido / Acordo extrajudicial"
                    value={archiveMotivo}
                    onChange={e => setArchiveMotivo(e.target.value)}
                    className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-semibold text-slate-800"
                    required
                  />
                </div>
              </div>
              <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setArchiveTargetId(null)}
                  className="border border-slate-200 hover:bg-slate-100 text-slate-500 text-xs font-bold px-4 py-2 rounded-lg transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmArchive}
                  className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all shadow-xs"
                >
                  Confirmar e Arquivar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL DE QUITAÇÃO INTERATIVA */}
      <AnimatePresence>
        {quitarTarget && (() => {
          const late = calculateLateInterestAndFine(quitarTarget);
          const baseVal = quitarTarget.saldoDevedor && quitarTarget.saldoDevedor > 0 
            ? quitarTarget.saldoDevedor 
            : (quitarTarget.valorOriginal || quitarTarget.valor);
          
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100 flex flex-col"
              >
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                  <h3 className="font-extrabold text-slate-900 text-sm tracking-tight uppercase flex items-center gap-1.5">
                    <span>💵</span> Confirmar Recebimento / Quitação
                  </h3>
                  <button
                    onClick={() => setQuitarTarget(null)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
                  {/* Detalhes da Cobrança */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Lançamento</span>
                      <span className="text-xs font-bold text-slate-800">{quitarTarget.id}</span>
                    </div>
                    <div className="flex justify-between items-center border-t border-slate-200/40 pt-1.5">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Período</span>
                      <span className="text-xs font-medium text-slate-600">{quitarTarget.periodo}</span>
                    </div>
                    <div className="flex justify-between items-center border-t border-slate-200/40 pt-1.5">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Valor em Aberto</span>
                      <span className="text-xs font-extrabold text-slate-800">{formatBRL(baseVal)}</span>
                    </div>
                  </div>

                  {/* Alerta de Atraso e Juros */}
                  {late.diasAtraso > 0 && (
                    <div className="border border-rose-200 bg-rose-50/50 p-4 rounded-xl space-y-3">
                      <div className="flex items-center gap-2 text-rose-800 font-extrabold text-xs uppercase tracking-wider">
                        <span>⚠️ Cobrança em Atraso por {late.diasAtraso} dias</span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Esta cobrança venceu em <strong>{quitarTarget.vencimento.split('-').reverse().join('/')}</strong>. Pela regra de juros e multa configurada, incidem os seguintes acréscimos:
                      </p>
                      <div className="grid grid-cols-2 gap-3 text-xs border-t border-rose-200/60 pt-2.5">
                        <div>
                          <span className="text-[10px] text-slate-500 font-bold block uppercase tracking-wider">Multa ({late.multaRate}%)</span>
                          <span className="font-extrabold text-rose-700">{formatBRL(late.multaValue)}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 font-bold block uppercase tracking-wider">Juros Diários ({late.jurosRate}% / dia)</span>
                          <span className="font-extrabold text-rose-700">{formatBRL(late.jurosValue)}</span>
                        </div>
                      </div>

                      {/* Escolher se quer cobrar com juros e multa */}
                      <div className="border-t border-rose-200/60 pt-3 flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="includeInterestCheckbox"
                          checked={quitarIncludeInterest}
                          onChange={e => {
                            const checked = e.target.checked;
                            setQuitarIncludeInterest(checked);
                            setQuitarValorFinal((checked ? late.valorTotalAtualizado : baseVal).toFixed(2));
                          }}
                          className="text-emerald-600 focus:ring-emerald-500 rounded cursor-pointer"
                        />
                        <label htmlFor="includeInterestCheckbox" className="text-xs font-extrabold text-slate-700 cursor-pointer select-none">
                          Cobrar Multa e Juros no valor total (Total: {formatBRL(late.valorTotalAtualizado)})
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Inputs de Quitação */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                        Valor Recebido (R$) *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={quitarValorFinal}
                        onChange={e => setQuitarValorFinal(e.target.value)}
                        className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 font-extrabold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                        Forma de Recebimento *
                      </label>
                      <select
                        value={quitarForma}
                        onChange={e => setQuitarForma(e.target.value)}
                        className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="PIX">PIX</option>
                        <option value="Dinheiro">Dinheiro</option>
                        <option value="Transferência">Transferência Bancária</option>
                        <option value="Cartão de Crédito">Cartão de Crédito</option>
                        <option value="Boleto">Boleto Bancário</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                      Observações da Quitação
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Recebido integralmente, sem pendências"
                      value={quitarObs}
                      onChange={e => setQuitarObs(e.target.value)}
                      className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 font-medium focus:outline-none"
                    />
                  </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setQuitarTarget(null)}
                    className="border border-slate-200 hover:bg-slate-100 text-slate-500 text-xs font-bold px-4 py-2 rounded-lg transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={confirmQuickPay}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all shadow-xs flex items-center gap-1.5"
                  >
                    <span>✓</span> Confirmar e Liquidar
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* CONFIRMAÇÃO DE ALTERAÇÕES NÃO SALVAS */}
      <AnimatePresence>
        {showUnsavedConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200"
            >
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-amber-50">
                <h3 className="font-extrabold text-amber-800 text-sm tracking-tight flex items-center gap-2 uppercase">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                  Alterações Não Salvas
                </h3>
              </div>

              <div className="p-5 space-y-3">
                <p className="text-xs text-slate-600 font-bold leading-relaxed">
                  Você realizou alterações no formulário de recebimentos. Se você sair agora, as novas informações <strong>não serão salvas</strong> e as alterações serão perdidas.
                </p>
                <p className="text-[11px] text-slate-400">
                  Tem certeza que deseja fechar a tela sem salvar os dados?
                </p>
              </div>

              <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowUnsavedConfirm(false)}
                  className="w-full sm:w-auto bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs px-4 py-2 rounded-lg transition-all"
                >
                  Continuar Editando
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDiscard}
                  className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-4 py-2 rounded-lg transition-all shadow-sm"
                >
                  Sair sem Salvar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
