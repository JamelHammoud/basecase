import React, { useEffect, useRef, useState } from 'react';

export interface ImageView {
  scale: number;
  x: number;
  y: number;
}

type ViewerAction = 'close' | 'next' | 'prev' | 'zoomIn' | 'zoomOut' | 'fit';

const KEY_ACTIONS: Record<string, ViewerAction> = {
  Escape: 'close',
  ArrowRight: 'next',
  ArrowLeft: 'prev',
  '=': 'zoomIn',
  '+': 'zoomIn',
  '-': 'zoomOut',
  '0': 'fit',
};

interface ViewerKeyOptions {
  isOpen: boolean;
  onClose: () => void;
  step: (dir: 1 | -1) => void;
  zoomAt: (factor: number, clientX?: number, clientY?: number, smooth?: boolean) => void;
  fit: (smooth?: boolean) => void;
}

export function useImageViewerKeys({ isOpen, onClose, step, zoomAt, fit }: ViewerKeyOptions) {
  useEffect(() => {
    if (!isOpen) return;

    const run: Record<ViewerAction, () => void> = {
      close: onClose,
      next: () => step(1),
      prev: () => step(-1),
      zoomIn: () => zoomAt(1.5, undefined, undefined, true),
      zoomOut: () => zoomAt(1 / 1.5, undefined, undefined, true),
      fit: () => fit(),
    };
    const onKey = (e: KeyboardEvent) => {
      const action = Object.hasOwn(KEY_ACTIONS, e.key) ? KEY_ACTIONS[e.key] : undefined;

      if (!action) return;

      if (action === 'close') e.stopPropagation();

      run[action]();
      e.preventDefault();
    };

    window.addEventListener('keydown', onKey, true);

    return () => window.removeEventListener('keydown', onKey, true);
  }, [isOpen, onClose, step, zoomAt, fit]);
}

interface ImagePanOptions {
  view: ImageView;
  setView: React.Dispatch<React.SetStateAction<ImageView>>;
  setAnimate: (animate: boolean) => void;
  onClose: () => void;
}

export function useImagePan({ view, setView, setAnimate, onClose }: ImagePanOptions) {
  const dragRef = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean; onBackdrop: boolean } | null>(
    null,
  );
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;

    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      vx: view.x,
      vy: view.y,
      moved: false,
      onBackdrop: e.target === e.currentTarget,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;

    if (!d) return;

    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;

    if (!d.moved && Math.hypot(dx, dy) < 3) return;

    d.moved = true;
    setDragging(true);
    setAnimate(false);
    setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
  };
  const onPointerUp = () => {
    const d = dragRef.current;

    dragRef.current = null;
    setDragging(false);

    if (d && !d.moved && d.onBackdrop) onClose();
  };

  return { dragging, handlers: { onPointerDown, onPointerMove, onPointerUp } };
}

interface ImageWheelOptions {
  stageRef: React.RefObject<HTMLDivElement | null>;
  isOpen: boolean;
  zoomAt: (factor: number, clientX?: number, clientY?: number) => void;
  setAnimate: (animate: boolean) => void;
  setView: React.Dispatch<React.SetStateAction<ImageView>>;
}

export function useImageWheel({ stageRef, isOpen, zoomAt, setAnimate, setView }: ImageWheelOptions) {
  useEffect(() => {
    const el = stageRef.current;

    if (!el || !isOpen) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
      } else {
        setAnimate(false);
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });

    return () => el.removeEventListener('wheel', onWheel);
  }, [stageRef, isOpen, zoomAt, setAnimate, setView]);
}
