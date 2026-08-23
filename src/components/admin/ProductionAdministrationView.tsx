import React, { useState } from 'react';
import { Building2, LockKeyhole, Users } from 'lucide-react';
import { ProductionUserAdministrationView } from './ProductionUserAdministrationView';
import { ProductionTenantProfileView } from './ProductionTenantProfileView';

export const ProductionAdministrationView: React.FC = () => {
  const [tab, setTab] = useState<'users' | 'tenant'>('users');

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab('users')}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${tab === 'users' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}
          >
            <Users className="h-4 w-4" /> Usuários
          </button>
          <button
            type="button"
            onClick={() => setTab('tenant')}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${tab === 'tenant' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}
          >
            <Building2 className="h-4 w-4" /> Empresa / Tenant
          </button>
        </div>
        <div className="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Somente Usuários e Empresa/Tenant possuem autoridade server-side nesta central. Backup/restore, segurança avançada, observabilidade e demais funções administrativas continuam fail-closed até waves próprias.
          </span>
        </div>
      </div>

      {tab === 'users' ? <ProductionUserAdministrationView /> : <ProductionTenantProfileView />}
    </div>
  );
};
