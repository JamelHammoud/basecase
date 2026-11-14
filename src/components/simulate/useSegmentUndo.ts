import { useEffect, useEffectEvent, useRef, type RefObject } from 'react';
import { OWN_EDIT_EVENT } from '../routines/useRoutineKeys';
import type { TryLabelsState } from '../../workspace/useTryLabels';

const MENU_ECHO_MS = 300;

type Step = 'undo' | 'redo';

function stepOf(e: React.KeyboardEvent): Step | null {
  const mod = e.metaKey || e.ctrlKey;
  const key = e.key.toLowerCase();

  if (mod && key === 'z') return e.shiftKey ? 'redo' : 'undo';

  return mod && key === 'y' ? 'redo' : null;
}

interface SegmentUndo {
  root: RefObject<HTMLDivElement | null>;
  labels: TryLabelsState;
  open: boolean;
}

export function useSegmentUndo({ root, labels, open }: SegmentUndo) {
  const lastKey = useRef(0);

  const onMenu = useEffectEvent((e: Event) => {
    const step = String((e as CustomEvent).detail);
    const echo = performance.now() - lastKey.current < MENU_ECHO_MS;

    if (!echo && (step === 'undo' || step === 'redo')) labels[step]();
  });

  useEffect(() => {
    const el = root.current;
    const listener = (e: Event) => onMenu(e);

    el?.addEventListener(OWN_EDIT_EVENT, listener);

    return () => el?.removeEventListener(OWN_EDIT_EVENT, listener);
  }, [root, open]);

  return (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = stepOf(e);

    if (!step || !(step === 'undo' ? labels.canUndo : labels.canRedo)) return;

    e.preventDefault();
    e.stopPropagation();
    lastKey.current = performance.now();
    labels[step]();
  };
}
