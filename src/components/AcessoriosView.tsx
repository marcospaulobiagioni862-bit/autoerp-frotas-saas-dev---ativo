import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Layers,
  Search,
  Plus,
  Pencil,
  Trash2,
  X,
  Activity,
  AlertCircle,
  Tag,
  CheckCircle2,
  Wrench,
  AlertTriangle
} from 'lucide-react';
import { Acessorio, Veiculo } from '../types';

interface AcessoriosViewProps {
  acessorios: Acessorio[];
  veiculos: Veiculo[];
  onAddAcessorio: (ac: Acessorio) => void;
  onEditAcessorio: (ac: Acessorio) => void;
  onArchiveAcessorio: (id: string, motivo: string) => void;
  onTriggerToast: (msg: string, type: 'success' | 'warning' | 'error' | 'info') => void;
  userRole: string;
}

export default function AcessoriosView({
  acessorios,
  veiculos,
  onAddAcessorio,
  onEditAcessorio,
  onArchiveAcessorio,
  onTriggerToast,
  userRole
}: AcessoriosViewProps) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('Todos');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAcessorio, setEditingAcessorio] = useState<Acessorio | null>(null);

  // Archive State
  const [archiveTargetId, setArchiveTargetId] = useState<string | null>(null);
  const [archiveMotivo, setArchiveMotivo] = useState('');

  // Form States
  const [veiculoPlaca, setVeiculoPlaca] = useState('');
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState('Eletrônico');
  const [qtd, setQtd] = useState('1');
  const [valor, setValor] = useState('');
  const [instalacao, setInstalacao] = useState('');
  const [garantia, setGarantia] = useState('');
  const [status, setStatus] = useState<'Ativo' | 'Inativo' | 'Em manutenção'>('Ativo');
  const [obs, setObs] = useState('');

  const canModify = userRole !== 'Consulta' && userRole !== 'Somente leitura';
  const [originalFormStateJson, setOriginalFormStateJson] = useState('');
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);

  const getSerializedFormState = () => {
    return JSON.stringify({
      veiculoPlaca,
      nome: nome.trim(),
      tipo,
      qtd: qtd.trim(),
      valor: valor.trim(),
      instalacao,
      garantia: garantia.trim(),
      status,
      obs: obs.trim()
    });
  };

  const getSerializedStateFromAcessorio = (ac: Acessorio | null) => {
    if (ac) {
      return JSON.stringify({
        veiculoPlaca: ac.veiculoPlaca,
        nome: ac.nome.trim(),
        tipo: ac.tipo,
        qtd: ac.qtd.toString().trim(),
        valor: ac.valor.toString().trim(),
        instalacao: ac.instalacao,
        garantia: (ac.garantia || '').trim(),
        status: ac.status,
        obs: (ac.obs || '').trim()
      });
    } else {
      return JSON.stringify({
        veiculoPlaca: veiculos[0]?.placa || '',
        nome: '',
        tipo: 'Eletrônico',
        qtd: '1',
        valor: '',
        instalacao: '',
        garantia: '',
        status: 'Ativo',
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

  const formatBRL = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const accessoryTypes = ['Eletrônico', 'Segurança', 'Estético', 'Utilitário', 'Mecânico', 'Outros'];

  const openAddModal = () => {
    if (!canModify) {
      onTriggerToast('Nível de acesso não permite gravação.', 'warning');
      return;
    }
    if (veiculos.length === 0) {
      onTriggerToast('Por favor, cadastre um veículo primeiro.', 'warning');
      return;
    }
    setEditingAcessorio(null);
    setVeiculoPlaca('');
    setNome('');
    setTipo('Eletrônico');
    setQtd('1');
    setValor('');
    setInstalacao('');
    setGarantia('');
    setStatus('Ativo');
    setObs('');
    setOriginalFormStateJson(getSerializedStateFromAcessorio(null));
    setIsModalOpen(true);
  };

  const openEditModal = (ac: Acessorio) => {
    if (!canModify) {
      onTriggerToast('Nível de acesso não permite gravação.', 'warning');
      return;
    }
    setEditingAcessorio(ac);
    setVeiculoPlaca(ac.veiculoPlaca);
    setNome(ac.nome);
    setTipo(ac.tipo);
    setQtd(ac.qtd.toString());
    setValor(ac.valor.toString());
    setInstalacao(ac.instalacao);
    setGarantia(ac.garantia);
    setStatus(ac.status);
    setObs(ac.obs || '');
    setOriginalFormStateJson(getSerializedStateFromAcessorio(ac));
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!veiculoPlaca || !nome || !valor) {
      onTriggerToast('Por favor, preencha todos os campos obrigatórios (*)', 'error');
      return;
    }

    const accessoryData: Acessorio = {
      id: editingAcessorio ? editingAcessorio.id : `ac_${Date.now()}`,
      veiculoPlaca,
      nome: nome.trim(),
      tipo,
      qtd: parseInt(qtd) || 1,
      valor: parseFloat(valor) || 0,
      instalacao,
      garantia: garantia.trim() || 'Sem garantia',
      status,
      obs: obs.trim() || undefined
    };

    if (editingAcessorio) {
      onEditAcessorio(accessoryData);
      onTriggerToast(`Acessório ${accessoryData.nome} atualizado!`, 'success');
    } else {
      onAddAcessorio(accessoryData);
      onTriggerToast(`Acessório ${accessoryData.nome} cadastrado!`, 'success');
    }
    setIsModalOpen(false);
  };

  const startArchive = (id: string) => {
    if (!canModify) {
      onTriggerToast('Acesso negado para alteração de cadastros.', 'warning');
      return;
    }
    setArchiveTargetId(id);
    setArchiveMotivo('');
  };

  const confirmArchive = () => {
    if (!archiveTargetId) return;
    onArchiveAcessorio(archiveTargetId, archiveMotivo.trim() || 'Remoção de acessório físico');
    onTriggerToast('Acessório movido para o Arquivo Morto.', 'success');
    setArchiveTargetId(null);
  };

  const filteredAcessorios = acessorios.filter(ac => {
    const matchesSearch =
      ac.nome.toLowerCase().includes(search.toLowerCase()) ||
      ac.veiculoPlaca.toLowerCase().includes(search.toLowerCase()) ||
      (ac.obs && ac.obs.toLowerCase().includes(search.toLowerCase()));

    const matchesType = typeFilter === 'Todos' || ac.tipo === typeFilter;

    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6">
      {/* Top action header */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-5 h-5 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Pesquisar por placa do veículo, acessório, observações..."
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
            <Plus className="w-4 h-4" /> Novo Acessório
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-2">
        <button
          onClick={() => setTypeFilter('Todos')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all ${
            typeFilter === 'Todos'
              ? 'bg-blue-50 text-blue-600 font-bold border-b-2 border-blue-500'
              : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          Todos
        </button>
        {accessoryTypes.map(type => (
          <button
            key={type}
            onClick={() => setTypeFilter(type)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all ${
              typeFilter === type
                ? 'bg-blue-50 text-blue-600 font-bold border-b-2 border-blue-500'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Accessories list table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <h3 className="font-bold text-slate-800 text-sm tracking-tight uppercase flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-600" /> Registro de Acessórios
          </h3>
          <span className="bg-blue-50 text-blue-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
            {filteredAcessorios.length} registrados
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 text-slate-500 text-[10px] uppercase font-bold tracking-wider border-b border-slate-100">
                <th className="px-5 py-3.5">Veículo</th>
                <th className="px-5 py-3.5">Acessório</th>
                <th className="px-5 py-3.5">Categoria</th>
                <th className="px-5 py-3.5">Qtd / Custo</th>
                <th className="px-5 py-3.5">Instalação / Garantia</th>
                <th className="px-5 py-3.5">Status</th>
                {canModify && <th className="px-5 py-3.5 text-right">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {filteredAcessorios.length > 0 ? (
                filteredAcessorios.map(ac => {
                  const isActive = ac.status === 'Ativo';
                  const isMaintenance = ac.status === 'Em manutenção';
                  return (
                    <tr key={ac.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-3.5">
                        <span className="bg-slate-100 border border-slate-300 rounded px-2.5 py-0.5 text-xs font-mono font-bold text-slate-700">
                          {ac.veiculoPlaca}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-slate-900">{ac.nome}</div>
                        {ac.obs && <span className="text-[11px] text-slate-400 italic max-w-xs block truncate">{ac.obs}</span>}
                      </td>
                      <td className="px-5 py-3.5 font-semibold text-slate-600">{ac.tipo}</td>
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-800">{formatBRL(ac.valor)}</div>
                        <div className="text-[10px] text-slate-400">Qtd: {ac.qtd}x</div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-medium text-slate-800">
                          {ac.instalacao ? new Date(ac.instalacao + 'T00:00:00').toLocaleDateString('pt-BR') : 'Sem data'}
                        </div>
                        <div className="text-[10px] text-slate-500 font-bold flex items-center gap-1">
                          <Tag className="w-3 h-3 text-blue-500" /> {ac.garantia}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        {isActive ? (
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200/60 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 w-fit">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Ativo
                          </span>
                        ) : isMaintenance ? (
                          <span className="bg-amber-50 text-amber-700 border border-amber-200/60 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 w-fit">
                            <Wrench className="w-3 h-3" /> Em manutenção
                          </span>
                        ) : (
                          <span className="bg-rose-50 text-rose-700 border border-rose-200/60 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 w-fit">
                            Inativo
                          </span>
                        )}
                      </td>
                      {canModify && (
                        <td className="px-5 py-3.5 text-right space-x-1 whitespace-nowrap">
                          <button
                            onClick={() => openEditModal(ac)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors inline-flex"
                            title="Editar Acessório"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => startArchive(ac.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors inline-flex"
                            title="Arquivar Acessório"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={canModify ? 7 : 6} className="text-center py-8 text-slate-400 font-medium">
                    Nenhum acessório registrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
                  <Layers className="w-5 h-5 text-blue-600" />
                  {editingAcessorio ? 'Editar Acessório' : 'Instalar Novo Acessório'}
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

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Nome do Acessório *
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Central Multimídia Pioneer"
                      value={nome}
                      onChange={e => setNome(e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Categoria
                      </label>
                      <select
                        value={tipo}
                        onChange={e => setTipo(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                      >
                        {accessoryTypes.map(t => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Quantidade
                      </label>
                      <input
                        type="number"
                        placeholder="1"
                        value={qtd}
                        onChange={e => setQtd(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                        min="1"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Valor Unitário / Total (R$) *
                      </label>
                      <input
                        type="number"
                        placeholder="Ex: 1200"
                        value={valor}
                        onChange={e => setValor(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                        required
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Garantia
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: 1 ano de fábrica"
                        value={garantia}
                        onChange={e => setGarantia(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                      />
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
                        Status do Equipamento
                      </label>
                      <select
                        value={status}
                        onChange={e => setStatus(e.target.value as any)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                      >
                        <option value="Ativo">Ativo</option>
                        <option value="Inativo">Inativo</option>
                        <option value="Em manutenção">Em manutenção</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Observações adicionais
                    </label>
                    <textarea
                      placeholder="Modelo, marca, ou outras notas de instalação..."
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
                    Salvar Acessório
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
                  Mover Acessório para Arquivo Morto?
                </div>
                <p className="text-slate-600 text-sm leading-relaxed mb-4">
                  Esta ação não destrói o histórico de faturamento ou compra, mas remove o acessório do inventário ativo do veículo.
                </p>
                <div className="flex flex-col gap-1.5 mb-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Motivo do arquivamento *
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Quebrado e substituído por modelo superior"
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
                  Você realizou alterações no formulário de acessórios. Se você sair agora, as novas informações <strong>não serão salvas</strong> e as alterações serão perdidas.
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
