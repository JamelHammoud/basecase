import React, { useLayoutEffect, useRef, useState } from 'react';
import { dragShift, dropIndex, TabBox, TabDrag } from './tabGeometry';

const EASE = 'cubic-bezier(0.2, 0, 0, 1)';
const DRAG_THRESHOLD_PX = 4;

type TabEls = Map<string, HTMLDivElement>;

interface Press extends TabDrag {
  index: number;
  x: number;
  started: boolean;
}

const boxesOf = (tabs: { id: string }[], els: TabEls): TabBox[] =>
  tabs.map((t) => {
    const el = els.get(t.id);

    return { left: el?.offsetLeft ?? 0, width: el?.offsetWidth ?? 0 };
  });

function shiftOf(tabs: { id: string }[], els: TabEls, index: number, drag: TabDrag | null) {
  if (!drag) return 0;

  const from = tabs.findIndex((t) => t.id === drag.id);

  if (from === -1) return 0;

  return dragShift(boxesOf(tabs, els), from, index, drag.dx);
}

function flipFrom(el: HTMLDivElement, before: number | undefined, settling: boolean) {
  const delta = before === undefined ? 0 : before - el.offsetLeft;

  if (Math.abs(delta) > 0.5) {
    el.style.transition = 'none';
    el.style.transform = `translateX(${delta}px)`;

    return true;
  }

  if (settling) {
    el.style.transition = 'none';
    el.style.transform = '';
  }

  return false;
}

interface TabDragOptions {
  tabs: { id: string }[];
  tabEls: React.RefObject<TabEls>;
  scrollerRef: React.RefObject<HTMLDivElement | null>;
  onReorder: (from: number, to: number) => void;
}

function useTabFlip({
  tabs,
  tabEls,
  scrollerRef,
  drag,
  lastLeftRef,
  settlingRef,
}: TabDragOptions & {
  drag: TabDrag | null;
  lastLeftRef: React.RefObject<Map<string, number>>;
  settlingRef: React.RefObject<boolean>;
}) {
  useLayoutEffect(() => {
    const moved: HTMLDivElement[] = [];

    tabs.forEach((t, i) => {
      const el = tabEls.current.get(t.id);

      if (!el) return;

      if (drag) {
        el.style.transition = t.id === drag.id ? 'none' : `transform 180ms ${EASE}`;
        el.style.transform = `translateX(${shiftOf(tabs, tabEls.current, i, drag)}px)`;

        return;
      }

      if (flipFrom(el, lastLeftRef.current.get(t.id), settlingRef.current)) moved.push(el);

      lastLeftRef.current.set(t.id, el.offsetLeft);
    });

    if (!drag) settlingRef.current = false;

    if (moved.length) {
      void scrollerRef.current?.offsetWidth;
      moved.forEach((el) => {
        el.style.transition = `transform 220ms ${EASE}`;
        el.style.transform = '';
      });
    }

    for (const id of [...lastLeftRef.current.keys()])
      if (!tabs.some((t) => t.id === id)) lastLeftRef.current.delete(id);
  });
}

export function useTabDrag(options: TabDragOptions) {
  const { tabs, tabEls, scrollerRef, onReorder } = options;
  const lastLeftRef = useRef(new Map<string, number>());
  const pressRef = useRef<Press | null>(null);
  const settlingRef = useRef(false);
  const [drag, setDrag] = useState<TabDrag | null>(null);

  useTabFlip({ ...options, drag, lastLeftRef, settlingRef });

  const startPress = (e: React.PointerEvent<HTMLDivElement>, id: string, index: number) => {
    pressRef.current = { id, index, x: e.clientX, dx: 0, started: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const movePress = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = pressRef.current;

    if (!p) return;

    const raw = e.clientX - p.x;

    if (!p.started && Math.abs(raw) < DRAG_THRESHOLD_PX) return;

    p.started = true;

    const el = tabEls.current.get(p.id);
    const scroller = scrollerRef.current;
    const min = el ? -el.offsetLeft : raw;
    const max = el && scroller ? scroller.scrollWidth - el.offsetLeft - el.offsetWidth : raw;

    p.dx = Math.max(min, Math.min(max, raw));
    setDrag({ id: p.id, dx: p.dx });
  };

  const endPress = () => {
    const p = pressRef.current;

    pressRef.current = null;

    if (!p?.started) {
      setDrag(null);

      return;
    }

    const to = dropIndex(boxesOf(tabs, tabEls.current), p.index, p.dx);

    tabs.forEach((t, i) => {
      const el = tabEls.current.get(t.id);

      if (el) lastLeftRef.current.set(t.id, el.offsetLeft + shiftOf(tabs, tabEls.current, i, p));
    });
    settlingRef.current = true;
    setDrag(null);

    if (to !== p.index) onReorder(p.index, to);
  };

  const isPressing = () => pressRef.current !== null;

  return { drag, startPress, movePress, endPress, isPressing };
}
