import { GeradorFinanceiroParams } from '../shared/financeiro/types';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Locate,
  Search,
  Plus,
  Pencil,
  Trash2,
  X,
  Activity,
  AlertCircle,
  AlertTriangle,
  Wifi,
  Calendar,
  Layers
} from 'lucide-react';
import { Rastreador, Veiculo } from '../types';

interface RastreadoresViewProps {
  rastreadores: Rastreador[];
  veiculos: Veiculo[];
  onAddRastreador: (r: Rastreador) => void;
  onEditRastreador: (r: Rastreador) => void;
  onArchiveRastreador: (id: string, motivo: string) => void;
  onTriggerToast: (msg: string, type: 'success' | 'warning' | 'error' | 'info') => void;
  userRole: string;
}

export default function RastreadoresView({
  rastreadores,
  veiculos,
  onAddRastreador,
  onEditRastreador,
  onArchiveRastreador,
  onTriggerToast,
  userRole
}: RastreadoresViewProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Todos' | 'Ativo' | 'Inativo' | 'Em Manutenção'>('Todos');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRastreador, setEditingRastreador] = useState<Rastreador | null>(null);
  
  const [finParams, setFinParams] = useState<GeradorFinanceiroParams>({
    tipo: 'Despesa',
    modalidade: 'Recorrente',
    valorTotal: 0,
    dataPrimeiroVencimento: new Date().toISOString().split('T')[0],
    formaPagamento: 'PIX',
    observacaoGeral: '',
    qtdParcelas: 12,
    periodicidade: 'Mensal',
    parcelasManuais: [],
    modoDivisao: 'Igual',
    semDataFim: true
  });

  // Archive State
  const [archiveTargetId, setArchiveTargetId] = useState<string | null>(null);
  const [archiveMotivo, setArchiveMotivo] = useState('');

  // Form States
  const [veiculoPlaca, setVeiculoPlaca] = useState('');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [imei, setImei] = useState('');
  const [operadora, setOperadora] = useState('');
  const [instalacao, setInstalacao] = useState('');
  const [planoMensal, setPlanoMensal] = useState('');
  const [valorMensal, setValorMensal] = useState('');
  const [status, setStatus] = useState<'Ativo' | 'Inativo' | 'Em Manutenção'>('Ativo');
  const [obs, setObs] = useState('');
  const [chipValor, setChipValor] = useState('');
  const [chipVencimento, setChipVencimento] = useState('');
  const [empresaValor, setEmpresaValor] = useState('');
  const [empresaVencimento, setEmpresaVencimento] = useState('');

  const [aparelhoFrequencia, setAparelhoFrequencia] = useState<'Mensal' | 'Anual' | 'Única'>('Mensal');
  const [aparelhoForma, setAparelhoForma] = useState('Pix');
  const [chipFrequencia, setChipFrequencia] = useState<'Mensal' | 'Anual' | 'Única'>('Mensal');
  const [chipForma, setChipForma] = useState('Pix');
  const [empresaFrequencia, setEmpresaFrequencia] = useState<'Mensal' | 'Anual' | 'Única'>('Mensal');
  const [empresaForma, setEmpresaForma] = useState('Pix');

  const [originalFormStateJson, setOriginalFormStateJson] = useState('');
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);

  const getSerializedFormState = () => {
    return JSON.stringify({
      veiculoPlaca,
      marca: marca.trim(),
      modelo: modelo.trim(),
      imei: imei.trim(),
      operadora: operadora.trim(),
      instalacao,
      planoMensal: planoMensal.trim(),
      valorMensal: valorMensal.trim(),
      status,
      obs: obs.trim(),
      chipValor: chipValor.trim(),
      chipVencimento,
      empresaValor: empresaValor.trim(),
      empresaVencimento,
      aparelhoFrequencia,
      aparelhoForma,
      chipFrequencia,
      chipForma,
      empresaFrequencia,
      empresaForma
    });
  };

  const getSerializedStateFromRastreador = (r: Rastreador | null, defaultPlaca = '') => {
    if (r) {
      return JSON.stringify({
        veiculoPlaca: r.veiculoPlaca,
        marca: r.marca.trim(),
        modelo: r.modelo.trim(),
        imei: r.imei.trim(),
        operadora: r.operadora.trim(),
        instalacao: r.instalacao,
        planoMensal: r.planoMensal.trim(),
        valorMensal: r.valorMensal.toString().trim(),
        status: r.status,
        obs: (r.obs || '').trim(),
        chipValor: (r.chip_valor !== undefined ? r.chip_valor.toString() : '').trim(),
        chipVencimento: r.chip_vencimento || '',
        empresaValor: (r.empresa_valor !== undefined ? r.empresa_valor.toString() : '').trim(),
        empresaVencimento: r.empresa_vencimento || '',
        aparelhoFrequencia: r.aparelho_frequencia || 'Mensal',
        aparelhoForma: r.aparelho_forma || 'Pix',
        chipFrequencia: r.chip_frequencia || 'Mensal',
        chipForma: r.chip_forma || 'Pix',
        empresaFrequencia: r.empresa_frequencia || 'Mensal',
        empresaForma: r.empresa_forma || 'Pix'
      });
    } else {
      return JSON.stringify({
        veiculoPlaca: defaultPlaca,
        marca: '',
        modelo: '',
        imei: '',
        operadora: 'Vivo',
        instalacao: '',
        planoMensal: '',
        valorMensal: '',
        status: 'Ativo',
        obs: '',
        chipValor: '',
        chipVencimento: '',
        empresaValor: '',
        empresaVencimento: '',
        aparelhoFrequencia: 'Mensal',
        aparelhoForma: 'Pix',
        chipFrequencia: 'Mensal',
        chipForma: 'Pix',
        empresaFrequencia: 'Mensal',
        empresaForma: 'Pix'
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

  const canModify = userRole !== 'Consulta' && userRole !== 'Somente leitura';

  const formatBRL = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const openAddModal = () => {
    if (!canModify) {
      onTriggerToast('Nível de acesso não permite gravação.', 'warning');
      return;
    }
    if (veiculos.length === 0) {
      onTriggerToast('Cadastre um veículo primeiro.', 'warning');
      return;
    }
    setEditingRastreador(null);
    setVeiculoPlaca('');
    setMarca('');
    setModelo('');
    setImei('');
    setOperadora('Vivo');
    setInstalacao('');
    setPlanoMensal('');
    setValorMensal('');
    setStatus('Ativo');
    setObs('');
    setChipValor('');
    setChipVencimento('');
    setEmpresaValor('');
    setEmpresaVencimento('');
    setAparelhoFrequencia('Mensal');
    setAparelhoForma('Pix');
    setChipFrequencia('Mensal');
    setChipForma('Pix');
    setEmpresaFrequencia('Mensal');
    setEmpresaForma('Pix');
    setOriginalFormStateJson(getSerializedStateFromRastreador(null, ''));
    setIsModalOpen(true);
  };

  const openEditModal = (r: Rastreador) => {
    if (!canModify) {
      onTriggerToast('Nível de acesso não permite gravação.', 'warning');
      return;
    }
    setEditingRastreador(r);
    setVeiculoPlaca(r.veiculoPlaca);
    setMarca(r.marca);
    setModelo(r.modelo);
    setImei(r.imei);
    setOperadora(r.operadora);
    setInstalacao(r.instalacao);
    setPlanoMensal(r.planoMensal);
    setValorMensal(r.valorMensal.toString());
    setStatus(r.status);
    setObs(r.obs || '');
    setChipValor(r.chip_valor !== undefined ? r.chip_valor.toString() : '');
    setChipVencimento(r.chip_vencimento || '');
    setEmpresaValor(r.empresa_valor !== undefined ? r.empresa_valor.toString() : '');
    setEmpresaVencimento(r.empresa_vencimento || '');
    setAparelhoFrequencia(r.aparelho_frequencia || 'Mensal');
    setAparelhoForma(r.aparelho_forma || 'Pix');
    setChipFrequencia(r.chip_frequencia || 'Mensal');
    setChipForma(r.chip_forma || 'Pix');
    setEmpresaFrequencia(r.empresa_frequencia || 'Mensal');
    setEmpresaForma(r.empresa_forma || 'Pix');
    setOriginalFormStateJson(getSerializedStateFromRastreador(r));
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!veiculoPlaca || !marca || !imei || !valorMensal) {
      onTriggerToast('Por favor, preencha os campos obrigatórios (*)', 'error');
      return;
    }

    const trackerData: Rastreador = {
      id: editingRastreador ? editingRastreador.id : `rst_${Date.now()}`,
      veiculoPlaca,
      marca: marca.trim(),
      modelo: modelo.trim(),
      imei: imei.trim(),
      operadora,
      instalacao,
      planoMensal: planoMensal.trim() || 'Padrão Telemetria',
      valorMensal: parseFloat(valorMensal) || 0,
      status,
      ultimaAtualizacao: new Date().toISOString(),
      obs: obs.trim() || undefined,
      chip_valor: chipValor ? parseFloat(chipValor) : undefined,
      chip_vencimento: chipVencimento || undefined,
      empresa_valor: empresaValor ? parseFloat(empresaValor) : undefined,
      empresa_vencimento: empresaVencimento || undefined,
      aparelho_frequencia: aparelhoFrequencia,
      aparelho_forma: aparelhoForma,
      chip_frequencia: chipFrequencia,
      chip_forma: chipForma,
      empresa_frequencia: empresaFrequencia,
      empresa_forma: empresaForma
    };

    if (editingRastreador) {
      onEditRastreador(trackerData);
      onTriggerToast(`Rastreador IMEI ${trackerData.imei} atualizado!`, 'success');
    } else {
      onAddRastreador(trackerData);
      onTriggerToast(`Rastreador IMEI ${trackerData.imei} cadastrado com sucesso!`, 'success');
    }
    setIsModalOpen(false);
  };

  const startArchive = (id: string) => {
    if (!canModify) {
      onTriggerToast('Nível de acesso não permite arquivar.', 'warning');
      return;
    }
    setArchiveTargetId(id);
    setArchiveMotivo('');
  };

  const confirmArchive = () => {
    if (!archiveTargetId) return;
    onArchiveRastreador(archiveTargetId, archiveMotivo.trim() || 'Remoção de equipamento');
    onTriggerToast('Rastreador enviado para o Arquivo Morto.', 'success');
    setArchiveTargetId(null);
  };

  const filteredTrackers = rastreadores.filter(r => {
    const matchesSearch =
      r.veiculoPlaca.toLowerCase().includes(search.toLowerCase()) ||
      r.imei.includes(search) ||
      r.marca.toLowerCase().includes(search.toLowerCase()) ||
      r.modelo.toLowerCase().includes(search.toLowerCase());

    const matchesStatus = statusFilter === 'Todos' || r.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Top action header */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-5 h-5 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Pesquisar por placa, IMEI, marca, modelo..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 text-sm shadow-2xs"
          />
        </div>

        {canModify && (
          <button
            onClick={openAddModal}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm px-4 py-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" /> Novo Rastreador
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        {(['Todos', 'Ativo', 'Inativo', 'Em Manutenção'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setStatusFilter(tab)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all ${
              statusFilter === tab
                ? 'bg-blue-50 text-blue-600 font-bold border-b-2 border-blue-500'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Grid of trackers */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTrackers.length > 0 ? (
          filteredTrackers.map(r => {
            const isAtivo = r.status === 'Ativo';
            const isEmManutencao = r.status === 'Em Manutenção';
            return (
              <div
                key={r.id}
                className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="bg-slate-100 border border-slate-300 rounded-md px-2.5 py-1 text-xs font-mono font-bold text-slate-800">
                      Placa: {r.veiculoPlaca}
                    </span>
                    {isAtivo ? (
                      <span className="bg-emerald-50 text-emerald-700 border border-emerald-200/50 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                        <Wifi className="w-3.5 h-3.5" /> Ativo
                      </span>
                    ) : isEmManutencao ? (
                      <span className="bg-amber-50 text-amber-700 border border-amber-200/50 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                        Em Manutenção
                      </span>
                    ) : (
                      <span className="bg-rose-50 text-rose-700 border border-rose-200/50 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                        Inativo
                      </span>
                    )}
                  </div>

                  <div className="border-t border-slate-100 pt-3">
                    <h4 className="font-extrabold text-slate-900 text-sm">{r.marca} {r.modelo}</h4>
                    <p className="text-slate-400 font-mono text-[11px] mt-0.5">IMEI: {r.imei}</p>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-600">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Operadora SIM:</span>
                      <span className="font-semibold text-slate-800">{r.operadora}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Plano M2M:</span>
                      <span className="font-semibold text-slate-800">{r.planoMensal}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Custo Mensal Aparelho:</span>
                      <span className="font-bold text-slate-800">{formatBRL(r.valorMensal)}</span>
                    </div>
                    {r.aparelho_frequencia && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Frequência Aparelho:</span>
                        <span className="font-semibold text-slate-800">{r.aparelho_frequencia}</span>
                      </div>
                    )}
                    {r.aparelho_forma && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Modalidade Aparelho:</span>
                        <span className="font-semibold text-slate-800">{r.aparelho_forma}</span>
                      </div>
                    )}
                    {r.instalacao && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Data Instalação:</span>
                        <span className="font-semibold text-slate-800">
                          {new Date(r.instalacao + 'T00:00:00').toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                    )}

                    {/* Dados do Chip */}
                    {(r.chip_valor !== undefined || r.chip_vencimento || r.chip_frequencia || r.chip_forma) && (
                      <div className="border-t border-slate-100 pt-2 mt-2 space-y-1">
                        <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1">
                          <span>📱 Chip / SIM Card</span>
                        </div>
                        {r.chip_valor !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Custo do Chip:</span>
                            <span className="font-bold text-slate-700">{formatBRL(r.chip_valor)}</span>
                          </div>
                        )}
                        {r.chip_vencimento && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Data Pgto Chip:</span>
                            <span className="font-semibold text-slate-700">
                              {r.chip_vencimento.includes('-')
                                ? new Date(r.chip_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')
                                : r.chip_vencimento}
                            </span>
                          </div>
                        )}
                        {r.chip_frequencia && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Frequência Chip:</span>
                            <span className="font-semibold text-slate-700">{r.chip_frequencia}</span>
                          </div>
                        )}
                        {r.chip_forma && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Modalidade Chip:</span>
                            <span className="font-semibold text-slate-700">{r.chip_forma}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Dados da Empresa */}
                    {(r.empresa_valor !== undefined || r.empresa_vencimento || r.empresa_frequencia || r.empresa_forma) && (
                      <div className="border-t border-slate-100 pt-2 mt-2 space-y-1">
                        <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1">
                          <span>🏢 Empresa de Rastreamento</span>
                        </div>
                        {r.empresa_valor !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Custo Mensal Empresa:</span>
                            <span className="font-bold text-slate-700">{formatBRL(r.empresa_valor)}</span>
                          </div>
                        )}
                        {r.empresa_vencimento && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Data Pgto Empresa:</span>
                            <span className="font-semibold text-slate-700">
                              {r.empresa_vencimento.includes('-')
                                ? new Date(r.empresa_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')
                                : r.empresa_vencimento}
                            </span>
                          </div>
                        )}
                        {r.empresa_frequencia && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Frequência Empresa:</span>
                            <span className="font-semibold text-slate-700">{r.empresa_frequencia}</span>
                          </div>
                        )}
                        {r.empresa_forma && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Modalidade Empresa:</span>
                            <span className="font-semibold text-slate-700">{r.empresa_forma}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {r.obs && (
                    <div className="bg-slate-50 text-[10px] text-slate-500 p-2 rounded-lg mt-2">
                      <strong>Obs:</strong> {r.obs}
                    </div>
                  )}
                </div>

                {canModify && (
                  <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 mt-4">
                    <button
                      type="button"
                      onClick={() => openEditModal(r)}
                      className="text-amber-700 hover:text-amber-800 hover:bg-amber-50 border border-slate-200 text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                      title="Editar"
                      aria-label="Editar"
                    >
                      <Pencil className="w-[18px] h-[18px] shrink-0" /> Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => startArchive(r.id)}
                      className="text-rose-600 hover:text-rose-800 hover:bg-rose-50 border border-slate-200 text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                      title="Excluir"
                      aria-label="Excluir"
                    >
                      <Trash2 className="w-[18px] h-[18px] shrink-0" /> Arquivar
                    </button>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 text-center py-12 text-slate-400 font-semibold col-span-3">
            Nenhum rastreador instalado/configurado.
          </div>
        )}
      </div>

      {/* CRUD MODAL */}
      <AnimatePresence>
        {isModalOpen && (
          <div 
            onClick={handleCloseModalAttempt}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs cursor-pointer"
          >
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200 cursor-default"
            >
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
                <h3 className="font-extrabold text-slate-800 text-base tracking-tight flex items-center gap-2">
                  <Locate className="w-5 h-5 text-blue-600" />
                  {editingRastreador ? 'Editar Rastreador' : 'Instalar Rastreador'}
                </h3>
                <button
                  onClick={handleCloseModalAttempt}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSave}>
                <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Veículo Vinculado *
                    </label>
                    <select
                      value={veiculoPlaca}
                      onChange={e => setVeiculoPlaca(e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                      required
                    >
                      <option value="">Selecione o veículo...</option>
                      {veiculos.map(v => (
                        <option key={v.placa} value={v.placa}>
                          {v.modelo} — Placa: {v.placa}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Marca do Dispositivo *
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Suntech"
                        value={marca}
                        onChange={e => setMarca(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                        required
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Modelo *
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: ST310U"
                        value={modelo}
                        onChange={e => setModelo(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Código IMEI *
                      </label>
                      <input
                        type="text"
                        placeholder="Número de 15 dígitos"
                        value={imei}
                        onChange={e => setImei(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                        required
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Operadora SIM Card
                      </label>
                      <select
                        value={operadora}
                        onChange={e => setOperadora(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                      >
                        <option value="Vivo">Vivo</option>
                        <option value="Claro">Claro</option>
                        <option value="Tim">Tim</option>
                        <option value="Oi">Oi</option>
                        <option value="Vodafone (M2M)">Vodafone (M2M)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Plano de Telemetria
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: 50MB M2M"
                        value={planoMensal}
                        onChange={e => setPlanoMensal(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Valor Mensal (R$) *
                      </label>
                      <input
                        type="number"
                        placeholder="Ex: 39.90"
                        value={valorMensal}
                        onChange={e => {
                          setValorMensal(e.target.value);
                          setFinParams(prev => ({ ...prev, valorTotal: parseFloat(e.target.value) || 0 }));
                        }}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Frequência Pgto Aparelho
                      </label>
                      <select
                        value={aparelhoFrequencia}
                        onChange={e => setAparelhoFrequencia(e.target.value as any)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                      >
                        <option value="Mensal">Mensal</option>
                        <option value="Anual">Anual</option>
                        <option value="Única">Única</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Modalidade Pgto Aparelho
                      </label>
                      <select
                        value={aparelhoForma}
                        onChange={e => setAparelhoForma(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                      >
                        <option value="Pix">Pix</option>
                        <option value="Boleto">Boleto</option>
                        <option value="Cartão de Crédito">Cartão de Crédito</option>
                        <option value="Débito em Conta">Débito em Conta</option>
                        <option value="Dinheiro">Dinheiro</option>
                        <option value="Outro">Outro</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Data de Instalação
                      </label>
                      <input
                        type="date"
                        value={instalacao}
                        onChange={e => setInstalacao(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Status Atual
                      </label>
                      <select
                        value={status}
                        onChange={e => setStatus(e.target.value as any)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                      >
                        <option value="Ativo">Ativo</option>
                        <option value="Inativo">Inativo</option>
                        <option value="Em Manutenção">Em Manutenção</option>
                      </select>
                    </div>
                  </div>

                  {/* CHIP / SIM CARD DETAILS FORM SECTION */}
                  <div className="border-t border-slate-100 pt-3">
                    <h4 className="text-xs font-black text-blue-600 uppercase tracking-wider mb-3">📱 Custos do Chip / SIM Card</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Custo Mensal do Chip (R$)
                        </label>
                        <input
                          type="number"
                          placeholder="Ex: 15.00"
                          value={chipValor}
                          onChange={e => setChipValor(e.target.value)}
                          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Data Pgto / Vencimento Chip
                        </label>
                        <input
                          type="date"
                          value={chipVencimento}
                          onChange={e => setChipVencimento(e.target.value)}
                          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-3">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Frequência Pgto Chip
                        </label>
                        <select
                          value={chipFrequencia}
                          onChange={e => setChipFrequencia(e.target.value as any)}
                          className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                        >
                          <option value="Mensal">Mensal</option>
                          <option value="Anual">Anual</option>
                          <option value="Única">Única</option>
                        </select>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Modalidade Pgto Chip
                        </label>
                        <select
                          value={chipForma}
                          onChange={e => setChipForma(e.target.value)}
                          className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                        >
                          <option value="Pix">Pix</option>
                          <option value="Boleto">Boleto</option>
                          <option value="Cartão de Crédito">Cartão de Crédito</option>
                          <option value="Débito em Conta">Débito em Conta</option>
                          <option value="Dinheiro">Dinheiro</option>
                          <option value="Outro">Outro</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* TRACKER COMPANY DETAILS FORM SECTION */}
                  <div className="border-t border-slate-100 pt-3">
                    <h4 className="text-xs font-black text-blue-600 uppercase tracking-wider mb-3">🏢 Custos da Empresa de Rastreamento</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Mensalidade Empresa (R$)
                        </label>
                        <input
                          type="number"
                          placeholder="Ex: 25.00"
                          value={empresaValor}
                          onChange={e => setEmpresaValor(e.target.value)}
                          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Data Pgto / Vencimento Empresa
                        </label>
                        <input
                          type="date"
                          value={empresaVencimento}
                          onChange={e => setEmpresaVencimento(e.target.value)}
                          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-3">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Frequência Pgto Empresa
                        </label>
                        <select
                          value={empresaFrequencia}
                          onChange={e => setEmpresaFrequencia(e.target.value as any)}
                          className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                        >
                          <option value="Mensal">Mensal</option>
                          <option value="Anual">Anual</option>
                          <option value="Única">Única</option>
                        </select>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Modalidade Pgto Empresa
                        </label>
                        <select
                          value={empresaForma}
                          onChange={e => setEmpresaForma(e.target.value)}
                          className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                        >
                          <option value="Pix">Pix</option>
                          <option value="Boleto">Boleto</option>
                          <option value="Cartão de Crédito">Cartão de Crédito</option>
                          <option value="Débito em Conta">Débito em Conta</option>
                          <option value="Dinheiro">Dinheiro</option>
                          <option value="Outro">Outro</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Observações / Posicionamento
                    </label>
                    <textarea
                      placeholder="Identificação física de onde foi ocultado no carro..."
                      value={obs}
                      onChange={e => setObs(e.target.value)}
                      rows={2}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                    />
                  </div>
                </div>

                <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={handleCloseModalAttempt}
                    className="border border-slate-200 hover:bg-slate-100 text-slate-500 text-xs font-bold px-4 py-2 rounded-lg transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all shadow-xs"
                  >
                    Salvar Rastreador
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CONFIRM ARCHIVE */}
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
                  Mover Rastreador para Arquivo Morto?
                </div>
                <p className="text-slate-600 text-sm leading-relaxed mb-4">
                  Essa operação não exclui as especificações de hardware, mas move-as para o arquivo histórico.
                </p>
                <div className="flex flex-col gap-1.5 mb-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Motivo do arquivamento *
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Desinstalação devido a devolução do veículo"
                    value={archiveMotivo}
                    onChange={e => setArchiveMotivo(e.target.value)}
                    className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-semibold"
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
                  Você realizou alterações no formulário de rastreadores. Se você sair agora, as novas informações <strong>não serão salvas</strong> e as alterações serão perdidas.
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
    </div>
  );
}
