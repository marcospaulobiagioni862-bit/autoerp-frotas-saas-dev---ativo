import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Car,
  Search,
  Plus,
  RefreshCw,
  AlertTriangle,
  Wrench,
  TrendingUp,
  User,
  History,
  Pencil,
  Save,
  CheckCircle2,
  Sliders,
  ChevronRight,
  X,
  Shield,
  FileText,
  DollarSign,
  AlertCircle,
  Clock,
  Edit2,
  ArrowRight
} from 'lucide-react';
import {
  Veiculo,
  Motorista,
  Contrato,
  Manutencao,
  CustomMaintItem,
  KmRegistro,
  ApuracaoKmCobranca,
  KmAuditLog,
  HistoricoKmValorContrato
} from '../types';
import { CarBrandLogo } from '../shared/components/CarBrandLogo';

interface KmCarrosViewProps {
  veiculos: Veiculo[];
  motoristas: Motorista[];
  contratos: Contrato[];
  manutencoes: Manutencao[];
  kmRegistros: KmRegistro[];
  apuracoesKm: ApuracaoKmCobranca[];
  kmAuditLogs: KmAuditLog[];
  onUpdateVeiculo: (v: Veiculo) => void;
  onEditContrato: (c: Contrato) => void;
  onAddManutencao: (m: Manutencao) => void;
  onAddKmRegistro: (reg: KmRegistro) => void;
  onAprovarCorrecaoKm: (veiculoPlaca: string, novoKm: number, motivo: string, usuario: string) => void;
  onApurarExcedenteKm: (apuracao: ApuracaoKmCobranca) => void;
  onTriggerToast: (msg: string, type: 'success' | 'warning' | 'error') => void;
}

export default function KmCarrosView({
  veiculos,
  motoristas,
  contratos,
  manutencoes,
  kmRegistros,
  apuracoesKm,
  kmAuditLogs,
  onUpdateVeiculo,
  onEditContrato,
  onAddManutencao,
  onAddKmRegistro,
  onAprovarCorrecaoKm,
  onApurarExcedenteKm,
  onTriggerToast
}: KmCarrosViewProps) {
  const [activeTab, setActiveTab] = useState<'veiculos' | 'apuracoes' | 'auditoria'>('veiculos');
  const [search, setSearch] = useState('');
  const [filterAlert, setFilterAlert] = useState<'Todos' | 'Critico' | 'Atencao' | 'EmDia'>('Todos');

  // Modal 1: Quick Register KM
  const [isKmModalOpen, setIsKmModalOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Veiculo | null>(null);
  const [newKmInput, setNewKmInput] = useState('');
  const [kmOrigemInput, setKmOrigemInput] = useState<KmRegistro['origem']>('Registro Manual');
  const [kmObsInput, setKmObsInput] = useState('');
  const [kmValidationError, setKmValidationError] = useState<string | null>(null);

  // Modal 2: Correction Flow (Typo adjustment with justification & audit)
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [corrVehicle, setCorrVehicle] = useState<Veiculo | null>(null);
  const [corrNewKm, setCorrNewKm] = useState('');
  const [corrMotivo, setCorrMotivo] = useState('');
  const [corrAutorizadoPor, setCorrAutorizadoPor] = useState('Administrador');

  // Modal 3: Contract KM Rates & Limits Config
  const [isContractKmModalOpen, setIsContractKmModalOpen] = useState(false);
  const [selectedContract, setSelectedContract] = useState<Contrato | null>(null);
  const [cfgLimiteKm, setCfgLimiteKm] = useState('3000');
  const [cfgTipoLimite, setCfgTipoLimite] = useState<'Por mês' | 'Por semana' | 'Por dia' | 'Por contrato'>('Por mês');
  const [cfgValorKmExcedente, setCfgValorKmExcedente] = useState('0.80');
  const [cfgToleranciaKm, setCfgToleranciaKm] = useState('100');
  const [cfgRegraCobranca, setCfgRegraCobranca] = useState<'Modo Periódico' | 'No Encerramento do Contrato'>('Modo Periódico');
  const [cfgMotivoAlteracao, setCfgMotivoAlteracao] = useState('Ajuste anual de tarifa contratual');
  const [cfgOpcaoAplicacao, setCfgOpcaoAplicacao] = useState<'Futuras' | 'RecalcularAbertas'>('Futuras');

  // Modal 4: Excess KM Billing Engine
  const [isApuracaoModalOpen, setIsApuracaoModalOpen] = useState(false);
  const [apurVehicle, setApurVehicle] = useState<Veiculo | null>(null);
  const [apurContract, setApurContract] = useState<Contrato | null>(null);
  const [apurDataInicio, setApurDataInicio] = useState('2026-08-01');
  const [apurDataFim, setApurDataFim] = useState('2026-08-31');
  const [apurKmInicial, setApurKmInicial] = useState('50000');
  const [apurKmFinal, setApurKmFinal] = useState('53800');

  // Helper to get active driver for a vehicle
  const getActiveDriver = (v: Veiculo) => {
    if (v.motoristaCpf) {
      const driver = motoristas.find((m) => m.cpf === v.motoristaCpf);
      if (driver) return driver;
    }
    const contract = contratos.find((c) => c.veiculoPlaca === v.placa && c.status === 'Ativo');
    if (!contract) return null;
    return motoristas.find((m) => m.cpf === contract.motoristaCpf);
  };

  // Helper to get active contract for a vehicle
  const getActiveContract = (v: Veiculo) => {
    return contratos.find((c) => c.veiculoPlaca === v.placa && c.status === 'Ativo');
  };

  // Helper to get last 5 KM registered for a vehicle
  const getLast5KmRegistros = (placa: string) => {
    return kmRegistros
      .filter((r) => r.veiculoPlaca === placa)
      .sort((a, b) => new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime())
      .slice(0, 5);
  };

  // Maintenance Status calculation
  const getMaintStatus = (v: Veiculo, type: 'oleo' | 'correia' | 'freio' | 'embreagem') => {
    let label = '';
    let emoji = '';
    let defaultPeriod = 10000;
    let lastKm = v.km_inicial;

    if (type === 'oleo') {
      label = 'Troca de Óleo';
      emoji = '🛢️';
      const oilMaints = manutencoes
        .filter((m) => m.veiculoPlaca === v.placa && m.status === 'Concluída' && m.tipo.toLowerCase().includes('óleo'))
        .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

      lastKm = oilMaints.length > 0 ? oilMaints[0].km : v.maint_oleo_km_ultimo ?? v.km_inicial;
      defaultPeriod = v.maint_oleo_periodo ?? 10000;
    } else if (type === 'correia') {
      label = 'Correia Dentada';
      emoji = '⚙️';
      const correiaMaints = manutencoes
        .filter((m) => m.veiculoPlaca === v.placa && m.status === 'Concluída' && (m.tipo.toLowerCase().includes('correia') || m.tipo.toLowerCase().includes('dentada')))
        .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

      lastKm = correiaMaints.length > 0 ? correiaMaints[0].km : v.maint_correia_km_ultimo ?? v.km_inicial;
      defaultPeriod = v.maint_correia_periodo ?? 50000;
    } else if (type === 'freio') {
      label = 'Revisão dos Freios';
      emoji = '🛑';
      const freioMaints = manutencoes
        .filter((m) => m.veiculoPlaca === v.placa && m.status === 'Concluída' && (m.tipo.toLowerCase().includes('freio') || m.tipo.toLowerCase().includes('pastilha') || m.tipo.toLowerCase().includes('disco')))
        .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

      lastKm = freioMaints.length > 0 ? freioMaints[0].km : v.maint_freio_km_ultimo ?? v.km_inicial;
      defaultPeriod = v.maint_freio_periodo ?? 20000;
    } else if (type === 'embreagem') {
      label = 'Troca de Embreagem';
      emoji = '⛓️';
      const embreagemMaints = manutencoes
        .filter((m) => m.veiculoPlaca === v.placa && m.status === 'Concluída' && m.tipo.toLowerCase().includes('embreagem'))
        .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

      lastKm = embreagemMaints.length > 0 ? embreagemMaints[0].km : v.maint_embreagem_km_ultimo ?? v.km_inicial;
      defaultPeriod = v.maint_embreagem_periodo ?? 80000;
    }

    const kmSinceChange = v.km_atual - lastKm;
    const kmRemaining = defaultPeriod - kmSinceChange;

    let color: 'red' | 'yellow' | 'green' = 'green';
    let statusLabel = 'Em dia';

    const redThreshold = Math.max(1000, defaultPeriod * 0.1);
    const yellowThreshold = Math.max(2500, defaultPeriod * 0.25);

    if (kmRemaining <= redThreshold) {
      color = 'red';
      statusLabel = 'CRÍTICO';
    } else if (kmRemaining <= yellowThreshold) {
      color = 'yellow';
      statusLabel = 'Atenção';
    }

    return {
      label,
      emoji,
      lastKm,
      period: defaultPeriod,
      kmSinceChange,
      kmRemaining,
      color,
      statusLabel
    };
  };

  const filteredVeiculos = useMemo(() => {
    return veiculos.filter((v) => {
      const matchSearch =
        v.placa.toLowerCase().includes(search.toLowerCase()) ||
        v.modelo.toLowerCase().includes(search.toLowerCase()) ||
        v.marca.toLowerCase().includes(search.toLowerCase());

      if (!matchSearch) return false;

      const oilStatus = getMaintStatus(v, 'oleo');
      if (filterAlert === 'Critico') return oilStatus.color === 'red';
      if (filterAlert === 'Atencao') return oilStatus.color === 'yellow';
      if (filterAlert === 'EmDia') return oilStatus.color === 'green';

      return true;
    });
  }, [veiculos, search, filterAlert, manutencoes]);

  // Open KM Register Modal
  const handleOpenKmModal = (v: Veiculo) => {
    setSelectedVehicle(v);
    setNewKmInput((v.km_atual + 200).toString());
    setKmOrigemInput('Registro Manual');
    setKmObsInput('Conferência de rotina no pátio.');
    setKmValidationError(null);
    setIsKmModalOpen(true);
  };

  // Submit New KM with Strict Validation
  const handleSaveKmSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVehicle) return;

    const enteredKm = parseInt(newKmInput, 10);
    const currentVehicleKm = selectedVehicle.km_atual;

    // Strict Rule: entered KM cannot be lower than current vehicle KM
    if (isNaN(enteredKm) || enteredKm < currentVehicleKm) {
      setKmValidationError(
        `Atenção: A quilometragem informada (${enteredKm.toLocaleString('pt-BR')} km) é menor do que a última registrada (${currentVehicleKm.toLocaleString('pt-BR')} km). Caso tenha ocorrido um erro de digitação no passado, solicite a 'Correção de Digitação' com justificativa.`
      );
      return;
    }

    const kmAnterior = currentVehicleKm;
    const kmPercorridos = enteredKm - kmAnterior;
    const activeContract = getActiveContract(selectedVehicle);
    const activeDriver = getActiveDriver(selectedVehicle);

    // 1. Update vehicle state
    onUpdateVeiculo({
      ...selectedVehicle,
      km_atual: enteredKm,
      km: enteredKm
    });

    // 2. Add KM record log
    onAddKmRegistro({
      id: `km-reg-${Date.now()}`,
      veiculoPlaca: selectedVehicle.placa,
      contratoId: activeContract?.id,
      motoristaCpf: activeDriver?.cpf,
      dataHora: new Date().toISOString(),
      km: enteredKm,
      kmAnterior,
      kmPercorridos,
      usuario: 'Administrador ERP',
      origem: kmOrigemInput,
      observacao: kmObsInput
    });

    setIsKmModalOpen(false);
    onTriggerToast(`KM do veículo ${selectedVehicle.placa} atualizado para ${enteredKm.toLocaleString('pt-BR')} km!`, 'success');
  };

  // Open Correction Modal
  const handleOpenCorrectionModal = (v: Veiculo) => {
    setCorrVehicle(v);
    setCorrNewKm(v.km_atual.toString());
    setCorrMotivo('Erro de digitação ao lançar vistoria anterior.');
    setCorrAutorizadoPor('Gerente de Operações');
    setIsCorrectionModalOpen(true);
  };

  const handleSaveCorrectionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!corrVehicle) return;

    const kmVal = parseInt(corrNewKm, 10);
    if (isNaN(kmVal) || kmVal <= 0) {
      onTriggerToast('Informe um valor de KM válido para correção', 'warning');
      return;
    }

    if (!corrMotivo.trim()) {
      onTriggerToast('A justificativa da correção é obrigatória para fins de auditoria!', 'warning');
      return;
    }

    onAprovarCorrecaoKm(corrVehicle.placa, kmVal, corrMotivo.trim(), corrAutorizadoPor);
    setIsCorrectionModalOpen(false);
    setIsKmModalOpen(false);
    onTriggerToast(`Correção de KM do veículo ${corrVehicle.placa} aprovada e registrada em auditoria!`, 'success');
  };

  // Open Contract KM Configuration Modal
  const handleOpenContractKmModal = (c: Contrato) => {
    setSelectedContract(c);
    setCfgLimiteKm((c.limiteKm || 3000).toString());
    setCfgTipoLimite(c.tipoLimiteKm || 'Por mês');
    setCfgValorKmExcedente((c.valorKmExcedente || 0.80).toString());
    setCfgToleranciaKm((c.toleranciaKm || 100).toString());
    setCfgRegraCobranca(c.regraCobrancaKm || 'Modo Periódico');
    setCfgMotivoAlteracao('Atualização de tabela e franquia contratual');
    setCfgOpcaoAplicacao('Futuras');
    setIsContractKmModalOpen(true);
  };

  const handleSaveContractKmSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContract) return;

    const novoValorKm = parseFloat(cfgValorKmExcedente) || 0.80;
    const valorAnteriorKm = selectedContract.valorKmExcedente || 0.80;

    const novoHistorico: HistoricoKmValorContrato = {
      id: `hist-km-${Date.now()}`,
      dataHora: new Date().toLocaleString('pt-BR'),
      usuario: 'Administrador ERP',
      valorAnterior: valorAnteriorKm,
      valorNovo: novoValorKm,
      motivo: cfgMotivoAlteracao,
      opcaoAplicacao: cfgOpcaoAplicacao
    };

    const updatedContrato: Contrato = {
      ...selectedContract,
      limiteKm: parseInt(cfgLimiteKm, 10) || 3000,
      tipoLimiteKm: cfgTipoLimite,
      valorKmExcedente: novoValorKm,
      toleranciaKm: parseInt(cfgToleranciaKm, 10) || 0,
      regraCobrancaKm: cfgRegraCobranca,
      historicoValoresKm: [novoHistorico, ...(selectedContract.historicoValoresKm || [])]
    };

    onEditContrato(updatedContrato);
    setIsContractKmModalOpen(false);
    onTriggerToast(`Regras de limite e taxa de KM do contrato ${selectedContract.id} atualizadas com sucesso!`, 'success');
  };

  // Open Excess KM Billing Calculation Modal
  const handleOpenApuracaoModal = (v: Veiculo) => {
    const activeC = getActiveContract(v);
    if (!activeC) {
      onTriggerToast(`O veículo ${v.placa} não possui um contrato ativo para apuração de KM.`, 'warning');
      return;
    }

    setApurVehicle(v);
    setApurContract(activeC);
    setApurDataInicio(activeC.inicio);
    setApurDataFim(new Date().toISOString().split('T')[0]);
    setApurKmInicial((activeC.kmInicialContrato || v.km_inicial || 50000).toString());
    setApurKmFinal(v.km_atual.toString());

    setIsApuracaoModalOpen(true);
  };

  // Submit Excess KM Billing to Contas a Receber
  const handleSaveApuracaoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!apurVehicle || !apurContract) return;

    const kIni = parseInt(apurKmInicial, 10);
    const kFin = parseInt(apurKmFinal, 10);
    const limite = apurContract.limiteKm || 3000;
    const tolerancia = apurContract.toleranciaKm || 0;
    const valorPorKm = apurContract.valorKmExcedente || 0.80;

    const kmUtilizado = Math.max(0, kFin - kIni);
    const kmExcedente = Math.max(0, kmUtilizado - limite - tolerancia);
    const valorTotalExcedente = parseFloat((kmExcedente * valorPorKm).toFixed(2));

    const apurId = `km-excedente-${apurContract.id}-${apurDataInicio.slice(0, 7)}`;

    // Anti-duplication check
    const exists = apuracoesKm.some((a) => a.id === apurId);
    if (exists) {
      onTriggerToast(`Já existe uma apuração de KM excedente para o contrato ${apurContract.id} referente ao período selecionado.`, 'warning');
      return;
    }

    if (kmExcedente <= 0) {
      onTriggerToast(`A quilometragem utilizada (${kmUtilizado} km) não ultrapassou a franquia contratada (${limite} km + ${tolerancia} km tolerância). Nenhuma cobrança necessária.`, 'warning');
      return;
    }

    const novaApuracao: ApuracaoKmCobranca = {
      id: apurId,
      contratoId: apurContract.id,
      veiculoPlaca: apurVehicle.placa,
      motoristaCpf: apurContract.motoristaCpf,
      dataInicial: apurDataInicio,
      dataFinal: apurDataFim,
      kmInicial: kIni,
      kmFinal: kFin,
      kmUtilizado,
      limiteContratado: limite,
      toleranciaKm: tolerancia,
      kmExcedente,
      valorPorKm,
      valorTotalExcedente,
      dataApuracao: new Date().toISOString().split('T')[0],
      tipoApuracao: apurContract.regraCobrancaKm === 'No Encerramento do Contrato' ? 'Final Encerramento' : 'Periódica',
      status: 'Cobrado'
    };

    onApurarExcedenteKm(novaApuracao);
    setIsApuracaoModalOpen(false);
    onTriggerToast(`Apuração finalizada: ${kmExcedente} KM excedentes cobrados (R$ ${valorTotalExcedente.toFixed(2)}) e adicionados em Contas a Receber!`, 'success');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-red-600/10 border border-red-600/20 text-red-600 rounded-2xl flex items-center justify-center shrink-0">
            <Car className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
              Controle de Quilometragem & Franquia Contratual
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Acompanhamento de leituras, histórico das últimas 5 medições, regras de cobrança automática por KM excedente e auditoria.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (veiculos.length > 0) handleOpenKmModal(veiculos[0]);
            }}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Registrar Leitura de KM</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-slate-200 gap-6">
        <button
          onClick={() => setActiveTab('veiculos')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'veiculos' ? 'border-red-600 text-red-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Car className="w-4 h-4" />
          <span>Frota & Quilometragens ({veiculos.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('apuracoes')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'apuracoes' ? 'border-red-600 text-red-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          <span>Apurações & Cobranças de KM Excedente ({apuracoesKm.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('auditoria')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'auditoria' ? 'border-red-600 text-red-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Log de Auditoria de KM ({kmAuditLogs.length})</span>
        </button>
      </div>

      {/* TAB 1: FROTA E QUILOMETRAGENS */}
      {activeTab === 'veiculos' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar veículo por placa ou modelo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600">Filtro Óleo:</span>
              <button
                onClick={() => setFilterAlert('Todos')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg border cursor-pointer ${
                  filterAlert === 'Todos' ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-700 border-slate-200'
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setFilterAlert('Critico')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg border cursor-pointer ${
                  filterAlert === 'Critico' ? 'bg-red-600 text-white border-red-600' : 'bg-red-50 text-red-700 border-red-200'
                }`}
              >
                Crítico
              </button>
              <button
                onClick={() => setFilterAlert('Atencao')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg border cursor-pointer ${
                  filterAlert === 'Atencao' ? 'bg-amber-500 text-white border-amber-500' : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}
              >
                Atenção
              </button>
            </div>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredVeiculos.map((v) => {
              const driver = getActiveDriver(v);
              const contract = getActiveContract(v);
              const last5Km = getLast5KmRegistros(v.placa);
              const oilStatus = getMaintStatus(v, 'oleo');

              return (
                <div key={v.placa} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4">
                  {/* Header */}
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs bg-slate-900 text-white font-mono font-bold px-2.5 py-1 rounded-md">
                        {v.placa}
                      </span>
                      <span className="text-[11px] font-bold text-slate-500">
                        {contract ? `Contrato ${contract.id}` : 'Sem Contrato Ativo'}
                      </span>
                    </div>

                    <h3 className="font-extrabold text-base text-slate-900 mt-2">
                      {v.marca} {v.modelo}
                    </h3>
                    <p className="text-xs text-slate-500">Motorista: {driver ? driver.nome : 'Nenhum atribuído'}</p>
                  </div>

                  {/* Current KM Banner */}
                  <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider">
                        Quilometragem Atual
                      </span>
                      <span className="text-xl font-black text-slate-900 tracking-tight">
                        {v.km_atual.toLocaleString('pt-BR')} <small className="text-xs font-bold text-slate-500">KM</small>
                      </span>
                    </div>

                    <button
                      onClick={() => handleOpenKmModal(v)}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                    >
                      Atualizar KM
                    </button>
                  </div>

                  {/* Contract Limits Info */}
                  {contract && (
                    <div className="bg-red-50/60 border border-red-100 p-3 rounded-xl space-y-1.5 text-xs text-slate-700 font-medium">
                      <div className="flex items-center justify-between font-bold text-slate-900">
                        <span>Franquia Contratada:</span>
                        <span>{contract.limiteKm || 3000} km / {contract.tipoLimiteKm || 'mês'}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span>Excedente por KM:</span>
                        <span className="font-extrabold text-red-700">R$ {(contract.valorKmExcedente || 0.80).toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span>Tolerância:</span>
                        <span>{contract.toleranciaKm || 0} km</span>
                      </div>

                      <button
                        onClick={() => handleOpenContractKmModal(contract)}
                        className="text-[10px] font-extrabold text-red-600 hover:underline pt-1 block cursor-pointer"
                      >
                        ⚙️ Editar Regras de KM do Contrato
                      </button>
                    </div>
                  )}

                  {/* Last 5 Registered KM Readings */}
                  <div className="space-y-2 border-t border-slate-100 pt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-extrabold uppercase text-slate-400">
                        Últimas 5 Quilometragens
                      </span>
                      <button
                        onClick={() => handleOpenCorrectionModal(v)}
                        className="text-[10px] font-bold text-slate-600 hover:text-red-600 underline cursor-pointer"
                      >
                        Corrigir Digitação
                      </button>
                    </div>

                    <div className="space-y-1 text-[11px]">
                      {last5Km.length === 0 ? (
                        <div className="text-slate-400 italic">Sem histórico prévio registrado.</div>
                      ) : (
                        last5Km.map((reg) => (
                          <div key={reg.id} className="flex items-center justify-between text-slate-600 bg-slate-50 px-2 py-1 rounded-md">
                            <span className="font-bold text-slate-900">{reg.km.toLocaleString('pt-BR')} km</span>
                            <span className="text-[10px] text-slate-500">
                              {new Date(reg.dataHora).toLocaleDateString('pt-BR')} ({reg.origem})
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span
                      className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full border ${
                        oilStatus.color === 'red'
                          ? 'bg-red-100 text-red-800 border-red-200'
                          : oilStatus.color === 'yellow'
                          ? 'bg-amber-100 text-amber-800 border-amber-200'
                          : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                      }`}
                    >
                      Óleo: {oilStatus.statusLabel} ({oilStatus.kmRemaining.toLocaleString('pt-BR')} km rest)
                    </span>

                    <button
                      onClick={() => handleOpenApuracaoModal(v)}
                      className="text-xs font-extrabold text-red-600 hover:text-red-700 flex items-center gap-1 cursor-pointer"
                    >
                      <span>Apurar KM Excedente</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: APURAÇÕES E COBRANÇAS DE KM EXCEDENTE */}
      {activeTab === 'apuracoes' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-extrabold text-slate-900 text-sm uppercase tracking-wider">
                Histórico de Cobranças de KM Excedente Geradas
              </h3>
              <span className="text-xs font-bold text-slate-500">
                Sincronizadas com Contas a Receber
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="p-4">Contrato / Veículo</th>
                    <th className="p-4">Período Apuração</th>
                    <th className="p-4">KM Inicial / Final</th>
                    <th className="p-4">KM Utilizado</th>
                    <th className="p-4">Limite + Tolerância</th>
                    <th className="p-4">KM Excedente</th>
                    <th className="p-4">Tarifa / KM</th>
                    <th className="p-4">Total Cobrado (R$)</th>
                    <th className="p-4 text-center">Status Financeiro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {apuracoesKm.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-400 font-semibold">
                        Nenhuma cobrança de KM excedente gerada até o momento.
                      </td>
                    </tr>
                  ) : (
                    apuracoesKm.map((a) => (
                      <tr key={a.id} className="hover:bg-slate-50">
                        <td className="p-4 font-bold text-slate-900">
                          <div>Contrato {a.contratoId}</div>
                          <div className="text-[10px] text-slate-500">Veículo: {a.veiculoPlaca}</div>
                        </td>
                        <td className="p-4">{a.dataInicial} até {a.dataFinal}</td>
                        <td className="p-4 font-mono">{a.kmInicial.toLocaleString('pt-BR')} -&gt; {a.kmFinal.toLocaleString('pt-BR')}</td>
                        <td className="p-4 font-bold text-slate-900">{a.kmUtilizado.toLocaleString('pt-BR')} km</td>
                        <td className="p-4">{a.limiteContratado} km (+{a.toleranciaKm} km)</td>
                        <td className="p-4 font-black text-red-600">+{a.kmExcedente.toLocaleString('pt-BR')} km</td>
                        <td className="p-4 font-bold">R$ {a.valorPorKm.toFixed(2)}</td>
                        <td className="p-4 font-black text-emerald-700 text-sm">
                          R$ {a.valorTotalExcedente.toFixed(2)}
                        </td>
                        <td className="p-4 text-center">
                          <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2.5 py-1 rounded-full border border-emerald-200">
                            Lançado em Contas a Receber
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: AUDITORIA DE KM */}
      {activeTab === 'auditoria' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
          <h3 className="font-extrabold text-slate-900 text-base border-b border-slate-100 pb-3">
            Histórico de Alterações, Correções e Apurações de Quilometragem
          </h3>

          <div className="space-y-3">
            {kmAuditLogs.length === 0 ? (
              <div className="text-center text-slate-400 py-6">Nenhum evento registrado no log de auditoria.</div>
            ) : (
              kmAuditLogs.map((log) => (
                <div key={log.id} className="p-3.5 border border-slate-200 rounded-xl bg-slate-50 flex items-start justify-between gap-4 text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-slate-900">{log.acao}</span>
                      {log.veiculoPlaca && (
                        <span className="bg-slate-900 text-white font-mono font-bold text-[10px] px-2 py-0.5 rounded-md">
                          {log.veiculoPlaca}
                        </span>
                      )}
                    </div>
                    <p className="text-slate-600">{log.motivo}</p>
                    <div className="text-[10px] text-slate-400 font-medium">
                      Usuário: {log.usuario} • {log.dataHora}
                    </div>
                  </div>
                  {log.valorNovo !== undefined && (
                    <div className="text-right shrink-0">
                      <span className="text-[10px] text-slate-400 uppercase block font-bold">Novo Valor</span>
                      <span className="font-black text-slate-900">{log.valorNovo}</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* MODAL 1: REGISTRAR NOVO KM */}
      <AnimatePresence>
        {isKmModalOpen && selectedVehicle && (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl border border-slate-200"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">
                    Registrar Quilometragem — {selectedVehicle.placa}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Última leitura: {selectedVehicle.km_atual.toLocaleString('pt-BR')} km
                  </p>
                </div>
                <button
                  onClick={() => setIsKmModalOpen(false)}
                  className="text-slate-400 hover:text-slate-700 text-xl font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {kmValidationError && (
                <div className="bg-red-50 border border-red-200 text-red-800 text-xs p-3.5 rounded-xl space-y-2">
                  <div className="flex items-start gap-2 font-bold">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <span>Inconsistência na Quilometragem</span>
                  </div>
                  <p>{kmValidationError}</p>
                  <button
                    onClick={() => {
                      setIsKmModalOpen(false);
                      handleOpenCorrectionModal(selectedVehicle);
                    }}
                    className="mt-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs rounded-lg transition-colors cursor-pointer"
                  >
                    Solicitar Correção de Digitação
                  </button>
                </div>
              )}

              <form onSubmit={handleSaveKmSubmit} className="space-y-4 text-xs font-semibold">
                <div>
                  <label className="block text-slate-700 mb-1">Nova Leitura do Odômetro (KM):</label>
                  <input
                    type="number"
                    value={newKmInput}
                    onChange={(e) => {
                      setNewKmInput(e.target.value);
                      setKmValidationError(null);
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-lg font-black text-slate-900"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-1">Origem do Registro:</label>
                  <select
                    value={kmOrigemInput}
                    onChange={(e) => setKmOrigemInput(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-bold"
                  >
                    <option value="Registro Manual">Registro Manual (Checagem no pátio)</option>
                    <option value="Vistoria">Vistoria Periódica</option>
                    <option value="Manutenção">Entrada/Saída de Oficina</option>
                    <option value="Entrega do Veículo">Entrega ao Motorista</option>
                    <option value="Devolução do Veículo">Devolução pelo Motorista</option>
                    <option value="Atualização Periódica">WhatsApp / Foto enviada pelo Motorista</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 mb-1">Observações / Anotações:</label>
                  <textarea
                    rows={2}
                    value={kmObsInput}
                    onChange={(e) => setKmObsInput(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-medium"
                    placeholder="ex: Leitura conferida com foto do painel."
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsKmModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-extrabold rounded-xl shadow-md cursor-pointer"
                  >
                    Confirmar Leitura de KM
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 2: CORREÇÃO DE DIGITAÇÃO DE KM */}
      <AnimatePresence>
        {isCorrectionModalOpen && corrVehicle && (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl border border-slate-200"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-extrabold text-slate-900 text-base">
                  Aprovar Correção de Digitação — {corrVehicle.placa}
                </h3>
                <button
                  onClick={() => setIsCorrectionModalOpen(false)}
                  className="text-slate-400 hover:text-slate-700 text-xl font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveCorrectionSubmit} className="space-y-4 text-xs font-semibold">
                <div>
                  <label className="block text-slate-700 mb-1">Novo KM Corrigido:</label>
                  <input
                    type="number"
                    value={corrNewKm}
                    onChange={(e) => setCorrNewKm(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-black text-slate-900 text-base"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-1">
                    Justificativa Obrigatória para Auditoria:
                  </label>
                  <textarea
                    rows={3}
                    value={corrMotivo}
                    onChange={(e) => setCorrMotivo(e.target.value)}
                    placeholder="Descreva detalhadamente o erro ocorrido (ex: Digitação incorreta de um zero a mais na vistoria anterior)."
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-medium"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-1">Autorizado Por:</label>
                  <input
                    type="text"
                    value={corrAutorizadoPor}
                    onChange={(e) => setCorrAutorizadoPor(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-bold"
                    required
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsCorrectionModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-extrabold rounded-xl shadow-md cursor-pointer"
                  >
                    Salvar e Logar em Auditoria
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 3: CONFIGURAR LIMITES DE KM E VALOR DO EXCEDENTE NO CONTRATO */}
      <AnimatePresence>
        {isContractKmModalOpen && selectedContract && (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl border border-slate-200"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-extrabold text-slate-900 text-base">
                  Configurar Limite e Tarifas de KM — Contrato {selectedContract.id}
                </h3>
                <button
                  onClick={() => setIsContractKmModalOpen(false)}
                  className="text-slate-400 hover:text-slate-700 text-xl font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveContractKmSubmit} className="space-y-4 text-xs font-semibold">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 mb-1">Franquia / Limite de KM:</label>
                    <input
                      type="number"
                      value={cfgLimiteKm}
                      onChange={(e) => setCfgLimiteKm(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-bold"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-1">Periodicidade do Limite:</label>
                    <select
                      value={cfgTipoLimite}
                      onChange={(e) => setCfgTipoLimite(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-bold"
                    >
                      <option value="Por mês">Por mês</option>
                      <option value="Por semana">Por semana</option>
                      <option value="Por dia">Por dia</option>
                      <option value="Por contrato">Por contrato (Total)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 mb-1">Valor por KM Excedente (R$):</label>
                    <input
                      type="number"
                      step="0.01"
                      value={cfgValorKmExcedente}
                      onChange={(e) => setCfgValorKmExcedente(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-black text-red-600"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-1">Tolerância Sem Cobrança (KM):</label>
                    <input
                      type="number"
                      value={cfgToleranciaKm}
                      onChange={(e) => setCfgToleranciaKm(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 mb-1">Regra de Cobrança:</label>
                  <select
                    value={cfgRegraCobranca}
                    onChange={(e) => setCfgRegraCobranca(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-bold"
                  >
                    <option value="Modo Periódico">Modo Periódico (Cobrar mensalmente no vencimento)</option>
                    <option value="No Encerramento do Contrato">No Encerramento do Contrato (Devolução final)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 mb-1">Motivo da Alteração do Valor:</label>
                  <input
                    type="text"
                    value={cfgMotivoAlteracao}
                    onChange={(e) => setCfgMotivoAlteracao(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-medium"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-1">Aplicação do Novo Valor:</label>
                  <select
                    value={cfgOpcaoAplicacao}
                    onChange={(e) => setCfgOpcaoAplicacao(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-bold text-slate-900"
                  >
                    <option value="Futuras">Aplicar novo valor apenas para apurações futuras</option>
                    <option value="RecalcularAbertas">Recalcular apurações em aberto com o novo valor</option>
                  </select>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsContractKmModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-extrabold rounded-xl shadow-md cursor-pointer"
                  >
                    Salvar Regras de KM
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 4: APURAÇÃO E COBRANÇA AUTOMÁTICA DE KM EXCEDENTE */}
      <AnimatePresence>
        {isApuracaoModalOpen && apurVehicle && apurContract && (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl border border-slate-200"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">
                    Apuração de KM Excedente — Contrato {apurContract.id}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Veículo: {apurVehicle.marca} {apurVehicle.modelo} ({apurVehicle.placa})
                  </p>
                </div>
                <button
                  onClick={() => setIsApuracaoModalOpen(false)}
                  className="text-slate-400 hover:text-slate-700 text-xl font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveApuracaoSubmit} className="space-y-4 text-xs font-semibold">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 mb-1">Data Início do Período:</label>
                    <input
                      type="date"
                      value={apurDataInicio}
                      onChange={(e) => setApurDataInicio(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-bold"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-1">Data Fim do Período:</label>
                    <input
                      type="date"
                      value={apurDataFim}
                      onChange={(e) => setApurDataFim(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-bold"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 mb-1">KM Inicial do Período:</label>
                    <input
                      type="number"
                      value={apurKmInicial}
                      onChange={(e) => setApurKmInicial(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-bold"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-1">KM Final do Período:</label>
                    <input
                      type="number"
                      value={apurKmFinal}
                      onChange={(e) => setApurKmFinal(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-bold"
                      required
                    />
                  </div>
                </div>

                {/* Live Preview Box */}
                {(() => {
                  const kIni = parseInt(apurKmInicial, 10) || 0;
                  const kFin = parseInt(apurKmFinal, 10) || 0;
                  const limite = apurContract.limiteKm || 3000;
                  const tolerancia = apurContract.toleranciaKm || 0;
                  const valorPorKm = apurContract.valorKmExcedente || 0.80;

                  const util = Math.max(0, kFin - kIni);
                  const exc = Math.max(0, util - limite - tolerancia);
                  const total = exc * valorPorKm;

                  return (
                    <div className="bg-slate-900 text-slate-100 p-4 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span>KM Utilizado:</span>
                        <span className="font-bold text-white">{util.toLocaleString('pt-BR')} km</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-400">
                        <span>Franquia ({limite} km + {tolerancia} km tol):</span>
                        <span>{limite + tolerancia} km</span>
                      </div>
                      <div className="flex items-center justify-between text-red-400 font-bold border-t border-slate-800 pt-1.5">
                        <span>KM Excedente:</span>
                        <span>+{exc.toLocaleString('pt-BR')} km</span>
                      </div>
                      <div className="flex items-center justify-between text-emerald-400 text-base font-black border-t border-slate-800 pt-1.5">
                        <span>Total a Cobrar:</span>
                        <span>R$ {total.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })()}

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsApuracaoModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-extrabold rounded-xl shadow-md cursor-pointer"
                  >
                    Gerar Cobrança em Contas a Receber
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
