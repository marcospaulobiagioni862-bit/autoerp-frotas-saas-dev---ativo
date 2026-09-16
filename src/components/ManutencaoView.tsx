import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Wrench,
  Search,
  Plus,
  Trash2,
  Pencil,
  X,
  Calendar,
  DollarSign,
  Car,
  Activity,
  CheckCircle,
  AlertCircle,
  AlertTriangle
} from 'lucide-react';
import { Manutencao, Veiculo } from '../types';
import GeradorFinanceiroForm from '../shared/financeiro/GeradorFinanceiroForm';
import { GeradorFinanceiroParams } from '../shared/financeiro/types';

interface ManutencaoViewProps {
  manutencoes: Manutencao[];
  veiculos: Veiculo[];
  onAddManutencao: (m: Manutencao) => void;
  onEditManutencao: (m: Manutencao) => void;
  onDeleteManutencao: (id: string, motivo: string) => void;
  onTriggerToast: (msg: string, type: 'success' | 'warning' | 'error') => void;
}

export default function ManutencaoView({
  manutencoes,
  veiculos,
  onAddManutencao,
  onEditManutencao,
  onDeleteManutencao,
  onTriggerToast
}: ManutencaoViewProps) {
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingManutencao, setEditingManutencao] = useState<Manutencao | null>(null);

  const [finParams, setFinParams] = useState<GeradorFinanceiroParams>({
    tipo: 'Despesa',
    modalidade: 'À vista',
    valorTotal: 0,
    dataPrimeiroVencimento: new Date().toISOString().split('T')[0],
    formaPagamento: 'PIX',
    observacaoGeral: '',
    qtdParcelas: 2,
    periodicidade: 'Mensal',
    parcelasManuais: [],
    modoDivisao: 'Igual',
    semDataFim: false
  });

  // Archive and Completion modal states
  const [archiveTargetId, setArchiveTargetId] = useState<string | null>(null);
  const [archiveMotivo, setArchiveMotivo] = useState('');
  const [completeTarget, setCompleteTarget] = useState<Manutencao | null>(null);

  // Form states
  const [veiculoPlaca, setVeiculoPlaca] = useState('');
  const [tipo, setTipo] = useState('Revisão Preventiva');
  const [desc, setDesc] = useState('');
  const [data, setData] = useState('');
  const [custo, setCusto] = useState('');
  const [oficina, setOficina] = useState('');
  const [km, setKm] = useState('');
  const [status, setStatus] = useState<'Concluída' | 'Em Andamento' | 'Agendada'>('Concluída');
  const [formaPagamento, setFormaPagamento] = useState('Pix');
  const [modoPagamento, setModoPagamento] = useState<'À Vista' | 'Parcelado' | 'Cortesia' | ''>('À Vista');
  const [qtdParcelas, setQtdParcelas] = useState<number>(1);

  const [originalFormStateJson, setOriginalFormStateJson] = useState('');
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);

  const getSerializedFormState = () => {
    return JSON.stringify({
      veiculoPlaca,
      tipo,
      desc: desc.trim(),
      data,
      custo: custo.trim(),
      oficina: oficina.trim(),
      km: km.trim(),
      status,
      formaPagamento,
      modoPagamento,
      qtdParcelas
    });
  };

  const getSerializedStateFromManutencao = (m: Manutencao | null, defaultPlaca = '', defaultKm = '') => {
    if (m) {
      return JSON.stringify({
        veiculoPlaca: m.veiculoPlaca,
        tipo: m.tipo,
        desc: (m.desc || '').trim(),
        data: m.data,
        custo: m.custo.toString().trim(),
        oficina: (m.oficina || '').trim(),
        km: m.km.toString().trim(),
        status: m.status,
        formaPagamento: m.formaPagamento || 'Pix',
        modoPagamento: m.modoPagamento || 'À Vista',
        qtdParcelas: m.qtdParcelas || 1
      });
    } else {
      return JSON.stringify({
        veiculoPlaca: defaultPlaca,
        tipo: 'Revisão Preventiva',
        desc: '',
        data: '',
        custo: '',
        oficina: '',
        km: defaultKm,
        status: 'Concluída',
        formaPagamento: 'Pix',
        modoPagamento: 'À Vista',
        qtdParcelas: 1
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

  const openAddModal = () => {
    setEditingManutencao(null);
    setVeiculoPlaca('');
    setTipo('Revisão Preventiva');
    setDesc('');
    setData('');
    setCusto('');
    setOficina('');
    setKm('');
    setStatus('Concluída');
    setFormaPagamento('Pix');
    setModoPagamento('À Vista');
    setQtdParcelas(1);
    
    // Iniciar formulário em branco para escolha obrigatória de veículo
    setVeiculoPlaca('');
    setKm('');
    
    setOriginalFormStateJson(getSerializedStateFromManutencao(null, '', ''));
    setIsModalOpen(true);
  };

  const openEditModal = (m: Manutencao) => {
    setEditingManutencao(m);
    setVeiculoPlaca(m.veiculoPlaca);
    setTipo(m.tipo);
    setDesc(m.desc);
    setData(m.data);
    setCusto(m.custo.toString());
    setOficina(m.oficina);
    setKm(m.km.toString());
    setStatus(m.status);
    setFormaPagamento(m.formaPagamento || 'Pix');
    setModoPagamento(m.modoPagamento || 'À Vista');
    setQtdParcelas(m.qtdParcelas || 1);
    setOriginalFormStateJson(getSerializedStateFromManutencao(m));
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    if (!veiculoPlaca || !tipo || !data || !km) {
      onTriggerToast('Por favor, preencha todos os campos obrigatórios (*)', 'error');
      return;
    }

    const serviceId = editingManutencao ? editingManutencao.id : `SVR-${manutencoes.length + 101}`;


    if (finParams.modalidade === 'Parcelado' && finParams.modoDivisao === 'Personalizado') {
      const soma = finParams.parcelasManuais.reduce((a, b) => a + b.valor, 0);
      if (Math.abs(soma - finParams.valorTotal) >= 0.01) {
        onTriggerToast('A soma das parcelas deve ser igual ao valor total do lançamento.', 'error');
        return;
      }
    }

    const serviceData: Manutencao = {
      id: serviceId,
      veiculoPlaca,
      tipo,
      desc: desc.trim(),
      data,
      custo: parseFloat(custo) || 0,
      oficina: oficina.trim() || 'Oficina Geral',
      km: parseInt(km) || 0,
      status,
      formaPagamento: finParams.formaPagamento,
      modoPagamento: finParams.modalidade === 'Parcelado' ? 'Parcelado' : 'À Vista',
      qtdParcelas: finParams.modalidade === 'Parcelado' ? finParams.qtdParcelas : 1,
      finConfig: finParams
    };

    if (editingManutencao) {
      onEditManutencao(serviceData);
      onTriggerToast(`Registro ${serviceId} de manutenção atualizado!`, 'success');
    } else {
      onAddManutencao(serviceData);
      onTriggerToast(`Registro ${serviceId} de manutenção gravado com sucesso!`, 'success');
    }

    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
    setArchiveTargetId(id);
    setArchiveMotivo('');
  };

  const confirmArchive = () => {
    if (!archiveTargetId) return;
    onDeleteManutencao(archiveTargetId, archiveMotivo.trim() || 'Remoção via controle de manutenção');
    onTriggerToast(`Registro de manutenção ${archiveTargetId} movido para o Arquivo Morto!`, 'success');
    setArchiveTargetId(null);
  };

  const handleCompleteService = (m: Manutencao) => {
    setCompleteTarget(m);
  };

  const confirmCompleteService = () => {
    if (!completeTarget) return;
    const concluida: Manutencao = { ...completeTarget, status: 'Concluída' };
    onEditManutencao(concluida);
    onTriggerToast(`Serviço de manutenção ${completeTarget.id} finalizado! Veículo liberado para operação.`, 'success');
    setCompleteTarget(null);
  };

  // Filtrar Manutenções
  const filteredManutencoes = manutencoes.filter(m => {
    const matchesSearch =
      m.veiculoPlaca.toLowerCase().includes(search.toLowerCase()) ||
      m.tipo.toLowerCase().includes(search.toLowerCase()) ||
      m.desc.toLowerCase().includes(search.toLowerCase()) ||
      m.oficina.toLowerCase().includes(search.toLowerCase());

    return matchesSearch;
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
    >
      {/* Barra de Pesquisa e Filtros */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-5 h-5 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Pesquisar manutenção por placa, oficina, tipo..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 text-sm shadow-2xs"
          />
        </div>

        <button
          onClick={openAddModal}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm px-4 py-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" /> Registrar Manutenção
        </button>
      </div>

      {/* Tabela de Lançamentos de Serviços */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm tracking-tight uppercase flex items-center gap-2">
            <Wrench className="w-4 h-4 text-blue-600" /> Histórico de Manutenção e Reparos
          </h3>
          <span className="bg-blue-50 text-blue-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
            {filteredManutencoes.length} registros
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse columns-divided">
            <thead>
              <tr className="bg-slate-50/50 text-slate-500 text-[10px] uppercase font-bold tracking-wider border-b border-slate-100">
                <th className="px-5 py-3.5">Veículo</th>
                <th className="px-5 py-3.5">Serviço / Tipo</th>
                <th className="px-5 py-3.5">Data / Oficina</th>
                <th className="px-5 py-3.5">KM / Custo</th>
                <th className="px-5 py-3.5">Faturamento / Pagamento</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {filteredManutencoes.length > 0 ? (
                filteredManutencoes.map(m => {
                  const veic = veiculos.find(v => v.placa === m.veiculoPlaca);
                  const dtFormat = m.data.split('-').reverse().join('/');

                  return (
                    <tr key={m.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-3.5 font-bold tracking-wide">
                        <span className="bg-slate-100 text-slate-800 border border-slate-300 rounded px-2 py-0.5 text-xs font-mono font-bold block w-fit mb-1">
                          {m.veiculoPlaca}
                        </span>
                        <div className="text-[11px] text-slate-400 font-medium">{veic?.modelo || 'Modelo não cadastrado'}</div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-slate-800">{m.tipo}</div>
                        <p className="text-xs text-slate-400 max-w-xs truncate" title={m.desc}>
                          {m.desc || 'Sem detalhes informados'}
                        </p>
                      </td>
                      <td className="px-5 py-3.5 text-xs">
                        <div className="flex items-center gap-1 font-semibold text-slate-600">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" /> {dtFormat}
                        </div>
                        <div className="text-[11px] text-slate-400 font-medium mt-0.5">{m.oficina}</div>
                      </td>
                      <td className="px-5 py-3.5 text-xs">
                        <div className="text-slate-500 font-mono">KM: {m.km.toLocaleString()}</div>
                        <div className="font-extrabold text-slate-800 mt-0.5">
                          {m.custo > 0 ? formatBRL(m.custo) : 'Garantia / Cortesia'}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-xs">
                        {m.modoPagamento ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider ${
                                m.modoPagamento === 'Cortesia' 
                                  ? 'bg-purple-50 text-purple-700 border border-purple-200/50' 
                                  : m.modoPagamento === 'Parcelado' 
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200/50' 
                                  : 'bg-slate-100 text-slate-700 border border-slate-200/60'
                              }`}>
                                {m.modoPagamento}
                              </span>
                              {m.modoPagamento === 'Parcelado' && m.qtdParcelas && (
                                <span className="text-[11px] font-bold text-slate-500">
                                  ({m.qtdParcelas}x)
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] font-semibold text-slate-600 flex items-center gap-1 mt-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                              {m.formaPagamento || 'Pix'}
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200/60">
                                À Vista
                              </span>
                            </div>
                            <div className="text-[11px] font-semibold text-slate-600 flex items-center gap-1 mt-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                              Pix
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {m.status === 'Concluída' ? (
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200/60 text-[11px] font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                            Concluída
                          </span>
                        ) : m.status === 'Em Andamento' ? (
                          <span className="bg-amber-50 text-amber-700 border border-amber-200/60 text-[11px] font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                            <Activity className="w-3.5 h-3.5 text-amber-500 animate-pulse" /> Em Execução
                          </span>
                        ) : (
                          <span className="bg-blue-50 text-blue-700 border border-blue-200/60 text-[11px] font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                            Agendada
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          {m.status !== 'Concluída' && (
                            <button
                              type="button"
                              onClick={() => handleCompleteService(m)}
                              className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-extrabold text-xs px-2.5 py-1.5 rounded-lg transition-all shadow-2xs cursor-pointer"
                              title="Finalizar Serviço"
                              aria-label="Finalizar Serviço"
                            >
                              Finalizar
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEditModal(m)}
                            className="min-w-[36px] min-h-[36px] p-2 text-amber-700 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition-colors flex items-center justify-center border border-slate-200 cursor-pointer"
                            title="Editar"
                            aria-label="Editar"
                          >
                            <Pencil className="w-[18px] h-[18px] shrink-0" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(m.id)}
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
                    Nenhum serviço registrado com a busca atual.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL CADASTRAR / EDITAR MANUTENÇÃO */}
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
              className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200 cursor-default"
            >
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
                <h3 className="font-extrabold text-slate-800 text-base tracking-tight flex items-center gap-2">
                  <Wrench className="w-5 h-5 text-blue-600" />
                  {editingManutencao ? `Editar Registro ${editingManutencao.id}` : 'Registrar Serviço de Manutenção'}
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
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                        <Car className="w-3 h-3" /> Veículo Operado *
                      </label>
                      <select
                        value={veiculoPlaca}
                        onChange={e => setVeiculoPlaca(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                        required
                      >
                        <option value="">Selecione a placa</option>
                        {veiculos.map(v => (
                          <option key={v.placa} value={v.placa}>
                            {v.modelo} - {v.placa}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Tipo de Serviço *
                      </label>
                      <select
                        value={tipo}
                        onChange={e => setTipo(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                        required
                      >
                        <option value="Revisão Preventiva">Revisão Preventiva</option>
                        <option value="Troca de Óleo">Troca de Óleo / Filtros</option>
                        <option value="Pneus">Substituição de Pneus</option>
                        <option value="Freios">Freios (Pastilha/Disco/Fluido)</option>
                        <option value="Elétrica">Elétrica / Alternador / Bateria</option>
                        <option value="Funilaria">Funilaria / Pintura / Detalhamento</option>
                        <option value="Mecânica Corretiva">Mecânica Corretiva / Motor</option>
                        <option value="Outros">Outros Reparos</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Descrição Detalhada do Serviço
                    </label>
                    <textarea
                      placeholder="Especifique peças trocadas, serviços executados e garantias..."
                      value={desc}
                      onChange={e => setDesc(e.target.value)}
                      rows={3}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Data de Entrada / Agendada *
                      </label>
                      <input
                        type="date"
                        value={data}
                        onChange={e => {
                          setData(e.target.value);
                          setFinParams(prev => ({ ...prev, dataPrimeiroVencimento: e.target.value }));
                        }}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                        required
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Custo do Serviço (R$)
                      </label>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={custo}
                        onChange={e => {
                          setCusto(e.target.value);
                          setFinParams(prev => ({ ...prev, valorTotal: parseFloat(e.target.value) || 0 }));
                        }}
                        step="0.01"
                        min="0"
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-bold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Oficina / Estabelecimento
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Euro Car Center"
                        value={oficina}
                        onChange={e => setOficina(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        KM no Momento do Serviço *
                      </label>
                      <input
                        type="number"
                        placeholder="Ex: 51200"
                        value={km}
                        onChange={e => setKm(e.target.value)}
                        min="0"
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Status da Manutenção
                      </label>
                      <select
                        value={status}
                        onChange={e => setStatus(e.target.value as any)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                      >
                        <option value="Concluída">Concluída (Veículo Liberado)</option>
                        <option value="Em Andamento">Em Andamento (Oficina / Retido)</option>
                        <option value="Agendada">Agendada (Futura)</option>
                      </select>
                    </div>
                  </div>

                  {/* Informações de Pagamento */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-4">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200 pb-2">
                      <DollarSign className="w-3.5 h-3.5 text-blue-600" /> Condições de Pagamento / Faturamento
                    </h4>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Modo de Pagamento
                        </label>
                        <select
                          value={modoPagamento}
                          onChange={e => {
                            const val = e.target.value as any;
                            setModoPagamento(val);
                            if (val !== 'Parcelado') {
                              setQtdParcelas(1);
                            }
                          }}
                          className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                        >
                          <option value="À Vista">À Vista</option>
                          <option value="Parcelado">Parcelado</option>
                          <option value="Cortesia">Cortesia / Garantia</option>
                        </select>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Forma de Pagamento
                        </label>
                        <select
                          value={formaPagamento}
                          onChange={e => setFormaPagamento(e.target.value)}
                          className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                          disabled={modoPagamento === 'Cortesia'}
                        >
                          <option value="Pix">Pix</option>
                          <option value="Cartão de Crédito">Cartão de Crédito</option>
                          <option value="Cartão de Débito">Cartão de Débito</option>
                          <option value="Boleto">Boleto Bancário</option>
                          <option value="Dinheiro">Dinheiro (Espécie)</option>
                          <option value="Transferência">Transferência Bancária</option>
                        </select>
                      </div>
                    </div>

                    {modoPagamento === 'Parcelado' && (
                      <div className="flex flex-col gap-1.5 pt-1">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Quantidade de Parcelas
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="2"
                            max="72"
                            value={qtdParcelas}
                            onChange={e => setQtdParcelas(parseInt(e.target.value) || 2)}
                            className="w-24 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 text-center font-bold"
                          />
                          <span className="text-xs text-slate-500 font-semibold">
                            parcelas {custo && parseFloat(custo) > 0 ? `de ${formatBRL(parseFloat(custo) / (qtdParcelas || 1))}` : ''}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
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
                    ⚙️ Gravar Serviço
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
                  Mover Ficha de Manutenção para o Arquivo Morto?
                </div>
                <p className="text-slate-600 text-sm leading-relaxed mb-4">
                  Esta ação não exclui permanentemente o registro de manutenção, mas o move para o Arquivo Morto preservando o histórico de despesas e relatórios do veículo.
                </p>
                <div className="flex flex-col gap-1.5 mb-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Motivo do arquivamento *
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Registro incorreto / Manutenção cancelada"
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

      {/* CONFIRM COMPLETION MODAL */}
      <AnimatePresence>
        {completeTarget && (
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
                  Marcar Serviço como Concluído?
                </div>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Confirmar a conclusão do serviço {completeTarget.id} do veículo <span className="font-bold">{completeTarget.veiculoPlaca}</span>? O veículo voltará a ficar <span className="text-emerald-600 font-bold">"Disponível"</span> para aluguel.
                </p>
              </div>
              <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setCompleteTarget(null)}
                  className="border border-slate-200 hover:bg-slate-100 text-slate-500 text-xs font-bold px-4 py-2 rounded-lg transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmCompleteService}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all shadow-xs"
                >
                  Confirmar Conclusão
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
                  Você realizou alterações no formulário de manutenção. Se você sair agora, as novas informações <strong>não serão salvas</strong> e as alterações serão perdidas.
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
