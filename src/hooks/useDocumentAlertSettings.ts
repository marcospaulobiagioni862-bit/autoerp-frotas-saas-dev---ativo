import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { DocumentClient } from '../api/documentClient';
import { DEFAULT_DOCUMENT_ALERT_SETTINGS } from '../shared/utils/documentAlertSettings';
export function useDocumentAlertSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState(DEFAULT_DOCUMENT_ALERT_SETTINGS);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true; setSettings(DEFAULT_DOCUMENT_ALERT_SETTINGS); setError('');
    const load = () => { if (user?.companyId) void DocumentClient.alertSettings().then(value => { if (active) { setSettings(value); setError(''); } }).catch(() => { if (active) setError('Não foi possível carregar os prazos configurados. Exibindo os padrões 7/15 dias.'); }); };
    load(); window.addEventListener('autoerp-document-alert-settings', load);
    return () => { active = false; window.removeEventListener('autoerp-document-alert-settings', load); };
  }, [user?.companyId]);
  return { settings, error };
}
