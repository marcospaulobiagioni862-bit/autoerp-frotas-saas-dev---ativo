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
  FileText,
  Sliders,
  Car,
  AlertCircle,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Pagamento, Motorista, Veiculo, Contrato } from '../types';
import { CarBrandLogo } from '../shared/components/CarBrandLogo';
import { PlacaMercosul } from './PlacaMercosul';

interface PagamentosViewProps {
  pagamentos: Pagamento[];
  motoristas: Motorista[];
  veiculos: Veiculo[];
  contratos: Contrato[];
  onAddPagamento: (p: Pagamento) => void;
  onEditPagamento: (p: Pagamento) => void;
  onDeletePagamento: (id: string, motivo: string) => void;
  onTriggerToast: (msg: string, type: 'success' | 'warning' | 'error') => void;
}

export default function PagamentosView({
  pagamentos,
  motoristas,
  veiculos,
  contratos,
  onAddPagamento,
  onEditPagamento,
  onDeletePagamento,
  onTriggerToast
}: PagamentosViewProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Todos' | 'Pago' | 'Pendente' | 'Atrasado'>('Todos');
  const [timeFilter, setTimeFilter] = useState<'Todos' | 'Diário' | 'Semanal' | 'Mensal' | 'Anual'>('Todos');
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  });
  const [categoriaFilter, setCategoriaFilter] = useState('Todos');
  const [formaFilter, setFormaFilter] = useState('Todos');
  const [motoristaFilter, setMotoristaFilter] = useState('Todos');
  const [veiculoFilter, setVeiculoFilter] = useState('Todos');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPagamento, setEditingPagamento] = useState<Pagamento | null>(null);
  const [activePayDropdownId, setActivePayDropdownId] = useState<string | null>(null);

  // Archiving confirmation modal state
  const [archiveTargetId, setArchiveTargetId] = useState<string | null>(null);
  const [archiveMotivo, setArchiveMotivo] = useState('');

  // Form states
  const [motoristaCpf, setMotoristaCpf] = useState('');
  const [veiculoPlaca, setVeiculoPlaca] = useState('');
  const [periodo, setPeriodo] = useState('Mensal');
  const [valor, setValor] = useState('');
  const [valorPago, setValorPago] = useState('');
  const [vencimento, setVencimento] = useState('');
  const [dataPagamento, setDataPagamento] = useState('');
  const [forma, setForma] = useState('Pix');
  const [status, setStatus] = useState<'Pago' | 'Pendente' | 'Atrasado'>('Pendente');
  const [obs, setObs] = useState('');

  // Installment States
  const [isParcelado, setIsParcelado] = useState(false);
  const [qtdParcelas, setQtdParcelas] = useState(1);
  const [valorTotal, setValorTotal] = useState('');
  const [valorParcela, setValorParcela] = useState('');
  const [installmentDates, setInstallmentDates] = useState<string[]>([]);

  // Recurrence States
  const [isRecorrente, setIsRecorrente] = useState(false);
  const [frequenciaRecorrente, setFrequenciaRecorrente] = useState<'Diário' | 'Semanal' | 'Mensal'>('Mensal');
  const [recorrenteQtd, setRecorrenteQtd] = useState<number>(12);

  // Categorias que DEVEM ser vinculadas ao Motorista
  const isDriverCategory = (cat: string) => {
    const norm = cat.toLowerCase().trim();
    return (
      norm.includes('diária') ||
      norm.includes('diaria') ||
      norm.includes('semanal') ||
      norm.includes('mensal') ||
      norm.includes('adiantamento') ||
      norm.includes('vale') ||
      norm.includes('repasse') ||
      norm.includes('comissão') ||
      norm.includes('comissao') ||
      norm.includes('motorista')
    );
  };

  // Categorias que DEVEM ser vinculadas ao Veículo
  const isVehicleCategory = (cat: string) => {
    const norm = cat.toLowerCase().trim();
    return (
      norm.includes('documento') ||
      norm.includes('licenciamento') ||
      norm.includes('ipva') ||
      norm.includes('dpvat') ||
      norm.includes('multa') ||
      norm.includes('seguro') ||
      norm.includes('rastreador') ||
      norm.includes('chip') ||
      norm.includes('manutenção') ||
      norm.includes('manutencao') ||
      norm.includes('oficina') ||
      norm.includes('peça') ||
      norm.includes('peca') ||
      norm.includes('acessório') ||
      norm.includes('acessorio') ||
      norm.includes('pneu') ||
      norm.includes('lavagem') ||
      norm.includes('combustível') ||
      norm.includes('combustivel') ||
      norm.includes('veículo') ||
      norm.includes('veiculo') ||
      norm.includes('financiamento') ||
      norm.includes('alienação') ||
      norm.includes('alienacao')
    );
  };

  const handleMotoristaSelect = (cpf: string) => {
    setMotoristaCpf(cpf);
    if (cpf && !veiculoPlaca) {
      const driver = motoristas.find(m => m.cpf === cpf);
      if (driver && driver.veiculoPlaca) {
        setVeiculoPlaca(driver.veiculoPlaca);
      } else {
        const activeContract = contratos.find(c => c.motoristaCpf === cpf && c.status === 'Ativo');
        if (activeContract && activeContract.veiculoPlaca) {
          setVeiculoPlaca(activeContract.veiculoPlaca);
        }
      }
    }
  };

  const handleVeiculoSelect = (placa: string) => {
    setVeiculoPlaca(placa);
    if (placa && !motoristaCpf) {
      const activeContract = contratos.find(c => c.veiculoPlaca === placa && c.status === 'Ativo');
      if (activeContract && activeContract.motoristaCpf) {
        setMotoristaCpf(activeContract.motoristaCpf);
      } else {
        const driver = motoristas.find(m => m.veiculoPlaca === placa);
        if (driver) {
          setMotoristaCpf(driver.cpf);
        }
      }
    }
  };

  const [originalFormStateJson, setOriginalFormStateJson] = useState('');
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);

  const getSerializedFormState = () => {
    return JSON.stringify({
      motoristaCpf,
      veiculoPlaca,
      periodo,
      valor: valor.trim(),
      valorPago: valorPago.trim(),
      vencimento,
      dataPagamento,
      forma,
      status,
      obs: obs.trim(),
      isParcelado,
      qtdParcelas,
      valorTotal: valorTotal.trim(),
      valorParcela: valorParcela.trim(),
      installmentDates,
      isRecorrente,
      frequenciaRecorrente,
      recorrenteQtd
    });
  };

  const getSerializedStateFromPagamento = (p: Pagamento | null, defaultVencimento = '') => {
    if (p) {
      return JSON.stringify({
        motoristaCpf: p.motoristaCpf || '',
        veiculoPlaca: p.veiculoPlaca || '',
        periodo: p.periodo,
        valor: p.valor.toString().trim(),
        valorPago: (p.valorPago || '').toString().trim(),
        vencimento: p.vencimento,
        dataPagamento: p.dataPagamento || '',
        forma: p.forma || 'Pix',
        status: p.status,
        obs: (p.obs || '').trim(),
        isParcelado: !!(p.qtdParcelas && p.qtdParcelas > 1),
        qtdParcelas: p.qtdParcelas || 1,
        valorTotal: (p.valorTotal ? p.valorTotal.toString() : p.valor.toString()).trim(),
        valorParcela: (p.valorParcela ? p.valorParcela.toString() : p.valor.toString()).trim(),
        installmentDates: [p.vencimento],
        isRecorrente: !!p.isRecorrente,
        frequenciaRecorrente: p.frequenciaRecorrente || 'Mensal',
        recorrenteQtd: 1
      });
    } else {
      return JSON.stringify({
        motoristaCpf: '',
        veiculoPlaca: '',
        periodo: 'Despesa Operacional',
        valor: '',
        valorPago: '',
        vencimento: defaultVencimento,
        dataPagamento: '',
        forma: 'Pix',
        status: 'Pendente',
        obs: '',
        isParcelado: false,
        qtdParcelas: 1,
        valorTotal: '',
        valorParcela: '',
        installmentDates: [],
        isRecorrente: false,
        frequenciaRecorrente: 'Mensal',
        recorrenteQtd: 12
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

  const formatBRL = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  // Filter to show only expenses (isDespesa === true)
  const despesasOnly = pagamentos.filter(p => p.isDespesa);
  const recebimentosOnly = pagamentos.filter(p => !p.isDespesa);

  // Helper to extract clean category name
  const getBaseCategoria = (periodoVal: string) => {
    return periodoVal
      .replace(/\s*\(\d+\/\d+\)$/, '') // remove parcel like (1/10)
      .replace(/\s*\(Recorrência\s*\d+\/\d+\)$/, '') // remove recurrence like (Recorrência 1/12)
      .trim();
  };

  const categoriasDisponiveis = Array.from(
    new Set(despesasOnly.map(p => getBaseCategoria(p.periodo)))
  ).filter(Boolean).sort();

  const formasDisponiveis = Array.from(
    new Set(despesasOnly.map(p => p.forma).filter(Boolean))
  ).sort();

  // Distinct available months for month-by-month filtering
  const availableMonthsList = useMemo(() => {
    const monthSet = new Set<string>();
    const now = new Date();
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    monthSet.add(currentMonthStr);

    pagamentos.forEach(p => {
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
  }, [pagamentos]);

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

  // Despesas filtered for KPI calculations (matching time, category, method, driver, vehicle, and search)
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
    const matchesCategoria = categoriaFilter === 'Todos' || getBaseCategoria(p.periodo) === categoriaFilter;
    const matchesForma = formaFilter === 'Todos' || p.forma === formaFilter;
    const matchesMotorista =
      motoristaFilter === 'Todos' ||
      (motoristaFilter === 'sem_motorista'
        ? !p.motoristaCpf
        : p.motoristaCpf === motoristaFilter);
    const matchesVeiculo =
      veiculoFilter === 'Todos' ||
      (veiculoFilter === 'sem_veiculo'
        ? !p.veiculoPlaca
        : p.veiculoPlaca === veiculoFilter || (p.motoristaCpf && motoristas.find(m => m.cpf === p.motoristaCpf)?.veiculoPlaca === veiculoFilter));

    return matchesSearch && matchesTime && matchesCategoria && matchesForma && matchesMotorista && matchesVeiculo;
  });

  // Recebimentos filtered for KPI calculations (matching time, driver, vehicle, and search)
  const filteredRecebimentosForKPI = recebimentosOnly.filter(p => {
    const mot = motoristas.find(m => m.cpf === p.motoristaCpf);
    const matchesSearch =
      !search ||
      p.id.toLowerCase().includes(search.toLowerCase()) ||
      p.periodo.toLowerCase().includes(search.toLowerCase()) ||
      p.motoristaCpf.includes(search) ||
      (mot && mot.nome.toLowerCase().includes(search.toLowerCase()));

    const matchesTime = matchesTimeFilter(p);
    const matchesMotorista =
      motoristaFilter === 'Todos' ||
      (motoristaFilter === 'sem_motorista'
        ? !p.motoristaCpf
        : p.motoristaCpf === motoristaFilter);
    const matchesVeiculo =
      veiculoFilter === 'Todos' ||
      (veiculoFilter === 'sem_veiculo'
        ? !p.veiculoPlaca
        : p.veiculoPlaca === veiculoFilter || (p.motoristaCpf && motoristas.find(m => m.cpf === p.motoristaCpf)?.veiculoPlaca === veiculoFilter));

    return matchesSearch && matchesTime && matchesMotorista && matchesVeiculo;
  });

  // KPIs Financeiros calculados conforme o filtro selecionado
  const totalPago = filteredDespesasForKPI.filter(p => p.status === 'Pago').reduce((sum, p) => sum + (p.valorPago !== undefined ? p.valorPago : p.valor), 0);
  const totalEmAberto = filteredDespesasForKPI.filter(p => p.status === 'Atrasado').reduce((sum, p) => sum + p.valor, 0);
  const totalPrevisto = filteredDespesasForKPI.filter(p => p.status === 'Pendente').reduce((sum, p) => sum + p.valor, 0);

  // Total Recebido conforme o filtro selecionado
  const totalRecebido = filteredRecebimentosForKPI.filter(p => p.status === 'Pago').reduce((sum, p) => sum + (p.valorPago || p.valor), 0);

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

  const generateRecurringDates = (baseDate: string, qty: number, freq: 'Diário' | 'Semanal' | 'Mensal') => {
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

  const handleTotalValueChange = (totalVal: string) => {
    setValorTotal(totalVal);
    const numericTotal = parseFloat(totalVal) || 0;
    if (qtdParcelas > 0) {
      const perInstallment = (numericTotal / qtdParcelas).toFixed(2);
      setValorParcela(perInstallment);
      setValor(perInstallment);
    }
  };

  const handleInstallmentValueChange = (instVal: string) => {
    setValorParcela(instVal);
    setValor(instVal);
    const numericInst = parseFloat(instVal) || 0;
    setValorTotal((numericInst * qtdParcelas).toFixed(2));
  };

  const handleQtyChange = (qtyVal: number) => {
    setQtdParcelas(qtyVal);
    const numericTotal = parseFloat(valorTotal) || 0;
    if (qtyVal > 0) {
      const perInstallment = (numericTotal / qtyVal).toFixed(2);
      setValorParcela(perInstallment);
      setValor(perInstallment);
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
    setPeriodo('Despesa Operacional');
    setValor('');
    setValorPago('');
    const today = new Date().toISOString().split('T')[0];
    setVencimento(today);
    setDataPagamento('');
    setForma('Pix');
    setStatus('Pendente');
    setObs('');
    setIsParcelado(false);
    setQtdParcelas(1);
    setValorTotal('');
    setValorParcela('');
    setInstallmentDates([]);
    setIsRecorrente(false);
    setFrequenciaRecorrente('Mensal');
    setRecorrenteQtd(12);
    setOriginalFormStateJson(getSerializedStateFromPagamento(null, today));
    setIsModalOpen(true);
  };

  const openEditModal = (p: Pagamento) => {
    setEditingPagamento(p);
    setMotoristaCpf(p.motoristaCpf || '');
    setVeiculoPlaca(p.veiculoPlaca || '');
    setPeriodo(p.periodo);
    setValor(p.valor.toString());
    setValorPago(p.valorPago ? p.valorPago.toString() : '');
    setVencimento(p.vencimento);
    setDataPagamento(p.dataPagamento || '');
    setForma(p.forma || 'Pix');
    setStatus(p.status);
    setObs(p.obs || '');
    setIsParcelado(!!(p.qtdParcelas && p.qtdParcelas > 1));
    setQtdParcelas(p.qtdParcelas || 1);
    setValorTotal(p.valorTotal ? p.valorTotal.toString() : p.valor.toString());
    setValorParcela(p.valorParcela ? p.valorParcela.toString() : p.valor.toString());
    setInstallmentDates([p.vencimento]);
    setIsRecorrente(!!p.isRecorrente);
    setFrequenciaRecorrente(p.frequenciaRecorrente || 'Mensal');
    setRecorrenteQtd(1);
    setOriginalFormStateJson(getSerializedStateFromPagamento(p));
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    if (!periodo || !vencimento) {
      onTriggerToast('Por favor, preencha todos os campos obrigatórios (*)', 'error');
      return;
    }

    // Regras de Vinculação Obrigatória por Categoria
    if (isDriverCategory(periodo) && !motoristaCpf) {
      onTriggerToast(`Lançamentos de Diárias/Semanal/Mensal (${periodo}) exigem a vinculação a um Motorista!`, 'error');
      return;
    }

    if (isVehicleCategory(periodo) && !veiculoPlaca) {
      onTriggerToast(`Despesas de Documentos, Seguros, Rastreadores, Chip ou Manutenção (${periodo}) devem ser lançadas para um Veículo!`, 'error');
      return;
    }

    if (isParcelado) {
      if (!valorTotal || !valorParcela || qtdParcelas < 1) {
        onTriggerToast('Por favor, defina o valor total e o número de parcelas!', 'error');
        return;
      }
    } else {
      if (!valor) {
        onTriggerToast('Por favor, informe o valor devido!', 'error');
        return;
      }
    }

    // Se for categoria de despesa operacional do veículo, não agrega ao motorista
    const effectiveDriverCpf = isVehicleCategory(periodo) ? '' : motoristaCpf;

    if (editingPagamento) {
      const finalVal = isParcelado ? parseFloat(valorParcela) : parseFloat(valor);
      const finalValorPago = status === 'Pago' && valorPago ? parseFloat(valorPago) : undefined;
      const pagamentoData: Pagamento = {
        ...editingPagamento,
        motoristaCpf: effectiveDriverCpf,
        veiculoPlaca: veiculoPlaca || undefined,
        periodo: periodo.trim(),
        valor: finalVal || 0,
        valorPago: finalValorPago,
        vencimento,
        dataPagamento: status === 'Pago' ? (dataPagamento || new Date().toISOString().split('T')[0]) : undefined,
        forma,
        status,
        obs: obs.trim(),
        isDespesa: true,
        qtdParcelas: isParcelado ? qtdParcelas : undefined,
        parcelaNumero: isParcelado ? editingPagamento.parcelaNumero || 1 : undefined,
        valorTotal: isParcelado ? parseFloat(valorTotal) : undefined,
        valorParcela: isParcelado ? parseFloat(valorParcela) : undefined,
        isRecorrente: isRecorrente,
        frequenciaRecorrente: isRecorrente ? frequenciaRecorrente : undefined,
      };

      onEditPagamento(pagamentoData);
      onTriggerToast(`Lançamento de despesa ${editingPagamento.id} atualizado!`, 'success');
    } else {
      if (isParcelado && qtdParcelas > 1) {
        const baseId = `#DES${Math.floor(Math.random() * 9000) + 1000}`;
        for (let i = 1; i <= qtdParcelas; i++) {
          const pagId = `${baseId}-${i}`;
          const dueDate = installmentDates[i - 1] || vencimento;
          
          // Se marcar como Pago, a 1ª parcela fica como Pago e o restante fica Pendente
          const itemStatus = (status === 'Pago' && i > 1) ? 'Pendente' : status;
          const itemDataPagamento = itemStatus === 'Pago' ? (dataPagamento || new Date().toISOString().split('T')[0]) : undefined;
          const itemForma = forma;
          const itemValorPago = itemStatus === 'Pago' && valorPago ? parseFloat(valorPago) : undefined;

          const pagData: Pagamento = {
            id: pagId,
            motoristaCpf: effectiveDriverCpf,
            veiculoPlaca: veiculoPlaca || undefined,
            periodo: `${periodo} (${i}/${qtdParcelas})`,
            valor: parseFloat(valorParcela) || 0,
            valorPago: itemValorPago,
            vencimento: dueDate,
            dataPagamento: itemDataPagamento,
            forma: itemForma,
            status: itemStatus,
            obs: obs.trim(),
            isDespesa: true,
            qtdParcelas,
            parcelaNumero: i,
            valorTotal: parseFloat(valorTotal) || 0,
            valorParcela: parseFloat(valorParcela) || 0
          };
          onAddPagamento(pagData);
        }
        onTriggerToast(`Lançadas ${qtdParcelas} parcelas de despesa com sucesso (ID base ${baseId})!`, 'success');
      } else if (isRecorrente && recorrenteQtd > 1) {
        const baseId = `#DES${Math.floor(Math.random() * 9000) + 1000}`;
        const recurringDates = generateRecurringDates(vencimento, recorrenteQtd, frequenciaRecorrente);
        for (let i = 1; i <= recorrenteQtd; i++) {
          const pagId = `${baseId}-R${i}`;
          const dueDate = recurringDates[i - 1] || vencimento;
          
          // Se marcar como Pago, a 1ª recorrência fica como Pago e o restante fica Pendente
          const itemStatus = (status === 'Pago' && i > 1) ? 'Pendente' : status;
          const itemDataPagamento = itemStatus === 'Pago' ? (dataPagamento || new Date().toISOString().split('T')[0]) : undefined;
          const itemForma = forma;
          const itemValorPago = itemStatus === 'Pago' && valorPago ? parseFloat(valorPago) : undefined;

          const pagData: Pagamento = {
            id: pagId,
            motoristaCpf: effectiveDriverCpf,
            veiculoPlaca: veiculoPlaca || undefined,
            periodo: `${periodo} (Recorrência ${i}/${recorrenteQtd})`,
            valor: parseFloat(valor) || 0,
            valorPago: itemValorPago,
            vencimento: dueDate,
            dataPagamento: itemDataPagamento,
            forma: itemForma,
            status: itemStatus,
            obs: obs.trim(),
            isDespesa: true,
            isRecorrente: true,
            frequenciaRecorrente
          };
          onAddPagamento(pagData);
        }
        onTriggerToast(`Lançadas ${recorrenteQtd} recorrências (${frequenciaRecorrente}) com sucesso (ID base ${baseId})!`, 'success');
      } else {
        const pagId = `#DES${Math.floor(Math.random() * 9000) + 1000}`;
        const finalVal = parseFloat(valor) || 0;
        const finalValorPago = status === 'Pago' && valorPago ? parseFloat(valorPago) : undefined;
        const pagData: Pagamento = {
          id: pagId,
          motoristaCpf: effectiveDriverCpf,
          veiculoPlaca: veiculoPlaca || undefined,
          periodo: periodo.trim(),
          valor: finalVal,
          valorPago: finalValorPago,
          vencimento,
          dataPagamento: status === 'Pago' ? (dataPagamento || new Date().toISOString().split('T')[0]) : undefined,
          forma,
          status,
          obs: obs.trim(),
          isDespesa: true,
          isRecorrente: isRecorrente,
          frequenciaRecorrente: isRecorrente ? frequenciaRecorrente : undefined
        };
        onAddPagamento(pagData);
        onTriggerToast(`Lançamento de contas a pagar ${pagId} registrado com sucesso!`, 'success');
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
    onDeletePagamento(archiveTargetId, archiveMotivo.trim() || 'Remoção via contas a pagar');
    onTriggerToast(`Lançamento de despesa ${archiveTargetId} movido para o Arquivo Morto!`, 'success');
    setArchiveTargetId(null);
  };

  const handleQuickPayExpense = (p: Pagamento, chosenForma: string = 'Pix') => {
    const today = new Date().toISOString().split('T')[0];
    const pago: Pagamento = {
      ...p,
      status: 'Pago',
      dataPagamento: today,
      forma: chosenForma,
      obs: p.obs ? `${p.obs} | Quitado via ${chosenForma}` : `Despesa quitada via ${chosenForma}`
    };
    onEditPagamento(pago);
    onTriggerToast(`Despesa de ${formatBRL(p.valor)} quitada com sucesso via ${chosenForma}!`, 'success');
  };

  // Filtrar Pagamentos
  const filteredPagamentos = filteredDespesasForKPI.filter(p => {
    return statusFilter === 'Todos' || p.status === statusFilter;
  });

  const sortedPagamentos = [...filteredPagamentos].sort((a, b) => {
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
    >
      {/* Cards Financeiros de Despesas e Receitas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
        <div className="bg-white p-4.5 rounded-xl border border-slate-200/80 shadow-sm flex items-center gap-3.5 border-l-4 border-l-emerald-600">
          <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center text-lg font-bold shrink-0">
            💰
          </div>
          <div>
            <span className="text-xl font-extrabold text-slate-800 tracking-tight block leading-none mb-1">
              {formatBRL(totalRecebido)}
            </span>
            <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">
              Total Recebido (Aluguéis)
            </span>
          </div>
        </div>

        <div className="bg-white p-4.5 rounded-xl border border-slate-200/80 shadow-sm flex items-center gap-3.5 border-l-4 border-l-red-600">
          <div className="w-10 h-10 bg-red-50 text-red-600 rounded-xl flex items-center justify-center text-lg font-bold shrink-0">
            💸
          </div>
          <div>
            <span className="text-xl font-extrabold text-slate-800 tracking-tight block leading-none mb-1">
              {formatBRL(totalPago)}
            </span>
            <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">
              Total Pago (Despesas)
            </span>
          </div>
        </div>

        <div className="bg-white p-4.5 rounded-xl border border-slate-200/80 shadow-sm flex items-center gap-3.5 border-l-4 border-l-rose-500">
          <div className="w-10 h-10 bg-rose-50 text-rose-500 rounded-xl flex items-center justify-center text-lg font-bold shrink-0">
            🚨
          </div>
          <div>
            <span className="text-xl font-extrabold text-slate-800 tracking-tight block leading-none mb-1">
              {formatBRL(totalEmAberto)}
            </span>
            <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">
              Despesas em Atraso
            </span>
          </div>
        </div>

        <div className="bg-white p-4.5 rounded-xl border border-slate-200/80 shadow-sm flex items-center gap-3.5 border-l-4 border-l-blue-500">
          <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-lg font-bold shrink-0">
            🗓️
          </div>
          <div>
            <span className="text-xl font-extrabold text-slate-800 tracking-tight block leading-none mb-1">
              {formatBRL(totalPrevisto)}
            </span>
            <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">
              Previsão a Pagar (Futuro)
            </span>
          </div>
        </div>
      </div>

      {/* Lembrete de Parcelas de Seguro Ativas */}
      {(() => {
        const veiculosComSeguro = veiculos.filter(v => v.segurado && v.seguro_parcelas && v.seguro_parcelas > 0);
        if (veiculosComSeguro.length === 0) return null;
        return (
          <div className="bg-slate-900 text-white rounded-xl p-4.5 space-y-3.5 shadow-md">
            <div className="flex items-center gap-2 text-red-500 border-b border-slate-800 pb-2">
              <AlertTriangle className="w-4.5 h-4.5 text-red-500 shrink-0 animate-pulse" />
              <h4 className="font-extrabold text-[11px] uppercase tracking-wider text-slate-100">
                Atenção: Parcelas de Seguro a Vencer no Fluxo de Despesas
              </h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {veiculosComSeguro.map(v => {
                const valorParcelaVal = v.seguro_valor ? (v.seguro_valor / v.seguro_parcelas!) : 0;
                return (
                  <div key={v.placa} className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs flex flex-col justify-between hover:border-slate-700 transition-all">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <PlacaMercosul placa={v.placa} size="sm" />
                        <span className="text-[10px] font-bold text-slate-400 uppercase">
                          {v.seguro_seguradora || 'Seguradora'}
                        </span>
                      </div>
                      <div className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                        <CarBrandLogo brand={v.marca} className="w-4 h-4" />
                        <span>{v.marca} {v.modelo}</span>
                      </div>
                      <div className="mt-2 space-y-1 text-slate-400 font-medium">
                        <div className="flex justify-between">
                          <span>Plano:</span>
                          <span className="font-bold text-red-400">{v.seguro_parcelas} parcelas</span>
                        </div>
                        <div className="flex justify-between pt-1 border-t border-slate-800 mt-1">
                          <span className="font-bold text-slate-300">Valor da Parcela:</span>
                          <span className="font-extrabold text-red-500 text-[13px]">{formatBRL(valorParcelaVal)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Barra de Pesquisa e Filtros */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-5 h-5 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Pesquisar contas a pagar por descrição, placa, ID, nome..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 text-sm shadow-2xs"
          />
        </div>

        <button
          onClick={openAddModal}
          className="bg-red-600 hover:bg-red-700 text-white font-bold text-sm px-4 py-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" /> Registrar Despesa (Saída)
        </button>
      </div>

      {/* Tabs de Filtro de Status */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap gap-2">
          {(['Todos', 'Pago', 'Pendente', 'Atrasado'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all ${
                statusFilter === tab
                  ? 'bg-red-50 text-red-700 font-bold border-b-2 border-red-500'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              {tab === 'Todos' ? 'Todas as Contas' : tab === 'Pago' ? 'Pagas (Liquidadas)' : tab === 'Pendente' ? 'Pendentes' : 'Vencidas / Atrasadas'}
            </button>
          ))}
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
                    ? 'bg-white text-red-700 font-black shadow-3xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {timeTab === 'Todos' ? 'Todos' : timeTab === 'Diário' ? 'Diário' : timeTab === 'Semanal' ? 'Semanal' : timeTab === 'Mensal' ? 'Mês a Mês' : 'Anual'}
              </button>
            ))}
          </div>

          {/* Seletor Mês a Mês quando Mensal/Mês a Mês estiver ativo */}
          {timeFilter === 'Mensal' && (
            <div className="flex items-center gap-1.5 bg-red-50 border border-red-200/90 p-1 rounded-xl text-xs font-semibold text-red-900 shadow-3xs animate-fadeIn">
              <div className="flex items-center gap-1 text-[11px] font-extrabold text-red-800 uppercase tracking-wider pl-1.5 pr-1">
                <Calendar className="w-3.5 h-3.5 text-red-600 shrink-0" />
                <span>Mês:</span>
              </div>

              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1 hover:bg-red-100/80 text-red-800 rounded-lg transition-colors cursor-pointer"
                title="Mês Anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="bg-white border border-red-200 rounded-lg px-2 py-1 text-xs font-bold text-red-900 focus:outline-none focus:border-red-500 cursor-pointer shadow-3xs"
              >
                {availableMonthsList.map(m => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1 hover:bg-red-100/80 text-red-800 rounded-lg transition-colors cursor-pointer"
                title="Próximo Mês"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filtros Avançados de Despesas (Tipo, Forma, Motorista e Veículo) */}
      <div className="bg-slate-50 border border-slate-200/80 p-3.5 rounded-xl space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              📂 Categoria / Tipo
            </label>
            <select
              value={categoriaFilter}
              onChange={e => setCategoriaFilter(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs font-semibold text-slate-700 focus:outline-none focus:border-red-500 transition-all cursor-pointer"
            >
              <option value="Todos">Todos os tipos ({categoriasDisponiveis.length})</option>
              {categoriasDisponiveis.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              💳 Forma de Pagamento
            </label>
            <select
              value={formaFilter}
              onChange={e => setFormaFilter(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs font-semibold text-slate-700 focus:outline-none focus:border-red-500 transition-all cursor-pointer"
            >
              <option value="Todos">Todas as formas ({formasDisponiveis.length})</option>
              {formasDisponiveis.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <User className="w-3 h-3 text-indigo-600" /> Motorista
            </label>
            <select
              value={motoristaFilter}
              onChange={e => setMotoristaFilter(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs font-semibold text-slate-700 focus:outline-none focus:border-red-500 transition-all cursor-pointer"
            >
              <option value="Todos">Todos os motoristas ({motoristas.length})</option>
              <option value="sem_motorista">Geral / Sem Motorista</option>
              {motoristas.map(m => (
                <option key={m.cpf} value={m.cpf}>
                  {m.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <Car className="w-3 h-3 text-slate-600" /> Veículo
            </label>
            <select
              value={veiculoFilter}
              onChange={e => setVeiculoFilter(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs font-semibold text-slate-700 focus:outline-none focus:border-red-500 transition-all cursor-pointer"
            >
              <option value="Todos">Todos os veículos ({veiculos.length})</option>
              <option value="sem_veiculo">Sem Veículo Vinculado</option>
              {veiculos.map(v => (
                <option key={v.placa} value={v.placa}>
                  {v.placa} - {v.marca} {v.modelo}
                </option>
              ))}
            </select>
          </div>
        </div>

        {(categoriaFilter !== 'Todos' || formaFilter !== 'Todos' || motoristaFilter !== 'Todos' || veiculoFilter !== 'Todos') && (
          <div className="pt-2 border-t border-slate-200/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Filtros Ativos:</span>
              {categoriaFilter !== 'Todos' && (
                <span className="bg-red-100 text-red-800 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  Cat: {categoriaFilter}
                  <button onClick={() => setCategoriaFilter('Todos')} className="hover:text-red-950 cursor-pointer"><X className="w-3 h-3" /></button>
                </span>
              )}
              {formaFilter !== 'Todos' && (
                <span className="bg-red-100 text-red-800 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  Forma: {formaFilter}
                  <button onClick={() => setFormaFilter('Todos')} className="hover:text-red-950 cursor-pointer"><X className="w-3 h-3" /></button>
                </span>
              )}
              {motoristaFilter !== 'Todos' && (
                <span className="bg-indigo-100 text-indigo-800 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  Motorista: {motoristaFilter === 'sem_motorista' ? 'Geral / Sem Motorista' : (motoristas.find(m => m.cpf === motoristaFilter)?.nome || motoristaFilter)}
                  <button onClick={() => setMotoristaFilter('Todos')} className="hover:text-indigo-950 cursor-pointer"><X className="w-3 h-3" /></button>
                </span>
              )}
              {veiculoFilter !== 'Todos' && (
                <span className="bg-slate-200 text-slate-800 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  Veículo: {veiculoFilter === 'sem_veiculo' ? 'Sem Veículo' : veiculoFilter}
                  <button onClick={() => setVeiculoFilter('Todos')} className="hover:text-slate-950 cursor-pointer"><X className="w-3 h-3" /></button>
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setCategoriaFilter('Todos');
                setFormaFilter('Todos');
                setMotoristaFilter('Todos');
                setVeiculoFilter('Todos');
              }}
              className="text-xs font-bold text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-1 rounded-lg border border-red-200 transition-all flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" /> Limpar Filtros
            </button>
          </div>
        )}
      </div>

      {/* Tabela de Lançamentos */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm tracking-tight uppercase flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-red-600" /> Fluxo de Contas a Pagar (Empresarial e Frotas)
          </h3>
          <span className="bg-red-50 text-red-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
            {filteredPagamentos.length} saídas
          </span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm columns-divided">
            <thead>
              <tr className="bg-slate-50/50 text-slate-500 text-[10px] uppercase font-bold tracking-wider border-b border-slate-100">
                <th className="px-5 py-3.5">ID / Descrição</th>
                <th className="px-5 py-3.5">Associação (Carro / Motorista)</th>
                <th className="px-5 py-3.5">Vencimento</th>
                <th className="px-5 py-3.5">Valor do Lançamento</th>
                <th className="px-5 py-3.5">Data de Liquidação</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {sortedPagamentos.length > 0 ? (
                sortedPagamentos.map(p => {
                  const mot = motoristas.find(m => m.cpf === p.motoristaCpf);
                  const vencFormat = p.vencimento.split('-').reverse().join('/');
                  const pagFormat = p.dataPagamento ? p.dataPagamento.split('-').reverse().join('/') : '—';

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* ID / Descrição */}
                      <td className="px-5 py-3.5 flex flex-col justify-center">
                        <div className="font-bold text-slate-900">{p.id}</div>
                        <div className="text-xs font-semibold text-slate-600">{p.obs || p.periodo}</div>
                      </td>

                      {/* Associação */}
                      <td className="px-5 py-3.5">
                        <div className="space-y-1.5">
                          {mot && (
                            <div className="flex items-center gap-1.5 bg-indigo-50/50 border border-indigo-100/50 px-2 py-1 rounded-lg w-fit">
                              <User className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                              <div>
                                <div className="text-xs font-bold text-indigo-900 leading-tight">{mot.nome}</div>
                                <div className="text-[9px] text-indigo-500 font-semibold tracking-wider uppercase">Motorista</div>
                              </div>
                            </div>
                          )}
                          {p.veiculoPlaca && (() => {
                            const v = veiculos.find(veic => veic.placa === p.veiculoPlaca);
                            return (
                              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg w-fit">
                                <PlacaMercosul placa={p.veiculoPlaca} size="sm" />
                                <div className="text-[10px] font-bold text-slate-700 uppercase leading-none">{v ? `${v.marca} ${v.modelo}` : 'Veículo'}</div>
                              </div>
                            );
                          })()}
                          {!mot && !p.veiculoPlaca && (
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg inline-block">
                              Geral / Administrativo
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Vencimento */}
                      <td className="px-5 py-3.5 text-slate-600">
                        <div className="flex items-center gap-1 text-xs font-semibold">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" /> {vencFormat}
                        </div>
                      </td>

                      {/* Valor do Lançamento */}
                      <td className="px-5 py-3.5">
                        <div className="font-extrabold text-slate-900 text-sm flex flex-col">
                          {p.status === 'Pago' && p.valorPago !== undefined && p.valorPago !== p.valor ? (
                            <>
                              <span className="line-through text-slate-400 text-xs font-normal">
                                {formatBRL(p.valor)}
                              </span>
                              <span className="text-emerald-600 font-extrabold text-xs">
                                Pago: {formatBRL(p.valorPago)}
                              </span>
                            </>
                          ) : (
                            <span>{formatBRL(p.valor)}</span>
                          )}
                        </div>
                        {p.qtdParcelas && p.qtdParcelas > 1 && (
                          <div className="mt-1 text-[11px] text-slate-500 font-medium">
                            <div>Total: <span className="font-bold text-slate-700">{formatBRL(p.valorTotal || (p.valor * p.qtdParcelas))}</span></div>
                            <div className="bg-amber-50 text-amber-850 px-1.5 py-0.5 rounded font-extrabold text-[9px] mt-0.5 inline-block border border-amber-200/50">
                              Parcela {p.parcelaNumero} de {p.qtdParcelas}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Liquidação */}
                      <td className="px-5 py-3.5 text-xs text-slate-600">
                        <div className="font-semibold text-slate-700">{pagFormat}</div>
                        {p.forma && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Forma: <span className="bg-slate-100 px-1.5 py-0.5 rounded font-bold text-slate-600">{p.forma}</span>
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-5 py-3.5">
                        {p.status === 'Pago' ? (
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200/60 text-[11px] font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Pago (Líquido)
                          </span>
                        ) : p.status === 'Atrasado' ? (
                          <span className="bg-rose-50 text-rose-700 border border-rose-200/60 text-[11px] font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-rose-500" /> Vencido
                          </span>
                        ) : (
                          <span className="bg-amber-50 text-amber-700 border border-amber-200/60 text-[11px] font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-amber-500" /> Pendente
                          </span>
                        )}
                      </td>

                      {/* Ações */}
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          {p.status !== 'Pago' && (
                            <div className="inline-block relative text-left">
                              <button
                                type="button"
                                onClick={() => setActivePayDropdownId(activePayDropdownId === p.id ? null : p.id)}
                                className="bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-extrabold text-xs px-2.5 py-1.5 rounded-lg transition-all shadow-2xs inline-flex items-center gap-1 cursor-pointer"
                                title="Pagar Conta"
                                aria-label="Pagar Conta"
                              >
                                <span>Pagar 💸</span>
                                <span className="text-[8px]">▼</span>
                              </button>
                              
                              {activePayDropdownId === p.id && (
                                <>
                                  {/* Overlay to close dropdown */}
                                  <div 
                                    className="fixed inset-0 z-10" 
                                    onClick={() => setActivePayDropdownId(null)}
                                  />
                                  <div className="absolute right-0 mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-xl py-1 z-20 text-left animate-in fade-in slide-in-from-top-1 duration-150">
                                    <div className="px-2.5 py-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                                      Selecione a Forma
                                    </div>
                                    {[
                                      { name: 'Pix', icon: '📱' },
                                      { name: 'Boleto', icon: '📄' },
                                      { name: 'Cartão', icon: '💳' },
                                      { name: 'Dinheiro', icon: '💵' },
                                      { name: 'Transferência', icon: '🏦' }
                                    ].map(item => (
                                      <button
                                        type="button"
                                        key={item.name}
                                        onClick={() => {
                                          handleQuickPayExpense(p, item.name);
                                          setActivePayDropdownId(null);
                                        }}
                                        className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 font-semibold transition-colors flex items-center gap-1.5"
                                      >
                                        <span>{item.icon}</span>
                                        <span>{item.name}</span>
                                      </button>
                                    ))}
                                  </div>
                                </>
                              )}
                            </div>
                          )}
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
                  <td colSpan={7} className="text-center py-12 text-slate-400 font-medium italic">
                    Nenhum lançamento de contas a pagar registrado com a pesquisa atual.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL CADASTRAR / EDITAR DESPESA */}
      <AnimatePresence>
        {isModalOpen && (
          <div 
            onClick={handleCloseModalAttempt}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs cursor-pointer"
          >
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200 cursor-default"
            >
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
                <h3 className="font-extrabold text-slate-800 text-base tracking-tight flex items-center gap-2 uppercase">
                  <DollarSign className="w-5 h-5 text-red-600" />
                  {editingPagamento ? `Editar Despesa ${editingPagamento.id}` : 'Registrar Novo Contas a Pagar'}
                </h3>
                <button
                  onClick={handleCloseModalAttempt}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSave}>
                <div className="p-5 overflow-y-auto max-h-[70vh] space-y-4">
                  {/* Associação Dupla (Carro e/ou Motorista) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
                    {/* Motorista Associado */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-indigo-500 shrink-0" /> Motorista {isDriverCategory(periodo) ? '*' : ''}
                        </span>
                        {isDriverCategory(periodo) && (
                          <span className="text-[10px] font-extrabold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-md">
                            Obrigatório
                          </span>
                        )}
                      </label>
                      <select
                        value={motoristaCpf}
                        onChange={e => handleMotoristaSelect(e.target.value)}
                        className={`bg-white border rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-700 focus:outline-none ${
                          isDriverCategory(periodo) && !motoristaCpf
                            ? 'border-indigo-400 focus:border-indigo-600 bg-indigo-50/20'
                            : 'border-slate-200 focus:border-red-500'
                        }`}
                        required={isDriverCategory(periodo)}
                      >
                        <option value="">Selecione o motorista...</option>
                        {motoristas.map(m => (
                          <option key={m.cpf} value={m.cpf}>
                            {m.nome}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Veículo Associado */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <Car className="w-3.5 h-3.5 text-slate-500 shrink-0" /> Veículo (Carro) {isVehicleCategory(periodo) ? '*' : ''}
                        </span>
                        {isVehicleCategory(periodo) && (
                          <span className="text-[10px] font-extrabold text-red-700 bg-red-100 px-2 py-0.5 rounded-md">
                            Obrigatório
                          </span>
                        )}
                      </label>
                      <select
                        value={veiculoPlaca}
                        onChange={e => handleVeiculoSelect(e.target.value)}
                        className={`bg-white border rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-700 focus:outline-none font-mono ${
                          isVehicleCategory(periodo) && !veiculoPlaca
                            ? 'border-red-400 focus:border-red-600 bg-red-50/20'
                            : 'border-slate-200 focus:border-red-500'
                        }`}
                        required={isVehicleCategory(periodo)}
                      >
                        <option value="">Selecione o veículo...</option>
                        {veiculos.map(v => (
                          <option key={v.placa} value={v.placa}>
                            {v.placa} — {v.marca} {v.modelo}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Tipo / Descrição */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Tipo / Categoria de Despesa *
                      </label>
                      <input
                        type="text"
                        list="tipo-despesa-options"
                        placeholder="Ex: Manutenção, Seguro, Diária..."
                        value={periodo}
                        onChange={e => setPeriodo(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 font-semibold"
                        required
                      />
                      <datalist id="tipo-despesa-options">
                        <option value="Diária" />
                        <option value="Semanal" />
                        <option value="Mensal" />
                        <option value="Adiantamento / Vale Motorista" />
                        <option value="Manutenção / Oficina" />
                        <option value="Documentos (IPVA / Licenciamento)" />
                        <option value="Seguro Veicular" />
                        <option value="Rastreador" />
                        <option value="Chip de Telemetria" />
                        <option value="Acessórios" />
                        <option value="Combustível" />
                        <option value="Lavagem / Higienização" />
                        <option value="Despesa Operacional" />
                      </datalist>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Descrição / Detalhes *
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Nota Fiscal Oficina, Compra de Pneu"
                        value={obs}
                        onChange={e => setObs(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 font-semibold"
                        required
                      />
                    </div>
                  </div>

                  {/* Configuração de Tipo de Lançamento (Único, Parcelado ou Recorrente) */}
                  {!editingPagamento && (
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs font-bold text-slate-700 block uppercase tracking-wider">Tipo de Repetição / Faturamento</span>
                          <span className="text-[11px] text-slate-400">Selecione se é um pagamento único, parcelado ou recorrente</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setIsParcelado(false);
                            setIsRecorrente(false);
                            setValorParcela(valor);
                            setValorTotal(valor);
                          }}
                          className={`px-3 py-2 rounded-lg text-xs font-bold transition-all border text-center flex flex-col items-center justify-center gap-1 cursor-pointer ${
                            !isParcelado && !isRecorrente
                              ? 'bg-red-600 text-white border-red-600 shadow-xs'
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
                            const valNum = parseFloat(valor) || 0;
                            setValorTotal(valNum.toString());
                            setValorParcela((valNum / 2).toFixed(2));
                            const generated = generateDefaultInstallmentDates(vencimento || new Date().toISOString().split('T')[0], 2);
                            setInstallmentDates(generated);
                            setQtdParcelas(2);
                          }}
                          className={`px-3 py-2 rounded-lg text-xs font-bold transition-all border text-center flex flex-col items-center justify-center gap-1 cursor-pointer ${
                            isParcelado
                              ? 'bg-red-600 text-white border-red-600 shadow-xs'
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
                              ? 'bg-red-600 text-white border-red-600 shadow-xs'
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
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                            Valor Total (R$) *
                          </label>
                          <input
                            type="number"
                            placeholder="1000.00"
                            value={valorTotal}
                            onChange={e => handleTotalValueChange(e.target.value)}
                            step="0.01"
                            min="0"
                            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 font-extrabold text-slate-800"
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
                            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 font-bold text-slate-800"
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
                            onChange={e => handleInstallmentValueChange(e.target.value)}
                            step="0.01"
                            min="0"
                            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 font-extrabold text-red-600"
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
                            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 font-semibold text-slate-700"
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
                    </>
                  ) : isRecorrente ? (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                            Valor de cada Recorrência (R$) *
                          </label>
                          <input
                            type="number"
                            placeholder="250.00"
                            value={valor}
                            onChange={e => { setValor(e.target.value); setValorParcela(e.target.value); setValorTotal(e.target.value); }}
                            step="0.01"
                            min="0"
                            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 font-extrabold text-red-600"
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
                            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 font-semibold text-slate-700"
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
                            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 font-bold text-slate-700"
                          >
                            <option value="Diário">Diário</option>
                            <option value="Semanal">Semanal</option>
                            <option value="Mensal">Mensal</option>
                          </select>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                            Quantidade de Repetições a Gerar *
                          </label>
                          <input
                            type="number"
                            value={recorrenteQtd}
                            onChange={e => setRecorrenteQtd(Math.max(1, parseInt(e.target.value) || 1))}
                            min="1"
                            max="36"
                            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 font-bold text-slate-800"
                            required
                            disabled={!!editingPagamento}
                          />
                        </div>
                      </div>

                      {/* Info Recorrência */}
                      {!editingPagamento && (
                        <div className="bg-amber-50 border border-amber-200/50 p-3 rounded-lg text-xs text-amber-800 font-medium">
                          💡 <strong>Planejamento:</strong> Serão gerados <strong>{recorrenteQtd}</strong> lançamentos <strong>{frequenciaRecorrente === 'Diário' ? 'diários' : frequenciaRecorrente === 'Semanal' ? 'semanais' : 'mensais'}</strong> de <strong>{formatBRL(parseFloat(valor) || 0)}</strong> cada, iniciando em <strong>{vencimento.split('-').reverse().join('/')}</strong>.
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Valor Devido (R$) *
                        </label>
                        <input
                          type="number"
                          placeholder="250.00"
                          value={valor}
                          onChange={e => { setValor(e.target.value); setValorParcela(e.target.value); setValorTotal(e.target.value); }}
                          step="0.01"
                          min="0"
                          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 font-extrabold text-red-600"
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
                          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 font-semibold text-slate-700"
                          required
                        />
                      </div>
                    </div>
                  )}

                  {/* Informações de Liquidação, Forma de Pagamento e Status */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Forma de Liquidação / Pagamento
                      </label>
                      <select
                        value={forma}
                        onChange={e => setForma(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-red-500 font-semibold text-slate-700"
                      >
                        <option value="Pix">Pix</option>
                        <option value="Boleto">Boleto</option>
                        <option value="Cartão">Cartão</option>
                        <option value="Dinheiro">Dinheiro</option>
                        <option value="Transferência">Transferência</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Status do Lançamento
                      </label>
                      <select
                        value={status}
                        onChange={e => setStatus(e.target.value as any)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-red-500 font-bold text-slate-700"
                      >
                        <option value="Pendente">Pendente</option>
                        <option value="Pago">Pago (Liquidado)</option>
                        <option value="Atrasado">Atrasado (Vencido)</option>
                      </select>
                    </div>
                  </div>

                  {/* Data de Liquidação (Aparece se for Pago) */}
                  {status === 'Pago' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-emerald-50/50 p-3.5 rounded-xl border border-emerald-100">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                          Data de Liquidação (Opcional)
                        </label>
                        <input
                          type="date"
                          value={dataPagamento}
                          onChange={e => setDataPagamento(e.target.value)}
                          className="bg-white border border-emerald-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 font-semibold text-slate-700"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                          Valor Efetivamente Pago (R$)
                        </label>
                        <input
                          type="number"
                          placeholder="Ex: 260.00"
                          value={valorPago}
                          onChange={e => setValorPago(e.target.value)}
                          step="0.01"
                          min="0"
                          className="bg-white border border-emerald-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 font-extrabold text-emerald-700"
                        />
                        <span className="text-[10px] text-emerald-600 font-medium leading-none">
                          Deixe em branco para usar o valor original do lançamento.
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={handleCloseModalAttempt}
                    className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs px-4 py-2.5 rounded-lg transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-lg transition-all shadow-sm"
                  >
                    Salvar Despesa
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
                  Mover Despesa para o Arquivo Morto?
                </div>
                <p className="text-slate-600 text-sm leading-relaxed mb-4">
                  Esta ação não exclui permanentemente o lançamento financeiro de despesa, mas o move para o Arquivo Morto preservando o histórico de conciliação.
                </p>
                <div className="flex flex-col gap-1.5 mb-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Motivo do arquivamento *
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Nota fiscal cancelada / Lançamento incorreto"
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
                  Você realizou alterações no formulário de pagamentos. Se você sair agora, as novas informações <strong>não serão salvas</strong> e as alterações serão perdidas.
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
