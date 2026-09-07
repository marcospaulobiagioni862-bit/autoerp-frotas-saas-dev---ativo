import React, { useEffect, useState } from 'react';
import { ShieldCheck, Building2, Sun, Moon, Menu } from 'lucide-react';
import { NotificationBell } from './NotificationBell';
import { useAuth } from '../../hooks/useAuth';
import type { NotificationItem } from '../../api/notificationClient';

interface HeaderProps {
  testStatus: { passed: number; total: number; failed: number } | null;
  onOpenTestRunner: () => void;
  // Compatibility prop retained while App.tsx is migrated. SECURITY-2N removes
  // the reset control from the runtime UI and intentionally never invokes it.
  onResetSeedData?: () => void;
  onToggleMobileSidebar?: () => void;
  onResolveNotification?: (item: NotificationItem) => void | Promise<void>;
}

function initials(name: string): string {
  const value = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
  return value || 'AU';
}

function roleLabel(role: string): string {
  const key = role.toUpperCase();
  if (key === 'ADMIN') return 'Administrador';
  if (key === 'MANAGER') return 'Gestor';
  if (key === 'OPERATIONAL_MANAGER') return 'Gestor Operacional';
  if (key === 'FINANCIAL') return 'Financeiro';
  if (key === 'OPERATIONAL') return 'Operacional';
  if (key === 'READONLY') return 'Somente leitura';
  return role;
}

export const Header: React.FC<HeaderProps> = ({
  testStatus,
  onOpenTestRunner,
  onToggleMobileSidebar,
  onResolveNotification,
}) => {
  const { user, authMode } = useAuth();
  const [isDark, setIsDark] = useState<boolean>(() => {
    return document.documentElement.classList.contains('dark');
  });
  const [isNavigationDrawerViewport, setIsNavigationDrawerViewport] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 1023px) and (pointer: coarse)').matches : false
  );

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px) and (pointer: coarse)');
    const syncViewport = () => setIsNavigationDrawerViewport(media.matches);
    syncViewport();
    media.addEventListener?.('change', syncViewport);
    return () => media.removeEventListener?.('change', syncViewport);
  }, []);

  const toggleDarkMode = () => {
    if (document.documentElement.classList.contains('dark')) {
      document.documentElement.classList.remove('dark');
      setIsDark(false);
    } else {
      document.documentElement.classList.add('dark');
      setIsDark(true);
    }
  };

  const gateClasses = !testStatus
    ? 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800'
    : testStatus.failed === 0
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
      : 'bg-red-50 text-red-800 border-red-200 hover:bg-red-100 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800';

  return (
    <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 shadow-2xs">
      <div className="flex items-center gap-3 sm:gap-4">
        {isNavigationDrawerViewport && onToggleMobileSidebar && (
          <button
            onClick={onToggleMobileSidebar}
            aria-label="Abrir menu de navegação"
            className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-black text-lg shadow-sm shrink-0">
            AE
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 leading-tight flex items-center gap-1.5">
              <span>AutoERP</span>
              <span className="text-[10px] sm:text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                Server Authority
              </span>
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:flex items-center gap-1">
              <Building2 className="w-3 h-3 text-slate-400" />
              {authMode === 'server-session' ? 'Sessão autenticada do servidor' : 'Ambiente de desenvolvimento'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <button
          onClick={onOpenTestRunner}
          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-500 ${gateClasses}`}
          title="Abrir informações sobre os gates técnicos autoritativos"
        >
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="hidden md:inline">
            <strong className="font-bold">
              {testStatus ? `${testStatus.passed}/${testStatus.total} Testes OK` : 'Gates: GitHub Actions'}
            </strong>
          </span>
          <span className="md:hidden font-bold">
            {testStatus ? `${testStatus.passed}/${testStatus.total}` : 'CI'}
          </span>
        </button>

        <NotificationBell onResolve={onResolveNotification} />

        <button
          onClick={toggleDarkMode}
          aria-label={isDark ? 'Alternar para tema claro' : 'Alternar para tema escuro'}
          className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          title={isDark ? 'Tema Claro' : 'Tema Escuro'}
        >
          {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
        </button>

        <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 mx-0.5 hidden sm:block" />

        <div className="flex items-center gap-2 pl-1">
          <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 font-semibold text-xs border border-slate-300 dark:border-slate-600 shrink-0">
            {initials(user.name)}
          </div>
          <div className="hidden xl:block text-left max-w-48">
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-none truncate" title={user.name}>{user.name}</p>
            <span className="text-[10px] text-slate-500 dark:text-slate-400">{roleLabel(user.role)}</span>
          </div>
        </div>
      </div>
    </header>
  );
};
