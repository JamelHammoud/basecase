import type React from 'react';
import { useState } from 'react';
import { moveEdge, type TrySegment } from '../../cases/tryLabels';

interface Drag {
  index: number;
  frame: number;
}

export const framePercent = (frame: number, frames: number) =>
  Math.min(1, Math.max(0, frame / Math.max(frames - 1, 1))) * 100;

export function useEdgeDrag(segments: TrySegment[], frames: number, onMove: (index: number, frame: number) => void) {
  const [drag, setDrag] = useState<Drag | null>(null);

  const frameAt = (edge: HTMLElement, clientX: number) => {
    const box = edge.parentElement?.getBoundingClientRect();

    if (!box || box.width <= 0) return 0;

    return Math.round(Math.min(1, Math.max(0, (clientX - box.left) / box.width)) * (frames - 1));
  };

  const handlers = (index: number) => ({
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      setDrag({ index, frame: segments[index].start });
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      if (drag?.index === index) setDrag({ index, frame: frameAt(e.currentTarget, e.clientX) });
    },
    onPointerUp: () => {
      if (drag?.index === index) onMove(index, drag.frame);

      setDrag(null);
    },
    onPointerCancel: () => setDrag(null),
  });

  return {
    shown: drag ? moveEdge(segments, drag.index, drag.frame) : segments,
    dragging: drag !== null,
    handlers,
  };
}
