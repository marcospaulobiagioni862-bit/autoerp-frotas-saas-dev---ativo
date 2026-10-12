import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { NotificationClient, type NotificationItem, type NotificationSeverity } from '../../api/notificationClient';
import { DocumentClient } from '../../api/documentClient';
import { AttachmentClient } from '../../api/attachmentClient';

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

function severityLabel(severity: NotificationSeverity): string {
  switch (severity) {
    case 'DANGER': return 'Crítica';
    case 'WARNING': return 'Atenção';
    case 'SUCCESS': return 'Sucesso';
    default: return 'Informação';
  }
}

function severityClasses(severity: NotificationSeverity): string {
  switch (severity) {
    case 'DANGER': return 'bg-error-bg text-error-text  ';
    case 'WARNING': return 'bg-warning-bg text-warning-text  ';
    case 'SUCCESS': return 'bg-success-bg text-success-text  ';
    default: return 'bg-info-bg text-info-text  ';
  }
}

function fallbackEntityLabel(item: NotificationItem): string | undefined {
  switch (item.entityType) {
    case 'Document': return 'Documento';
    case 'Insurance': return 'Seguro';
    case 'MaintenancePlan': return 'Manutenção preventiva';
    case 'TollPassage': return 'Pedágio / Free Flow';
    default: return item.entityType || undefined;
  }
}

interface NotificationBellProps {
  onResolve?: (item: NotificationItem) => void | Promise<void>;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ onResolve }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [entityLabels, setEntityLabels] = useState<Record<string, string>>({});
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

      const documentItems = nextItems.filter((item) => item.entityType === 'Document' && item.entityId);
      if (documentItems.length === 0) {
        setEntityLabels({});
      } else {
        const resolved = await Promise.all(documentItems.map(async (item) => {
          try {
            const document = await DocumentClient.get(item.entityId!);
            if (document.attachmentId) {
              const attachment = await AttachmentClient.get(document.attachmentId);
              return [item.id, `Arquivo: ${attachment.fileName}`] as const;
            }
            return [item.id, `Documento: ${document.documentType}`] as const;
          } catch {
            return [item.id, fallbackEntityLabel(item) || 'Documento'] as const;
          }
        }));
        setEntityLabels(Object.fromEntries(resolved));
      }
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

  const resolveNotification = async (item: NotificationItem) => {
    await markRead(item);
    setOpen(false);
    if (onResolve) await onResolve(item);
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
        className="relative p-2 text-graphite-500 hover:text-graphite-700 dark:text-graphite-400 dark:hover:text-graphite-200 hover:bg-graphite-100 dark:hover:bg-graphite-800 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
        title={error ? 'Notificações temporariamente indisponíveis' : 'Notificações'}
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-action-destructive text-on-action-destructive text-[9px] font-bold flex items-center justify-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-2rem))] bg-white dark:bg-graphite-900 border border-graphite-200 dark:border-graphite-700 rounded-xl shadow-xl overflow-hidden z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-graphite-200 dark:border-graphite-800">
            <div>
              <p className="text-sm font-bold text-graphite-900 dark:text-graphite-100">Notificações</p>
              <p className="text-[11px] text-graphite-500 dark:text-graphite-400">{unread} não lida(s)</p>
            </div>
            <button
              type="button"
              onClick={() => { void markAllRead(); }}
              disabled={unread === 0}
              className="p-1.5 rounded-lg text-graphite-500 hover:bg-graphite-100 dark:hover:bg-graphite-800 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-blue-500"
              title="Marcar todas como lidas"
            >
              <CheckCheck className="w-4 h-4" />
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading && (
              <div className="py-8 flex items-center justify-center text-graphite-500">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            )}
            {!loading && error && (
              <div className="px-4 py-6 text-sm text-error-text  text-center">
                Notificações indisponíveis. Tente novamente.
              </div>
            )}
            {!loading && !error && items.length === 0 && (
              <div className="px-4 py-6 text-sm text-graphite-500 dark:text-graphite-400 text-center">
                Nenhuma notificação.
              </div>
            )}
            {!loading && !error && items.map((item) => {
              const entity = entityLabels[item.id] || fallbackEntityLabel(item);
              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => { void resolveNotification(item); }}
                  className={`w-full text-left px-4 py-3 border-b last:border-b-0 border-graphite-100 dark:border-graphite-800 hover:bg-graphite-50 dark:hover:bg-graphite-800/70 transition-colors ${item.readAt ? 'opacity-70' : 'bg-info-bg '}`}
                >
                  <div className="flex gap-2 items-start">
                    <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${item.readAt ? 'bg-graphite-300 dark:bg-graphite-600' : 'bg-action-primary'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-xs font-semibold text-graphite-900 dark:text-graphite-100 truncate flex-1">{item.title}</p>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold ${severityClasses(item.severity)}`}>
                          {severityLabel(item.severity)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] leading-4 text-graphite-600 dark:text-graphite-300">{item.message}</p>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-graphite-400 min-w-0">
                        <span>{formatTimestamp(item.createdAt)}</span>
                        {entity && <span className="truncate" title={entity}>{entity}</span>}
                        <span>{item.readAt ? 'Lida' : 'Não lida'}</span>
                        {onResolve && <span className="font-semibold text-info-icon ">Abrir para resolver →</span>}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
