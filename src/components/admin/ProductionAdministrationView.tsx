import React, { useState } from 'react';
import { Building2, LockKeyhole, Users } from 'lucide-react';
import { ProductionTenantProfileView } from './ProductionTenantProfileView';
import { ProductionUserAdministrationView } from './ProductionUserAdministrationView';

type AdministrationTab = 'users' | 'tenant';

export const ProductionAdministrationView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AdministrationTab>('users');

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-6xl mx-auto">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Administração</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Superfícies promovidas para autoridade PostgreSQL autenticada.
            </p>
          </div>
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-950/60">
            <button
              type="button"
              onClick={() => setActiveTab('users')}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${activeTab === 'users' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800'}`}
            >
              <Users className="h-4 w-4" /> Usuários
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('tenant')}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${activeTab === 'tenant' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800'}`}
            >
              <Building2 className="h-4 w-4" /> Empresa / Tenant
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
        <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <strong>Escopo SECURITY-2Q2:</strong> Usuários e Empresa / Tenant usam autoridade PostgreSQL. Backup/restore, observabilidade, políticas de segurança, SLA e demais funções administrativas continuam bloqueadas até receberem autoridade server-side própria.
        </div>
      </div>

      {activeTab === 'users' ? <ProductionUserAdministrationView /> : <ProductionTenantProfileView />}
    </div>
  );
};
