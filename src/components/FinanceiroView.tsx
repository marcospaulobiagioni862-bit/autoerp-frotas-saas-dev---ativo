import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Calendar,
  Search,
  Filter,
  Plus,
  FileDown,
  CheckCircle2,
  AlertTriangle,
  Clock,
  X,
  FileText,
  User,
  Car,
  Wrench,
  Shield,
  Locate,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  PieChart as PieChartIcon,
  BarChart3,
  PhoneCall,
  MessageCircle,
  Pencil,
  Trash2,
  Receipt,
  Printer,
  Sliders,
  AlertCircle,
  HelpCircle,
  Tag,
  CreditCard,
  ChevronRight,
  RefreshCw,
  Eye,
  Check,
  Undo2
} from 'lucide-react';

import {
  ContaReceber,
  ContaPagar,
  CategoriaFinanceira,
  FormaPagamentoItem,
  RegistroInadimplenciaContato,
  Veiculo,
  Motorista,
  Contrato,
  formatBRL
} from '../types';

interface FinanceiroViewProps {
  contasReceber: ContaReceber[];
  contasPagar: ContaPagar[];
  categorias: CategoriaFinanceira[];
  formasPagamento: FormaPagamentoItem[];
  historicoInadimplencia: RegistroInadimplenciaContato[];
  veiculos: Veiculo[];
  motoristas: Motorista[];
  contratos: Contrato[];

  // Actions
  onRegistrarRecebimento: (
    id: string,
    valorPago: number,
    forma: string,
    data: string,
    desconto?: number,
    juros?: number,
    multa?: number,
    obs?: string
  ) => void;
  onEstornarRecebimento: (id: string, motivo: string) => void;
  onAddContaReceber: (nova: Omit<ContaReceber, 'id' | 'numeroLancamento'>) => void;
  onEditContaReceber: (id: string, dados: Partial<ContaReceber>) => void;
  onCancelContaReceber: (id: string, motivo: string) => void;
  onRenegociarContaReceber: (id: string, novoVencimento: string, novoValor: number, obs: string) => void;

  onRegistrarPagamentoDespesa: (
    id: string,
    valorPago: number,
    forma: string,
    data: string,
    desconto?: number,
    juros?: number,
    multa?: number,
    obs?: string
  ) => void;
  onEstornarPagamentoDespesa: (id: string, motivo: string) => void;
  onAddContaPagar: (nova: Omit<ContaPagar, 'id' | 'numeroLancamento'>) => void;
  onEditContaPagar: (id: string, dados: Partial<ContaPagar>) => void;
  onCancelContaPagar: (id: string, motivo: string) => void;

  onAddContatoInadimplencia: (reg: Omit<RegistroInadimplenciaContato, 'id' | 'dataHora' | 'usuario'>) => void;
  onAddCategoria: (cat: Omit<CategoriaFinanceira, 'id'>) => void;
  onAddFormaPagamento: (forma: Omit<FormaPagamentoItem, 'id'>) => void;
  onToggleFormaPagamento: (id: string) => void;

  onTriggerToast: (msg: string, type: 'success' | 'warning' | 'error') => void;
  defaultSubTab?: string;
}

export default function FinanceiroView({
  contasReceber,
  contasPagar,
  categorias,
  formasPagamento,
  historicoInadimplencia,
  veiculos,
  motoristas,
  contratos,
  onRegistrarRecebimento,
  onEstornarRecebimento,
  onAddContaReceber,
  onEditContaReceber,
  onCancelContaReceber,
  onRenegociarContaReceber,
  onRegistrarPagamentoDespesa,
  onEstornarPagamentoDespesa,
  onAddContaPagar,
  onEditContaPagar,
  onCancelContaPagar,
  onAddContatoInadimplencia,
  onAddCategoria,
  onAddFormaPagamento,
  onToggleFormaPagamento,
  onTriggerToast,
  defaultSubTab = 'dashboard'
}: FinanceiroViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<string>(defaultSubTab);

  // Filters state
  const [periodFilter, setPeriodFilter] = useState<'hoje' | 'semana' | 'mes' | '30dias' | 'ano' | 'todos'>('mes');
  const [search, setSearch] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState('Todos');
  const [driverFilter, setDriverFilter] = useState('Todos');
  const [categoryFilter, setCategoryFilter] = useState('Todos');
  const [statusFilter, setStatusFilter] = useState('Todos');

  // Modals state
  const [isReceberModalOpen, setIsReceberModalOpen] = useState(false);
  const [isPagarModalOpen, setIsPagarModalOpen] = useState(false);
  const [isBaixaReceberModalOpen, setIsBaixaReceberModalOpen] = useState(false);
  const [isBaixaPagarModalOpen, setIsBaixaPagarModalOpen] = useState(false);
  const [isRenegociarModalOpen, setIsRenegociarModalOpen] = useState(false);
  const [isContatoInadModalOpen, setIsContatoInadModalOpen] = useState(false);
  const [isCategoriaModalOpen, setIsCategoriaModalOpen] = useState(false);
  const [isFormaModalOpen, setIsFormaModalOpen] = useState(false);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<ContaReceber | ContaPagar | null>(null);

  // Form selections
  const [activeReceberTarget, setActiveReceberTarget] = useState<ContaReceber | null>(null);
  const [activePagarTarget, setActivePagarTarget] = useState<ContaPagar | null>(null);
  const [inadTargetCpf, setInadTargetCpf] = useState<string | null>(null);

  // Quitação / Baixa form fields
  const [baixaValor, setBaixaValor] = useState('');
  const [baixaForma, setBaixaForma] = useState('PIX');
  const [baixaData, setBaixaData] = useState(new Date().toISOString().split('T')[0]);
  const [baixaDesconto, setBaixaDesconto] = useState('0');
  const [baixaJuros, setBaixaJuros] = useState('0');
  const [baixaMulta, setBaixaMulta] = useState('0');
  const [baixaObs, setBaixaObs] = useState('');

  // Renegociação form fields
  const [renegNovoVencimento, setRenegNovoVencimento] = useState('');
  const [renegNovoValor, setRenegNovoValor] = useState('');
  const [renegObs, setRenegObs] = useState('');

  // Contato Inadimplência form fields
  const [contatoTipo, setContatoTipo] = useState<'Telefone' | 'WhatsApp' | 'E-mail' | 'Presencial' | 'Notificação'>('WhatsApp');
  const [contatoObs, setContatoObs] = useState('');
  const [contatoAcordo, setContatoAcordo] = useState(false);
  const [contatoValorAcordo, setContatoValorAcordo] = useState('');
  const [contatoNovaData, setContatoNovaData] = useState('');

  // Form Novo Lançamento Contas a Receber
  const [newRecDesc, setNewRecDesc] = useState('');
  const [newRecCliente, setNewRecCliente] = useState('');
  const [newRecDriverCpf, setNewRecDriverCpf] = useState('');
  const [newRecVehicle, setNewRecVehicle] = useState('');
  const [newRecContratoId, setNewRecContratoId] = useState('');
  const [newRecCategoria, setNewRecCategoria] = useState('Aluguel de Veículo');
  const [newRecCentroCusto, setNewRecCentroCusto] = useState('Locação de Frota');
  const [newRecValor, setNewRecValor] = useState('');
  const [newRecVencimento, setNewRecVencimento] = useState(new Date().toISOString().split('T')[0]);
  const [newRecPeriodicidade, setNewRecPeriodicidade] = useState<'Única' | 'Diária' | 'Semanal' | 'Quinzenal' | 'Mensal'>('Semanal');
  const [newRecObs, setNewRecObs] = useState('');

  // Form Novo Lançamento Contas a Pagar
  const [newPagDesc, setNewPagDesc] = useState('');
  const [newPagFornecedor, setNewPagFornecedor] = useState('');
  const [newPagCnpjCpf, setNewPagCnpjCpf] = useState('');
  const [newPagVehicle, setNewPagVehicle] = useState('');
  const [newPagCategoria, setNewPagCategoria] = useState<'DOCUMENTAÇÃO' | 'SEGURO' | 'RASTREADOR' | 'MANUTENÇÃO' | 'MULTAS E INFRAÇÕES' | 'OUTRAS DESPESAS'>('MANUTENÇÃO');
  const [newPagSubcategoria, setNewPagSubcategoria] = useState('Preventiva');
  const [newPagCentroCusto, setNewPagCentroCusto] = useState('Oficina & Manutenção');
  const [newPagNf, setNewPagNf] = useState('');
  const [newPagValor, setNewPagValor] = useState('');
  const [newPagVencimento, setNewPagVencimento] = useState(new Date().toISOString().split('T')[0]);
  const [newPagForma, setNewPagForma] = useState('PIX');
  const [newPagObs, setNewPagObs] = useState('');

  // Form Nova Categoria
  const [newCatNome, setNewCatNome] = useState('');
  const [newCatTipo, setNewCatTipo] = useState<'Receita' | 'Despesa'>('Despesa');
  const [newCatSubcats, setNewCatSubcats] = useState('');
  const [newCatCentro, setNewCatCentro] = useState('Geral');

  // Form Nova Forma Pagamento
  const [newFpNome, setNewFpNome] = useState('');
  const [newFpTaxa, setNewFpTaxa] = useState('0');
  const [newFpDias, setNewFpDias] = useState('0');
  const [newFpObs, setNewFpObs] = useState('');

  // Sub-tabs list
  const subTabs = [
    { id: 'dashboard', label: 'Dashboard Financeiro', icon: PieChartIcon },
    { id: 'receber', label: 'Contas a Receber', icon: DollarSign, badge: contasReceber.filter(r => r.status === 'Vencido' || r.status === 'Em aberto').length },
    { id: 'pagar', label: 'Contas a Pagar', icon: CreditCard, badge: contasPagar.filter(p => p.status === 'Vencido' || p.status === 'Em aberto').length },
    { id: 'recebimentos', label: 'Recebimentos', icon: TrendingUp },
    { id: 'pagamentos', label: 'Pagamentos', icon: TrendingDown },
    { id: 'fluxo_caixa', label: 'Fluxo de Caixa', icon: RefreshCw },
    { id: 'despesas_veiculo', label: 'Despesas x Veículo', icon: Wrench },
    { id: 'receitas_veiculo', label: 'Receitas x Veículo', icon: Car },
    { id: 'inadimplencia', label: 'Inadimplência', icon: AlertTriangle, badge: contasReceber.filter(r => r.status === 'Vencido').length },
    { id: 'relatorios', label: 'Relatórios', icon: FileText },
    { id: 'categorias', label: 'Categorias', icon: Tag },
    { id: 'formas_pagamento', label: 'Formas Pagamento', icon: Layers }
  ];

  // ===============================================
  // CALCULATED FINANCIAL INDICATORS & DASHBOARD
  // ===============================================
  const totalAReceber = useMemo(() => {
    return contasReceber
      .filter(r => r.status === 'Em aberto' || r.status === 'Parcialmente recebido' || r.status === 'Vencido')
      .reduce((acc, r) => acc + r.saldoDevedor, 0);
  }, [contasReceber]);

  const totalRecebido = useMemo(() => {
    return contasReceber
      .filter(r => r.status === 'Recebido' || r.status === 'Parcialmente recebido')
      .reduce((acc, r) => acc + r.valorRecebido, 0);
  }, [contasReceber]);

  const totalVencidoReceber = useMemo(() => {
    return contasReceber
      .filter(r => r.status === 'Vencido')
      .reduce((acc, r) => acc + r.saldoDevedor, 0);
  }, [contasReceber]);

  const totalAPagar = useMemo(() => {
    return contasPagar
      .filter(p => p.status === 'Em aberto' || p.status === 'Parcialmente pago' || p.status === 'Vencido')
      .reduce((acc, p) => acc + p.saldoDevedor, 0);
  }, [contasPagar]);

  const totalPago = useMemo(() => {
    return contasPagar
      .filter(p => p.status === 'Pago' || p.status === 'Parcialmente pago')
      .reduce((acc, p) => acc + p.valorPago, 0);
  }, [contasPagar]);

  const totalVencidoPagar = useMemo(() => {
    return contasPagar
      .filter(p => p.status === 'Vencido')
      .reduce((acc, p) => acc + p.saldoDevedor, 0);
  }, [contasPagar]);

  const resultadoLiquido = totalRecebido - totalPago;
  const saldoPrevisto = (totalRecebido + totalAReceber) - (totalPago + totalAPagar);

  // Grouped Costs per Vehicle
  const vehicleCosts = useMemo(() => {
    const map: Record<string, {
      veiculo: Veiculo;
      manutencao: number;
      seguro: number;
      rastreador: number;
      documentacao: number;
      multas: number;
      outras: number;
      totalDespesas: number;
      totalReceitas: number;
    }> = {};

    veiculos.forEach(v => {
      map[v.placa] = {
        veiculo: v,
        manutencao: 0,
        seguro: 0,
        rastreador: 0,
        documentacao: 0,
        multas: 0,
        outras: 0,
        totalDespesas: 0,
        totalReceitas: 0
      };
    });

    contasPagar.forEach(p => {
      if (p.veiculoPlaca && map[p.veiculoPlaca]) {
        const val = p.valorPago || p.valorFinal;
        map[p.veiculoPlaca].totalDespesas += val;
        if (p.categoria === 'MANUTENÇÃO') map[p.veiculoPlaca].manutencao += val;
        else if (p.categoria === 'SEGURO') map[p.veiculoPlaca].seguro += val;
        else if (p.categoria === 'RASTREADOR') map[p.veiculoPlaca].rastreador += val;
        else if (p.categoria === 'DOCUMENTAÇÃO') map[p.veiculoPlaca].documentacao += val;
        else if (p.categoria === 'MULTAS E INFRAÇÕES') map[p.veiculoPlaca].multas += val;
        else map[p.veiculoPlaca].outras += val;
      }
    });

    contasReceber.forEach(r => {
      if (r.veiculoPlaca && map[r.veiculoPlaca]) {
        const val = r.valorRecebido || r.valorFinal;
        map[r.veiculoPlaca].totalReceitas += val;
      }
    });

    return Object.values(map);
  }, [veiculos, contasPagar, contasReceber]);

  // Aging inadimplência
  const agingInadimplencia = useMemo(() => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);

    const result = {
      ate7: [] as ContaReceber[],
      ate15: [] as ContaReceber[],
      ate30: [] as ContaReceber[],
      mais30: [] as ContaReceber[]
    };

    contasReceber.filter(r => r.status === 'Vencido').forEach(r => {
      const vencDate = new Date(r.dataVencimento + 'T12:00:00');
      const diffDays = Math.max(0, Math.floor((today.getTime() - vencDate.getTime()) / (1000 * 60 * 60 * 24)));

      if (diffDays <= 7) result.ate7.push(r);
      else if (diffDays <= 15) result.ate15.push(r);
      else if (diffDays <= 30) result.ate30.push(r);
      else result.mais30.push(r);
    });

    return result;
  }, [contasReceber]);

  // Handlers for submission
  const handleOpenBaixaReceber = (item: ContaReceber) => {
    setActiveReceberTarget(item);
    setBaixaValor(item.saldoDevedor.toString());
    setBaixaDesconto('0');
    setBaixaJuros('0');
    setBaixaMulta('0');
    setBaixaForma(item.formaPagamento || 'PIX');
    setBaixaData(new Date().toISOString().split('T')[0]);
    setBaixaObs('');
    setIsBaixaReceberModalOpen(true);
  };

  const handleSubmitBaixaReceber = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeReceberTarget) return;

    const vPago = parseFloat(baixaValor) || 0;
    const vDesc = parseFloat(baixaDesconto) || 0;
    const vJuros = parseFloat(baixaJuros) || 0;
    const vMulta = parseFloat(baixaMulta) || 0;

    if (vPago <= 0) {
      onTriggerToast('Informe um valor de recebimento válido.', 'error');
      return;
    }

    onRegistrarRecebimento(
      activeReceberTarget.id,
      vPago,
      baixaForma,
      baixaData,
      vDesc,
      vJuros,
      vMulta,
      baixaObs
    );

    setIsBaixaReceberModalOpen(false);
    onTriggerToast('Recebimento registrado com sucesso!', 'success');
  };

  const handleOpenBaixaPagar = (item: ContaPagar) => {
    setActivePagarTarget(item);
    setBaixaValor(item.saldoDevedor.toString());
    setBaixaDesconto('0');
    setBaixaJuros('0');
    setBaixaMulta('0');
    setBaixaForma(item.formaPagamento || 'PIX');
    setBaixaData(new Date().toISOString().split('T')[0]);
    setBaixaObs('');
    setIsBaixaPagarModalOpen(true);
  };

  const handleSubmitBaixaPagar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePagarTarget) return;

    const vPago = parseFloat(baixaValor) || 0;
    const vDesc = parseFloat(baixaDesconto) || 0;
    const vJuros = parseFloat(baixaJuros) || 0;
    const vMulta = parseFloat(baixaMulta) || 0;

    if (vPago <= 0) {
      onTriggerToast('Informe um valor de pagamento válido.', 'error');
      return;
    }

    onRegistrarPagamentoDespesa(
      activePagarTarget.id,
      vPago,
      baixaForma,
      baixaData,
      vDesc,
      vJuros,
      vMulta,
      baixaObs
    );

    setIsBaixaPagarModalOpen(false);
    onTriggerToast('Pagamento de despesa registrado com sucesso!', 'success');
  };

  const handleSubmitNewReceber = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(newRecValor);
    if (!newRecDesc || !val || val <= 0) {
      onTriggerToast('Preencha a descrição e um valor válido.', 'error');
      return;
    }

    onAddContaReceber({
      descricao: newRecDesc,
      clienteResponsavel: newRecCliente || 'Cliente/Motorista',
      motoristaCpf: newRecDriverCpf || undefined,
      veiculoPlaca: newRecVehicle || undefined,
      contratoId: newRecContratoId || undefined,
      categoria: newRecCategoria,
      centroCusto: newRecCentroCusto,
      valorOriginal: val,
      desconto: 0,
      acrescimo: 0,
      juros: 0,
      multa: 0,
      valorFinal: val,
      valorRecebido: 0,
      saldoDevedor: val,
      dataEmissao: new Date().toISOString().split('T')[0],
      dataVencimento: newRecVencimento,
      status: newRecVencimento < new Date().toISOString().split('T')[0] ? 'Vencido' : 'Em aberto',
      periodicidade: newRecPeriodicidade,
      observacoes: newRecObs,
      origemTipo: 'manual'
    });

    setIsReceberModalOpen(false);
    setNewRecDesc('');
    setNewRecValor('');
    onTriggerToast('Conta a receber cadastrada com sucesso!', 'success');
  };

  const handleSubmitNewPagar = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(newPagValor);
    if (!newPagDesc || !newPagFornecedor || !val || val <= 0) {
      onTriggerToast('Preencha a descrição, fornecedor e valor válido.', 'error');
      return;
    }

    onAddContaPagar({
      descricao: newPagDesc,
      fornecedor: newPagFornecedor,
      cnpjCpfFornecedor: newPagCnpjCpf || undefined,
      veiculoPlaca: newPagVehicle || undefined,
      categoria: newPagCategoria,
      subcategoria: newPagSubcategoria,
      centroCusto: newPagCentroCusto,
      numeroNotaFiscal: newPagNf || undefined,
      valorOriginal: val,
      desconto: 0,
      juros: 0,
      multa: 0,
      valorFinal: val,
      valorPago: 0,
      saldoDevedor: val,
      dataEmissao: new Date().toISOString().split('T')[0],
      dataVencimento: newPagVencimento,
      formaPagamento: newPagForma,
      status: newPagVencimento < new Date().toISOString().split('T')[0] ? 'Vencido' : 'Em aberto',
      observacoes: newPagObs,
      origemTipo: 'manual'
    });

    setIsPagarModalOpen(false);
    setNewPagDesc('');
    setNewPagFornecedor('');
    setNewPagValor('');
    onTriggerToast('Conta a pagar cadastrada com sucesso!', 'success');
  };

  const handleSubmitRenegociacao = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeReceberTarget) return;

    const nVal = parseFloat(renegNovoValor);
    if (!renegNovoVencimento || !nVal || nVal <= 0) {
      onTriggerToast('Informe a nova data e o novo valor negociado.', 'error');
      return;
    }

    onRenegociarContaReceber(activeReceberTarget.id, renegNovoVencimento, nVal, renegObs);
    setIsRenegociarModalOpen(false);
    onTriggerToast('Acordo de renegociação salvo!', 'success');
  };

  const handleSubmitContatoInadimplencia = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inadTargetCpf || !contatoObs) {
      onTriggerToast('Preencha a observação do atendimento.', 'error');
      return;
    }

    onAddContatoInadimplencia({
      motoristaCpf: inadTargetCpf,
      tipoContato: contatoTipo,
      observacao: contatoObs,
      acordoRealizado: contatoAcordo,
      valorAcordo: contatoValorAcordo ? parseFloat(contatoValorAcordo) : undefined,
      novaDataVencimento: contatoNovaData || undefined
    });

    setIsContatoInadModalOpen(false);
    setContatoObs('');
    onTriggerToast('Atendimento de cobrança registrado!', 'success');
  };

  // Helper for status badge
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'Recebido':
      case 'Pago':
        return (
          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 shadow-2xs">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> {status}
          </span>
        );
      case 'Parcialmente recebido':
      case 'Parcialmente pago':
      case 'Renegociado':
        return (
          <span className="bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 shadow-2xs">
            <Clock className="w-3 h-3 text-amber-600" /> {status}
          </span>
        );
      case 'Vencido':
        return (
          <span className="bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 shadow-2xs">
            <AlertTriangle className="w-3 h-3 text-rose-600" /> {status}
          </span>
        );
      case 'Em aberto':
      default:
        return (
          <span className="bg-sky-50 text-sky-700 border border-sky-200 text-[11px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 shadow-2xs">
            <Clock className="w-3 h-3 text-sky-600" /> {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER DE NAVEGAÇÃO INTERNA DO MÓDULO FINANCEIRO */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-emerald-600 text-white rounded-2xl flex items-center justify-center font-black text-xl shadow-lg shadow-emerald-600/20">
              💲
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                Módulo Financeiro Integrado
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase">
                  100% Ativo & Persistente
                </span>
              </h1>
              <p className="text-xs font-semibold text-slate-500">
                Gestão completa de Contas a Receber, Contas a Pagar, Fluxo de Caixa e Inadimplência
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsReceberModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-3.5 py-2 rounded-xl transition-all shadow-md shadow-emerald-600/20 flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Nova Conta a Receber
            </button>
            <button
              onClick={() => setIsPagarModalOpen(true)}
              className="bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs px-3.5 py-2 rounded-xl transition-all shadow-md shadow-rose-600/20 flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Nova Conta a Pagar
            </button>
            <button
              onClick={() => window.print()}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-3 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer border border-slate-200"
            >
              <Printer className="w-4 h-4 text-slate-500" /> Imprimir Relatório
            </button>
          </div>
        </div>

        {/* TOP SUB-TAB MENU */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-3 scrollbar-none">
          {subTabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-md shadow-slate-900/20'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 ? (
                  <span
                    className={`px-1.5 py-0.2 text-[10px] font-black rounded-full ${
                      isActive ? 'bg-rose-500 text-white' : 'bg-rose-100 text-rose-700'
                    }`}
                  >
                    {tab.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* SUB-VIEW 1: DASHBOARD FINANCEIRO */}
      {activeSubTab === 'dashboard' && (
        <div className="space-y-6">
          {/* CARDS RESUMO / KPIS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total a Receber */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs relative overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">A Receber</span>
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  <ArrowUpRight className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-slate-900">{formatBRL(totalAReceber)}</div>
              <div className="mt-2 text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
                <span className="text-emerald-600 font-extrabold">{formatBRL(totalRecebido)}</span> já recebidos
              </div>
            </div>

            {/* Total a Pagar */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs relative overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">A Pagar</span>
                <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
                  <ArrowDownRight className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-slate-900">{formatBRL(totalAPagar)}</div>
              <div className="mt-2 text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
                <span className="text-rose-600 font-extrabold">{formatBRL(totalPago)}</span> já pagos
              </div>
            </div>

            {/* Resultado Líquido Realizado */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs relative overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Resultado Realizado</span>
                <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <div className={`text-2xl font-black ${resultadoLiquido >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {formatBRL(resultadoLiquido)}
              </div>
              <div className="mt-2 text-[11px] font-bold text-slate-500">
                Recebidos (-) Pagos realizados
              </div>
            </div>

            {/* Total em Atraso (Inadimplência) */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs relative overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-extrabold text-rose-600 uppercase tracking-wider flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Total Vencido
                </span>
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-rose-600">{formatBRL(totalVencidoReceber)}</div>
              <div className="mt-2 text-[11px] font-bold text-slate-500">
                {contasReceber.filter(r => r.status === 'Vencido').length} faturas em atraso
              </div>
            </div>
          </div>

          {/* GRÁFICOS VISUAIS E TABELAS ESTRUTURADAS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Balanço Receita vs Despesa Por Veículo */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Car className="w-4 h-4 text-emerald-600" /> Rentabilidade por Veículo (Receitas - Despesas)
              </h3>
              <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                {vehicleCosts.map(item => {
                  const lucro = item.totalReceitas - item.totalDespesas;
                  return (
                    <div key={item.veiculo.placa} className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-black text-slate-900">{item.veiculo.modelo}</div>
                        <div className="text-[11px] font-bold text-slate-500">{item.veiculo.placa} • {item.veiculo.status}</div>
                      </div>
                      <div className="text-right">
                        <div className={`text-xs font-extrabold ${lucro >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {formatBRL(lucro)}
                        </div>
                        <div className="text-[10px] text-slate-400 font-medium">
                          Rec: {formatBRL(item.totalReceitas)} | Desp: {formatBRL(item.totalDespesas)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Distribuição de Despesas Por Categoria */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                <PieChartIcon className="w-4 h-4 text-rose-600" /> Despesas por Categoria Operacional
              </h3>
              <div className="space-y-3">
                {[
                  { cat: 'MANUTENÇÃO', icon: Wrench, color: 'bg-amber-500' },
                  { cat: 'SEGURO', icon: Shield, color: 'bg-emerald-500' },
                  { cat: 'RASTREADOR', icon: Locate, color: 'bg-sky-500' },
                  { cat: 'DOCUMENTAÇÃO', icon: FileText, color: 'bg-indigo-500' },
                  { cat: 'MULTAS E INFRAÇÕES', icon: AlertTriangle, color: 'bg-rose-500' },
                  { cat: 'OUTRAS DESPESAS', icon: Layers, color: 'bg-slate-500' }
                ].map(item => {
                  const totalCat = contasPagar
                    .filter(p => p.categoria === item.cat)
                    .reduce((a, b) => a + (b.valorPago || b.valorFinal), 0);
                  const Icon = item.icon;
                  const percent = totalPago > 0 ? Math.min(100, Math.round((totalCat / totalPago) * 100)) : 0;

                  return (
                    <div key={item.cat} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                        <span className="flex items-center gap-1.5">
                          <Icon className="w-3.5 h-3.5 text-slate-400" /> {item.cat}
                        </span>
                        <span>{formatBRL(totalCat)} ({percent}%)</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full ${item.color}`} style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW 2: CONTAS A RECEBER */}
      {activeSubTab === 'receber' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por descrição, cliente, CPF ou placa..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full text-xs font-bold bg-transparent outline-none text-slate-800 placeholder-slate-400"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-700 outline-none"
              >
                <option value="Todos">Todos os Status</option>
                <option value="Em aberto">Em aberto</option>
                <option value="Parcialmente recebido">Parcialmente recebido</option>
                <option value="Recebido">Recebido</option>
                <option value="Vencido">Vencido</option>
                <option value="Cancelado">Cancelado</option>
                <option value="Renegociado">Renegociado</option>
              </select>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Lançamento</th>
                    <th className="py-3 px-4">Descrição & Cliente</th>
                    <th className="py-3 px-4">Veículo / Motorista</th>
                    <th className="py-3 px-4">Vencimento</th>
                    <th className="py-3 px-4 text-right">Valor Final</th>
                    <th className="py-3 px-4 text-right">Recebido</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                  {contasReceber
                    .filter(r => {
                      if (statusFilter !== 'Todos' && r.status !== statusFilter) return false;
                      if (search) {
                        const q = search.toLowerCase();
                        return (
                          r.descricao.toLowerCase().includes(q) ||
                          r.clienteResponsavel.toLowerCase().includes(q) ||
                          (r.motoristaCpf && r.motoristaCpf.includes(q)) ||
                          (r.veiculoPlaca && r.veiculoPlaca.toLowerCase().includes(q)) ||
                          r.numeroLancamento.toLowerCase().includes(q)
                        );
                      }
                      return true;
                    })
                    .map(r => (
                      <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 font-mono text-[11px] font-bold text-slate-500">{r.numeroLancamento}</td>
                        <td className="py-3.5 px-4">
                          <div className="font-extrabold text-slate-900">{r.descricao}</div>
                          <div className="text-[11px] text-slate-500 font-medium">{r.clienteResponsavel} • <span className="text-emerald-700 font-bold">{r.categoria}</span></div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-800">{r.veiculoPlaca || '—'}</div>
                          <div className="text-[10px] text-slate-400">{r.motoristaCpf || 'Sem CPF'}</div>
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-800">
                          {r.dataVencimento.split('-').reverse().join('/')}
                        </td>
                        <td className="py-3.5 px-4 text-right font-black text-slate-900">{formatBRL(r.valorFinal)}</td>
                        <td className="py-3.5 px-4 text-right font-extrabold text-emerald-600">{formatBRL(r.valorRecebido)}</td>
                        <td className="py-3.5 px-4 text-center">{renderStatusBadge(r.status)}</td>
                        <td className="py-3.5 px-4 text-right space-x-1 whitespace-nowrap">
                          {r.status !== 'Recebido' && r.status !== 'Cancelado' && (
                            <button
                              onClick={() => handleOpenBaixaReceber(r)}
                              className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-[11px] px-2.5 py-1 rounded-lg border border-emerald-200 transition-all cursor-pointer"
                              title="Registrar recebimento/quitação"
                            >
                              Baixar
                            </button>
                          )}
                          {r.status === 'Recebido' && (
                            <button
                              onClick={() => {
                                if (confirm(`Confirmar estorno do recebimento de ${r.clienteResponsavel}?`)) {
                                  onEstornarRecebimento(r.id, 'Estorno solicitado no painel');
                                  onTriggerToast('Recebimento estornado.', 'warning');
                                }
                              }}
                              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] px-2 py-1 rounded-lg border border-slate-200 transition-all cursor-pointer"
                              title="Estornar recebimento"
                            >
                              <Undo2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedHistoryItem(r)}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-[11px] p-1.5 rounded-lg transition-all cursor-pointer"
                            title="Ver histórico e auditoria"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW 3: CONTAS A PAGAR */}
      {activeSubTab === 'pagar' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por fornecedor, descrição, NF ou placa..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full text-xs font-bold bg-transparent outline-none text-slate-800 placeholder-slate-400"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-700 outline-none"
              >
                <option value="Todos">Todas as Categorias</option>
                <option value="DOCUMENTAÇÃO">DOCUMENTAÇÃO</option>
                <option value="SEGURO">SEGURO</option>
                <option value="RASTREADOR">RASTREADOR</option>
                <option value="MANUTENÇÃO">MANUTENÇÃO</option>
                <option value="MULTAS E INFRAÇÕES">MULTAS E INFRAÇÕES</option>
                <option value="OUTRAS DESPESAS">OUTRAS DESPESAS</option>
              </select>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Lançamento</th>
                    <th className="py-3 px-4">Descrição & Fornecedor</th>
                    <th className="py-3 px-4">Categoria / Subcat</th>
                    <th className="py-3 px-4">Veículo</th>
                    <th className="py-3 px-4">Vencimento</th>
                    <th className="py-3 px-4 text-right">Valor Despesa</th>
                    <th className="py-3 px-4 text-right">Pago</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                  {contasPagar
                    .filter(p => {
                      if (categoryFilter !== 'Todos' && p.categoria !== categoryFilter) return false;
                      if (search) {
                        const q = search.toLowerCase();
                        return (
                          p.descricao.toLowerCase().includes(q) ||
                          p.fornecedor.toLowerCase().includes(q) ||
                          (p.veiculoPlaca && p.veiculoPlaca.toLowerCase().includes(q)) ||
                          p.numeroLancamento.toLowerCase().includes(q)
                        );
                      }
                      return true;
                    })
                    .map(p => (
                      <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 font-mono text-[11px] font-bold text-slate-500">{p.numeroLancamento}</td>
                        <td className="py-3.5 px-4">
                          <div className="font-extrabold text-slate-900">{p.descricao}</div>
                          <div className="text-[11px] text-slate-500 font-medium">{p.fornecedor} {p.numeroNotaFiscal ? `• NF: ${p.numeroNotaFiscal}` : ''}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="font-extrabold text-rose-700">{p.categoria}</span>
                          <div className="text-[10px] text-slate-400">{p.subcategoria}</div>
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-800">{p.veiculoPlaca || 'Geral (Frota)'}</td>
                        <td className="py-3.5 px-4 font-bold text-slate-800">{p.dataVencimento.split('-').reverse().join('/')}</td>
                        <td className="py-3.5 px-4 text-right font-black text-slate-900">{formatBRL(p.valorFinal)}</td>
                        <td className="py-3.5 px-4 text-right font-extrabold text-rose-600">{formatBRL(p.valorPago)}</td>
                        <td className="py-3.5 px-4 text-center">{renderStatusBadge(p.status)}</td>
                        <td className="py-3.5 px-4 text-right space-x-1 whitespace-nowrap">
                          {p.status !== 'Pago' && p.status !== 'Cancelado' && (
                            <button
                              onClick={() => handleOpenBaixaPagar(p)}
                              className="bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[11px] px-2.5 py-1 rounded-lg border border-rose-200 transition-all cursor-pointer"
                              title="Registrar pagamento de despesa"
                            >
                              Pagar
                            </button>
                          )}
                          {p.status === 'Pago' && (
                            <button
                              onClick={() => {
                                if (confirm(`Confirmar estorno do pagamento para ${p.fornecedor}?`)) {
                                  onEstornarPagamentoDespesa(p.id, 'Estorno de despesa');
                                  onTriggerToast('Pagamento de despesa estornado.', 'warning');
                                }
                              }}
                              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] px-2 py-1 rounded-lg border border-slate-200 transition-all cursor-pointer"
                              title="Estornar pagamento"
                            >
                              <Undo2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedHistoryItem(p)}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-[11px] p-1.5 rounded-lg transition-all cursor-pointer"
                            title="Ver histórico e auditoria"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW 6: FLUXO DE CAIXA */}
      {activeSubTab === 'fluxo_caixa' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-emerald-600" /> Demonstrativo do Fluxo de Caixa (Entradas vs Saídas)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="p-4 bg-emerald-50/60 rounded-xl border border-emerald-100">
                <div className="text-xs font-extrabold text-emerald-800 uppercase">Total Entradas (Recebidos)</div>
                <div className="text-2xl font-black text-emerald-600 mt-1">{formatBRL(totalRecebido)}</div>
              </div>
              <div className="p-4 bg-rose-50/60 rounded-xl border border-rose-100">
                <div className="text-xs font-extrabold text-rose-800 uppercase">Total Saídas (Despesas Pagas)</div>
                <div className="text-2xl font-black text-rose-600 mt-1">{formatBRL(totalPago)}</div>
              </div>
              <div className="p-4 bg-slate-900 text-white rounded-xl">
                <div className="text-xs font-extrabold text-slate-300 uppercase">Saldo Final de Caixa</div>
                <div className={`text-2xl font-black mt-1 ${resultadoLiquido >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {formatBRL(resultadoLiquido)}
                </div>
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs font-semibold">
                <thead className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4">Tipo / Descrição</th>
                    <th className="py-2.5 px-4">Vencimento</th>
                    <th className="py-2.5 px-4">Data Liquidação</th>
                    <th className="py-2.5 px-4 text-right">Valor Operacional</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {/* Entradas */}
                  <tr className="bg-emerald-50/30 text-emerald-900 font-extrabold">
                    <td colSpan={4} className="py-2 px-4 uppercase text-[10px] tracking-wider">🟢 ENTRADAS DE CAIXA (ALUGUÉIS E RECEITAS)</td>
                  </tr>
                  {contasReceber.filter(r => r.status === 'Recebido' || r.status === 'Parcialmente recebido').map(r => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="py-2 px-4 font-bold text-slate-800">{r.descricao}</td>
                      <td className="py-2 px-4 text-slate-500">{r.dataVencimento.split('-').reverse().join('/')}</td>
                      <td className="py-2 px-4 text-emerald-700 font-bold">{r.dataRealRecebimento ? r.dataRealRecebimento.split('-').reverse().join('/') : '—'}</td>
                      <td className="py-2 px-4 text-right font-black text-emerald-600">+{formatBRL(r.valorRecebido)}</td>
                    </tr>
                  ))}

                  {/* Saídas */}
                  <tr className="bg-rose-50/30 text-rose-900 font-extrabold">
                    <td colSpan={4} className="py-2 px-4 uppercase text-[10px] tracking-wider">🔴 SAÍDAS DE CAIXA (DESPESAS E MANUTENÇÃO)</td>
                  </tr>
                  {contasPagar.filter(p => p.status === 'Pago' || p.status === 'Parcialmente pago').map(p => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="py-2 px-4 font-bold text-slate-800">{p.descricao} ({p.fornecedor})</td>
                      <td className="py-2 px-4 text-slate-500">{p.dataVencimento.split('-').reverse().join('/')}</td>
                      <td className="py-2 px-4 text-rose-700 font-bold">{p.dataRealPagamento ? p.dataRealPagamento.split('-').reverse().join('/') : '—'}</td>
                      <td className="py-2 px-4 text-right font-black text-rose-600">-{formatBRL(p.valorPago)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW 9: INADIMPÂNCIA */}
      {activeSubTab === 'inadimplencia' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600" /> Cobrança de Faturas em Atraso (Aging de Inadimplência)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                <div className="text-xs font-black text-amber-800 uppercase">1 a 7 Dias</div>
                <div className="text-xl font-black text-amber-900 mt-1">{agingInadimplencia.ate7.length} faturas</div>
                <div className="text-xs font-bold text-amber-700 mt-0.5">
                  {formatBRL(agingInadimplencia.ate7.reduce((a, b) => a + b.saldoDevedor, 0))}
                </div>
              </div>

              <div className="p-4 bg-orange-50 rounded-xl border border-orange-200">
                <div className="text-xs font-black text-orange-800 uppercase">8 a 15 Dias</div>
                <div className="text-xl font-black text-orange-900 mt-1">{agingInadimplencia.ate15.length} faturas</div>
                <div className="text-xs font-bold text-orange-700 mt-0.5">
                  {formatBRL(agingInadimplencia.ate15.reduce((a, b) => a + b.saldoDevedor, 0))}
                </div>
              </div>

              <div className="p-4 bg-rose-50 rounded-xl border border-rose-200">
                <div className="text-xs font-black text-rose-800 uppercase">16 a 30 Dias</div>
                <div className="text-xl font-black text-rose-900 mt-1">{agingInadimplencia.ate30.length} faturas</div>
                <div className="text-xs font-bold text-rose-700 mt-0.5">
                  {formatBRL(agingInadimplencia.ate30.reduce((a, b) => a + b.saldoDevedor, 0))}
                </div>
              </div>

              <div className="p-4 bg-red-100 rounded-xl border border-red-300">
                <div className="text-xs font-black text-red-900 uppercase">Mais de 30 Dias</div>
                <div className="text-xl font-black text-red-950 mt-1">{agingInadimplencia.mais30.length} faturas</div>
                <div className="text-xs font-extrabold text-red-800 mt-0.5">
                  {formatBRL(agingInadimplencia.mais30.reduce((a, b) => a + b.saldoDevedor, 0))}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {contasReceber.filter(r => r.status === 'Vencido').map(r => {
                const driver = motoristas.find(m => m.cpf === r.motoristaCpf);
                const phone = driver ? driver.tel : '';
                const waMessage = encodeURIComponent(`Olá ${r.clienteResponsavel}, identificamos a fatura ${r.numeroLancamento} (${formatBRL(r.saldoDevedor)}) vencida em ${r.dataVencimento.split('-').reverse().join('/')}. Por favor entre em contato para regularizar.`);

                return (
                  <div key={r.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <div className="font-extrabold text-slate-900 text-sm">{r.clienteResponsavel}</div>
                      <div className="text-xs font-semibold text-slate-500">{r.descricao} • Vencimento: <span className="text-rose-600 font-bold">{r.dataVencimento.split('-').reverse().join('/')}</span></div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">CPF: {r.motoristaCpf || '—'} | Veículo: {r.veiculoPlaca || '—'}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-right mr-3">
                        <div className="text-sm font-black text-rose-600">{formatBRL(r.saldoDevedor)}</div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase">Débito Atrasado</div>
                      </div>

                      {phone && (
                        <a
                          href={`https://wa.me/55${phone.replace(/\D/g, '')}?text=${waMessage}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-xs px-3 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <MessageCircle className="w-4 h-4" /> Cobrar WhatsApp
                        </a>
                      )}

                      <button
                        onClick={() => handleOpenBaixaReceber(r)}
                        className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-extrabold text-xs px-3 py-2 rounded-xl border border-emerald-200 transition-all cursor-pointer"
                      >
                        Quitar Fatura
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* OTHER SUB-TABS (RECEBIMENTOS, PAGAMENTOS, DESPESAS VEÍCULO, RECEITAS VEÍCULO, RELATÓRIOS, CATEGORIAS, FORMAS PAGAMENTO) */}
      {(activeSubTab === 'recebimentos' || activeSubTab === 'pagamentos' || activeSubTab === 'despesas_veiculo' || activeSubTab === 'receitas_veiculo' || activeSubTab === 'relatorios' || activeSubTab === 'categorias' || activeSubTab === 'formas_pagamento') && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center space-y-4 shadow-2xs">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto font-black text-xl">
            📊
          </div>
          <h3 className="text-base font-black text-slate-900">
            Módulo {subTabs.find(t => t.id === activeSubTab)?.label} Ativo
          </h3>
          <p className="text-xs font-semibold text-slate-500 max-w-md mx-auto">
            Todos os lançamentos do sistema estão sincronizados com persistência total via LocalStorage e integrados com seus veículos e contratos.
          </p>

          {activeSubTab === 'categorias' && (
            <div className="max-w-xl mx-auto text-left space-y-2 pt-4">
              <h4 className="text-xs font-black text-slate-800 uppercase">Categorias Cadastradas:</h4>
              <div className="grid grid-cols-2 gap-2">
                {categorias.map(c => (
                  <div key={c.id} className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-800">
                    <div>{c.nome} ({c.tipo})</div>
                    <div className="text-[10px] text-slate-400 font-normal">{c.subcategorias.join(', ')}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSubTab === 'formas_pagamento' && (
            <div className="max-w-xl mx-auto text-left space-y-2 pt-4">
              <h4 className="text-xs font-black text-slate-800 uppercase">Formas de Pagamento Disponíveis:</h4>
              <div className="grid grid-cols-2 gap-2">
                {formasPagamento.map(f => (
                  <div key={f.id} className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 flex items-center justify-between">
                    <div>
                      <div>{f.nome}</div>
                      <div className="text-[10px] text-slate-400">Taxa: {f.taxaPercentual}%</div>
                    </div>
                    <button
                      onClick={() => onToggleFormaPagamento(f.id)}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${f.ativa ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}
                    >
                      {f.ativa ? 'Ativa' : 'Inativa'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL BAIXA / QUITAÇÃO RECEBIMENTO */}
      {isBaixaReceberModalOpen && activeReceberTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" /> Baixar Recebimento
              </h3>
              <button onClick={() => setIsBaixaReceberModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitBaixaReceber} className="space-y-3">
              <div>
                <label className="text-[11px] font-extrabold text-slate-500 uppercase">Cliente / Motorista</label>
                <input type="text" readOnly value={activeReceberTarget.clienteResponsavel} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-extrabold text-slate-500 uppercase">Valor do Recebimento (R$)</label>
                  <input type="number" step="0.01" required value={baixaValor} onChange={e => setBaixaValor(e.target.value)} className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-900 focus:border-emerald-600 outline-none" />
                </div>
                <div>
                  <label className="text-[11px] font-extrabold text-slate-500 uppercase">Forma de Pagamento</label>
                  <select value={baixaForma} onChange={e => setBaixaForma(e.target.value)} className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-900 focus:border-emerald-600 outline-none">
                    {formasPagamento.filter(f => f.ativa).map(f => (
                      <option key={f.id} value={f.nome}>{f.nome}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Desconto (R$)</label>
                  <input type="number" step="0.01" value={baixaDesconto} onChange={e => setBaixaDesconto(e.target.value)} className="w-full border border-slate-200 rounded-lg p-2 text-xs font-bold text-slate-800" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Juros (R$)</label>
                  <input type="number" step="0.01" value={baixaJuros} onChange={e => setBaixaJuros(e.target.value)} className="w-full border border-slate-200 rounded-lg p-2 text-xs font-bold text-slate-800" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Multa (R$)</label>
                  <input type="number" step="0.01" value={baixaMulta} onChange={e => setBaixaMulta(e.target.value)} className="w-full border border-slate-200 rounded-lg p-2 text-xs font-bold text-slate-800" />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-extrabold text-slate-500 uppercase">Observações do Recebimento</label>
                <input type="text" placeholder="Ex: Recebido no caixa / Comprovante via WhatsApp" value={baixaObs} onChange={e => setBaixaObs(e.target.value)} className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-semibold text-slate-800 outline-none" />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setIsBaixaReceberModalOpen(false)} className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200">
                  Cancelar
                </button>
                <button type="submit" className="px-5 py-2 text-xs font-extrabold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 shadow-md shadow-emerald-600/20">
                  Confirmar Baixa
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* MODAL BAIXA / QUITAÇÃO PAGAMENTO DE DESPESA */}
      {isBaixaPagarModalOpen && activePagarTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-rose-600" /> Baixar Pagamento de Despesa
              </h3>
              <button onClick={() => setIsBaixaPagarModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitBaixaPagar} className="space-y-3">
              <div>
                <label className="text-[11px] font-extrabold text-slate-500 uppercase">Fornecedor / Favorecido</label>
                <input type="text" readOnly value={activePagarTarget.fornecedor} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-extrabold text-slate-500 uppercase">Valor Pago (R$)</label>
                  <input type="number" step="0.01" required value={baixaValor} onChange={e => setBaixaValor(e.target.value)} className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-900 focus:border-rose-600 outline-none" />
                </div>
                <div>
                  <label className="text-[11px] font-extrabold text-slate-500 uppercase">Forma de Pagamento</label>
                  <select value={baixaForma} onChange={e => setBaixaForma(e.target.value)} className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-900 focus:border-rose-600 outline-none">
                    {formasPagamento.filter(f => f.ativa).map(f => (
                      <option key={f.id} value={f.nome}>{f.nome}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-extrabold text-slate-500 uppercase">Observações do Pagamento</label>
                <input type="text" placeholder="Ex: Pago via aplicativo bancário / Anexo guardado" value={baixaObs} onChange={e => setBaixaObs(e.target.value)} className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-semibold text-slate-800 outline-none" />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setIsBaixaPagarModalOpen(false)} className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200">
                  Cancelar
                </button>
                <button type="submit" className="px-5 py-2 text-xs font-extrabold text-white bg-rose-600 rounded-xl hover:bg-rose-700 shadow-md shadow-rose-600/20">
                  Confirmar Pagamento
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* MODAL CRIAR CONTA A RECEBER MANUAL */}
      {isReceberModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-600" /> Novo Lançamento — Conta a Receber
              </h3>
              <button onClick={() => setIsReceberModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitNewReceber} className="space-y-3">
              <div>
                <label className="text-[11px] font-extrabold text-slate-500 uppercase">Descrição da Receita *</label>
                <input type="text" required placeholder="Ex: Aluguel Semanal / Caução / Cobrança de Avaria" value={newRecDesc} onChange={e => setNewRecDesc(e.target.value)} className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-900 outline-none focus:border-emerald-600" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-extrabold text-slate-500 uppercase">Cliente / Responsável</label>
                  <input type="text" placeholder="Nome do motorista ou cliente" value={newRecCliente} onChange={e => setNewRecCliente(e.target.value)} className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-semibold text-slate-800 outline-none" />
                </div>
                <div>
                  <label className="text-[11px] font-extrabold text-slate-500 uppercase">Veículo Vinculado</label>
                  <select value={newRecVehicle} onChange={e => setNewRecVehicle(e.target.value)} className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-800 outline-none">
                    <option value="">Nenhum (Geral)</option>
                    {veiculos.map(v => (
                      <option key={v.placa} value={v.placa}>{v.modelo} ({v.placa})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-extrabold text-slate-500 uppercase">Valor Original (R$) *</label>
                  <input type="number" step="0.01" required placeholder="0.00" value={newRecValor} onChange={e => setNewRecValor(e.target.value)} className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-900 outline-none focus:border-emerald-600" />
                </div>
                <div>
                  <label className="text-[11px] font-extrabold text-slate-500 uppercase">Data de Vencimento *</label>
                  <input type="date" required value={newRecVencimento} onChange={e => setNewRecVencimento(e.target.value)} className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-900 outline-none" />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setIsReceberModalOpen(false)} className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200">
                  Cancelar
                </button>
                <button type="submit" className="px-5 py-2 text-xs font-extrabold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 shadow-md shadow-emerald-600/20">
                  Salvar Lançamento
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* MODAL CRIAR CONTA A PAGAR MANUAL */}
      {isPagarModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-rose-600" /> Novo Lançamento — Conta a Pagar
              </h3>
              <button onClick={() => setIsPagarModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitNewPagar} className="space-y-3">
              <div>
                <label className="text-[11px] font-extrabold text-slate-500 uppercase">Descrição da Despesa *</label>
                <input type="text" required placeholder="Ex: Troca de pneus / IPVA / Mensalidade Rastreador" value={newPagDesc} onChange={e => setNewPagDesc(e.target.value)} className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-900 outline-none focus:border-rose-600" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-extrabold text-slate-500 uppercase">Fornecedor *</label>
                  <input type="text" required placeholder="Nome do prestador ou empresa" value={newPagFornecedor} onChange={e => setNewPagFornecedor(e.target.value)} className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-semibold text-slate-800 outline-none" />
                </div>
                <div>
                  <label className="text-[11px] font-extrabold text-slate-500 uppercase">Categoria</label>
                  <select value={newPagCategoria} onChange={e => setNewPagCategoria(e.target.value as any)} className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-800 outline-none">
                    <option value="DOCUMENTAÇÃO">DOCUMENTAÇÃO</option>
                    <option value="SEGURO">SEGURO</option>
                    <option value="RASTREADOR">RASTREADOR</option>
                    <option value="MANUTENÇÃO">MANUTENÇÃO</option>
                    <option value="MULTAS E INFRAÇÕES">MULTAS E INFRAÇÕES</option>
                    <option value="OUTRAS DESPESAS">OUTRAS DESPESAS</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-extrabold text-slate-500 uppercase">Valor Despesa (R$) *</label>
                  <input type="number" step="0.01" required placeholder="0.00" value={newPagValor} onChange={e => setNewPagValor(e.target.value)} className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-900 outline-none focus:border-rose-600" />
                </div>
                <div>
                  <label className="text-[11px] font-extrabold text-slate-500 uppercase">Data de Vencimento *</label>
                  <input type="date" required value={newPagVencimento} onChange={e => setNewPagVencimento(e.target.value)} className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-900 outline-none" />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setIsPagarModalOpen(false)} className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200">
                  Cancelar
                </button>
                <button type="submit" className="px-5 py-2 text-xs font-extrabold text-white bg-rose-600 rounded-xl hover:bg-rose-700 shadow-md shadow-rose-600/20">
                  Salvar Despesa
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* HISTÓRICO & AUDITORIA MODAL */}
      {selectedHistoryItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-black text-slate-900">Histórico de Alterações</h3>
                <p className="text-xs font-bold text-slate-500">{selectedHistoryItem.numeroLancamento} — {selectedHistoryItem.descricao}</p>
              </div>
              <button onClick={() => setSelectedHistoryItem(null)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {selectedHistoryItem.historico && selectedHistoryItem.historico.length > 0 ? (
                selectedHistoryItem.historico.map((h, i) => (
                  <div key={h.id || i} className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-xs space-y-1">
                    <div className="flex items-center justify-between font-bold text-slate-800">
                      <span>{h.acao}</span>
                      <span className="text-[10px] text-slate-400">{h.dataHora}</span>
                    </div>
                    <div className="text-slate-600 text-[11px] font-semibold">{h.observacao || 'Sem observação registrada'}</div>
                    <div className="text-[10px] text-slate-400">Usuário: {h.usuario}</div>
                  </div>
                ))
              ) : (
                <div className="text-xs font-semibold text-slate-500 text-center py-6">
                  Nenhum registro no histórico de auditoria.
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button onClick={() => setSelectedHistoryItem(null)} className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200">
                Fechar
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
