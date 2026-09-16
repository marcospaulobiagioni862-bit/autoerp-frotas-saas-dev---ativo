import { GeradorFinanceiroParams } from '../shared/financeiro/types';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileText,
  Search,
  Plus,
  Trash2,
  Pencil,
  X,
  Calendar,
  DollarSign,
  Car,
  User,
  Info,
  AlertTriangle,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { Contrato, Motorista, Veiculo, Manutencao, Pagamento } from '../types';
import { getVehicleMaintenanceAlerts } from '../shared/domain/maintenance';

interface ContratosViewProps {
  contratos: Contrato[];
  motoristas: Motorista[];
  veiculos: Veiculo[];
  manutencoes: Manutencao[];
  pagamentos: Pagamento[];
  onAddContrato: (c: Contrato) => void;
  onEditContrato: (c: Contrato) => void;
  onDeleteContrato: (id: string, motivo: string) => void;
  onTriggerToast: (msg: string, type: 'success' | 'warning' | 'error') => void;
}

export default function ContratosView({
  contratos,
  motoristas,
  veiculos,
  manutencoes,
  pagamentos,
  onAddContrato,
  onEditContrato,
  onDeleteContrato,
  onTriggerToast
}: ContratosViewProps) {
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingContrato, setEditingContrato] = useState<Contrato | null>(null);

  const [finParams, setFinParams] = useState<GeradorFinanceiroParams>({
    tipo: 'Receita',
    modalidade: 'Recorrente',
    valorTotal: 0,
    dataPrimeiroVencimento: new Date().toISOString().split('T')[0],
    formaPagamento: 'PIX',
    observacaoGeral: '',
    qtdParcelas: 12,
    periodicidade: 'Semanal',
    parcelasManuais: [],
    modoDivisao: 'Igual',
    semDataFim: true
  });
  const [pendenciesToConfirm, setPendenciesToConfirm] = useState<{ list: string[]; data: Contrato } | null>(null);
  const [modalActiveTab, setModalActiveTab] = useState<'dados' | 'checklist'>('dados');

  // Archiving and Finish confirmation modal states
  const [archiveTargetId, setArchiveTargetId] = useState<string | null>(null);
  const [archiveMotivo, setArchiveMotivo] = useState('');
  const [finishTarget, setFinishTarget] = useState<Contrato | null>(null);

  // Form states
  const [motoristaCpf, setMotoristaCpf] = useState('');
  const [veiculoPlaca, setVeiculoPlaca] = useState('');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [valor, setValor] = useState('');
  const [diaCobranca, setDiaCobranca] = useState('Segunda-feira');
  const [caucao, setCaucao] = useState('');
  const [kmFranquia, setKmFranquia] = useState('1500');
  const [obs, setObs] = useState('');
  const [status, setStatus] = useState<'Ativo' | 'Suspenso' | 'Finalizado'>('Ativo');
  const [frequencia, setFrequencia] = useState<'Diário' | 'Semanal' | 'Mensal' | 'Anual'>('Semanal');

  // Recurring payment configuration states inside Contract
  const [isRecorrente, setIsRecorrente] = useState(false);
  const [formaPagamento, setFormaPagamento] = useState('PIX');
  const [valorRecorrente, setValorRecorrente] = useState('');
  const [frequenciaRecorrente, setFrequenciaRecorrente] = useState<'Diário' | 'Semanal' | 'Mensal' | 'Anual'>('Mensal');
  const [recorrenteQtd, setRecorrenteQtd] = useState(12);

  const [originalFormStateJson, setOriginalFormStateJson] = useState('');
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);

  const getSerializedFormState = () => {
    return JSON.stringify({
      motoristaCpf,
      veiculoPlaca,
      inicio,
      fim,
      valor: valor.trim(),
      diaCobranca,
      caucao: caucao.trim(),
      kmFranquia: kmFranquia.trim(),
      obs: obs.trim(),
      status,
      frequencia,
      isRecorrente,
      formaPagamento,
      valorRecorrente: valorRecorrente.trim(),
      frequenciaRecorrente,
      recorrenteQtd
    });
  };

  const getSerializedStateFromContrato = (c: Contrato | null, defaultDriverCpf = '', defaultPlaca = '', defaultValor = '') => {
    if (c) {
      return JSON.stringify({
        motoristaCpf: c.motoristaCpf,
        veiculoPlaca: c.veiculoPlaca,
        inicio: c.inicio,
        fim: c.fim || '',
        valor: c.valor.toString().trim(),
        diaCobranca: c.diaCobranca,
        caucao: c.caucao.toString().trim(),
        kmFranquia: c.kmFranquia.toString().trim(),
        obs: (c.obs || '').trim(),
        status: c.status,
        frequencia: c.frequencia || 'Semanal',
        isRecorrente: c.isRecorrente || false,
        formaPagamento: c.formaPagamento || 'PIX',
        valorRecorrente: (c.valorRecorrente ? c.valorRecorrente.toString() : '').trim(),
        frequenciaRecorrente: c.frequenciaRecorrente || 'Mensal',
        recorrenteQtd: c.recorrenteQtd || 12
      });
    } else {
      return JSON.stringify({
        motoristaCpf: defaultDriverCpf,
        veiculoPlaca: defaultPlaca,
        inicio: '',
        fim: '',
        valor: defaultValor,
        diaCobranca: 'Segunda-feira',
        caucao: '1000',
        kmFranquia: '1500',
        obs: '',
        status: 'Ativo',
        frequencia: 'Semanal',
        isRecorrente: false,
        formaPagamento: 'PIX',
        valorRecorrente: '',
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

  const getSugeridoValor = (veic: Veiculo, freq: 'Diário' | 'Semanal' | 'Mensal' | 'Anual') => {
    if (freq === 'Diário') {
      return veic.valor_diario !== undefined ? veic.valor_diario : Math.round(veic.valor / 7);
    } else if (freq === 'Mensal') {
      return veic.valor_mensal !== undefined ? veic.valor_mensal : Math.round(veic.valor * 4);
    } else if (freq === 'Anual') {
      return Math.round(veic.valor * 52);
    } else {
      return veic.valor_semanal !== undefined ? veic.valor_semanal : veic.valor;
    }
  };

  // Quando o veículo é selecionado no dropdown, preenchemos o valor sugerido
  const handleVeiculoChange = (placa: string, currentFreq = frequencia) => {
    setVeiculoPlaca(placa);
    const veic = veiculos.find(v => v.placa === placa);
    if (veic) {
      setValor(getSugeridoValor(veic, currentFreq).toString());
    }
  };

  const openAddModal = () => {
    setEditingContrato(null);
    setMotoristaCpf('');
    setVeiculoPlaca('');
    setInicio('');
    setFim('');
    setValor('');
    setDiaCobranca('Segunda-feira');
    setCaucao('1000');
    setKmFranquia('1500');
    setObs('');
    setStatus('Ativo');
    setFrequencia('Semanal');

    setIsRecorrente(false);
    setFormaPagamento('PIX');
    setValorRecorrente('');
    setFrequenciaRecorrente('Mensal');
    setRecorrenteQtd(12);
    
    // Iniciar formulário em branco para escolha obrigatória de motorista e veículo
    setMotoristaCpf('');
    setVeiculoPlaca('');
    setValor('');
    

    setOriginalFormStateJson(getSerializedStateFromContrato(null, '', '', ''));
    setModalActiveTab('dados');
    setFinParams({
      tipo: 'Receita',
      modalidade: 'Recorrente',
      valorTotal: 0,
      dataPrimeiroVencimento: new Date().toISOString().split('T')[0],
      formaPagamento: 'PIX',
      observacaoGeral: '',
      qtdParcelas: 12,
      periodicidade: 'Semanal',
      parcelasManuais: [],
      modoDivisao: 'Igual',
      semDataFim: true
    });
    setIsModalOpen(true);
  };

  const openEditModal = (c: Contrato) => {
    setEditingContrato(c);
    setMotoristaCpf(c.motoristaCpf);
    setVeiculoPlaca(c.veiculoPlaca);
    setInicio(c.inicio);
    setFim(c.fim || '');
    setValor(c.valor.toString());
    setDiaCobranca(c.diaCobranca);
    setCaucao(c.caucao.toString());
    setKmFranquia(c.kmFranquia.toString());
    setObs(c.obs);
    setStatus(c.status);
    setFrequencia(c.frequencia || 'Semanal');

    setIsRecorrente(c.isRecorrente || false);
    setFormaPagamento(c.formaPagamento || 'PIX');
    setValorRecorrente(c.valorRecorrente ? c.valorRecorrente.toString() : '');
    setFrequenciaRecorrente(c.frequenciaRecorrente || 'Mensal');
    setRecorrenteQtd(c.recorrenteQtd || 12);

    setOriginalFormStateJson(getSerializedStateFromContrato(c));
    setModalActiveTab('dados');
    if (c.finConfig) {
      setFinParams(c.finConfig);
    } else {
      setFinParams({
        tipo: 'Receita',
        modalidade: 'Recorrente',
        valorTotal: c.valor,
        dataPrimeiroVencimento: c.inicio,
        formaPagamento: c.formaPagamento || 'PIX',
        observacaoGeral: c.obs || '',
        qtdParcelas: 12,
        periodicidade: 'Semanal',
        parcelasManuais: [],
        modoDivisao: 'Igual',
        semDataFim: !c.fim
      });
    }
    setIsModalOpen(true);
  };

  const getDriverPendencies = (m: Motorista) => {
    const pends: string[] = [];
    const todayStr = new Date().toISOString().split('T')[0];
    if (m.cnh_venc && m.cnh_venc < todayStr) {
      pends.push(`CNH do Motorista Vencida (Vencimento: ${m.cnh_venc.split('-').reverse().join('/')})`);
    }
    if (m.status === 'Inadimplente') {
      pends.push(`Status Financeiro do Motorista: Inadimplente`);
    }
    if (m.status === 'Bloqueado') {
      pends.push(`Status do Motorista: Bloqueado`);
    }
    if (m.status === 'Inativo') {
      pends.push(`Status do Motorista: Inativo`);
    }

    // Check specific unpaid/overdue payments
    const unpaid = (pagamentos || []).filter(
      p => p.motoristaCpf === m.cpf && (p.status === 'Pendente' || p.status === 'Atrasado')
    );
    unpaid.forEach(p => {
      pends.push(`Débito Pendente: Parcela ${p.periodo} (${p.status}) - R$ ${p.valor.toFixed(2)}`);
    });

    return pends;
  };

  const getDriverChecks = (cpf: string) => {
    const m = motoristas.find(driver => driver.cpf === cpf);
    if (!m) {
      return {
        cnh: { ok: true, label: 'CNH Ativa', issues: [] },
        financeiro: { ok: true, label: 'Débitos Pendentes', issues: [] },
        allOk: true
      };
    }

    const todayStr = new Date().toISOString().split('T')[0];

    // 1. CNH Ativa
    const cnhIssues: string[] = [];
    if (!m.cnh || m.cnh.trim() === '') {
      cnhIssues.push('CNH não cadastrada');
    }
    if (m.cnh_venc && m.cnh_venc < todayStr) {
      cnhIssues.push(`CNH vencida em ${m.cnh_venc.split('-').reverse().join('/')}`);
    }
    if (m.status === 'Bloqueado') {
      cnhIssues.push('Cadastro do Motorista está Bloqueado');
    }
    if (m.status === 'Inativo') {
      cnhIssues.push('Cadastro do Motorista está Inativo');
    }

    // 2. Débitos Pendentes
    const finIssues: string[] = [];
    if (m.status === 'Inadimplente') {
      finIssues.push('Motorista com status de Inadimplente');
    }
    const driverPayments = (pagamentos || []).filter(
      p => p.motoristaCpf === m.cpf && (p.status === 'Pendente' || p.status === 'Atrasado')
    );
    if (driverPayments.length > 0) {
      driverPayments.forEach(p => {
        const vencStr = p.vencimento ? p.vencimento.split('-').reverse().join('/') : 'sem data';
        finIssues.push(`Parcela ${p.status === 'Atrasado' ? 'atrasada' : 'pendente'}: Período ${p.periodo} (Venc: ${vencStr}) - R$ ${p.valor.toFixed(2)}`);
      });
    }

    const allOk = cnhIssues.length === 0 && finIssues.length === 0;

    return {
      cnh: { ok: cnhIssues.length === 0, label: 'CNH Ativa', issues: cnhIssues },
      financeiro: { ok: finIssues.length === 0, label: 'Débitos Pendentes', issues: finIssues },
      allOk
    };
  };

  const getVehicleChecks = (placa: string) => {
    const v = veiculos.find(veic => veic.placa === placa);
    if (!v) {
      return {
        documento: { ok: true, label: 'Documento', issues: [] },
        seguro: { ok: true, label: 'Seguro', issues: [] },
        manutencao: { ok: true, label: 'Manutenção', issues: [] },
        rastreador: { ok: true, label: 'Rastreador', issues: [] },
        allOk: true
      };
    }

    const todayStr = new Date().toISOString().split('T')[0];

    // 1. Documento (CRLV, IPVA, Vistoria)
    const docIssues: string[] = [];
    const crlvDoc = (documentos || []).find(d => d.veiculoPlaca === v.placa && d.tipo === 'CRLV');
    const isCrlvDocValid = crlvDoc && crlvDoc.status === 'Válido';
    const isVehicleCrlvValid = (v.crlv_situacao === 'Em dia' || v.crlv_situacao === 'Regular' || (!v.crlv_situacao && !!v.crlv_vencimento)) && (!v.crlv_vencimento || v.crlv_vencimento >= todayStr);

    if (!isCrlvDocValid && !isVehicleCrlvValid) {
      if (v.crlv_vencimento && v.crlv_vencimento < todayStr) {
        docIssues.push(`CRLV vencido em ${v.crlv_vencimento.split('-').reverse().join('/')}`);
      } else if (crlvDoc && crlvDoc.status === 'Vencido') {
        docIssues.push(`CRLV vencido em ${crlvDoc.vencimento ? crlvDoc.vencimento.split('-').reverse().join('/') : 'data passada'}`);
      } else {
        docIssues.push(`CRLV pendente ou com situação irregular`);
      }
    }
    if (v.ipva_vencimento && v.ipva_vencimento < todayStr) {
      docIssues.push(`IPVA vencido em ${v.ipva_vencimento.split('-').reverse().join('/')}`);
    } else if (v.ipva_situacao === 'Pendente') {
      docIssues.push(`IPVA com Situação: Pendente`);
    }
    if (v.vistoria_vencimento && v.vistoria_vencimento < todayStr) {
      docIssues.push(`Laudo de Vistoria vencido em ${v.vistoria_vencimento.split('-').reverse().join('/')}`);
    } else if (v.vistoria_resultado === 'Reprovado') {
      docIssues.push(`Laudo de Vistoria: Reprovado`);
    }

    // 2. Seguro
    const segIssues: string[] = [];
    if (!v.segurado) {
      segIssues.push("Veículo sem Seguro Ativo");
    } else if (v.seguro_vencimento && v.seguro_vencimento < todayStr) {
      segIssues.push(`Seguro do Veículo Vencido (Vencimento: ${v.seguro_vencimento.split('-').reverse().join('/')})`);
    }

    // 3. Manutenção (incomplete maintenance for this vehicle)
    const maintIssues: string[] = [];
    const pendingMaintenances = (manutencoes || []).filter(
      m => m.veiculoPlaca === v.placa && m.status !== 'Concluída'
    );
    if (pendingMaintenances.length > 0) {
      pendingMaintenances.forEach(m => {
        maintIssues.push(`Manutenção pendente: ${m.tipo} (${m.status})`);
      });
    }

    // Preventive alerts
    const maintAlerts = getVehicleMaintenanceAlerts(v, manutencoes);
    maintAlerts.forEach(alert => {
      if (alert.color === 'red') {
        maintIssues.push(`[Crítico] ${alert.label}: ${alert.description}`);
      } else if (alert.color === 'yellow') {
        maintIssues.push(`[Atenção] ${alert.label}: ${alert.description}`);
      }
    });

    // 4. Rastreador
    const rStatus = (v.rastreador_status || '').toLowerCase();
    const rastIssues: string[] = [];
    if (!v.possui_rastreador) {
      rastIssues.push("Veículo sem Rastreador Ativo");
    } else {
      if (rStatus === 'inativo' || rStatus === 'desativado') {
        rastIssues.push(`Rastreador inativo/desativado`);
      } else if (rStatus === 'alerta' || rStatus === 'falha' || rStatus === 'bateria baixa' || rStatus === 'pendente') {
        rastIssues.push(`Rastreador com status: ${v.rastreador_status}`);
      }
    }

    const allOk = docIssues.length === 0 && segIssues.length === 0 && maintIssues.length === 0 && rastIssues.length === 0;

    return {
      documento: { ok: docIssues.length === 0, label: 'Documento', issues: docIssues },
      seguro: { ok: segIssues.length === 0, label: 'Seguro', issues: segIssues },
      manutencao: { ok: maintIssues.length === 0, label: 'Manutenção', issues: maintIssues },
      rastreador: { ok: rastIssues.length === 0, label: 'Rastreador', issues: rastIssues },
      allOk
    };
  };

  const getVehiclePendencies = (v: Veiculo) => {
    const checks = getVehicleChecks(v.placa);
    const pends: string[] = [];
    
    if (v.status === 'Em preparação') {
      pends.push(`Status do Veículo: Em preparação`);
    }
    if (v.status === 'Fora da frota') {
      pends.push(`Status do Veículo: Fora da frota`);
    }

    if (!checks.documento.ok) {
      pends.push(...checks.documento.issues.map(issue => `Documento: ${issue}`));
    }
    if (!checks.seguro.ok) {
      pends.push(...checks.seguro.issues.map(issue => `Seguro: ${issue}`));
    }
    if (!checks.manutencao.ok) {
      pends.push(...checks.manutencao.issues.map(issue => `Manutenção: ${issue}`));
    }
    if (!checks.rastreador.ok) {
      pends.push(...checks.rastreador.issues.map(issue => `Rastreador: ${issue}`));
    }

    return pends;
  };

  const executeSave = (contratoData: Contrato) => {
    if (editingContrato) {
      onEditContrato(contratoData);
      onTriggerToast(`Contrato ${contratoData.id} atualizado!`, 'success');
    } else {
      onAddContrato(contratoData);
      onTriggerToast(`Contrato ${contratoData.id} criado com sucesso!`, 'success');
    }
    setIsModalOpen(false);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    if (!motoristaCpf || !veiculoPlaca || !inicio || !valor) {
      onTriggerToast('Por favor, preencha todos os campos obrigatórios (*)', 'error');
      return;
    }

    // Evitar que o mesmo motorista ou veículo seja alugado em duplicidade (contratos Ativo ou Suspenso)
    if (status !== 'Finalizado') {
      const otherActiveContractDriver = contratos.find(
        c => c.motoristaCpf === motoristaCpf && 
        c.status !== 'Finalizado' && 
        (!editingContrato || c.id !== editingContrato.id)
      );
      if (otherActiveContractDriver) {
        onTriggerToast(`Erro: O motorista selecionado já possui um contrato ativo/suspenso (${otherActiveContractDriver.id})!`, 'error');
        return;
      }

      const otherActiveContractVehicle = contratos.find(
        c => c.veiculoPlaca === veiculoPlaca && 
        c.status !== 'Finalizado' && 
        (!editingContrato || c.id !== editingContrato.id)
      );
      if (otherActiveContractVehicle) {
        onTriggerToast(`Erro: O veículo selecionado já possui um contrato ativo/suspenso (${otherActiveContractVehicle.id})!`, 'error');
        return;
      }
    }

    const contratoId = editingContrato ? editingContrato.id : `#00${contratos.length + 1}`;

    const selectedMotorista = motoristas.find(m => m.cpf === motoristaCpf);
    const selectedVeiculo = veiculos.find(v => v.placa === veiculoPlaca);

    const dPends = selectedMotorista ? getDriverPendencies(selectedMotorista) : [];
    const vPends = selectedVeiculo ? getVehiclePendencies(selectedVeiculo) : [];
    const allPends = [...dPends, ...vPends];

    // If there are pending items, we'll append them to obs of contratoData when saved
    let updatedObs = obs.trim();
    if (allPends.length > 0) {
      const pendingText = `[PENDÊNCIAS GERAIS ERP DETECTADAS NA LOCAÇÃO]\n` + allPends.map(p => `- ${p}`).join('\n');
      if (!updatedObs.includes('[PENDÊNCIAS GERAIS ERP DETECTADAS NA LOCAÇÃO]')) {
        updatedObs = `${updatedObs ? updatedObs + '\n\n' : ''}${pendingText}`;
      }
    }

    const contratoData: Contrato = {
      id: contratoId,
      motoristaCpf,
      veiculoPlaca,
      inicio,
      fim: fim || undefined,
      valor: parseFloat(valor) || 350,
      diaCobranca,
      caucao: parseFloat(caucao) || 0,
      kmFranquia: parseInt(kmFranquia) || 1500,
      obs: updatedObs,
      status,
      frequencia,
      isRecorrente,
      formaPagamento: isRecorrente ? formaPagamento : undefined,
      valorRecorrente: isRecorrente ? (parseFloat(valorRecorrente) || parseFloat(valor)) : undefined,
      frequenciaRecorrente: isRecorrente ? frequenciaRecorrente : undefined,
      recorrenteQtd: isRecorrente ? recorrenteQtd : undefined
    };

    if (allPends.length > 0) {
      setPendenciesToConfirm({
        list: allPends,
        data: contratoData
      });
      return;
    }

    executeSave(contratoData);
  };

  const handleDelete = (id: string) => {
    setArchiveTargetId(id);
    setArchiveMotivo('');
  };

  const confirmArchive = () => {
    if (!archiveTargetId) return;
    onDeleteContrato(archiveTargetId, archiveMotivo.trim() || 'Rescisão / Cancelamento de contrato');
    onTriggerToast(`Contrato ${archiveTargetId} movido para o Arquivo Morto!`, 'success');
    setArchiveTargetId(null);
  };

  const handleFinishContrato = (c: Contrato) => {
    setFinishTarget(c);
  };

  const confirmFinishContrato = () => {
    if (!finishTarget) return;
    const finalizado: Contrato = { ...finishTarget, status: 'Finalizado' };
    onEditContrato(finalizado);
    onTriggerToast(`Contrato ${finishTarget.id} encerrado com sucesso!`, 'success');
    setFinishTarget(null);
  };

  // Filtrar Contratos
  const filteredContratos = contratos.filter(c => {
    const mot = motoristas.find(m => m.cpf === c.motoristaCpf);
    const veic = veiculos.find(v => v.placa === c.veiculoPlaca);
    
    const term = search.toLowerCase();
    const matchesSearch =
      c.id.toLowerCase().includes(term) ||
      (mot && mot.nome.toLowerCase().includes(term)) ||
      c.motoristaCpf.includes(term) ||
      (veic && veic.modelo.toLowerCase().includes(term)) ||
      c.veiculoPlaca.toLowerCase().includes(term);

    return matchesSearch;
  });

  // Contratos Ativos ou Suspensos que contam como locações em vigência no momento
  const activeOrSuspendedContracts = contratos.filter(
    c => c.status !== 'Finalizado' && (!editingContrato || c.id !== editingContrato.id)
  );

  const busyDriversCpfs = new Set(activeOrSuspendedContracts.map(c => c.motoristaCpf));
  const busyVehiclesPlacas = new Set(activeOrSuspendedContracts.map(c => c.veiculoPlaca));

  const availableVehicles = veiculos.filter(v => 
    v.status !== 'Fora da frota'
  );

  const activeDrivers = motoristas.filter(m => 
    m.status === 'Ativo' || (editingContrato && m.cpf === editingContrato.motoristaCpf)
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
    >
      {/* Banner de Aviso de Renovação de Contrato (15 dias antes do término) */}
      {(() => {
        const today = new Date();
        today.setHours(0,0,0,0);
        const expiringSoon = contratos.filter(c => {
          if (c.status === 'Finalizado' || !c.fim) return false;
          const endDate = new Date(c.fim + 'T00:00:00');
          const diffMs = endDate.getTime() - today.getTime();
          const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
          return diffDays <= 15;
        });

        if (expiringSoon.length === 0) return null;

        return (
          <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-xl shadow-xs flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <div>
                <h4 className="text-sm font-bold text-amber-900">Aviso de Renovação de Locação ({expiringSoon.length})</h4>
                <p className="text-xs text-amber-700">
                  Existem contratos com prazo de vigência a vencer em até 15 dias ou já vencidos. Providencie a renovação do contrato de locação.
                </p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Barra de Ações Superiores */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-5 h-5 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Pesquisar contrato por ID, motorista, placa, carro..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 text-sm shadow-2xs"
          />
        </div>

        <button
          onClick={openAddModal}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm px-4 py-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" /> Novo Contrato
        </button>
      </div>

      {/* Tabela de Contratos */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm tracking-tight uppercase flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600" /> Contratos de Locação
          </h3>
          <span className="bg-blue-50 text-blue-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
            {filteredContratos.length} contratos
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse columns-divided">
            <thead>
              <tr className="bg-slate-50/50 text-slate-500 text-[10px] uppercase font-bold tracking-wider border-b border-slate-100">
                <th className="px-5 py-3.5">ID</th>
                <th className="px-5 py-3.5">Motorista</th>
                <th className="px-5 py-3.5">Veículo</th>
                <th className="px-5 py-3.5">Vigência</th>
                <th className="px-5 py-3.5">Valor / Frequência</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">ERP Integrado / Pendências</th>
                <th className="px-5 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {filteredContratos.length > 0 ? (
                filteredContratos.map(c => {
                  const mot = motoristas.find(m => m.cpf === c.motoristaCpf);
                  const veic = veiculos.find(v => v.placa === c.veiculoPlaca);
                  const dtInicio = c.inicio.split('-').reverse().join('/');
                  const dtFim = c.fim ? c.fim.split('-').reverse().join('/') : 'Indeterminado';

                  return (
                    <tr key={c.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-3.5 font-bold text-slate-900 tracking-wider">
                        {c.id}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-slate-800">{mot?.nome || 'Não encontrado'}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{c.motoristaCpf}</div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-700">{veic?.modelo || 'Não encontrado'}</div>
                        <div className="text-[11px] text-slate-400 font-mono uppercase bg-slate-100 px-1.5 py-0.5 rounded inline-block mt-0.5">
                          {c.veiculoPlaca}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-600">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" /> {dtInicio} a {dtFim}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Cobrança: <strong>{c.diaCobranca}</strong>
                        </div>
                        {(() => {
                          if (c.status === 'Finalizado' || !c.fim) return null;
                          const today = new Date();
                          today.setHours(0,0,0,0);
                          const endDate = new Date(c.fim + 'T00:00:00');
                          const diffMs = endDate.getTime() - today.getTime();
                          const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                          if (diffDays > 15) return null;

                          return (
                            <div className="mt-1.5 inline-flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-300 px-2 py-0.5 rounded text-[10px] font-bold">
                              <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                              <span>
                                {diffDays < 0
                                  ? `Vencido há ${Math.abs(diffDays)}d`
                                  : diffDays === 0
                                  ? `Vence Hoje`
                                  : `Renovação em ${diffDays}d`}
                              </span>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-extrabold text-slate-800">{formatBRL(c.valor)}</div>
                        <span className="inline-block text-[10px] bg-slate-100 text-slate-600 font-bold uppercase px-1.5 py-0.2 rounded mt-1 border border-slate-200">
                          {c.frequencia || 'Semanal'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        {c.status === 'Ativo' ? (
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200/60 text-[11px] font-bold px-2.5 py-0.5 rounded-full">
                            Ativo
                          </span>
                        ) : c.status === 'Suspenso' ? (
                          <span className="bg-amber-50 text-amber-700 border border-amber-200/60 text-[11px] font-bold px-2.5 py-0.5 rounded-full">
                            Suspenso
                          </span>
                        ) : (
                          <span className="bg-slate-100 text-slate-500 border border-slate-200/60 text-[11px] font-bold px-2.5 py-0.5 rounded-full">
                            Finalizado
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {(() => {
                          const driverChecks = getDriverChecks(c.motoristaCpf);
                          const vehicleChecks = getVehicleChecks(c.veiculoPlaca);
                          const allIssues = [
                            ...driverChecks.cnh.issues,
                            ...driverChecks.financeiro.issues,
                            ...vehicleChecks.documento.issues,
                            ...vehicleChecks.seguro.issues,
                            ...vehicleChecks.manutencao.issues,
                            ...vehicleChecks.rastreador.issues
                          ];

                          if (allIssues.length === 0) {
                            return (
                              <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200/50 text-[11px] font-bold px-2.5 py-1 rounded-lg">
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                <span>100% Regular</span>
                              </span>
                            );
                          }

                          return (
                            <div className="flex flex-col gap-1 max-w-[190px]">
                              {driverChecks.cnh.issues.length > 0 && (
                                <span className="bg-amber-50 text-amber-700 border border-amber-200/40 text-[10px] font-bold px-2 py-0.5 rounded-md truncate" title={driverChecks.cnh.issues.join(', ')}>
                                  👤 CNH Pendente
                                </span>
                              )}
                              {driverChecks.financeiro.issues.length > 0 && (
                                <span className="bg-rose-50 text-rose-700 border border-rose-200/40 text-[10px] font-bold px-2 py-0.5 rounded-md truncate" title={driverChecks.financeiro.issues.join(', ')}>
                                  👤 Débito Pendente
                                </span>
                              )}
                              {vehicleChecks.documento.issues.length > 0 && (
                                <span className="bg-amber-50 text-amber-700 border border-amber-200/40 text-[10px] font-bold px-2 py-0.5 rounded-md truncate" title={vehicleChecks.documento.issues.join(', ')}>
                                  🚗 CRLV/Doc Pendente
                                </span>
                              )}
                              {vehicleChecks.seguro.issues.length > 0 && (
                                <span className="bg-rose-50 text-rose-700 border border-rose-200/40 text-[10px] font-bold px-2 py-0.5 rounded-md truncate" title={vehicleChecks.seguro.issues.join(', ')}>
                                  🚗 Seguro Vencido
                                </span>
                              )}
                              {vehicleChecks.manutencao.issues.length > 0 && (
                                <span className="bg-amber-50 text-amber-700 border border-amber-200/40 text-[10px] font-bold px-2 py-0.5 rounded-md truncate" title={vehicleChecks.manutencao.issues.join(', ')}>
                                  🚗 Manut. Pendente
                                </span>
                              )}
                              {vehicleChecks.rastreador.issues.length > 0 && (
                                <span className="bg-slate-100 text-slate-700 border border-slate-200/40 text-[10px] font-bold px-2 py-0.5 rounded-md truncate" title={vehicleChecks.rastreador.issues.join(', ')}>
                                  🚗 Rastreador Alerta
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          {(() => {
                            if (c.status !== 'Ativo' || !c.fim) return null;
                            const today = new Date();
                            today.setHours(0,0,0,0);
                            const endDate = new Date(c.fim + 'T00:00:00');
                            const diffMs = endDate.getTime() - today.getTime();
                            const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                            if (diffDays > 15) return null;

                            return (
                              <button
                                type="button"
                                onClick={() => openEditModal(c)}
                                className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs px-2.5 py-1.5 rounded-lg transition-all shadow-2xs inline-flex items-center gap-1 cursor-pointer"
                                title="Renovar Contrato de Locação"
                                aria-label="Renovar Contrato de Locação"
                              >
                                Renovar
                              </button>
                            );
                          })()}
                          {c.status === 'Ativo' && (
                            <button
                              type="button"
                              onClick={() => handleFinishContrato(c)}
                              className="bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-bold text-xs px-2.5 py-1.5 rounded-lg transition-all shadow-2xs cursor-pointer"
                              title="Encerrar Aluguel"
                              aria-label="Encerrar Aluguel"
                            >
                              Encerrar
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEditModal(c)}
                            className="min-w-[36px] min-h-[36px] p-2 text-amber-700 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition-colors flex items-center justify-center border border-slate-200 cursor-pointer"
                            title="Editar"
                            aria-label="Editar"
                          >
                            <Pencil className="w-[18px] h-[18px] shrink-0" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(c.id)}
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
                  <td colSpan={7} className="text-center py-8 text-slate-400 font-medium">
                    Nenhum contrato localizado com a busca atual.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL CADASTRAR / EDITAR CONTRATO */}
      <AnimatePresence>
        {isModalOpen && (
          <div 
            onClick={handleCloseModalAttempt}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs cursor-pointer"
          >
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-3xl overflow-hidden border border-slate-200 cursor-default"
            >
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
                <h3 className="font-extrabold text-slate-800 text-base tracking-tight flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  {editingContrato ? `Editar Contrato ${editingContrato.id}` : 'Criar Novo Contrato de Locação'}
                </h3>
                <button
                  type="button"
                  onClick={handleCloseModalAttempt}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSave}>
                <div className="p-5 overflow-y-auto max-h-[82vh] space-y-4">
                  {/* Informação contextual de veículos livres */}
                  {!editingContrato && availableVehicles.length === 0 && (
                    <div className="p-3 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg text-xs flex items-start gap-2">
                      <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <strong>Aviso:</strong> Não há veículos operacionais com status <strong>Disponível</strong> no momento. Libere veículos na aba "Veículos" ou finalize contratos existentes.
                      </div>
                    </div>
                  )}

                  {/* Sempre visível: Seleção de Motorista e Veículo */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                        <User className="w-3 h-3" /> Motorista Beneficiário *
                      </label>
                      <select
                        value={motoristaCpf}
                        onChange={e => {
                          const val = e.target.value;
                          if (val) {
                            const otherActiveContract = contratos.find(c => c.motoristaCpf === val && c.status !== "Finalizado" && c.id !== editingContrato?.id);
                            if (otherActiveContract) {
                              onTriggerToast(`Atenção: O contrato anterior (#${otherActiveContract.id}) será encerrado e arquivado ao salvar. Débitos em atraso permanecerão no extrato.`, 'warning');
                            }
                            setMotoristaCpf(val);
                          } else {
                            setMotoristaCpf('');
                          }
                        }}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                        required
                      >
                        <option value="">Selecione um motorista</option>
                        {activeDrivers.map(m => (
                          <option key={m.cpf} value={m.cpf}>
                            {m.nome} ({m.cpf}){busyDriversCpfs.has(m.cpf) ? ' - [Substituirá contrato anterior]' : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                        <Car className="w-3 h-3" /> Veículo Designado *
                      </label>
                      <select
                        value={veiculoPlaca}
                        onChange={e => {
                          const val = e.target.value;
                          if (val) {
                            const otherActiveContract = contratos.find(c => c.veiculoPlaca === val && c.status !== "Finalizado" && c.id !== editingContrato?.id);
                            if (otherActiveContract) {
                              onTriggerToast(`Atenção: O contrato anterior (#${otherActiveContract.id}) será encerrado e arquivado ao salvar. Débitos em atraso permanecerão no extrato.`, 'warning');
                            }
                            handleVeiculoChange(val);
                          } else {
                            handleVeiculoChange('');
                          }
                        }}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 font-bold"
                        required
                      >
                        <option value="">Selecione o veículo</option>
                        {availableVehicles.map(v => (
                          <option key={v.placa} value={v.placa}>
                            {v.modelo} - Placa: {v.placa} ({v.valor_diario ? `Dia: R$ ${v.valor_diario}` : `Dia: R$ ${Math.round(v.valor/7)}`} | {v.valor_semanal ? `Sem: R$ ${v.valor_semanal}` : `Sem: R$ ${v.valor}`} | {v.valor_mensal ? `Mês: R$ ${v.valor_mensal}` : `Mês: R$ ${Math.round(v.valor*4)}`}){busyVehiclesPlacas.has(v.placa) ? ' - [Substituirá contrato anterior]' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Real-time mini pills row under selectors */}
                  {(veiculoPlaca || motoristaCpf) && (
                    <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-xl flex items-center justify-between gap-3 flex-wrap">
                      <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide">ERP Integrado:</span>
                      <div className="flex gap-2 flex-wrap">
                        {motoristaCpf && (() => {
                          const driverChecks = getDriverChecks(motoristaCpf);
                          return (
                            <>
                              <button
                                type="button"
                                onClick={() => setModalActiveTab('checklist')}
                                className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all flex items-center gap-1.5 shadow-2xs hover:scale-105 ${
                                  driverChecks.cnh.ok
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-amber-50 text-amber-700 border-amber-200'
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${driverChecks.cnh.ok ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                                Motorista CNH: {driverChecks.cnh.ok ? 'Ativa' : 'Pendente'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setModalActiveTab('checklist')}
                                className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all flex items-center gap-1.5 shadow-2xs hover:scale-105 ${
                                  driverChecks.financeiro.ok
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-amber-50 text-amber-700 border-amber-200'
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${driverChecks.financeiro.ok ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                                Débitos: {driverChecks.financeiro.ok ? 'Sem Pendências' : 'Pendentes'}
                              </button>
                            </>
                          );
                        })()}

                        {veiculoPlaca && (() => {
                          const checks = getVehicleChecks(veiculoPlaca);
                          return (
                            <>
                              <button
                                type="button"
                                onClick={() => setModalActiveTab('checklist')}
                                className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all flex items-center gap-1.5 shadow-2xs hover:scale-105 ${
                                  checks.documento.ok
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-amber-50 text-amber-700 border-amber-200'
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${checks.documento.ok ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                                Veículo Doc: {checks.documento.ok ? 'OK' : 'Pendente'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setModalActiveTab('checklist')}
                                className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all flex items-center gap-1.5 shadow-2xs hover:scale-105 ${
                                  checks.seguro.ok
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-amber-50 text-amber-700 border-amber-200'
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${checks.seguro.ok ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                                Seguro: {checks.seguro.ok ? 'OK' : 'Pendente'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setModalActiveTab('checklist')}
                                className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all flex items-center gap-1.5 shadow-2xs hover:scale-105 ${
                                  checks.manutencao.ok
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-amber-50 text-amber-700 border-amber-200'
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${checks.manutencao.ok ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                                Manutenção: {checks.manutencao.ok ? 'OK' : 'Pendente'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setModalActiveTab('checklist')}
                                className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all flex items-center gap-1.5 shadow-2xs hover:scale-105 ${
                                  checks.rastreador.ok
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-amber-50 text-amber-700 border-amber-200'
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${checks.rastreador.ok ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                                Rastreador: {checks.rastreador.ok ? 'OK' : 'Pendente'}
                              </button>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Tabs Selector Row inside Modal */}
                  <div className="flex border-b border-slate-200 bg-slate-50/50 rounded-lg overflow-hidden p-0.5 gap-0.5 border">
                    <button
                      type="button"
                      onClick={() => setModalActiveTab('dados')}
                      className={`flex-1 py-2 rounded text-xs font-bold uppercase tracking-wider text-center transition-all ${
                        modalActiveTab === 'dados'
                          ? 'bg-white text-blue-600 shadow-2xs border border-slate-200/50'
                          : 'text-slate-500 hover:text-slate-700 hover:bg-white/40'
                      }`}
                    >
                      📋 Informações do Contrato
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalActiveTab('checklist')}
                      className={`flex-1 py-2 rounded text-xs font-bold uppercase tracking-wider text-center transition-all flex items-center justify-center gap-2 ${
                        modalActiveTab === 'checklist'
                          ? 'bg-white text-blue-600 shadow-2xs border border-slate-200/50'
                          : 'text-slate-500 hover:text-slate-700 hover:bg-white/40'
                      }`}
                    >
                      🔍 Checagem Pré-Locação (ERP)
                      {(veiculoPlaca || motoristaCpf) && (
                        <span className={`w-2 h-2 rounded-full ${
                          (veiculoPlaca ? getVehicleChecks(veiculoPlaca).allOk : true) &&
                          (motoristaCpf ? getDriverChecks(motoristaCpf).allOk : true)
                            ? 'bg-emerald-500'
                            : 'bg-amber-500 animate-pulse'
                        }`} />
                      )}
                    </button>
                  </div>

                  {/* CONDITIONAL TAB CONTENT */}
                  {modalActiveTab === 'dados' ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                            Data de Início *
                          </label>
                          <input
                            type="date"
                            value={inicio}
                            onChange={e => setInicio(e.target.value)}
                            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                            required
                          />
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                            Data de Término (Opcional)
                          </label>
                          <input
                            type="date"
                            value={fim}
                            onChange={e => setFim(e.target.value)}
                            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-4">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                            Tipo de Aluguel *
                          </label>
                          <select
                            value={frequencia}
                            onChange={e => {
                              const newFreq = e.target.value as any;
                              setFrequencia(newFreq);
                              if (veiculoPlaca) {
                                const veic = veiculos.find(v => v.placa === veiculoPlaca);
                                if (veic) {
                                  setValor(getSugeridoValor(veic, newFreq).toString());
                                }
                              }
                            }}
                            className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 font-bold"
                            required
                          >
                            <option value="Diário">Diário</option>
                            <option value="Semanal">Semanal</option>
                            <option value="Mensal">Mensal</option>
                            <option value="Anual">Anual</option>
                          </select>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                            Valor (R$) *
                          </label>
                          <input
                            type="number"
                            placeholder="350.00"
                            value={valor}
                            onChange={e => {
                            setValor(e.target.value);
                            setFinParams(prev => ({ ...prev, valorTotal: parseFloat(e.target.value) || 0 }));
                          }}
                            step="0.01"
                            min="0"
                            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-bold text-blue-600"
                            required
                          />
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                            Dia / Ciclo de Cobrança
                          </label>
                          <select
                            value={diaCobranca}
                            onChange={e => setDiaCobranca(e.target.value)}
                            className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 font-semibold text-slate-700"
                          >
                            <option value="Segunda-feira">Segunda-feira</option>
                            <option value="Terça-feira">Terça-feira</option>
                            <option value="Quarta-feira">Quarta-feira</option>
                            <option value="Quinta-feira">Quinta-feira</option>
                            <option value="Sexta-feira">Sexta-feira</option>
                            <option value="Sábado">Sábado</option>
                            <option value="Mensal (Data de Início)">Mensal (Data de Início)</option>
                          </select>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                            Caução Exigido (R$)
                          </label>
                          <input
                            type="number"
                            placeholder="1000.00"
                            value={caucao}
                            onChange={e => setCaucao(e.target.value)}
                            step="0.01"
                            min="0"
                            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                            Franquia de KM / Semana
                          </label>
                          <input
                            type="number"
                            placeholder="1500"
                            value={kmFranquia}
                            onChange={e => setKmFranquia(e.target.value)}
                            min="0"
                            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-medium text-slate-700"
                          />
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                            Status do Contrato
                          </label>
                          <select
                            value={status}
                            onChange={e => setStatus(e.target.value as any)}
                            className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                          >
                            <option value="Ativo">Ativo (Em vigência)</option>
                            <option value="Suspenso">Suspenso (Inadimplente/Bloqueio)</option>
                            <option value="Finalizado">Finalizado (Encerrado)</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Observações / Acordos Especiais
                        </label>
                        <textarea
                          placeholder="Indique condições específicas de vistoria, entrega do caução, multas etc."
                          value={obs}
                          onChange={e => setObs(e.target.value)}
                          rows={3}
                          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                        />
                      </div>

                      {/* PAGAMENTO RECORRENTE AUTOMÁTICO DE CONTRATO */}
                      <div className="border border-blue-100 bg-blue-50/40 rounded-xl p-4 space-y-3.5 mt-2">
                        <label className="flex items-center gap-2 font-bold text-xs text-blue-900 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={isRecorrente}
                            onChange={e => {
                              setIsRecorrente(e.target.checked);
                              if (e.target.checked && !valorRecorrente) {
                                setValorRecorrente(valor);
                              }
                            }}
                            className="rounded border-blue-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                          />
                          <span>Ativar Faturamento/Recebimento Recorrente no Contrato 🔁</span>
                        </label>
                        
                        {isRecorrente && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-extrabold uppercase text-blue-800">
                                Modalidade (Forma) *
                              </label>
                              <select
                                value={formaPagamento}
                                onChange={e => setFormaPagamento(e.target.value)}
                                className="bg-white border border-blue-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-blue-900 focus:outline-none focus:border-blue-500"
                              >
                                <option value="PIX">PIX</option>
                                <option value="Boleto">Boleto</option>
                                <option value="Cartão">Cartão</option>
                                <option value="Dinheiro">Dinheiro</option>
                              </select>
                            </div>

                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-extrabold uppercase text-blue-800">
                                Valor da Recorrência *
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                placeholder="350.00"
                                value={valorRecorrente}
                                onChange={e => setValorRecorrente(e.target.value)}
                                className="bg-white border border-blue-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-blue-900 focus:outline-none focus:border-blue-500"
                                required={isRecorrente}
                              />
                            </div>

                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-extrabold uppercase text-blue-800">
                                Frequência *
                              </label>
                              <select
                                value={frequenciaRecorrente}
                                onChange={e => setFrequenciaRecorrente(e.target.value as any)}
                                className="bg-white border border-blue-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-blue-900 focus:outline-none focus:border-blue-500"
                              >
                                <option value="Diário">Diário</option>
                                <option value="Semanal">Semanal</option>
                                <option value="Mensal">Mensal</option>
                                <option value="Anual">Anual</option>
                              </select>
                            </div>

                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-extrabold uppercase text-blue-800">
                                Qtd. Recorrências *
                              </label>
                              <input
                                type="number"
                                min="1"
                                max="120"
                                value={recorrenteQtd}
                                onChange={e => setRecorrenteQtd(parseInt(e.target.value) || 12)}
                                className="bg-white border border-blue-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-blue-900 focus:outline-none focus:border-blue-500"
                                required={isRecorrente}
                              />
                            </div>
                          </div>
                        )}
                        <div className="mt-2 p-2 bg-blue-100/60 border border-blue-200/80 rounded-lg text-[10px] text-blue-800 leading-relaxed font-medium space-y-1">
                          <p>
                            🗓️ <strong>Sincronização do Contas a Receber:</strong> As parcelas serão inseridas automaticamente no <strong>Contas a Receber</strong> seguindo as datas de vencimento (Início, Fim, Frequência e Dia de Cobrança).
                          </p>
                          <p>
                            ✅ <strong>Baixa de Pagamento:</strong> A liquidação/baixa dos valores é realizada exclusivamente na aba <strong>Contas a Receber</strong>.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* TAB CHECKLIST: ERP PRE-LOCACAO CHECK */
                    <div className="space-y-6">
                      {/* 1. SEÇÃO DO MOTORISTA */}
                      {motoristaCpf ? (
                        (() => {
                          const driverChecks = getDriverChecks(motoristaCpf);
                          const m = motoristas.find(driver => driver.cpf === motoristaCpf);
                          if (!m) return null;

                          return (
                            <div className="space-y-4">
                              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-3">
                                <User className="w-5 h-5 text-blue-600 shrink-0" />
                                <div>
                                  <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wide">Análise do Motorista: {m.nome}</h4>
                                  <p className="text-[11px] text-slate-500 font-medium">CPF: <strong className="font-mono">{m.cpf}</strong> | CNH: <strong className="font-mono">{m.cnh || 'Não cadastrada'}</strong></p>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Item 1: CNH Ativa */}
                                <div className={`p-4 rounded-xl border transition-all ${
                                  driverChecks.cnh.ok 
                                    ? 'bg-emerald-50/30 border-emerald-200' 
                                    : 'bg-amber-50/40 border-amber-200'
                                }`}>
                                  <div className="flex items-center justify-between mb-2">
                                    <h5 className="font-bold text-xs uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                                      🪪 CNH Ativa & Cadastro
                                    </h5>
                                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                      driverChecks.cnh.ok
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : 'bg-amber-100 text-amber-800'
                                    }`}>
                                      {driverChecks.cnh.ok ? 'OK' : 'Pendente'}
                                    </span>
                                  </div>
                                  <div className="space-y-1.5">
                                    {driverChecks.cnh.ok ? (
                                      <p className="text-xs text-emerald-700 font-medium flex items-center gap-1">
                                        <span>✓</span> CNH ativa e dentro do prazo de validade.
                                      </p>
                                    ) : (
                                      driverChecks.cnh.issues.map((issue, idx) => (
                                        <p key={idx} className="text-xs text-amber-800 font-semibold flex items-start gap-1">
                                          <span className="text-amber-500 mt-0.5">⚠️</span> 
                                          <span>{issue}</span>
                                        </p>
                                      ))
                                    )}
                                    <div className="pt-2 text-[10px] text-slate-400 space-y-0.5 border-t border-slate-100/50 mt-2 font-medium">
                                      <p>Categoria: {m.cat || 'Não informada'}</p>
                                      <p>Vencimento: {m.cnh_venc ? m.cnh_venc.split('-').reverse().join('/') : 'Não cadastrado'}</p>
                                      <p>Status: {m.status}</p>
                                    </div>
                                  </div>
                                </div>

                                {/* Item 2: Débitos Pendentes */}
                                <div className={`p-4 rounded-xl border transition-all ${
                                  driverChecks.financeiro.ok 
                                    ? 'bg-emerald-50/30 border-emerald-200' 
                                    : 'bg-amber-50/40 border-amber-200'
                                }`}>
                                  <div className="flex items-center justify-between mb-2">
                                    <h5 className="font-bold text-xs uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                                      💰 Débitos Pendentes / Financeiro
                                    </h5>
                                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                      driverChecks.financeiro.ok
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : 'bg-amber-100 text-amber-800'
                                    }`}>
                                      {driverChecks.financeiro.ok ? 'Sem Débitos' : 'Com Débitos'}
                                    </span>
                                  </div>
                                  <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                                    {driverChecks.financeiro.ok ? (
                                      <p className="text-xs text-emerald-700 font-medium flex items-center gap-1">
                                        <span>✓</span> Sem nenhum débito ou inadimplência registrada.
                                      </p>
                                    ) : (
                                      driverChecks.financeiro.issues.map((issue, idx) => (
                                        <p key={idx} className="text-xs text-amber-800 font-semibold flex items-start gap-1">
                                          <span className="text-amber-500 mt-0.5">⚠️</span> 
                                          <span>{issue}</span>
                                        </p>
                                      ))
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })()
                      ) : (
                        <div className="p-4 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl space-y-2">
                          <User className="w-6 h-6 text-slate-300 mx-auto" />
                          <p className="text-xs font-semibold text-slate-500">Nenhum motorista selecionado</p>
                        </div>
                      )}

                      {/* 2. SEÇÃO DO VEÍCULO */}
                      {veiculoPlaca ? (
                        (() => {
                          const checks = getVehicleChecks(veiculoPlaca);
                          const v = veiculos.find(veic => veic.placa === veiculoPlaca);
                          if (!v) return null;

                          return (
                            <div className="space-y-4 pt-4 border-t border-slate-200/60">
                              <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl flex items-center gap-3">
                                <Car className="w-5 h-5 text-blue-600 shrink-0" />
                                <div>
                                  <h4 className="font-bold text-blue-900 text-xs uppercase tracking-wide">Análise do Veículo: {v.modelo}</h4>
                                  <p className="text-[11px] text-blue-700 font-medium">Placa: <strong className="font-mono">{v.placa}</strong> | Renavam: <strong className="font-mono">{v.renavam || 'Não cadastrado'}</strong></p>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Item 1: Documento */}
                                <div className={`p-4 rounded-xl border transition-all ${
                                  checks.documento.ok 
                                    ? 'bg-emerald-50/30 border-emerald-200' 
                                    : 'bg-amber-50/40 border-amber-200'
                                }`}>
                                  <div className="flex items-center justify-between mb-2">
                                    <h5 className="font-bold text-xs uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                                      📄 Documento (CRLV/IPVA)
                                    </h5>
                                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                      checks.documento.ok
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : 'bg-amber-100 text-amber-800'
                                    }`}>
                                      {checks.documento.ok ? 'OK' : 'Pendente'}
                                    </span>
                                  </div>
                                  <div className="space-y-1.5">
                                    {checks.documento.ok ? (
                                      <p className="text-xs text-emerald-700 font-medium flex items-center gap-1">
                                        <span>✓</span> CRLV, IPVA e Vistoria estão em dia.
                                      </p>
                                    ) : (
                                      checks.documento.issues.map((issue, idx) => (
                                        <p key={idx} className="text-xs text-amber-800 font-semibold flex items-start gap-1">
                                          <span className="text-amber-500 mt-0.5">⚠️</span> 
                                          <span>{issue}</span>
                                        </p>
                                      ))
                                    )}
                                    <div className="pt-2 text-[10px] text-slate-400 space-y-0.5 border-t border-slate-100/50 mt-2 font-medium">
                                      <p>CRLV: {v.crlv_situacao || 'Não informado'} {v.crlv_vencimento ? `(Venc: ${v.crlv_vencimento.split('-').reverse().join('/')})` : ''}</p>
                                      <p>IPVA: {v.ipva_situacao || 'Não informado'} {v.ipva_vencimento ? `(Venc: ${v.ipva_vencimento.split('-').reverse().join('/')})` : ''}</p>
                                      <p>Vistoria: {v.vistoria_resultado || 'Não informada'} {v.vistoria_vencimento ? `(Venc: ${v.vistoria_vencimento.split('-').reverse().join('/')})` : ''}</p>
                                    </div>
                                  </div>
                                </div>

                                {/* Item 2: Seguro */}
                                <div className={`p-4 rounded-xl border transition-all ${
                                  checks.seguro.ok 
                                    ? 'bg-emerald-50/30 border-emerald-200' 
                                    : 'bg-amber-50/40 border-amber-200'
                                }`}>
                                  <div className="flex items-center justify-between mb-2">
                                    <h5 className="font-bold text-xs uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                                      🛡️ Seguro Ativo
                                    </h5>
                                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                      checks.seguro.ok
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : 'bg-amber-100 text-amber-800'
                                    }`}>
                                      {checks.seguro.ok ? 'OK' : 'Pendente'}
                                    </span>
                                  </div>
                                  <div className="space-y-1.5">
                                    {checks.seguro.ok ? (
                                      <p className="text-xs text-emerald-700 font-medium flex items-center gap-1">
                                        <span>✓</span> Seguro ativo e dentro do prazo.
                                      </p>
                                    ) : (
                                      checks.seguro.issues.map((issue, idx) => (
                                        <p key={idx} className="text-xs text-amber-800 font-semibold flex items-start gap-1">
                                          <span className="text-amber-500 mt-0.5">⚠️</span> 
                                          <span>{issue}</span>
                                        </p>
                                      ))
                                    )}
                                    <div className="pt-2 text-[10px] text-slate-400 space-y-0.5 border-t border-slate-100/50 mt-2 font-medium">
                                      <p>Seguradora: {v.seguro_seguradora || 'Não cadastrada'}</p>
                                      <p>Vencimento: {v.seguro_vencimento ? v.seguro_vencimento.split('-').reverse().join('/') : 'Não cadastrado'}</p>
                                    </div>
                                  </div>
                                </div>

                                {/* Item 3: Manutenção */}
                                <div className={`p-4 rounded-xl border transition-all ${
                                  checks.manutencao.ok 
                                    ? 'bg-emerald-50/30 border-emerald-200' 
                                    : 'bg-amber-50/40 border-amber-200'
                                }`}>
                                  <div className="flex items-center justify-between mb-2">
                                    <h5 className="font-bold text-xs uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                                      🔧 Manutenção ERP
                                    </h5>
                                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                      checks.manutencao.ok
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : 'bg-amber-100 text-amber-800'
                                    }`}>
                                      {checks.manutencao.ok ? 'OK' : 'Pendente'}
                                    </span>
                                  </div>
                                  <div className="space-y-1.5">
                                    {checks.manutencao.ok ? (
                                      <p className="text-xs text-emerald-700 font-medium flex items-center gap-1">
                                        <span>✓</span> Nenhuma manutenção pendente.
                                      </p>
                                    ) : (
                                      checks.manutencao.issues.map((issue, idx) => (
                                        <p key={idx} className="text-xs text-amber-800 font-semibold flex items-start gap-1">
                                          <span className="text-amber-500 mt-0.5">⚠️</span> 
                                          <span>{issue}</span>
                                        </p>
                                      ))
                                    )}
                                    <div className="pt-2 text-[10px] text-slate-400 space-y-0.5 border-t border-slate-100/50 mt-2 font-medium">
                                      <p>KM Atual: {v.km_atual || v.km || 0} km</p>
                                    </div>
                                  </div>
                                </div>

                                {/* Item 4: Rastreador */}
                                <div className={`p-4 rounded-xl border transition-all ${
                                  checks.rastreador.ok 
                                    ? 'bg-emerald-50/30 border-emerald-200' 
                                    : 'bg-amber-50/40 border-amber-200'
                                }`}>
                                  <div className="flex items-center justify-between mb-2">
                                    <h5 className="font-bold text-xs uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                                      📡 Rastreador Satelital
                                    </h5>
                                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                      checks.rastreador.ok
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : 'bg-amber-100 text-amber-800'
                                    }`}>
                                      {checks.rastreador.ok ? 'OK' : 'Pendente'}
                                    </span>
                                  </div>
                                  <div className="space-y-1.5">
                                    {checks.rastreador.ok ? (
                                      <p className="text-xs text-emerald-700 font-medium flex items-center gap-1">
                                        <span>✓</span> Rastreador operando normalmente.
                                      </p>
                                    ) : (
                                      checks.rastreador.issues.map((issue, idx) => (
                                        <p key={idx} className="text-xs text-amber-800 font-semibold flex items-start gap-1">
                                          <span className="text-amber-500 mt-0.5">⚠️</span> 
                                          <span>{issue}</span>
                                        </p>
                                      ))
                                    )}
                                    <div className="pt-2 text-[10px] text-slate-400 space-y-0.5 border-t border-slate-100/50 mt-2 font-medium">
                                      <p>Equipamento: {v.possui_rastreador ? 'Instalado' : 'Não instalado'}</p>
                                      {v.possui_rastreador && <p>Sinal: {v.rastreador_status || 'Sem sinal'}</p>}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {!checks.allOk && (
                                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex gap-2.5 items-start">
                                  <span className="text-amber-500 text-sm shrink-0">⚠️</span>
                                  <div>
                                    <strong>Aviso do ERP:</strong> Este veículo possui pendências. Se você salvar o contrato, ele será aprovado com as observações gravadas automaticamente.
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()
                      ) : (
                        <div className="p-4 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl space-y-2">
                          <Car className="w-6 h-6 text-slate-300 mx-auto" />
                          <p className="text-xs font-semibold text-slate-500">Nenhum veículo selecionado</p>
                        </div>
                      )}

                      {!motoristaCpf && !veiculoPlaca && (
                        <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl space-y-2">
                          <Info className="w-8 h-8 text-slate-300 mx-auto" />
                          <p className="text-sm font-semibold text-slate-500">Nenhum Motorista ou Veículo Selecionado</p>
                          <p className="text-xs text-slate-400">Por favor, selecione um motorista e/ou veículo para carregar as checagens automatizadas do ERP.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={handleCloseModalAttempt}
                    className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs px-4 py-2 rounded-lg transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-lg transition-all shadow-sm"
                  >
                    📄 Firmar Contrato
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CONFIRMAÇÃO DE PENDÊNCIAS MODAL */}
      <AnimatePresence>
        {pendenciesToConfirm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200"
            >
              <div className="px-5 py-4 border-b border-amber-200 flex items-center justify-between bg-amber-50">
                <h3 className="font-extrabold text-amber-800 text-sm tracking-tight flex items-center gap-2 uppercase">
                  <AlertTriangle className="w-5 h-5 text-amber-600 animate-pulse shrink-0" />
                  Pendências Detectadas!
                </h3>
                <button
                  onClick={() => setPendenciesToConfirm(null)}
                  className="p-1.5 text-amber-500 hover:text-amber-700 hover:bg-amber-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="text-sm text-slate-600 leading-relaxed space-y-3">
                  <p className="font-medium text-slate-800">
                    Atenção! Foram detectadas as seguintes pendências/restrições operacionais para o cadastro selecionado:
                  </p>
                  
                  <div className="bg-amber-50/50 border border-amber-200/60 rounded-xl p-4 space-y-2.5 max-h-56 overflow-y-auto">
                    {pendenciesToConfirm.list.map((pend, idx) => (
                      <div key={idx} className="flex gap-2.5 items-start text-xs font-semibold text-slate-700">
                        <span className="text-amber-500 shrink-0 text-sm mt-0.5">⚠️</span>
                        <span>{pend}</span>
                      </div>
                    ))}
                  </div>

                  <p className="text-xs text-slate-500 italic">
                    Deseja ignorar estas restrições e prosseguir com a ativação/atualização do contrato mesmo assim?
                  </p>
                </div>
              </div>

              <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex gap-2 justify-end">
                <button
                  onClick={() => setPendenciesToConfirm(null)}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold px-4 py-2.5 rounded-lg transition-all"
                >
                  Não, Cancelar e Corrigir
                </button>
                <button
                  onClick={() => {
                    executeSave(pendenciesToConfirm.data);
                    setPendenciesToConfirm(null);
                  }}
                  className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-4 py-2.5 rounded-lg transition-all shadow-sm flex items-center gap-1.5"
                >
                  Sim, Continuar Mesmo Assim
                </button>
              </div>
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
                  Mover Contrato para o Arquivo Morto?
                </div>
                <p className="text-slate-600 text-sm leading-relaxed mb-4">
                  Esta ação arquiva o contrato ativo mantendo o histórico de faturas e vistorias vinculadas a este motorista e veículo.
                </p>
                <div className="flex flex-col gap-1.5 mb-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Motivo do arquivamento *
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Cancelamento por inadimplência / Fim de contrato padrão"
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

      {/* CONFIRM FINISH CONTRATO MODAL */}
      <AnimatePresence>
        {finishTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200"
            >
              <div className="p-5">
                <div className="flex items-center gap-3 text-blue-600 font-bold text-base border-b border-slate-100 pb-3 mb-4">
                  <CheckCircle className="w-6 h-6 text-blue-500" />
                  Encerrar Contrato?
                </div>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Deseja realmente encerrar oficialmente o contrato <span className="font-bold">{finishTarget.id}</span>? O veículo associado voltará a ficar <span className="text-emerald-600 font-bold">"Disponível"</span> para aluguel.
                </p>
              </div>
              <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setFinishTarget(null)}
                  className="border border-slate-200 hover:bg-slate-100 text-slate-500 text-xs font-bold px-4 py-2 rounded-lg transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmFinishContrato}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all shadow-xs"
                >
                  Confirmar Encerramento
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
                  Você realizou alterações no formulário de contratos. Se você sair agora, as novas informações <strong>não serão salvas</strong> e as alterações serão perdidas.
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
