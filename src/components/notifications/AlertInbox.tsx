import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Bell, Check, CheckCheck, ExternalLink, X } from 'lucide-react';
import { NotificationClient } from '../../api/notificationClient';
import type { PersistentNotification } from '../../types/entities';

interface AlertInboxProps {
  onNavigate?: (tab: string) => void;
}

const severityClass: Record<PersistentNotification['severity'], string> = {
  INFO: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200',
  WARNING: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
  DANGER: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200',
  SUCCESS: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200',
};

function formatDate(value: string): string {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString('pt-BR') : value;
}

export const AlertInbox: React.FC<AlertInboxProps> = ({ onNavigate }) => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PersistentNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const refreshCount = useCallback(async () => {
    try {
      setUnreadCount(await NotificationClient.unreadCount());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha ao consultar alertas.');
    }
  }, []);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const [nextItems, count] = await Promise.all([
        NotificationClient.list({ limit: 20 }),
        NotificationClient.unreadCount(),
      ]);
      if (request !== requestRef.current) return;
      setItems(nextItems.filter((item) => item.status !== 'DISMISSED' && item.status !== 'ARCHIVED'));
      setUnreadCount(count);
    } catch (caught) {
      if (request === requestRef.current) {
        setError(caught instanceof Error ? caught.message : 'Falha ao carregar alertas.');
      }
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshCount();
    const timer = window.setInterval(() => void refreshCount(), 60_000);
    return () => {
      window.clearInterval(timer);
      requestRef.current += 1;
    };
  }, [refreshCount]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const markRead = async (item: PersistentNotification, navigate: boolean) => {
    setError(null);
    try {
      if (item.status === 'UNREAD') await NotificationClient.markRead(item.id);
      await load();
      if (navigate && item.destinationTab && onNavigate) {
        setOpen(false);
        onNavigate(item.destinationTab);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha ao atualizar alerta.');
    }
  };

  const dismiss = async (item: PersistentNotification) => {
    setError(null);
    try {
      await NotificationClient.dismiss(item.id);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha ao dispensar alerta.');
    }
  };

  const markAllRead = async () => {
    setError(null);
    try {
      await NotificationClient.markAllRead();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha ao marcar alertas como lidos.');
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Abrir central de alertas"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="relative rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        title="Alertas"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-rose-600 px-1 text-center text-[9px] font-bold leading-4 text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-[min(92vw,420px)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Central de Alertas</h2>
              <p className="text-[11px] text-slate-500">{unreadCount} não lido{unreadCount === 1 ? '' : 's'}</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void markAllRead()}
                disabled={unreadCount === 0 || loading}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-blue-300 dark:hover:bg-blue-950/50"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Todas lidas
              </button>
              <button type="button" aria-label="Fechar alertas" onClick={() => setOpen(false)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {error && (
            <div className="m-3 flex gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="max-h-[60vh] overflow-y-auto p-2">
            {loading && items.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">Carregando alertas...</div>
            ) : items.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">Nenhum alerta disponível.</div>
            ) : (
              <div className="space-y-2">
                {items.map((item) => (
                  <article key={item.id} className={`rounded-lg border p-3 ${severityClass[item.severity]} ${item.status === 'READ' ? 'opacity-70' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h3 className="text-xs font-bold">{item.title}</h3>
                          {item.status === 'UNREAD' && <span className="rounded-full bg-current/10 px-1.5 py-0.5 text-[9px] font-black uppercase">Novo</span>}
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed opacity-90">{item.message}</p>
                        <p className="mt-1.5 text-[10px] opacity-70">{formatDate(item.createdAt)}{item.dueDate ? ` • Venc. ${item.dueDate}` : ''} • {item.alertStage}</p>
                      </div>
                      <button type="button" aria-label={`Dispensar ${item.title}`} title="Dispensar" onClick={() => void dismiss(item)} className="shrink-0 rounded p-1 opacity-60 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.status === 'UNREAD' && (
                        <button type="button" onClick={() => void markRead(item, false)} className="flex items-center gap-1 text-[10px] font-bold underline-offset-2 hover:underline">
                          <Check className="h-3 w-3" /> Marcar como lido
                        </button>
                      )}
                      {item.destinationTab && onNavigate && (
                        <button type="button" onClick={() => void markRead(item, true)} className="flex items-center gap-1 text-[10px] font-bold underline-offset-2 hover:underline">
                          <ExternalLink className="h-3 w-3" /> Abrir origem
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
