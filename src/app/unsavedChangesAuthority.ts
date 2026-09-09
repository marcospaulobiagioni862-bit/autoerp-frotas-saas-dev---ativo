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

export function installUnsavedChangesBeforeUnload(): () => void {
  const handler = (event: BeforeUnloadEvent) => {
    if (!hasUnsavedChanges()) return;
    event.preventDefault();
    event.returnValue = '';
  };
  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
}
