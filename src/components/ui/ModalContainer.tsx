import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { clearUnsavedChanges, markUnsavedChanges, UNSAVED_CHANGES_MESSAGE } from '../../app/unsavedChangesAuthority';

export interface ModalContainerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '5xl' | '6xl' | string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '5xl' | '6xl' | string;
}

export const ModalContainer: React.FC<ModalContainerProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'lg',
  size,
}) => {
  const requireExplicitClose = title === 'Novo Contrato' || title === 'Editar Contrato';
  const guardId = useId();
  const dirtyRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const markDirty = (target: EventTarget | null) => {
    const element = target instanceof HTMLElement ? target : null;
    if (!element || element.closest('[data-unsaved-ignore="true"]')) return;
    const tag = element.tagName.toLowerCase();
    const editable = tag === 'input' || tag === 'textarea' || tag === 'select' || element.isContentEditable;
    if (!editable) return;
    if (element instanceof HTMLInputElement && ['button','submit','reset'].includes(element.type)) return;
    if (element.hasAttribute('readonly') || element.hasAttribute('disabled')) return;
    if (dirtyRef.current) return;
    dirtyRef.current = true;
    markUnsavedChanges(guardId);
  };

  const requestClose = () => {
    if ((dirtyRef.current || containerRef.current?.querySelector('[data-draft-dirty="true"]')) && !window.confirm(UNSAVED_CHANGES_MESSAGE)) return;
    clearUnsavedChanges(guardId);
    dirtyRef.current = false;
    onClose();
  };

  useEffect(() => {
    if (!isOpen) {
      clearUnsavedChanges(guardId);
      dirtyRef.current = false;
      return;
    }
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const appMain = document.querySelector('main') as HTMLElement | null;
    const previousMainOverflow = appMain?.style.overflow || '';
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    if (appMain) appMain.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      if (appMain) appMain.style.overflow = previousMainOverflow;
      clearUnsavedChanges(guardId);
      dirtyRef.current = false;
    };
  }, [isOpen, guardId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !requireExplicitClose) requestClose();
    };
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, requireExplicitClose, guardId]);

  if (!isOpen) return null;

  const resolvedWidth = size || maxWidth;

  const maxWidthStyles: Record<string, string> = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '4xl': 'max-w-4xl',
    '5xl': 'max-w-5xl',
    '6xl': 'max-w-6xl',
    'max-w-sm': 'max-w-sm',
    'max-w-md': 'max-w-md',
    'max-w-lg': 'max-w-lg',
    'max-w-xl': 'max-w-xl',
    'max-w-2xl': 'max-w-2xl',
    'max-w-4xl': 'max-w-4xl',
    'max-w-5xl': 'max-w-5xl',
    'max-w-6xl': 'max-w-6xl',
  };

  const widthClass = maxWidthStyles[resolvedWidth as string] || maxWidthStyles.lg;

  return (
    <div
      ref={containerRef}
      aria-modal="true"
      role="dialog"
      aria-labelledby="modal-title"
      data-unsaved-guard={guardId}
      onInputCapture={(event) => markDirty(event.target)}
      onChangeCapture={(event) => markDirty(event.target)}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-3 overflow-hidden bg-slate-900/60 backdrop-blur-xs transition-opacity"
    >
      <div
        className="fixed inset-0"
        onClick={requireExplicitClose ? undefined : requestClose}
        aria-hidden="true"
      />

      <div
        className={`relative w-full min-w-0 ${widthClass} bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[96vh] z-10 transition-all transform animate-in fade-in zoom-in-95 duration-150`}
      >
        <div className="flex min-w-0 items-start justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
          <div className="min-w-0">
            <h2 id="modal-title" className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={requestClose}
            aria-label="Fechar modal"
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="min-w-0 flex-1 min-h-0 p-4 overflow-y-auto overflow-x-hidden space-y-3">
          {children}
        </div>
      </div>
    </div>
  );
};
