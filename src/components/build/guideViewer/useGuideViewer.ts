import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { settleTilt } from '../../../design-system';
import { findCover, flyIn, flyOut, readCoverOrigin, type FlightStage } from '../../../guide/viewer/guideFlight';
import type { GuidePages } from '../../../guide/viewer/guidePages';
import { GuidePageStack, PAGE_H_PX, PAGE_W_PX, type PageAnchor } from '../../../guide/viewer/pageStack';

const TOP_PX = 52;
const BOTTOM_PX = 76;
const SIDE_PX = 48;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 1.25;
const PAGE_WATCH_SHARE = 0.55;
const PINCH_SPEED = 0.01;

interface Stage {
  stack: GuidePageStack;
  flight: FlightStage;
  cover: HTMLElement | null;
  closing: boolean;
}

interface ViewerElements {
  scroller: HTMLDivElement;
  column: HTMLDivElement;
  backdrop: HTMLDivElement;
  chrome: HTMLDivElement;
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function applyScale(scroller: HTMLElement, column: HTMLElement, zoom: number) {
  const fit = Math.min(
    (scroller.clientHeight - TOP_PX - BOTTOM_PX) / PAGE_H_PX,
    (scroller.clientWidth - 2 * SIDE_PX) / PAGE_W_PX,
  );

  column.style.setProperty('--guide-k', String(Math.max(0.1, fit) * zoom));
}

function keepUnder(scroller: HTMLElement, anchor: PageAnchor, point: { x: number; y: number }) {
  const r = anchor.slot.getBoundingClientRect();

  scroller.scrollLeft += r.left + anchor.fx * r.width - point.x;
  scroller.scrollTop += r.top + anchor.fy * r.height - point.y;
}

function welcomeBack(cover: HTMLElement) {
  cover.style.visibility = '';
  cover.animate([{ transform: 'scale(1.08)' }, { transform: 'none' }], {
    duration: 420,
    easing: 'cubic-bezier(0.2, 0, 0, 1)',
  });
}

function watchPages(stack: GuidePageStack, scroller: HTMLElement, onPage: (page: number) => void) {
  const watch = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) onPage(Number((entry.target as HTMLElement).dataset.page) + 1);
      }
    },
    { root: scroller, threshold: PAGE_WATCH_SHARE },
  );

  stack.slots.forEach((slot) => watch.observe(slot));

  return watch;
}

function mountStage(pages: GuidePages, els: ViewerElements, zoom: number): Stage {
  const stack = new GuidePageStack(els.column, pages);
  const origin = readCoverOrigin();
  const cover = origin ? findCover() : null;
  const flight = { backdrop: els.backdrop, chrome: els.chrome, slots: stack.slots, reduced: reducedMotion() };

  applyScale(els.scroller, els.column, zoom);
  els.scroller.focus({ preventScroll: true });

  if (cover) {
    cover.style.visibility = 'hidden';
    settleTilt(cover);
  }

  const stage: Stage = { stack, flight, cover, closing: false };

  void stack.ready().then(() => {
    if (!els.column.isConnected || stage.closing) return;

    els.column.style.visibility = 'visible';
    void flyIn(flight, origin);
  });

  return stage;
}

export function useGuideViewer(pages: GuidePages, onClosed: () => void) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const zoomRef = useRef(1);
  const closingRef = useRef(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const els = {
      scroller: scrollerRef.current!,
      column: columnRef.current!,
      backdrop: backdropRef.current!,
      chrome: chromeRef.current!,
    };
    const stage = mountStage(pages, els, zoomRef.current);
    const pageWatch = watchPages(stage.stack, els.scroller, setPage);
    const resize = new ResizeObserver(() => applyScale(els.scroller, els.column, zoomRef.current));

    resize.observe(els.scroller);
    stageRef.current = stage;

    return () => {
      pageWatch.disconnect();
      resize.disconnect();
      stage.stack.dispose();

      if (stage.cover) stage.cover.style.visibility = '';

      stageRef.current = null;
    };
  }, [pages]);

  const close = async () => {
    const stage = stageRef.current;

    if (closingRef.current) return;

    closingRef.current = true;

    if (!stage) {
      onClosed();

      return;
    }

    stage.closing = true;
    stage.stack.slots.forEach((slot) => slot.getAnimations().forEach((a) => a.finish()));

    const scroller = scrollerRef.current!;
    const view = scroller.getBoundingClientRect();

    scroller.style.scrollSnapType = 'none';

    await flyOut(stage.flight, stage.stack.nearestToCenter(view), stage.cover ? readCoverOrigin() : null);

    if (stage.cover) welcomeBack(stage.cover);

    onClosed();
  };

  const zoom = (factor: number, at?: { x: number; y: number }) => {
    const scroller = scrollerRef.current!;
    const view = scroller.getBoundingClientRect();
    const point = at ?? { x: view.left + view.width / 2, y: view.top + view.height / 2 };
    const anchor = stageRef.current?.stack.anchorAt(point);

    zoomRef.current = factor ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomRef.current * factor)) : 1;
    applyScale(scroller, columnRef.current!, zoomRef.current);
    scroller.style.scrollSnapType = zoomRef.current > 1 ? 'none' : '';

    if (anchor) keepUnder(scroller, anchor, point);
  };

  const onWheel = useEffectEvent((e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;

    e.preventDefault();
    zoom(Math.exp(-e.deltaY * PINCH_SPEED), { x: e.clientX, y: e.clientY });
  });

  useEffect(() => {
    const scroller = scrollerRef.current!;
    const handle = (e: WheelEvent) => onWheel(e);

    scroller.addEventListener('wheel', handle, { passive: false });

    return () => scroller.removeEventListener('wheel', handle);
  }, []);

  const turnPage = (delta: number) => {
    const slots = stageRef.current?.stack.slots ?? [];
    const next = slots[Math.min(slots.length - 1, Math.max(0, page - 1 + delta))];

    next?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
  };

  const KEYS: Record<string, () => void> = {
    Escape: () => void close(),
    ArrowLeft: () => turnPage(-1),
    ArrowRight: () => turnPage(1),
    '=': () => zoom(ZOOM_STEP),
    '+': () => zoom(ZOOM_STEP),
    '-': () => zoom(1 / ZOOM_STEP),
    '0': () => zoom(0),
  };

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    const run = KEYS[e.key];

    if (!run || e.altKey || e.ctrlKey) return;

    e.preventDefault();
    run();
  });

  useEffect(() => {
    const handle = (e: KeyboardEvent) => onKey(e);

    window.addEventListener('keydown', handle);

    return () => window.removeEventListener('keydown', handle);
  }, []);

  return {
    refs: { scrollerRef, columnRef, backdropRef, chromeRef },
    page,
    pageCount: pages.pages.length,
    previousPage: () => turnPage(-1),
    nextPage: () => turnPage(1),
    close: () => void close(),
    zoomIn: () => zoom(ZOOM_STEP),
    zoomOut: () => zoom(1 / ZOOM_STEP),
  };
}
