import React, { useEffect, useState } from 'react';
import { AlertTriangle, Building2, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import {
  TenantProfileClient,
  type TenantProfileDto,
  type TenantProfileUpdateInput,
} from '../../api/tenantProfileClient';
import { Badge, Button, Card } from '../ui';

const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900 dark:disabled:text-slate-500';

function formFrom(profile: TenantProfileDto): TenantProfileUpdateInput {
  return {
    companyName: profile.companyName,
    timezone: profile.timezone,
    currency: 'BRL',
    maxVehiclesLimit: profile.maxVehiclesLimit,
    maxDriversLimit: profile.maxDriversLimit,
    logoUrl: profile.logoUrl || '',
  };
}

export const ProductionTenantProfileView: React.FC = () => {
  const [profile, setProfile] = useState<TenantProfileDto | null>(null);
  const [form, setForm] = useState<TenantProfileUpdateInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const loaded = await TenantProfileClient.get();
      setProfile(loaded);
      setForm(formFrom(loaded));
    } catch (cause) {
      setProfile(null);
      setForm(null);
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar Empresa / Tenant.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const setText = (field: 'companyName' | 'timezone' | 'logoUrl', value: string) => {
    setForm((current) => current ? { ...current, [field]: value } : current);
    setMessage(null);
  };

  const setLimit = (field: 'maxVehiclesLimit' | 'maxDriversLimit', value: string) => {
    if (value.trim() === '') {
      setForm((current) => current ? { ...current, [field]: Number.NaN } : current);
    } else {
      setForm((current) => current ? { ...current, [field]: Number(value) } : current);
    }
    setMessage(null);
  };

  const valid = Boolean(
    form &&
    form.companyName.trim().length >= 2 && form.companyName.trim().length <= 160 &&
    form.timezone.trim().length > 0 && form.timezone.trim().length <= 100 &&
    (!form.logoUrl || form.logoUrl.trim().length <= 2000000) &&
    Number.isInteger(form.maxVehiclesLimit) && form.maxVehiclesLimit >= 0 && form.maxVehiclesLimit <= 100000 &&
    Number.isInteger(form.maxDriversLimit) && form.maxDriversLimit >= 0 && form.maxDriversLimit <= 200000
  );

  const dirty = Boolean(profile && form && (
    profile.companyName !== form.companyName.trim() ||
    profile.timezone !== form.timezone.trim() ||
    profile.currency !== form.currency ||
    profile.maxVehiclesLimit !== form.maxVehiclesLimit ||
    profile.maxDriversLimit !== form.maxDriversLimit ||
    (profile.logoUrl || '') !== (form.logoUrl || '').trim()
  ));

  const save = async () => {
    if (!form || !valid || !dirty) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await TenantProfileClient.update({
        companyName: form.companyName.trim(),
        timezone: form.timezone.trim(),
        currency: 'BRL',
        maxVehiclesLimit: form.maxVehiclesLimit,
        maxDriversLimit: form.maxDriversLimit,
        logoUrl: form.logoUrl ? form.logoUrl.trim() : null,
      });
      setProfile(updated);
      setForm(formFrom(updated));
      setMessage('Empresa / Tenant atualizado com autoridade PostgreSQL e auditoria server-side.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao atualizar Empresa / Tenant.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-blue-50 p-3 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
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
              Perfil operacional do tenant autenticado. Tenant e ator são derivados exclusivamente da sessão do servidor.
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading || saving} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {message && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
          <ShieldCheck className="h-4 w-4 shrink-0" /> {message}
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 p-4 dark:border-slate-800">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">Configuração operacional</h3>
          <p className="text-xs text-slate-500">O documento da empresa é exibido a partir do PostgreSQL, mas permanece imutável nesta wave.</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-12 text-slate-500">
            <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Carregando Empresa / Tenant...
          </div>
        ) : profile && form ? (
          <div className="grid gap-5 p-5 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nome da empresa</span>
              <input
                className={inputClass}
                value={form.companyName}
                required
                minLength={2}
                maxLength={160}
                onChange={(event) => setText('companyName', event.target.value)}
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Documento da empresa</span>
              <input className={inputClass} value={profile.document} readOnly disabled aria-label="Documento da empresa somente leitura" />
              <span className="block text-xs text-slate-500">Somente leitura. Não pode ser alterado por esta tela.</span>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fuso horário</span>
              <input
                className={inputClass}
                value={form.timezone}
                required
                maxLength={100}
                onChange={(event) => setText('timezone', event.target.value)}
                placeholder="America/Sao_Paulo"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Moeda</span>
              <input className={inputClass} value="BRL" readOnly disabled aria-label="Moeda BRL somente leitura nesta wave" />
              <span className="block text-xs text-slate-500">Esta wave suporta exclusivamente BRL.</span>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Limite de veículos</span>
              <input
                className={inputClass}
                type="number"
                min={0}
                max={100000}
                step={1}
                value={Number.isFinite(form.maxVehiclesLimit) ? form.maxVehiclesLimit : ''}
                onChange={(event) => setLimit('maxVehiclesLimit', event.target.value)}
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Limite de motoristas</span>
              <input
                className={inputClass}
                type="number"
                min={0}
                max={200000}
                step={1}
                value={Number.isFinite(form.maxDriversLimit) ? form.maxDriversLimit : ''}
                onChange={(event) => setLimit('maxDriversLimit', event.target.value)}
              />
            </label>

            <div className="md:col-span-2 space-y-2">
              <label className="space-y-1.5 block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Logotipo da empresa (URL ou Data URL)</span>
                <input
                  className={inputClass}
                  value={form.logoUrl || ''}
                  maxLength={2000000}
                  onChange={(event) => setText('logoUrl', event.target.value)}
                  placeholder="https://exemplo.com/logo.png ou data:image/jpeg;base64,..."
                />
                <span className="block text-xs text-slate-500">
                  URL da imagem ou string Base64 (JPEG/PNG) da marca que será exibida nos cabeçalhos e documentos.
                </span>
              </label>
              {form.logoUrl && form.logoUrl.trim() && (
                <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                  <span className="text-xs text-slate-500">Prévia do logo:</span>
                  <img
                    src={form.logoUrl.trim()}
                    alt="Prévia do logo da empresa"
                    className="h-10 max-w-[160px] object-contain rounded border border-slate-200 bg-white p-1 dark:border-slate-700"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              )}
            </div>

            <div className="md:col-span-2 flex flex-col gap-3 border-t border-slate-200 pt-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">
                Alterações válidas são persistidas atomicamente e auditadas pelo servidor. Valores inválidos falham sem gravação.
              </p>
              <Button onClick={() => void save()} disabled={!valid || !dirty || saving} className="gap-2">
                <Save className="h-4 w-4" /> {saving ? 'Salvando...' : 'Salvar alterações'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-10 text-center text-sm text-slate-500">Perfil Empresa / Tenant indisponível.</div>
        )}
      </Card>
    </div>
  );
};
