import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Archive,
  Search,
  RotateCcw,
  Eye,
  X,
  Calendar,
  User,
  Info,
  Layers,
  FileText,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { ArquivoMortoItem } from '../types';

interface ArquivoMortoViewProps {
  arquivoMorto: ArquivoMortoItem[];
  onRestoreItem: (item: ArquivoMortoItem) => void;
  onDeleteArchiveItem: (item: ArquivoMortoItem) => void;
  onTriggerToast: (msg: string, type: 'success' | 'warning' | 'error' | 'info') => void;
  userRole: string;
}

export default function ArquivoMortoView({
  arquivoMorto,
  onRestoreItem,
  onDeleteArchiveItem,
  onTriggerToast,
  userRole
}: ArquivoMortoViewProps) {
  const [search, setSearch] = useState('');
  const [tipoFilter, setTipoFilter] = useState('Todos');
  const [viewingItem, setViewingItem] = useState<ArquivoMortoItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<ArquivoMortoItem | null>(null);
  const [restoringItem, setRestoringItem] = useState<ArquivoMortoItem | null>(null);

  const canModify = userRole === 'Administrador' || userRole === 'Operador' || userRole === 'Financeiro';

  const formatBRL = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const handleRestore = (item: ArquivoMortoItem) => {
    setRestoringItem(item);
  };

  const tipos = [
    'Todos',
    'Veículo',
    'Motorista',
    'Contrato',
    'Pagamento',
    'Manutenção',
    'Documento',
    'Seguradora',
    'Apólice',
    'Rastreador',
    'Acessório'
  ];

  const filteredItems = arquivoMorto.filter(item => {
    const matchesTipo = tipoFilter === 'Todos' || item.tipo === tipoFilter;

    // Search into stringified item data for maximum flexibility
    const dataString = JSON.stringify(item.dados).toLowerCase();
    const matchesSearch =
      dataString.includes(search.toLowerCase()) ||
      item.motivo_arquivamento.toLowerCase().includes(search.toLowerCase()) ||
      item.arquivado_por.toLowerCase().includes(search.toLowerCase());

    return matchesTipo && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Informative Header Banner */}
      <div className="bg-slate-100 border border-slate-200/60 rounded-xl p-4 flex gap-3 text-slate-700">
        <Info className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <strong className="text-slate-800">Sobre o Arquivo Morto:</strong>
          <p className="text-slate-600 leading-relaxed">
            Nenhum registro no AutoERP é excluído definitivamente. Ao remover veículos, motoristas, contratos ou finanças, eles são enviados com segurança para cá. Isso preserva as relações históricas, as auditorias financeiras e possibilita a recuperação de dados caso necessário.
          </p>
        </div>
      </div>

      {/* Action Header */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-5 h-5 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Pesquisar por conteúdo, motivo, responsável..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 text-sm shadow-2xs"
          />
        </div>
      </div>

      {/* Categories Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-2">
        {tipos.map(t => (
          <button
            key={t}
            onClick={() => setTipoFilter(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all ${
              tipoFilter === t
                ? 'bg-slate-200 text-slate-800 font-bold border-b-2 border-slate-700'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Main List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <h3 className="font-bold text-slate-800 text-sm tracking-tight uppercase flex items-center gap-2">
            <Archive className="w-4 h-4 text-slate-600" /> Histórico de Registros Arquivados
          </h3>
          <span className="bg-slate-100 text-slate-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
            {filteredItems.length} arquivados
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 text-slate-500 text-[10px] uppercase font-bold tracking-wider border-b border-slate-100">
                <th className="px-5 py-3.5">Categoria</th>
                <th className="px-5 py-3.5">Identificador do Registro</th>
                <th className="px-5 py-3.5">Arquivado Em</th>
                <th className="px-5 py-3.5">Responsável</th>
                <th className="px-5 py-3.5">Motivo / Justificativa</th>
                <th className="px-5 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {filteredItems.length > 0 ? (
                filteredItems.map(item => {
                  // Figure out a friendly identifier label based on the entity type
                  let label = item.originalId;
                  if (item.tipo === 'Veículo') {
                    label = `Placa: ${item.dados.placa} (${item.dados.modelo})`;
                  } else if (item.tipo === 'Motorista') {
                    label = `${item.dados.nome} (${item.originalId})`;
                  } else if (item.tipo === 'Contrato') {
                    label = `Contrato nº ${item.originalId} (${item.dados.veiculoPlaca})`;
                  } else if (item.tipo === 'Pagamento') {
                    label = `Parcela ${item.originalId} (${formatBRL(item.dados.valor)})`;
                  } else if (item.tipo === 'Manutenção') {
                    label = `Manutenção ${item.dados.tipo} (${item.dados.veiculoPlaca})`;
                  } else if (item.tipo === 'Documento') {
                    label = `Doc: ${item.dados.tipo} (${item.dados.veiculoPlaca})`;
                  } else if (item.tipo === 'Seguradora') {
                    label = item.dados.nome;
                  } else if (item.tipo === 'Apólice') {
                    label = `Seguro nº ${item.dados.numero} (${item.dados.veiculoPlaca})`;
                  } else if (item.tipo === 'Rastreador') {
                    label = `Rastreador Suntech (${item.dados.veiculoPlaca})`;
                  } else if (item.tipo === 'Acessório') {
                    label = `${item.dados.nome} (${item.dados.veiculoPlaca})`;
                  }

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-3.5">
                        <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded-md uppercase border border-slate-200">
                          {item.tipo}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-semibold text-slate-900 truncate max-w-xs">{label}</td>
                      <td className="px-5 py-3.5 font-medium">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          {new Date(item.arquivado_em + 'T00:00:00').toLocaleDateString('pt-BR')}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-medium flex items-center gap-1.5 mt-1.5">
                        <User className="w-3.5 h-3.5 text-blue-500" />
                        <span>{item.arquivado_por}</span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-500 max-w-xs truncate">{item.motivo_arquivamento}</td>
                      <td className="px-5 py-3.5 text-right space-x-1 whitespace-nowrap">
                        <button
                          onClick={() => setViewingItem(item)}
                          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors inline-flex"
                          title="Visualizar Registro Original"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleRestore(item)}
                          className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors inline-flex"
                          title="Restaurar para Ativo"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        {canModify && (
                          <button
                            onClick={() => setDeletingItem(item)}
                            className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors inline-flex"
                            title="Excluir Permanentemente"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-400 font-semibold">
                    Nenhum registro arquivado nesta categoria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* DETAIL MODAL */}
      <AnimatePresence>
        {viewingItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200"
            >
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
                <h3 className="font-extrabold text-slate-800 text-sm tracking-tight flex items-center gap-2 uppercase">
                  <Archive className="w-4 h-4 text-slate-600" />
                  Detalhes do {viewingItem.tipo} Arquivado
                </h3>
                <button
                  onClick={() => setViewingItem(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
                {/* Metadados de arquivamento */}
                <div className="grid grid-cols-2 gap-4 bg-amber-50/50 border border-amber-200/50 rounded-xl p-4 text-xs text-amber-900">
                  <div className="space-y-1">
                    <span className="text-slate-400 block font-bold uppercase tracking-wide text-[9px]">Data de Arquivamento</span>
                    <span className="font-bold flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-amber-600" />
                      {new Date(viewingItem.arquivado_em + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-slate-400 block font-bold uppercase tracking-wide text-[9px]">Responsável</span>
                    <span className="font-bold flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-amber-600" />
                      {viewingItem.arquivado_por}
                    </span>
                  </div>
                  <div className="col-span-2 space-y-1 pt-2 border-t border-amber-200/30">
                    <span className="text-slate-400 block font-bold uppercase tracking-wide text-[9px]">Motivo do arquivamento</span>
                    <span className="font-semibold leading-relaxed">"{viewingItem.motivo_arquivamento}"</span>
                  </div>
                </div>

                {/* Dados brutos em formato amigável */}
                <div className="space-y-3">
                  <h4 className="text-slate-800 text-xs font-extrabold uppercase tracking-wide">Ficha de Dados Salva</h4>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-medium text-slate-700 divide-y divide-slate-100">
                    {Object.entries(viewingItem.dados).map(([key, val]) => {
                      if (val === null || val === undefined || typeof val === 'object') return null;
                      return (
                        <div key={key} className="flex justify-between py-2">
                          <span className="text-slate-400 font-bold uppercase text-[9px]">{key}</span>
                          <span className="text-slate-800 font-semibold">{val.toString()}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex gap-2 justify-end">
                <button
                  onClick={() => setViewingItem(null)}
                  className="bg-slate-800 hover:bg-slate-950 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all"
                >
                  Fechar
                </button>
                <button
                  onClick={() => {
                    const item = viewingItem;
                    setViewingItem(null);
                    handleRestore(item);
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all shadow-xs flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Restaurar Registro
                </button>
                {canModify && (
                  <button
                    onClick={() => {
                      const item = viewingItem;
                      setViewingItem(null);
                      setDeletingItem(item);
                    }}
                    className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all shadow-xs flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Excluir Permanentemente
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CONFIRM DELETE MODAL */}
      <AnimatePresence>
        {deletingItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200"
            >
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-rose-50">
                <h3 className="font-extrabold text-rose-800 text-sm tracking-tight flex items-center gap-2 uppercase">
                  <AlertTriangle className="w-5 h-5 text-rose-600" />
                  Confirmar Exclusão Permanente
                </h3>
                <button
                  onClick={() => setDeletingItem(null)}
                  className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="text-sm text-slate-600 leading-relaxed space-y-2">
                  <p>
                    Você está prestes a excluir permanentemente o registro de <strong>{deletingItem.tipo}</strong>:
                  </p>
                  <div className="p-3 bg-slate-100 rounded-lg font-bold text-slate-850 border border-slate-200 text-xs">
                    {deletingItem.tipo === 'Veículo' && `Placa: ${deletingItem.dados.placa} (${deletingItem.dados.modelo})`}
                    {deletingItem.tipo === 'Motorista' && `${deletingItem.dados.nome} (CPF: ${deletingItem.originalId})`}
                    {deletingItem.tipo === 'Contrato' && `Contrato nº ${deletingItem.originalId} (${deletingItem.dados.veiculoPlaca})`}
                    {deletingItem.tipo === 'Pagamento' && `Parcela ${deletingItem.originalId} (${formatBRL(deletingItem.dados.valor)})`}
                    {deletingItem.tipo === 'Manutenção' && `Manutenção ${deletingItem.dados.tipo} (${deletingItem.dados.veiculoPlaca})`}
                    {deletingItem.tipo === 'Documento' && `Doc: ${deletingItem.dados.tipo} (${deletingItem.dados.veiculoPlaca})`}
                    {deletingItem.tipo === 'Seguradora' && deletingItem.dados.nome}
                    {deletingItem.tipo === 'Apólice' && `Seguro nº ${deletingItem.dados.numero} (${deletingItem.dados.veiculoPlaca})`}
                    {deletingItem.tipo === 'Rastreador' && `Rastreador Suntech (${deletingItem.dados.veiculoPlaca})`}
                    {deletingItem.tipo === 'Acessório' && `${deletingItem.dados.nome} (${deletingItem.dados.veiculoPlaca})`}
                  </div>
                  <p className="text-xs text-rose-600 font-extrabold flex gap-1.5 items-start bg-rose-50 border border-rose-100 p-3 rounded-lg leading-normal">
                    <span className="shrink-0 text-base">⚠️</span>
                    <span>ATENÇÃO: Esta ação é irreversível! O registro será excluído permanentemente da lixeira e não poderá ser recuperado ou restaurado de forma alguma.</span>
                  </p>
                </div>
              </div>

              <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex gap-2 justify-end">
                <button
                  onClick={() => setDeletingItem(null)}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold px-4 py-2 rounded-lg transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    onDeleteArchiveItem(deletingItem);
                    setDeletingItem(null);
                  }}
                  className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all shadow-xs flex items-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" /> Sim, Excluir Definitivamente
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CONFIRM RESTORE MODAL */}
      <AnimatePresence>
        {restoringItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200"
            >
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-blue-50">
                <h3 className="font-extrabold text-blue-800 text-sm tracking-tight flex items-center gap-2 uppercase">
                  <RotateCcw className="w-5 h-5 text-blue-600" />
                  Confirmar Restauração
                </h3>
                <button
                  onClick={() => setRestoringItem(null)}
                  className="p-1.5 text-blue-400 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="text-sm text-slate-600 leading-relaxed space-y-2">
                  <p>
                    Deseja realmente reativar e restaurar o registro de <strong>{restoringItem.tipo}</strong> para o painel ativo?
                  </p>
                  <div className="p-3 bg-slate-100 rounded-lg font-bold text-slate-850 border border-slate-200 text-xs">
                    {restoringItem.tipo === 'Veículo' && `Placa: ${restoringItem.dados.placa} (${restoringItem.dados.modelo})`}
                    {restoringItem.tipo === 'Motorista' && `${restoringItem.dados.nome} (CPF: ${restoringItem.originalId})`}
                    {restoringItem.tipo === 'Contrato' && `Contrato nº ${restoringItem.originalId} (${restoringItem.dados.veiculoPlaca})`}
                    {restoringItem.tipo === 'Pagamento' && `Parcela ${restoringItem.originalId} (${formatBRL(restoringItem.dados.valor)})`}
                    {restoringItem.tipo === 'Manutenção' && `Manutenção ${restoringItem.dados.tipo} (${restoringItem.dados.veiculoPlaca})`}
                    {restoringItem.tipo === 'Documento' && `Doc: ${restoringItem.dados.tipo} (${restoringItem.dados.veiculoPlaca})`}
                    {restoringItem.tipo === 'Seguradora' && restoringItem.dados.nome}
                    {restoringItem.tipo === 'Apólice' && `Seguro nº ${restoringItem.dados.numero} (${restoringItem.dados.veiculoPlaca})`}
                    {restoringItem.tipo === 'Rastreador' && `Rastreador (${restoringItem.dados.veiculoPlaca})`}
                    {restoringItem.tipo === 'Acessório' && `${restoringItem.dados.nome} (${restoringItem.dados.veiculoPlaca})`}
                  </div>
                  <p className="text-xs text-blue-600 font-medium flex gap-1.5 items-start bg-blue-50 border border-blue-100 p-3 rounded-lg leading-normal">
                    <span className="shrink-0 text-base">ℹ️</span>
                    <span>O registro reaparecerá nas suas listagens e tabelas operacionais e todas as integrações associadas serão processadas novamente.</span>
                  </p>
                </div>
              </div>

              <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex gap-2 justify-end">
                <button
                  onClick={() => setRestoringItem(null)}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold px-4 py-2 rounded-lg transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    onRestoreItem(restoringItem);
                    setRestoringItem(null);
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all shadow-xs flex items-center gap-1.5"
                >
                  <RotateCcw className="w-4 h-4" /> Sim, Reativar Registro
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
