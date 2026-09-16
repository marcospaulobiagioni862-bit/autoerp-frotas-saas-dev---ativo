import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RotateCcw, X, CheckCircle2, ShieldCheck } from 'lucide-react';

interface UndoToastBannerProps {
  isVisible: boolean;
  onUndo: () => void;
  onDismiss: () => void;
  durationSeconds?: number;
}

export default function UndoToastBanner({
  isVisible,
  onUndo,
  onDismiss,
  durationSeconds = 30
}: UndoToastBannerProps) {
  const [timeLeft, setTimeLeft] = useState(durationSeconds);

  useEffect(() => {
    if (!isVisible) {
      setTimeLeft(durationSeconds);
      return;
    }

    setTimeLeft(durationSeconds);

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onDismiss();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isVisible, durationSeconds, onDismiss]);

  if (!isVisible) return null;

  const progressPercentage = (timeLeft / durationSeconds) * 100;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4 no-print"
        >
          <div className="bg-slate-900 border border-slate-700 text-white rounded-2xl shadow-2xl overflow-hidden p-4 relative backdrop-blur-md">
            {/* Countdown Progress Bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-slate-800">
              <motion.div
                className="h-full bg-gradient-to-r from-red-500 via-amber-500 to-emerald-500"
                style={{ width: `${progressPercentage}%` }}
                transition={{ duration: 1, ease: 'linear' }}
              />
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm text-white flex items-center gap-1.5">
                    Planilha zerada com sucesso!
                  </h4>
                  <p className="text-[11px] text-slate-300 font-medium">
                    Backup automático salvo ({timeLeft}s para desfazer)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={onUndo}
                  className="bg-red-600 hover:bg-red-700 text-white font-black text-xs px-4 py-2 rounded-xl transition-all shadow-md shadow-red-600/30 flex items-center gap-1.5 cursor-pointer uppercase tracking-wider active:scale-95"
                >
                  <RotateCcw className="w-4 h-4 shrink-0" />
                  <span>Desfazer ({timeLeft}s)</span>
                </button>

                <button
                  type="button"
                  onClick={onDismiss}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                  title="Fechar notificação"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
