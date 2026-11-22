import { useEffectEvent, useLayoutEffect, useRef } from 'react';
import { findPartDeep, parentBoolean } from '../../booleans/parts';
import type { ScenePart } from '../../types/robotics';

const findRow = (scroller: HTMLElement, key: string) =>
  scroller.querySelector<HTMLElement>(`[data-layer-row="${CSS.escape(key)}"]`);

const rowFor = (scroller: HTMLElement, parts: ScenePart[], id: string): HTMLElement | null => {
  const row = findRow(scroller, `part:${id}`);

  if (row) return row;

  const parent = parentBoolean(parts, id);

  if (parent) return rowFor(scroller, parts, parent.id);

  const group = parts.find((p) => p.id === id)?.group;

  return group ? findRow(scroller, `group:${group.id}`) : null;
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

    if (!scroller || !primaryId || !findPartDeep(parts, primaryId)) return;

    const row = rowFor(scroller, parts, primaryId);

    if (row) centerRow(scroller, row);
  });

  useLayoutEffect(() => {
    if (open) reveal();
  }, [open, primaryId]);

  return scrollerRef;
};
