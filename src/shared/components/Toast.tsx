import { motion } from 'motion/react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { useEffect } from 'react';

interface ToastProps {
  message: string;
  type: 'success' | 'warning' | 'error' | 'info';
  onClose: () => void;
}

export default function Toast({ message, type, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgClasses = {
    success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    warning: 'bg-amber-50 text-amber-800 border-amber-200',
    error: 'bg-rose-50 text-rose-800 border-rose-200',
    info: 'bg-blue-50 text-blue-800 border-blue-200',
  };

  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-600" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-600" />,
    error: <X className="w-5 h-5 text-rose-600" />,
    info: <Info className="w-5 h-5 text-blue-600" />,
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg max-w-sm ${bgClasses[type]}`}
    >
      {icons[type]}
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="text-slate-400 hover:text-slate-600 ml-auto pl-2">
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
}
