import { useEffect, useEffectEvent } from 'react';
import { isModalOpen } from '../../design-system';
import { isTextEntry } from '../../workspace/helpers';

export interface TimelineKeysTarget {
  open: boolean;
  dt: number;
  frames: number;
  step: (by: number) => void;
  seek: (frame: number) => void;
  toggle: () => void;
  close: () => void;
}

type KeyAction = (timeline: TimelineKeysTarget, shift: boolean) => void;

const second = (t: TimelineKeysTarget) => Math.max(1, Math.round(1 / t.dt));

const KEYS: Record<string, KeyAction> = {
  ArrowLeft: (t, shift) => t.step(shift ? -second(t) : -1),
  ArrowRight: (t, shift) => t.step(shift ? second(t) : 1),
  Home: (t) => t.seek(0),
  End: (t) => t.seek(t.frames - 1),
  ' ': (t) => t.toggle(),
  Escape: (t) => t.close(),
};

const typing = (el: Element | null) => isTextEntry(el) && !(el instanceof HTMLInputElement && el.type === 'range');

const ignored = (e: KeyboardEvent) =>
  e.metaKey || e.ctrlKey || e.altKey || typing(document.activeElement) || isModalOpen();

export function useTimelineKeys(timeline: TimelineKeysTarget) {
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    const action = KEYS[e.key];

    if (!action || ignored(e)) return;

    e.preventDefault();
    e.stopPropagation();

    if (e.type === 'keydown') action(timeline, e.shiftKey);
  });

  useEffect(() => {
    if (!timeline.open) return;

    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);

    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
    };
  }, [timeline.open]);
}
