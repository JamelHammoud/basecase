import { useEffect, useEffectEvent } from 'react';
import { isModalOpen } from '../../design-system';
import { isTextEntry } from '../../workspace/helpers';

interface TriesKeys {
  active: boolean;
  onBack: () => void;
  onDelete: () => void;
}

const ignored = (e: KeyboardEvent) =>
  e.metaKey || e.ctrlKey || e.altKey || isTextEntry(document.activeElement) || isModalOpen();

export function useTriesKeys({ active, onBack, onDelete }: TriesKeys) {
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    const keys: Record<string, (() => void) | undefined> = { Escape: onBack, Backspace: onDelete, Delete: onDelete };
    const action = keys[e.key];

    if (!action || ignored(e)) return;

    e.preventDefault();
    e.stopPropagation();
    action();
  });

  useEffect(() => {
    if (!active) return;

    window.addEventListener('keydown', onKey, true);

    return () => window.removeEventListener('keydown', onKey, true);
  }, [active]);
}
