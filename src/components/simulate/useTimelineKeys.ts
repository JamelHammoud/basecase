import type React from 'react';
import { useEffect, useEffectEvent } from 'react';
import { splitAt } from '../../cases/tryLabels';
import { isModalOpen } from '../../design-system';
import { isTextEntry } from '../../workspace/helpers';
import type { TryTimeline } from '../../workspace/useTryTimeline';

type KeyAction = (timeline: TryTimeline, shift: boolean) => void;

const second = (t: TryTimeline) => Math.max(1, Math.round(1 / t.dt));

const merge: KeyAction = (t) => t.segments.merge(t.frame);

export interface TimelineOwner {
  root: React.RefObject<HTMLElement | null>;
  onKeyEdit: () => void;
}

const mergePasses = (t: TryTimeline) => t.segments.selected === null;

const PASSES: Record<string, (t: TryTimeline) => boolean> = {
  s: (t) => splitAt(t.segments.segments, t.frame) === t.segments.segments,
  Backspace: mergePasses,
  Delete: mergePasses,
};

const passesOn = (e: KeyboardEvent, timeline: TryTimeline) => !!PASSES[e.key]?.(timeline);

const leavesTimeline = (e: PointerEvent, root: HTMLElement | null) => {
  const target = e.target instanceof Element ? e.target : null;

  return !!target && !root?.contains(target) && !target.closest('[role="menu"]') && !isModalOpen();
};

const KEYS: Record<string, KeyAction> = {
  ArrowLeft: (t, shift) => t.step(shift ? -second(t) : -1),
  ArrowRight: (t, shift) => t.step(shift ? second(t) : 1),
  Home: (t) => t.seek(0),
  End: (t) => t.seek(t.frames - 1),
  ' ': (t) => t.toggle(),
  Escape: (t) => t.close(),
  s: (t) => t.segments.split(t.frame),
  Backspace: merge,
  Delete: merge,
};

const typing = (el: Element | null) => isTextEntry(el) && !(el instanceof HTMLInputElement && el.type === 'range');

const busy = () => typing(document.activeElement) || isModalOpen();

const ignored = (e: KeyboardEvent) => e.metaKey || e.ctrlKey || e.altKey || busy();

function historyStep(e: KeyboardEvent, timeline: TryTimeline): (() => boolean) | null {
  const key = e.key.toLowerCase();

  if (e.type !== 'keydown' || !(e.metaKey || e.ctrlKey) || e.altKey || busy()) return null;

  if (key === 'y' || (key === 'z' && e.shiftKey)) return timeline.segments.canRedo ? timeline.segments.redo : null;

  return key === 'z' && timeline.segments.canUndo ? timeline.segments.undo : null;
}

export function useTimelineKeys(timeline: TryTimeline, owner: TimelineOwner) {
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    const step = historyStep(e, timeline);
    const action = KEYS[e.key];

    if (step) {
      e.preventDefault();
      e.stopPropagation();
      owner.onKeyEdit();
      step();

      return;
    }

    if (!action || ignored(e) || passesOn(e, timeline)) return;

    e.preventDefault();
    e.stopPropagation();

    if (e.type === 'keydown') action(timeline, e.shiftKey);
  });

  const onPress = useEffectEvent((e: PointerEvent) => {
    if (timeline.segments.selected !== null && leavesTimeline(e, owner.root.current)) timeline.segments.select(null);
  });

  useEffect(() => {
    if (!timeline.open) return;

    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    window.addEventListener('pointerdown', onPress, true);

    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
      window.removeEventListener('pointerdown', onPress, true);
    };
  }, [timeline.open]);
}
