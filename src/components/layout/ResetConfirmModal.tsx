import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Trash2, X, ShieldAlert, Check, Loader2, ArrowRight, RotateCcw, Database, FileText, Calendar } from 'lucide-react';
import { PlanilhaBackupDetails } from '../../types';

interface ResetConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmReset: (motivo?: string) => Promise<void> | void;
  recordDetails: PlanilhaBackupDetails;
  periodoStr: string;
  userRole: 'Administrador' | 'Financeiro' | 'Operador' | 'Consulta' | 'Somente leitura';
  isProcessing?: boolean;
}

export default function ResetConfirmModal({
  isOpen,
  onClose,
  onConfirmReset,
  recordDetails,
  periodoStr,
  userRole,
  isProcessing = false
}: ResetConfirmModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [confirmationInput, setConfirmationInput] = useState('');
  const [motivo, setMotivo] = useState('');

  // Permission check: Administrador or Financeiro permitted
  const isAuthorized = userRole === 'Administrador' || userRole === 'Financeiro';

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setConfirmationInput('');
      setMotivo('');
    }
  }, [isOpen]);

  const isDoubleConfirmValid = confirmationInput.trim().toUpperCase() === 'ZERAR';

  const handleExecuteReset = async () => {
    if (!isAuthorized || !isDoubleConfirmValid || isProcessing) return;
    await onConfirmReset(motivo.trim() || undefined);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden border border-red-200"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-red-100 flex items-center justify-between bg-gradient-to-r from-red-50 via-rose-50 to-orange-50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-red-600/10 border border-red-200 flex items-center justify-center text-red-600 shadow-xs">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-red-900 text-base tracking-tight uppercase">
                    Zerar Planilha / Exclusão Completa
                  </h3>
                  <span className="text-[11px] font-semibold text-red-600 block">
                    Etapa {step} de 2 — {step === 1 ? 'Análise e Confirmação' : 'Dupla Autenticação'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={isProcessing}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              {!isAuthorized ? (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-800 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-extrabold text-red-700">
                    <ShieldAlert className="w-5 h-5 shrink-0" />
                    <span>Acesso Não Autorizado</span>
                  </div>
                  <p className="text-xs leading-relaxed text-red-700">
                    Você está conectado como <strong className="uppercase">{userRole}</strong>. A função <strong>ZERAR PLANILHA</strong> exige autorização de Nível <strong>Administrador</strong> ou <strong>Financeiro</strong>.
                  </p>
                  <p className="text-[11px] text-red-600 font-semibold">
                    Solicite permissão ao administrador do sistema para executar esta ação crítica.
                  </p>
                </div>
              ) : step === 1 ? (
                /* ETAPA 1 */
                <div className="space-y-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-black text-amber-900 uppercase">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                      TEM CERTEZA QUE DESEJA ZERAR A PLANILHA?
                    </div>
                    <p className="text-xs font-semibold text-amber-800 leading-relaxed">
                      Todos os dados inseridos nas células e tabelas da planilha serão removidos. Esta ação pode ser revertida através do backup automático criado imediatamente antes da exclusão.
                    </p>
                  </div>

                  {/* Detalhes da Planilha */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <span className="text-xs font-extrabold text-slate-700 uppercase flex items-center gap-1.5">
                        <Database className="w-4 h-4 text-red-600" /> AutoERP — Base Completa
                      </span>
                      <span className="bg-red-100 text-red-700 text-[11px] font-black px-2 py-0.5 rounded-full">
                        {recordDetails.totalGeral} registro(s) a apagar
                      </span>
                    </div>

                    <div className="text-xs text-slate-600 space-y-2">
                      <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" /> Período dos dados:
                        </span>
                        <strong className="text-slate-800 font-mono">{periodoStr}</strong>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-200/80">
                        <div className="bg-white p-2 rounded-lg border border-slate-200 flex justify-between">
                          <span className="text-slate-500">Veículos:</span>
                          <strong className="text-slate-800">{recordDetails.veiculos}</strong>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-slate-200 flex justify-between">
                          <span className="text-slate-500">Motoristas:</span>
                          <strong className="text-slate-800">{recordDetails.motoristas}</strong>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-slate-200 flex justify-between">
                          <span className="text-slate-500">Contratos:</span>
                          <strong className="text-slate-800">{recordDetails.contratos}</strong>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-slate-200 flex justify-between">
                          <span className="text-slate-500">Pagamentos/Receb.:</span>
                          <strong className="text-slate-800">{recordDetails.pagamentos + recordDetails.contasReceber}</strong>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-slate-200 flex justify-between">
                          <span className="text-slate-500">Ordens de Serviço:</span>
                          <strong className="text-slate-800">{recordDetails.manutencoes}</strong>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-slate-200 flex justify-between">
                          <span className="text-slate-500">Documentos/Seguros:</span>
                          <strong className="text-slate-800">{recordDetails.documentos + recordDetails.apolices}</strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* O que é preservado */}
                  <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-3 text-xs text-emerald-900 space-y-1">
                    <span className="font-bold text-emerald-950 block">✅ A estrutura da planilha permanece 100% intacta:</span>
                    <p className="text-[11px] text-emerald-800 leading-normal">
                      Títulos, cabeçalhos, fórmulas de cálculo, regras do DETRAN, máscaras, categorias padrão, permissões e configurações do ERP serão mantidos para novas digitações.
                    </p>
                  </div>

                  {/* Motivo da exclusão */}
                  <div className="space-y-1">
                    <label className="text-xs font-extrabold text-slate-700 block">
                      Motivo do Zeramento (Opcional — Registrado em Auditoria):
                    </label>
                    <input
                      type="text"
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      placeholder="Ex: Início de novo ciclo fiscal / Limpeza de testes"
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:border-red-500"
                    />
                  </div>
                </div>
              ) : (
                /* ETAPA 2 — DUPLA CONFIRMAÇÃO */
                <div className="space-y-4 py-2">
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2 text-center">
                    <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center text-white mx-auto shadow-md shadow-red-500/20">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                    <h4 className="font-black text-red-900 text-sm uppercase tracking-wide">
                      Dupla Confirmação Obrigatória
                    </h4>
                    <p className="text-xs font-bold text-slate-700">
                      Para confirmar a remoção permanente dos <span className="text-red-600 font-extrabold">{recordDetails.totalGeral} registros</span> da planilha, digite a palavra abaixo:
                    </p>
                  </div>

                  <div className="space-y-2 max-w-sm mx-auto text-center">
                    <label className="text-xs font-black text-slate-700 uppercase block tracking-wider">
                      Digite <span className="text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200">ZERAR</span> para liberar:
                    </label>
                    <input
                      type="text"
                      value={confirmationInput}
                      onChange={(e) => setConfirmationInput(e.target.value)}
                      disabled={isProcessing}
                      autoFocus
                      placeholder="Digite ZERAR aqui"
                      className={`w-full text-center tracking-widest font-black uppercase text-base px-4 py-2.5 rounded-xl border-2 transition-all shadow-xs ${
                        isDoubleConfirmValid
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                          : 'border-slate-300 bg-white text-slate-800 focus:border-red-500 focus:outline-none'
                      }`}
                    />
                    {confirmationInput && !isDoubleConfirmValid && (
                      <span className="text-[11px] font-bold text-red-500 block">
                        Por favor, digite exatamente a palavra ZERAR
                      </span>
                    )}
                    {isDoubleConfirmValid && (
                      <span className="text-[11px] font-extrabold text-emerald-600 flex items-center justify-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Texto de confirmação correto! Botão liberado.
                      </span>
                    )}
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] text-slate-600 text-center">
                    🔒 <strong>Segurança Garante:</strong> Um backup automático com data ({new Date().toLocaleDateString('pt-BR')}) e hora será salvo no Histórico de Backups antes do expurgo.
                  </div>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
              {step === 2 && !isProcessing ? (
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold px-4 py-2.5 rounded-xl transition-all cursor-pointer"
                >
                  ← Voltar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isProcessing}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold px-4 py-2.5 rounded-xl transition-all cursor-pointer"
                >
                  Cancelar (Manter Dados)
                </button>
              )}

              {isAuthorized && (
                step === 1 ? (
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="bg-red-600 hover:bg-red-700 text-white text-xs font-black px-5 py-2.5 rounded-xl transition-all shadow-md shadow-red-600/20 flex items-center gap-2 cursor-pointer uppercase tracking-wide"
                  >
                    <span>Sim, Continuar para Zerar</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleExecuteReset}
                    disabled={!isDoubleConfirmValid || isProcessing}
                    className={`text-xs font-black px-6 py-2.5 rounded-xl transition-all shadow-md flex items-center gap-2 uppercase tracking-wide ${
                      isDoubleConfirmValid && !isProcessing
                        ? 'bg-red-600 hover:bg-red-700 text-white cursor-pointer shadow-red-600/20 active:scale-95'
                        : 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
                    }`}
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Zerando Planilha...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        <span>Confirmar Exclusão</span>
                      </>
                    )}
                  </button>
                )
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
