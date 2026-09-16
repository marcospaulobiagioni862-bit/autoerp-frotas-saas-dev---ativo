import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Database, Download, RotateCcw, Trash2, X, Calendar, User, FileText, CheckCircle2, ShieldCheck } from 'lucide-react';
import { PlanilhaBackup } from '../../types';

interface BackupManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  backups: PlanilhaBackup[];
  onRestoreBackup: (backup: PlanilhaBackup) => void;
  onDeleteBackup: (backupId: string) => void;
}

export default function BackupManagerModal({
  isOpen,
  onClose,
  backups,
  onRestoreBackup,
  onDeleteBackup
}: BackupManagerModalProps) {
  const [selectedBackup, setSelectedBackup] = useState<PlanilhaBackup | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDownloadJSON = (b: PlanilhaBackup) => {
    const jsonString = JSON.stringify(b, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeDate = b.dataHora.replace(/[:/ ]/g, '_');
    link.href = url;
    link.download = `AutoERP_Backup_${safeDate}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden border border-slate-200"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-red-600/20 border border-red-500/30 flex items-center justify-center text-red-400">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-white text-base tracking-tight uppercase flex items-center gap-2">
                    Gerenciador de Backups & Restauração
                  </h3>
                  <span className="text-xs text-slate-400 block font-medium">
                    Histórico de backups automáticos gerados ao zerar a planilha
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto bg-slate-50">
              {backups.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 p-8 space-y-3">
                  <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mx-auto">
                    <Database className="w-7 h-7" />
                  </div>
                  <h4 className="font-black text-slate-800 text-sm uppercase">
                    Nenhum Backup Registrado
                  </h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                    O sistema cria automaticamente um backup completo sempre que você clica em <strong>ZERAR PLANILHA</strong>. Como nenhuma exclusão foi feita ainda, não há backups armazenados.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {backups.map((b) => {
                    const isSelected = selectedBackup?.id === b.id;
                    return (
                      <div
                        key={b.id}
                        className={`bg-white rounded-xl border transition-all p-4 space-y-3 ${
                          isSelected ? 'border-red-500 ring-2 ring-red-500/10 shadow-md' : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="bg-red-100 text-red-800 font-black text-[10px] px-2 py-0.5 rounded-md uppercase tracking-wider">
                                Backup Automático
                              </span>
                              <span className="text-xs font-black text-slate-800">
                                {b.nomePlanilha}
                              </span>
                            </div>
                            <div className="flex items-center gap-4 text-[11px] text-slate-500 mt-1 font-medium">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5 text-slate-400" /> {b.dataHora}
                              </span>
                              <span className="flex items-center gap-1">
                                <User className="w-3.5 h-3.5 text-slate-400" /> Responsável: <strong className="text-slate-700">{b.usuarioResponsavel}</strong>
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleDownloadJSON(b)}
                              title="Baixar arquivo de backup em JSON"
                              className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" /> Baixar
                            </button>

                            <button
                              type="button"
                              onClick={() => onRestoreBackup(b)}
                              title="Restaurar este backup na planilha atual"
                              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black px-3.5 py-1.5 rounded-lg transition-all shadow-xs flex items-center gap-1 cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" /> Restaurar
                            </button>

                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(b.id)}
                              title="Excluir este backup"
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Summary metrics */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                          <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                            <span className="text-slate-400 block text-[10px] font-bold">TOTAL DE REGISTROS</span>
                            <strong className="text-red-600 font-extrabold text-sm">{b.quantidadeRegistrosTotal}</strong>
                          </div>
                          <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                            <span className="text-slate-400 block text-[10px] font-bold">VEÍCULOS / MOTORISTAS</span>
                            <strong className="text-slate-800">{b.detalhesRegistros?.veiculos || 0} veíc / {b.detalhesRegistros?.motoristas || 0} mot</strong>
                          </div>
                          <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                            <span className="text-slate-400 block text-[10px] font-bold">CONTRATOS & FINANCEIRO</span>
                            <strong className="text-slate-800">{b.detalhesRegistros?.contratos || 0} contr / {b.detalhesRegistros?.pagamentos || 0} pag</strong>
                          </div>
                          <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                            <span className="text-slate-400 block text-[10px] font-bold">PERÍODO APROXIMADO</span>
                            <strong className="text-slate-700 font-mono text-[10px] truncate block">{b.periodoInicio || 'Geral'}</strong>
                          </div>
                        </div>

                        {b.motivoExclusao && (
                          <div className="text-[11px] text-slate-600 bg-amber-50/60 border border-amber-100 p-2 rounded-lg">
                            💬 <strong>Motivo informado:</strong> {b.motivoExclusao}
                          </div>
                        )}

                        {/* Confirmation for Delete Backup */}
                        {confirmDeleteId === b.id && (
                          <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center justify-between gap-3 text-xs">
                            <span className="text-red-800 font-bold">
                              Tem certeza que deseja excluir este backup permanentemente?
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="bg-white hover:bg-slate-100 text-slate-700 px-3 py-1 rounded-lg font-bold border border-slate-200 cursor-pointer"
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteBackup(b.id);
                                  setConfirmDeleteId(null);
                                }}
                                className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-lg font-black cursor-pointer shadow-xs"
                              >
                                Excluir Backup
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3.5 border-t border-slate-200 bg-white flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" /> Backups são salvos localmente e protegidos contra falhas.
              </span>
              <button
                type="button"
                onClick={onClose}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold px-4 py-2 rounded-xl transition-all cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
