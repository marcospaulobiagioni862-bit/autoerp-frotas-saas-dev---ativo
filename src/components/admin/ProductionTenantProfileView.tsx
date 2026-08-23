import React, { useEffect, useState } from 'react';
import { AlertTriangle, Building2, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import { AdminTenantClient, type AdminTenantProfileDto } from '../../api/adminTenantClient';
import { Badge, Button, Card, Input } from '../ui';

export const ProductionTenantProfileView: React.FC = () => {
  const [profile, setProfile] = useState<AdminTenantProfileDto | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [timezone, setTimezone] = useState('America/Sao_Paulo');
  const [maxVehicles, setMaxVehicles] = useState('5000');
  const [maxDrivers, setMaxDrivers] = useState('10000');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const apply = (value: AdminTenantProfileDto) => {
    setProfile(value);
    setCompanyName(value.companyName);
    setTimezone(value.timezone);
    setMaxVehicles(String(value.maxVehiclesLimit));
    setMaxDrivers(String(value.maxDriversLimit));
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      apply(await AdminTenantClient.getProfile());
    } catch (cause) {
      setProfile(null);
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar perfil do tenant.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const maxVehiclesLimit = Number(maxVehicles);
      const maxDriversLimit = Number(maxDrivers);
      const updated = await AdminTenantClient.updateProfile({
        companyName,
        timezone,
        currency: 'BRL',
        maxVehiclesLimit,
        maxDriversLimit,
      });
      apply(updated);
      setMessage('Perfil da empresa atualizado com autoridade PostgreSQL.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao salvar perfil do tenant.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-indigo-50 p-3 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Empresa / Tenant</h2>
              <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                PostgreSQL autoritativo
              </Badge>
            </div>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Identidade básica e parâmetros operacionais do tenant autenticado.
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading || saving} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}
      {message && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
          <ShieldCheck className="h-4 w-4" /> {message}
        </div>
      )}

      <Card className="p-6">
        {loading ? (
          <div className="flex items-center justify-center p-10 text-slate-500">
            <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Carregando perfil...
          </div>
        ) : profile ? (
          <form onSubmit={save} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                Nome da empresa
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} maxLength={200} required />
              </label>
              <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                Documento do tenant
                <Input value={profile.document || 'Não informado'} disabled />
                <span className="block text-xs font-normal text-slate-500">Somente leitura nesta wave porque participa da resolução do login.</span>
              </label>
              <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                Timezone
                <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} required />
              </label>
              <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                Moeda
                <Input value="BRL" disabled />
                <span className="block text-xs font-normal text-slate-500">BRL é a moeda suportada nesta etapa.</span>
              </label>
              <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                Limite de veículos
                <Input type="number" min="0" step="1" value={maxVehicles} onChange={(e) => setMaxVehicles(e.target.value)} required />
              </label>
              <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                Limite de motoristas
                <Input type="number" min="0" step="1" value={maxDrivers} onChange={(e) => setMaxDrivers(e.target.value)} required />
              </label>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-slate-500">
                Tenant: {profile.companyId} · última atualização: {profile.updatedAt}
              </div>
              <Button type="submit" disabled={saving} className="gap-2">
                <Save className="h-4 w-4" /> {saving ? 'Salvando...' : 'Salvar perfil'}
              </Button>
            </div>
          </form>
        ) : (
          <div className="p-10 text-center text-sm text-slate-500">Perfil indisponível.</div>
        )}
      </Card>
    </div>
  );
};
