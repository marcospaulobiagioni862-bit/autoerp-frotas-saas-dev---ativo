import React, { useState } from 'react';
import { AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { ModalContainer } from './ModalContainer';
import { Button } from './Button';
import { Input } from './Input';

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => void | Promise<void>;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'primary';
  requireReason?: boolean;
  reasonPlaceholder?: string;
  isLoading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'danger',
  requireReason = false,
  reasonPlaceholder = 'Informe o motivo...',
  isLoading = false,
}) => {
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');

  const handleConfirm = async () => {
    if (requireReason && !reason.trim()) {
      setReasonError('O motivo é obrigatório para esta operação.');
      return;
    }
    setReasonError('');
    await onConfirm(reason.trim());
    setReason('');
  };

  const handleClose = () => {
    setReason('');
    setReasonError('');
    onClose();
  };

  const iconMap = {
    danger: <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />,
    warning: <AlertCircle className="w-6 h-6 text-amber-600 dark:text-amber-400" />,
    primary: <Info className="w-6 h-6 text-blue-600 dark:text-blue-400" />,
  };

  const buttonVariantMap = {
    danger: 'danger' as const,
    warning: 'primary' as const,
    primary: 'primary' as const,
  };

  return (
    <ModalContainer isOpen={isOpen} onClose={handleClose} title={title} maxWidth="md">
      <div className="flex items-start gap-4">
        <div className="p-2.5 rounded-full bg-slate-100 dark:bg-slate-800 shrink-0">
          {iconMap[variant]}
        </div>
        <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
          <p>{message}</p>

          {requireReason && (
            <div className="pt-2">
              <Input
                label="Motivo"
                required
                placeholder={reasonPlaceholder}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (e.target.value.trim()) setReasonError('');
                }}
                error={reasonError}
              />
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800 mt-4">
        <Button variant="outline" onClick={handleClose} disabled={isLoading}>
          {cancelLabel}
        </Button>
        <Button
          variant={buttonVariantMap[variant]}
          onClick={handleConfirm}
          isLoading={isLoading}
        >
          {confirmLabel}
        </Button>
      </div>
    </ModalContainer>
  );
};
