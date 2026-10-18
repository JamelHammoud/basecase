import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Axis = 'y' | 'x';

interface Thumb {
  el: HTMLElement;
  axis: Axis;
  left: number;
  top: number;
  width: number;
  height: number;
}

const THICK = 6;
const INSET = 2;
const MIN_LEN = 28;
const HIDE_AFTER_MS = 900;

function measureY(el: HTMLElement): Thumb | null {
  const r = el.getBoundingClientRect();
  const range = el.scrollHeight - el.clientHeight;

  if (range < 1) return null;

  const track = el.clientHeight - INSET * 2;
  const len = Math.max(MIN_LEN, (track * el.clientHeight) / el.scrollHeight);
  const top = r.top + el.clientTop + INSET + (el.scrollTop / range) * (track - len);

  return {
    el,
    axis: 'y',
    left: r.left + el.clientLeft + el.clientWidth - THICK - INSET,
    top,
    width: THICK,
    height: len,
  };
}

function measureX(el: HTMLElement): Thumb | null {
  const r = el.getBoundingClientRect();
  const range = el.scrollWidth - el.clientWidth;

  if (range < 1) return null;

  const track = el.clientWidth - INSET * 2;
  const len = Math.max(MIN_LEN, (track * el.clientWidth) / el.scrollWidth);
  const left = r.left + el.clientLeft + INSET + (Math.abs(el.scrollLeft) / range) * (track - len);

  return {
    el,
    axis: 'x',
    left,
    top: r.top + el.clientTop + el.clientHeight - THICK - INSET,
    width: len,
    height: THICK,
  };
}

const measure = (el: HTMLElement, axis: Axis): Thumb | null => (axis === 'y' ? measureY(el) : measureX(el));

export const OverlayScrollbars: React.FC = () => {
  const [thumbs, setThumbs] = useState<Thumb[]>([]);
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<number | null>(null);
  const hovering = useRef(false);
  const drag = useRef<{ thumb: Thumb; start: number; scroll: number } | null>(null);
  const last = useRef<{ el: HTMLElement; x: number; y: number } | null>(null);

  const scheduleHide = () => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);

    hideTimer.current = window.setTimeout(() => {
      if (!hovering.current && !drag.current) setVisible(false);
    }, HIDE_AFTER_MS);
  };

  useEffect(() => {
    const onScroll = (e: Event) => {
      const el = e.target instanceof HTMLElement ? e.target : (document.scrollingElement as HTMLElement | null);

      if (!el || el.classList.contains('no-scrollbar')) return;

      const prev = last.current;
      const movedY = !prev || prev.el !== el || prev.y !== el.scrollTop;
      const movedX = !prev || prev.el !== el || prev.x !== el.scrollLeft;

      last.current = { el, x: el.scrollLeft, y: el.scrollTop };

      const next = [movedY && measure(el, 'y'), movedX && measure(el, 'x')].filter((t): t is Thumb => !!t);

      if (!next.length) return;

      setThumbs(next);
      setVisible(true);
      scheduleHide();
    };
    const onResize = () => setVisible(false);

    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);

    return () => {
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);

      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, []);

  const onPointerDown = (thumb: Thumb) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = {
      thumb,
      start: thumb.axis === 'y' ? e.clientY : e.clientX,
      scroll: thumb.axis === 'y' ? thumb.el.scrollTop : thumb.el.scrollLeft,
    };
    thumb.el.dataset.scrollbarDrag = '';
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;

    if (!d) return;

    const { el, axis } = d.thumb;
    const fresh = measure(el, axis);

    if (!fresh) return;

    const range = axis === 'y' ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth;
    const track =
      (axis === 'y' ? el.clientHeight : el.clientWidth) - INSET * 2 - (axis === 'y' ? fresh.height : fresh.width);
    const delta = (axis === 'y' ? e.clientY : e.clientX) - d.start;
    const to = d.scroll + (delta * range) / Math.max(1, track);

    if (axis === 'y') el.scrollTop = to;
    else el.scrollLeft = to;
  };
  const endDrag = () => {
    const d = drag.current;

    if (!d) return;

    delete d.thumb.el.dataset.scrollbarDrag;
    drag.current = null;
    scheduleHide();
  };

  return createPortal(
    <>
      {thumbs.map((t) => (
        <div
          key={t.axis}
          aria-hidden
          onPointerDown={onPointerDown(t)}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerEnter={() => (hovering.current = true)}
          onPointerLeave={() => {
            hovering.current = false;
            scheduleHide();
          }}
          className={`fixed z-[200] rounded-full bg-white/25 hover:bg-white/40 transition-[opacity,background-color] duration-200 ${
            visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          style={{ left: t.left, top: t.top, width: t.width, height: t.height }}
        />
      ))}
    </>,
    document.body,
  );
};
