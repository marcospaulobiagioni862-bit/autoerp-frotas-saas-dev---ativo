import React, { useEffect, useState, useRef } from 'react';
import { Building2, Sun, Moon, Menu, ShieldCheck, LogOut, ChevronDown, Settings, User as UserIcon } from 'lucide-react';
import { NotificationBell } from './NotificationBell';
import { useAuth } from '../../hooks/useAuth';
import type { NotificationItem } from '../../api/notificationClient';
import { OpsHealthClient, type OpsBuildIdentity } from '../../api/opsHealthClient';
import { UserProfileModal } from '../profile/UserProfileModal';

interface HeaderProps {
 testStatus: { passed: number; total: number; failed: number } | null;
 onOpenTestRunner: () => void;
 // Compatibility prop retained while App.tsx is migrated. SECURITY-2N removes
 // the reset control from the runtime UI and intentionally never invokes it.
 onResetSeedData?: () => void;
 onToggleMobileSidebar?: () => void;
 onResolveNotification?: (item: NotificationItem) => void | Promise<void>;
 onNavigateTab?: (tab: string) => void;
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
 onToggleMobileSidebar,
 onResolveNotification,
 onNavigateTab,
}) => {
 const { user, authMode, logout } = useAuth();
 const [buildIdentity, setBuildIdentity] = useState<OpsBuildIdentity | null>(null);
 const [isDark, setIsDark] = useState<boolean>(() => {
 return document.documentElement.classList.contains('dark');
 });
 const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
 const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
 const [isLoggingOut, setIsLoggingOut] = useState(false);
 const userMenuRef = useRef<HTMLDivElement>(null);

 // SECURITY-2Q2: a entrada administrativa continua derivando do principal ADMIN
 // autenticado. O AUTOERP-46 a moveu da barra lateral para o menu do avatar; a
 // regra de visibilidade tem de viajar junto, senao todo usuario logado passa a
 // enxergar "Area Administrativa".
 const isAdmin = String(user.role || '').toUpperCase() === 'ADMIN';

 useEffect(() => {
 let cancelled = false;
 if (authMode !== 'server-session') {
 setBuildIdentity(null);
 return () => { cancelled = true; };
 }
 void OpsHealthClient.get()
 .then((summary) => { if (!cancelled) setBuildIdentity(summary.build); })
 .catch(() => { if (!cancelled) setBuildIdentity({ commitSha: null, environment: 'unknown', service: null }); });
 return () => { cancelled = true; };
 }, [authMode]);

 useEffect(() => {
 if (!isUserMenuOpen) return;
 const handlePointerDown = (event: MouseEvent) => {
 if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
 setIsUserMenuOpen(false);
 }
 };
 const handleKeyDown = (event: KeyboardEvent) => {
 if (event.key === 'Escape') {
 setIsUserMenuOpen(false);
 }
 };
 document.addEventListener('mousedown', handlePointerDown);
 document.addEventListener('keydown', handleKeyDown);
 return () => {
 document.removeEventListener('mousedown', handlePointerDown);
 document.removeEventListener('keydown', handleKeyDown);
 };
 }, [isUserMenuOpen]);

 const toggleDarkMode = () => {
 if (document.documentElement.classList.contains('dark')) {
 document.documentElement.classList.remove('dark');
 setIsDark(false);
 } else {
 document.documentElement.classList.add('dark');
 setIsDark(true);
 }
 };

 const handleLogout = async () => {
 try {
 setIsLoggingOut(true);
 setIsUserMenuOpen(false);
 await logout();
 } catch (error) {
 console.error('Logout error:', error);
 } finally {
 setIsLoggingOut(false);
 }
 };

 return (
 <header className="h-16 bg-white dark:bg-graphite-900 border-b border-graphite-200 dark:border-graphite-800 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 shadow-2xs">
 <div className="flex items-center gap-3 sm:gap-4">
 {onToggleMobileSidebar && (
 <button
 onClick={onToggleMobileSidebar}
 aria-label="Abrir menu de navegação"
 className="p-2 md:hidden text-graphite-600 dark:text-graphite-300 hover:bg-graphite-100 dark:hover:bg-graphite-800 rounded-lg transition-colors focus:outline-none focus:ring-2 focus-visible:outline-focus-ring"
 >
 <Menu className="w-5 h-5" />
 </button>
 )}

 <div className="flex items-center gap-2.5">
 <div className="w-9 h-9 rounded-xl bg-surface-raised flex items-center justify-center text-white font-black text-lg shadow-sm shrink-0">
 AE
 </div>
 <div>
 <h1 className="text-sm sm:text-base font-bold text-graphite-900 dark:text-graphite-100 leading-tight flex items-center gap-1.5">
 <span>AutoERP</span>
 <span className="text-[10px] sm:text-xs font-medium px-2 py-0.5 rounded-full bg-info-bg text-info-text border border-info-border ">
 V2 Preview
 </span>
 </h1>
 <p className="text-[11px] text-graphite-500 dark:text-graphite-400 hidden sm:flex items-center gap-1">
 <Building2 className="w-3 h-3 text-graphite-400" />
 <span>{authMode === 'server-session' ? 'Ambiente isolado para revisão' : 'Ambiente de desenvolvimento'}</span>
 {authMode === 'server-session' && (
 <span
 className={buildIdentity?.commitSha ? 'font-mono text-success-icon ' : 'font-medium text-warning-icon '}
 title={buildIdentity?.commitSha || 'O ambiente implantado ainda não expôs o SHA do commit.'}
 >
 · preview isolado · {buildIdentity?.commitSha ? buildIdentity.commitSha.slice(0, 7) : 'SHA ?'}
 </span>
 )}
 </p>
 </div>
 </div>
 </div>

 <div className="flex items-center gap-2 sm:gap-3">
 <NotificationBell onResolve={onResolveNotification} />

 <button
 onClick={toggleDarkMode}
 aria-label={isDark ? 'Alternar para tema claro' : 'Alternar para tema escuro'}
 className="p-2 text-graphite-500 hover:text-graphite-700 dark:text-graphite-400 dark:hover:text-graphite-200 hover:bg-graphite-100 dark:hover:bg-graphite-800 rounded-lg transition-colors focus:outline-none focus:ring-2 focus-visible:outline-focus-ring"
 title={isDark ? 'Tema Claro' : 'Tema Escuro'}
 >
 {isDark ? <Sun className="w-4 h-4 text-warning-text" /> : <Moon className="w-4 h-4 text-graphite-600" />}
 </button>

 <div className="h-6 w-px bg-graphite-200 dark:bg-graphite-800 mx-0.5 hidden sm:block" />

 <div className="relative" ref={userMenuRef}>
 <button
 type="button"
 onClick={() => setIsUserMenuOpen((prev) => !prev)}
 aria-expanded={isUserMenuOpen}
 aria-haspopup="menu"
 aria-label={`Menu do usuário: ${user.name}`}
 className="flex items-center gap-2 p-1 sm:px-2 sm:py-1.5 rounded-xl hover:bg-graphite-100 dark:hover:bg-graphite-800 transition-colors focus:outline-none focus:ring-2 focus-visible:outline-focus-ring text-left group"
 >
 <div className="w-8 h-8 rounded-full bg-surface-raised flex items-center justify-center text-graphite-800 dark:text-graphite-100 font-bold text-xs border border-graphite-300/80 dark:border-graphite-600 shrink-0 shadow-2xs group-hover:scale-105 transition-transform overflow-hidden">
 {user.avatarUrl ? (
 <img
 src={user.avatarUrl}
 alt={user.name}
 className="w-full h-full object-cover"
 />
 ) : (
 initials(user.name)
 )}
 </div>
 <div className="hidden xl:block text-left max-w-44">
 <p className="text-xs font-semibold text-graphite-800 dark:text-graphite-200 leading-none truncate" title={user.name}>
 {user.name}
 </p>
 <span className="text-[10px] text-graphite-500 dark:text-graphite-400 block mt-0.5">
 {roleLabel(user.role)}
 </span>
 </div>
 <ChevronDown className={`w-3.5 h-3.5 text-graphite-400 group-hover:text-graphite-600 dark:group-hover:text-graphite-200 transition-transform duration-200 ${isUserMenuOpen ? 'rotate-180' : ''}`} />
 </button>

 {isUserMenuOpen && (
 <div
 role="menu"
 aria-orientation="vertical"
 className="absolute right-0 mt-2 w-64 rounded-2xl bg-white dark:bg-graphite-900 border border-graphite-200 dark:border-graphite-800 shadow-xl py-2 z-50"
 >
 <div className="px-4 py-3 border-b border-graphite-100 dark:border-graphite-800">
 <p className="text-xs font-bold text-graphite-900 dark:text-graphite-100 truncate">
 {user.name}
 </p>
 <p className="text-[11px] font-medium text-graphite-500 dark:text-graphite-400 mt-0.5 flex items-center gap-1.5">
 <span className="inline-block w-1.5 h-1.5 rounded-full bg-action-primary" />
 <span>{roleLabel(user.role)}</span>
 </p>
 <p className="text-[10px] text-graphite-400 dark:text-graphite-500 mt-1 truncate">
 Empresa: {user.companyId}
 </p>
 </div>

  <div className="py-1">
 <button
 type="button"
 role="menuitem"
 aria-label="Meu Perfil"
 onClick={() => {
 setIsUserMenuOpen(false);
 setIsProfileModalOpen(true);
 }}
 className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-graphite-700 dark:text-graphite-300 hover:bg-graphite-50 dark:hover:bg-graphite-800/60 hover:text-action-primary dark:hover:text-action-primary transition-colors text-left"
 >
 <UserIcon className="w-4 h-4 text-graphite-400 dark:text-graphite-500" />
 <div>
 <span className="font-semibold block">Meu Perfil</span>
 <span className="text-[10px] text-graphite-400 dark:text-graphite-500 block leading-tight">Foto, dados pessoais e senha</span>
 </div>
 </button>
 </div>
 {isAdmin && (
 <div className="py-1">
 <button
 type="button"
 role="menuitem"
 aria-label="Area Administrativa"
 onClick={() => {
 setIsUserMenuOpen(false);
 onNavigateTab?.('administration');
 }}
 className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-graphite-700 dark:text-graphite-300 hover:bg-graphite-50 dark:hover:bg-graphite-800/60 hover:text-info-icon dark:text-graphite-300 dark:hover:text-info-text transition-colors text-left"
 >
 <Settings className="w-4 h-4 text-graphite-400 dark:text-graphite-500" />
 <div>
 <span className="font-semibold block">Área Administrativa</span>
 <span className="text-[10px] text-graphite-400 dark:text-graphite-500 block leading-tight">Configurações, usuários e sistema</span>
 </div>
 </button>
 </div>
 )}

 <div className="my-1 border-t border-graphite-100 dark:border-graphite-800" />

 <div className="py-1 px-1.5">
 <button
 type="button"
 role="menuitem"
 disabled={isLoggingOut}
 onClick={handleLogout}
 className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-error-icon hover:bg-error-bg dark:hover:bg-error-bg rounded-lg transition-colors text-left disabled:opacity-50"
 >
 <LogOut className="w-4 h-4" />
 <span>{isLoggingOut ? 'Saindo...' : 'Sair da conta'}</span>
 </button>
 </div>
 </div>
 )}
 </div>
 </div>
  {isProfileModalOpen && (
 <UserProfileModal
 isOpen={isProfileModalOpen}
 onClose={() => setIsProfileModalOpen(false)}
 />
 )}
 </header>
 );
};
