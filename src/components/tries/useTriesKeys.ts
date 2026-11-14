import { useEffect, useEffectEvent } from 'react';
import { isModalOpen } from '../../design-system';
import { isTextEntry } from '../../workspace/helpers';

interface TriesKeys {
  active: boolean;
  picked: string[];
  onClear: () => void;
  onDelete: (ids: string[]) => void;
  onLeave: () => void;
}

const ignored = (e: KeyboardEvent) => e.metaKey || e.ctrlKey || e.altKey || isTextEntry(document.activeElement);

export function useTriesKeys({ active, picked, onClear, onDelete, onLeave }: TriesKeys) {
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (ignored(e) || isModalOpen()) return;

    const actions: Record<string, () => void> = {
      Escape: () => (picked.length ? onClear() : onLeave()),
      Backspace: () => picked.length && onDelete(picked),
      Delete: () => picked.length && onDelete(picked),
    };
    const action = actions[e.key];

    if (!action) return;

    e.preventDefault();
    action();
  });

  useEffect(() => {
    if (!active) return;

    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }, [active]);
}
