import React, { useEffect, useEffectEvent, useRef, useState } from 'react';
import { dropTarget, rowTop } from './queueDrag';

const DRAG_THRESHOLD_PX = 4;

export const SETTLE_MS = 180;

interface Press {
  id: string;
  index: number;
  pointerY: number;
  offsetY: number;
  left: number;
  width: number;
  started: boolean;
}

export interface QueueDrag {
  id: string;
  from: number;
  to: number;
  top: number;
  left: number;
  width: number;
  settling: boolean;
}

interface QueueDragOptions {
  count: number;
  listRef: React.RefObject<HTMLDivElement | null>;
  onMove: (from: number, to: number) => void;
  onClick: (id: string) => void;
}

const listTopOf = (listRef: QueueDragOptions['listRef']) => listRef.current?.getBoundingClientRect().top ?? 0;

export function useQueueDrag({ count, listRef, onMove, onClick }: QueueDragOptions) {
  const pressRef = useRef<Press | null>(null);
  const [drag, setDrag] = useState<QueueDrag | null>(null);
  const dragging = !!drag && !drag.settling;

  const settle = (to: number) => {
    if (!drag) return;

    const landed = { ...drag, to, top: listTopOf(listRef) + rowTop(to), settling: true };

    setDrag(landed);
    window.setTimeout(() => {
      if (landed.to !== landed.from) onMove(landed.from, landed.to);

      setDrag(null);
    }, SETTLE_MS);
  };

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !drag) return;

    e.preventDefault();
    e.stopPropagation();
    pressRef.current = null;
    settle(drag.from);
  });

  useEffect(() => {
    if (!dragging) return;

    const listener = (e: KeyboardEvent) => onKey(e);

    window.addEventListener('keydown', listener, true);

    return () => window.removeEventListener('keydown', listener, true);
  }, [dragging]);

  const start = (e: React.PointerEvent<HTMLElement>, id: string, index: number) => {
    if (e.button !== 0 || drag || (e.target as Element).closest('button')) return;

    const rect = e.currentTarget.getBoundingClientRect();

    pressRef.current = {
      id,
      index,
      pointerY: e.clientY,
      offsetY: e.clientY - rect.top,
      left: rect.left,
      width: rect.width,
      started: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const move = (e: React.PointerEvent<HTMLElement>) => {
    const p = pressRef.current;

    if (!p || (!p.started && Math.abs(e.clientY - p.pointerY) < DRAG_THRESHOLD_PX)) return;

    p.started = true;

    const top = e.clientY - p.offsetY;
    const to = dropTarget(top - listTopOf(listRef), count, p.index);

    setDrag({ id: p.id, from: p.index, to, top, left: p.left, width: p.width, settling: false });
  };

  const end = () => {
    const p = pressRef.current;

    pressRef.current = null;

    if (!p) return;

    if (!p.started) onClick(p.id);
    else if (drag) settle(drag.to);
  };

  const cancel = () => {
    pressRef.current = null;

    if (drag && !drag.settling) settle(drag.from);
  };

  return { drag, start, move, end, cancel };
}
