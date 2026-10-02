const dirtySources = new Set<string>();

export const UNSAVED_CHANGES_MESSAGE =
  'Existem alterações não salvas. Se você sair agora, essas informações serão perdidas. Deseja continuar?';

export function markUnsavedChanges(source: string): void {
  if (!source) return;
  dirtySources.add(source);
}

export function clearUnsavedChanges(source: string): void {
  dirtySources.delete(source);
}

export function clearAllUnsavedChanges(): void {
  dirtySources.clear();
}

export function hasUnsavedChanges(): boolean {
  return dirtySources.size > 0;
}

export function confirmDiscardUnsavedChanges(message = UNSAVED_CHANGES_MESSAGE): boolean {
  if (!hasUnsavedChanges()) return true;
  return window.confirm(message);
}

export function requestGuardedClose(
  event: { currentTarget: EventTarget | null },
  onClose: () => void,
  message = UNSAVED_CHANGES_MESSAGE
): void {
  const element = event.currentTarget instanceof Element ? event.currentTarget : null;
  const guardId = element?.closest('[data-unsaved-guard]')?.getAttribute('data-unsaved-guard') || '';
  const nestedDirty = element?.closest('[data-unsaved-guard]')?.querySelector('[data-draft-dirty="true"]');
  if (guardId && (dirtySources.has(guardId) || nestedDirty) && !window.confirm(message)) return;
  if (guardId) clearUnsavedChanges(guardId);
  onClose();
}

export function installUnsavedChangesBeforeUnload(): () => void {
  const handler = (event: BeforeUnloadEvent) => {
    if (!hasUnsavedChanges()) return;
    event.preventDefault();
    event.returnValue = '';
  };
  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
}
