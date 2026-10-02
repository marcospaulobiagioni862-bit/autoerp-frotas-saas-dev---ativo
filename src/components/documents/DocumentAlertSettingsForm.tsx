import React, { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useDocumentAlertSettings } from '../../hooks/useDocumentAlertSettings';
import { DocumentClient } from '../../api/documentClient';
import { validateDocumentAlertSettings } from '../../shared/utils/documentAlertSettings';
import { Button, Input } from '../ui';
export function DocumentAlertSettingsForm() {
  const { user } = useAuth();
  const { settings, error: loadError } = useDocumentAlertSettings();
  const [red, setRed] = useState('7'), [yellow, setYellow] = useState('15');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { setRed(String(settings.redDays)); setYellow(String(settings.yellowDays)); }, [settings]);
  const editable = ['ADMIN','MANAGER','OPERATIONAL_MANAGER'].includes(String(user?.role));
  return <form className="rounded-lg border p-4 space-y-2" onSubmit={async event => {
    event.preventDefault(); if (busy || !editable) return; setError('');
    try { const input = validateDocumentAlertSettings({ redDays: Number(red), yellowDays: Number(yellow) }); setBusy(true); await DocumentClient.updateAlertSettings(input); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Falha ao salvar prazos'); }
    finally { setBusy(false); }
  }}>
    <p className="text-sm font-semibold">Alertas de validade dos documentos</p>
    <div className="flex flex-wrap items-end gap-3"><Input label="Vermelho: até quantos dias" type="number" required min="0" max="365" value={red} disabled={!editable} onChange={event => setRed(event.target.value)} /><Input label="Amarelo: até quantos dias" type="number" required min="0" max="365" value={yellow} disabled={!editable} onChange={event => setYellow(event.target.value)} />{editable && <Button type="submit" isLoading={busy}>Salvar prazos</Button>}</div>
    <p className="text-xs text-slate-500">Vencidos ficam vermelhos. Acima do prazo amarelo, documentos válidos ficam verdes. A configuração vale para a empresa.</p>
    {(error || loadError) && <p role="alert" className="text-xs text-red-600">{error || loadError}</p>}
  </form>;
}
