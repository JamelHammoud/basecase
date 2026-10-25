import { useEffectEvent, useLayoutEffect, useRef } from 'react';
import type { ScenePart } from '../../types/robotics';

const findRow = (scroller: HTMLElement, key: string) =>
  scroller.querySelector<HTMLElement>(`[data-layer-row="${CSS.escape(key)}"]`);

const rowFor = (scroller: HTMLElement, part: ScenePart) => {
  const row = findRow(scroller, `part:${part.id}`);

  if (row || !part.group) return row;

  return findRow(scroller, `group:${part.group.id}`);
};

const centerRow = (scroller: HTMLElement, row: HTMLElement) => {
  const view = scroller.getBoundingClientRect();
  const box = row.getBoundingClientRect();

  if (box.top >= view.top && box.bottom <= view.bottom) return;

  scroller.scrollTop += box.top - view.top - (view.height - box.height) / 2;
};

export const useRevealSelection = (parts: ScenePart[], primaryId: string | undefined, open: boolean) => {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const reveal = useEffectEvent(() => {
    const scroller = scrollerRef.current;
    const part = parts.find((p) => p.id === primaryId);

    if (!scroller || !part) return;

    const row = rowFor(scroller, part);

    if (row) centerRow(scroller, row);
  });

  useLayoutEffect(() => {
    if (open) reveal();
  }, [open, primaryId]);

  return scrollerRef;
};
