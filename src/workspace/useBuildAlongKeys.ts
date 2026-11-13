import { useEffect, useEffectEvent } from 'react';
import { isModalOpen } from '../design-system';
import { isTextEntry } from './helpers';
import type { BuildAlong } from './useBuildAlong';

export function useBuildAlongKeys(buildAlong: BuildAlong, listening: boolean) {
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || isTextEntry(document.activeElement) || isModalOpen()) return;

    const actions: Record<string, () => void> = {
      Escape: buildAlong.close,
      ArrowRight: buildAlong.next,
      ArrowLeft: buildAlong.previous,
    };
    const action = actions[e.key];

    if (!action) return;

    e.preventDefault();
    action();
  });

  useEffect(() => {
    if (!listening) return;

    const listener = (e: KeyboardEvent) => onKey(e);

    window.addEventListener('keydown', listener);

    return () => window.removeEventListener('keydown', listener);
  }, [listening]);
}
