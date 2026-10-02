import { useEffect, useRef, useState } from 'react';
import { useAuth } from './useAuth';
import { draftKey, readFormDraft, writeFormDraft } from '../app/localFormDraft';
import { clearUnsavedChanges, markUnsavedChanges, UNSAVED_CHANGES_MESSAGE } from '../app/unsavedChangesAuthority';

export function useLocalFormDraft<T>(formId: string, value: T, restore: (value: T) => void, enabled = true, dirtyOverride?: boolean) {
  const { user } = useAuth();
  const key = user?.companyId && user?.userId ? draftKey(user.companyId, user.userId, formId) : '';
  const current = useRef({ value, restore }); current.current = { value, restore };
  const baseline = useRef('');
  const skipSave = useRef(false);
  const suspended = useRef(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!enabled || !key) return;
    baseline.current = JSON.stringify(current.current.value);
    skipSave.current = true; suspended.current = false; setNotice('');
    let restored: T | null = null;
    try { restored = readFormDraft(localStorage, key, current.current.value); }
    catch { setNotice('Armazenamento local indisponível. Mantenha o formulário aberto até salvar.'); }
    if (restored) { current.current.restore(restored); setNotice('Rascunho local restaurado. Confira os dados e selecione novamente arquivos ainda não enviados.'); }
    return () => { clearUnsavedChanges(key); };
  }, [key, enabled]);

  useEffect(() => {
    if (!enabled || !key) return;
    if (skipSave.current) { skipSave.current = false; return; }
    const serialized = JSON.stringify(value);
    if (suspended.current) { baseline.current = serialized; suspended.current = false; return; }
    const dirty = dirtyOverride ?? serialized !== baseline.current;
    if (!dirty) { clearUnsavedChanges(key); try { localStorage.removeItem(key); } catch { /* storage may be unavailable */ } return; }
    markUnsavedChanges(key);
    try { writeFormDraft(localStorage, key, value); setNotice(message => message.startsWith('Rascunho local restaurado') ? message : 'Rascunho salvo neste navegador. Arquivos ainda não enviados precisam ser selecionados novamente.'); }
    catch { setNotice('Não foi possível salvar o rascunho local. Mantenha o formulário aberto até salvar.'); }
  }, [key, enabled, value, dirtyOverride]);

  const clear = () => {
    if (key) { try { localStorage.removeItem(key); } catch { /* guard remains usable */ } clearUnsavedChanges(key); }
    baseline.current = JSON.stringify(current.current.value); suspended.current = true; setNotice('');
  };
  const close = (onClose: () => void) => {
    if (JSON.stringify(current.current.value) !== baseline.current && !window.confirm(UNSAVED_CHANGES_MESSAGE)) return;
    clearUnsavedChanges(key); onClose();
  };
  return { clear, close, notice, dirty: enabled && (dirtyOverride ?? JSON.stringify(value) !== baseline.current) };
}
