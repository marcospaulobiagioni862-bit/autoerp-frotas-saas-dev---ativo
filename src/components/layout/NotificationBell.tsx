import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { NotificationClient, type NotificationItem } from '../../api/notificationClient';

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

export const NotificationBell: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [error, setError] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(async () => {
    try {
      setUnread(await NotificationClient.unreadCount());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  const refreshInbox = useCallback(async () => {
    setLoading(true);
    try {
      const [nextItems, nextUnread] = await Promise.all([
        NotificationClient.list(20),
        NotificationClient.unreadCount(),
      ]);
      setItems(nextItems);
      setUnread(nextUnread);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshCount();
    const onFocus = () => { void refreshCount(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshCount]);

  useEffect(() => {
    if (!open) return;
    void refreshInbox();
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open, refreshInbox]);

  const markRead = async (item: NotificationItem) => {
    if (item.readAt) return;
    try {
      const updated = await NotificationClient.markRead(item.id);
      setItems((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
      setUnread((current) => Math.max(0, current - 1));
      setError(false);
    } catch {
      setError(true);
    }
  };

  const markAllRead = async () => {
    try {
      await NotificationClient.markAllRead();
      const readAt = new Date().toISOString();
      setItems((current) => current.map((entry) => entry.readAt ? entry : { ...entry, readAt }));
      setUnread(0);
      setError(false);
    } catch {
      setError(true);
    }
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Abrir notificações"
        aria-expanded={open}
        className="relative p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
        title={error ? 'Notificações temporariamente indisponíveis' : 'Notificações'}
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-600 text-white text-[9px] font-bold flex items-center justify-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-2rem))] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Notificações</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{unread} não lida(s)</p>
            </div>
            <button
              type="button"
              onClick={() => { void markAllRead(); }}
              disabled={unread === 0}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-blue-500"
              title="Marcar todas como lidas"
            >
              <CheckCheck className="w-4 h-4" />
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading && (
              <div className="py-8 flex items-center justify-center text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            )}
            {!loading && error && (
              <div className="px-4 py-6 text-sm text-red-700 dark:text-red-300 text-center">
                Notificações indisponíveis. Tente novamente.
              </div>
            )}
            {!loading && !error && items.length === 0 && (
              <div className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400 text-center">
                Nenhuma notificação.
              </div>
            )}
            {!loading && !error && items.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => { void markRead(item); }}
                className={`w-full text-left px-4 py-3 border-b last:border-b-0 border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors ${item.readAt ? 'opacity-70' : 'bg-blue-50/40 dark:bg-blue-950/10'}`}
              >
                <div className="flex gap-2 items-start">
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${item.readAt ? 'bg-slate-300 dark:bg-slate-600' : 'bg-blue-600'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">{item.title}</p>
                    <p className="mt-0.5 text-[11px] leading-4 text-slate-600 dark:text-slate-300">{item.message}</p>
                    <p className="mt-1 text-[10px] text-slate-400">{formatTimestamp(item.createdAt)}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
