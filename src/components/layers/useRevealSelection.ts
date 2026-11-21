import { useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import type { ScenePart } from '../../types/robotics';
import type { LayerListRow } from './dataRows';
import { layerRange, layerSlots, selectedRowIndex, LAYER_ROW_HEIGHT, LAYER_ROW_PITCH } from './layerWindow';

interface LayerView {
  parts: ScenePart[];
  rows: LayerListRow[];
  primaryId: string | undefined;
  editingId: string | null;
  open: boolean;
}

export const useRevealSelection = ({ parts, rows, primaryId, editingId, open }: LayerView) => {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [view, setView] = useState({ top: 0, height: 720 });
  const selected = selectedRowIndex(rows, parts, primaryId);
  const present = parts.length > 0;
  const measure = useEffectEvent(() => {
    const scroller = scrollerRef.current;
    const list = listRef.current;

    if (!scroller || !list) return;

    const top = scroller.getBoundingClientRect().top - list.getBoundingClientRect().top;
    const next = { top, height: scroller.clientHeight };

    setView((current) => (current.top === next.top && current.height === next.height ? current : next));
  });
  const reveal = useEffectEvent(() => {
    const scroller = scrollerRef.current;
    const list = listRef.current;

    if (!scroller || !list || selected < 0) return;

    const top = list.getBoundingClientRect().top - scroller.getBoundingClientRect().top + selected * LAYER_ROW_PITCH;

    if (top >= 0 && top + LAYER_ROW_HEIGHT <= scroller.clientHeight) return;

    scroller.scrollTop += top - (scroller.clientHeight - LAYER_ROW_HEIGHT) / 2;
    measure();
  });

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;

    if (!open || !scroller) return;

    const observer = new ResizeObserver(measure);

    observer.observe(scroller);
    scroller.addEventListener('scroll', measure, { passive: true });
    measure();

    return () => {
      observer.disconnect();
      scroller.removeEventListener('scroll', measure);
    };
  }, [open, present]);
  useLayoutEffect(() => {
    if (open) reveal();
  }, [open, primaryId, selected]);

  return { scrollerRef, listRef, slots: layerSlots(rows, layerRange(rows.length, view.top, view.height), editingId) };
};
