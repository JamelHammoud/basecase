import { useEffect, useEffectEvent } from 'react';
import { isModalOpen } from '../../design-system';
import { isTextEntry } from '../../workspace/helpers';
import type { TriesView } from '../../workspace/useTriesView';

export function useTriesKeys(view: TriesView, timelineOpen: boolean) {
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || isModalOpen() || isTextEntry(document.activeElement)) return;

    if (e.key === 'Escape' && !timelineOpen) {
      e.preventDefault();
      view.close();
    }

    if ((e.key === 'Backspace' || e.key === 'Delete') && view.selected.length) {
      e.preventDefault();
      view.remove();
    }
  });

  useEffect(() => {
    if (!view.open) return;

    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }, [view.open]);
}
