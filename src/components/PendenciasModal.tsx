import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertTriangle,
  CheckCircle2,
  X,
  Plus,
  Trash2,
  Calendar,
  User,
  PlusCircle,
  Download,
  Clock,
  Info,
  Check,
  RotateCcw
} from 'lucide-react';
import { PendenciaItem } from '../hooks/usePendencias';

interface PendenciasModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'startup' | 'shutdown';
  pendencies: PendenciaItem[];
  customTasks: PendenciaItem[];
  onAddCustomTask: (task: { titulo: string; prioridade: 'Alta' | 'Média' | 'Baixa'; responsavel: string; vencimento: string }) => void;
  onResolveItem: (id: string) => void;
  onDeleteCustomTask: (id: string) => void;
  onSnooze: () => void;
  onConfirmExit: () => void;
  onCancelExit: () => void;
}

export default function PendenciasModal({
  isOpen,
  onClose,
  mode,
  pendencies,
  customTasks,
  onAddCustomTask,
  onResolveItem,
  onDeleteCustomTask,
  onSnooze,
  onConfirmExit,
  onCancelExit
}: PendenciasModalProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<'Alta' | 'Média' | 'Baixa'>('Média');
  const [newResponsible, setNewResponsible] = useState('');
  const [newDueDate, setNewDueDate] = useState(() => new Date().toISOString().split('T')[0]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newResponsible.trim() || !newDueDate) return;

    onAddCustomTask({
      titulo: newTitle.trim(),
      prioridade: newPriority,
      responsavel: newResponsible.trim(),
      vencimento: newDueDate
    });

    setNewTitle('');
    setNewResponsible('');
    setShowAddForm(false);
  };

  const exportToJson = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      customTasks: customTasks,
      activePendencies: pendencies
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `auto_erp_pendencias_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className={`p-5 text-white flex items-center justify-between ${
          mode === 'shutdown' ? 'bg-amber-600' : 'bg-red-600'
        }`}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">
              {mode === 'shutdown' ? '⚠️' : '🔔'}
            </span>
            <div>
              <h2 className="text-lg font-black uppercase tracking-wider">
                {mode === 'shutdown' ? 'Pendências Pendentes no Encerramento' : 'Alerta de Pendências (Hoje & Ontem)'}
              </h2>
              <p className="text-xs text-white/85 font-medium">
                {mode === 'shutdown' 
                  ? 'Você possui tarefas pendentes antes de fechar o sistema.' 
                  : 'Fique em dia com as tarefas operacionais e financeiras de hoje e ontem.'
                }
              </p>
            </div>
          </div>
          {mode === 'startup' && (
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Summary status banner */}
          <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
                pendencies.length > 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
              }`}>
                {pendencies.length}
              </div>
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wide block">Total de Pendências</span>
                <span className="text-sm font-extrabold text-slate-700">
                  {pendencies.length > 0 
                    ? 'Necessitam de sua atenção urgente' 
                    : 'Excelente! Todas as pendências foram resolvidas!'
                  }
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={exportToJson}
              className="inline-flex items-center gap-1.5 text-xs font-black text-slate-500 hover:text-slate-800 bg-white border border-slate-200 shadow-sm px-3 py-1.5 rounded-lg transition-all cursor-pointer"
              title="Salvar como arquivo JSON local"
            >
              <Download className="w-3.5 h-3.5" /> Salvar em JSON
            </button>
          </div>

          {/* Manual Task adding section */}
          {mode === 'startup' && (
            <div className="border border-slate-100 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAddForm(!showAddForm)}
                className="w-full bg-slate-50 hover:bg-slate-100/80 transition-all p-3 text-slate-600 text-xs font-bold flex items-center justify-between border-b border-slate-100 cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <PlusCircle className="w-4 h-4 text-red-500" /> CADASTRAR NOVA TAREFA / PENDÊNCIA MANUAL
                </span>
                <span className="text-xs">{showAddForm ? 'Ocultar' : 'Expandir'}</span>
              </button>

              <AnimatePresence>
                {showAddForm && (
                  <motion.form
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    onSubmit={handleSubmit}
                    className="p-4 bg-white space-y-3 border-t border-slate-100"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-black text-slate-500 uppercase">Título da Pendência *</label>
                        <input
                          type="text"
                          required
                          placeholder="Ex: Assinar vistoria do Palio"
                          value={newTitle}
                          onChange={e => setNewTitle(e.target.value)}
                          className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus:border-red-600"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-black text-slate-500 uppercase">Responsável *</label>
                        <input
                          type="text"
                          required
                          placeholder="Ex: João da Silva"
                          value={newResponsible}
                          onChange={e => setNewResponsible(e.target.value)}
                          className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus:border-red-600"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-black text-slate-500 uppercase">Prioridade</label>
                        <select
                          value={newPriority}
                          onChange={e => setNewPriority(e.target.value as any)}
                          className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-semibold focus:outline-none focus:border-red-600 cursor-pointer"
                        >
                          <option value="Alta">🔴 Alta</option>
                          <option value="Média">🟡 Média</option>
                          <option value="Baixa">🟢 Baixa</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-black text-slate-500 uppercase">Data Limite *</label>
                        <input
                          type="date"
                          required
                          value={newDueDate}
                          onChange={e => setNewDueDate(e.target.value)}
                          className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold focus:outline-none focus:border-red-600"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        type="submit"
                        className="bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs px-4 py-2 rounded-lg shadow-sm transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" /> Adicionar Pendência
                      </button>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Pendencies list */}
          <div className="space-y-3">
            <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider block">
              Lista de Pendências em Aberto
            </h3>

            {pendencies.length === 0 ? (
              <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-2">
                <span className="text-3xl">🎉</span>
                <p className="text-sm font-bold text-slate-500">Nenhuma pendência para ontem ou hoje!</p>
                <p className="text-xs text-slate-400">Excelente trabalho mantendo tudo em ordem.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[38vh] overflow-y-auto pr-1">
                <AnimatePresence initial={false}>
                  {pendencies.map(item => {
                    const isOverdue = item.vencimento < new Date().toISOString().split('T')[0];
                    return (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0, overflow: 'hidden', marginBottom: 0 }}
                        transition={{ duration: 0.2 }}
                        className={`border rounded-xl p-3.5 transition-all flex items-start justify-between gap-4 bg-white hover:border-slate-300 ${
                          item.prioridade === 'Alta' 
                            ? 'border-l-4 border-l-red-600 border-slate-200 shadow-sm' 
                            : item.prioridade === 'Média' 
                            ? 'border-l-4 border-l-amber-500 border-slate-200' 
                            : 'border-l-4 border-l-emerald-500 border-slate-200'
                        }`}
                      >
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${
                              item.prioridade === 'Alta'
                                ? 'bg-red-50 text-red-700 border border-red-200/50'
                                : item.prioridade === 'Média'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200/50'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200/50'
                            }`}>
                              Prioridade: {item.prioridade}
                            </span>
                            <span className="bg-slate-100 text-slate-600 border border-slate-200 text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide uppercase">
                              {item.tipo}
                            </span>
                            {isOverdue && (
                              <span className="bg-rose-50 text-rose-700 border border-rose-200/50 text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider flex items-center gap-0.5 animate-pulse">
                                <Clock className="w-3 h-3" /> ATRASADO!
                              </span>
                            )}
                          </div>

                          <h4 className="text-sm font-bold text-slate-800 leading-snug break-words">
                            {item.titulo}
                          </h4>

                          <div className="flex items-center gap-4 text-[10.5px] text-slate-400 font-medium flex-wrap">
                            <span className="flex items-center gap-1">
                              <User className="w-3.5 h-3.5 text-slate-400" />
                              Responsável: <strong className="text-slate-600">{item.responsavel}</strong>
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              Vencimento: <strong className="text-slate-600">{item.vencimento.split('-').reverse().join('/')}</strong>
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => onResolveItem(item.id)}
                            className="inline-flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 hover:text-emerald-800 text-xs font-black px-2.5 py-1.5 rounded-lg border border-emerald-200 transition-all cursor-pointer"
                            title="Marcar como resolvido"
                          >
                            <Check className="w-3.5 h-3.5" /> Resolver
                          </button>
                          
                          {item.tipo === 'Manual' && (
                            <button
                              type="button"
                              onClick={() => onDeleteCustomTask(item.id)}
                              className="p-1.5 bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-600 border border-slate-200 rounded-lg transition-all cursor-pointer"
                              title="Excluir tarefa"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>

        {/* Footer / Actions based on mode */}
        <div className="bg-slate-50 p-5 border-t border-slate-100 flex items-center justify-between gap-4 flex-wrap">
          {mode === 'startup' ? (
            <>
              <div className="text-[10.5px] text-slate-400 font-medium max-w-sm">
                💡 <em>Dica: As pendências são geradas com base no status financeiro e ordens de serviços agendadas de hoje e ontem.</em>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="bg-slate-800 hover:bg-slate-900 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl shadow-md transition-all uppercase tracking-wider cursor-pointer"
              >
                Prosseguir para o Sistema
              </button>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-0.5 text-slate-600 max-w-sm">
                <span className="text-xs font-black uppercase text-slate-700">Deseja encerrar mesmo com pendências em aberto?</span>
                <span className="text-[10.5px] text-slate-400 font-medium">Se adiar, o lembrete será silenciado até amanhã.</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onCancelExit}
                  className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-extrabold text-xs px-4 py-2.5 rounded-xl transition-all uppercase tracking-wider cursor-pointer"
                >
                  Não, Voltar
                </button>
                <button
                  type="button"
                  onClick={onSnooze}
                  className="bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-200 font-extrabold text-xs px-4 py-2.5 rounded-xl transition-all uppercase tracking-wider cursor-pointer"
                >
                  Adiar Remoto
                </button>
                <button
                  type="button"
                  onClick={onConfirmExit}
                  className="bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-md transition-all uppercase tracking-wider cursor-pointer"
                >
                  Sim, Encerrar
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
