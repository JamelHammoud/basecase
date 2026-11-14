import { useEffect, useEffectEvent } from 'react';
import { shortcutFor, type ShortcutHandlers } from '../../app/shortcuts';
import { isModalOpen } from '../../design-system';
import { isTextEntry } from '../../workspace/helpers';
import type { TryTimeline } from '../../workspace/useTryTimeline';

type TimelineKeys = Pick<TryTimeline, 'dt' | 'frames' | 'step' | 'seek' | 'toggle' | 'faster' | 'close'>;

const second = (t: TimelineKeys) => Math.max(1, Math.round(1 / t.dt));

const forward = (e: KeyboardEvent) => ['ArrowRight', 'End', ']'].includes(e.key) || e.code === 'BracketRight';

export const timelineKeyHandlers = (t: TimelineKeys): ShortcutHandlers => ({
  'timeline:play': () => t.toggle(),
  'timeline:frame': (e) => t.step(forward(e) ? 1 : -1),
  'timeline:second': (e) => t.step(forward(e) ? second(t) : -second(t)),
  'timeline:ends': (e) => t.seek(forward(e) ? t.frames - 1 : 0),
  'timeline:speed': (e) => t.faster(forward(e) ? 1 : -1),
  'timeline:close': () => t.close(),
});

const typing = (el: Element | null) => isTextEntry(el) && !(el instanceof HTMLInputElement && el.type === 'range');

const ignored = (e: KeyboardEvent) =>
  e.metaKey || e.ctrlKey || e.altKey || typing(document.activeElement) || isModalOpen();

export function useTimelineKeys(timeline: TryTimeline) {
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    const id = shortcutFor(e, 'timeline');
    const action = id && timelineKeyHandlers(timeline)[id];

    if (!action || ignored(e)) return;

    e.preventDefault();
    e.stopPropagation();

    if (e.type === 'keydown') action(e);
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
