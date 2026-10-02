import React, { useEffect, useState } from 'react';
import { confirmDiscardUnsavedChanges } from '../../app/unsavedChangesAuthority';

declare const __AUTOERP_BUILD_ID__: string;
export function NewVersionNotice() {
  const [available, setAvailable] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const response = await fetch('/version.json', { cache: 'no-store', credentials: 'same-origin' });
        if (!response.ok) return;
        const version = await response.json();
        if (active && typeof version.buildId === 'string' && version.buildId !== __AUTOERP_BUILD_ID__) setAvailable(version.buildId);
      } catch { /* availability never interrupts work */ }
    };
    void check();
    const timer = window.setInterval(() => { void check(); }, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  if (!available || available === dismissed) return null;
  return <aside role="status" className="flex flex-wrap items-center gap-3 border-b border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
    <span>Uma nova versão está disponível. Seu trabalho continuará aberto.</span>
    <button type="button" className="rounded border px-3 py-1" onClick={() => setDismissed(available)}>Continuar trabalhando</button>
    <button type="button" className="rounded bg-blue-600 px-3 py-1 text-white" onClick={() => { if (confirmDiscardUnsavedChanges()) window.location.reload(); }}>Atualizar agora</button>
  </aside>;
}
