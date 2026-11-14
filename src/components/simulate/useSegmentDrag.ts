import { useRef, useState, type RefObject } from 'react';
import { sampleAt } from '../../design-system/tracePaths';

interface Drag {
  index: number;
  frame: number;
}

interface SegmentDragOptions {
  track: RefObject<HTMLDivElement | null>;
  frames: number;
  onMove: (index: number, frame: number) => void;
}

export function useSegmentDrag({ track, frames, onMove }: SegmentDragOptions) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const moved = useRef(false);

  const frameAt = (clientX: number) => {
    const box = track.current?.getBoundingClientRect();

    return box ? sampleAt((clientX - box.left) / Math.max(box.width, 1), frames) : 0;
  };

  const handle = (index: number) => ({
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      moved.current = false;
      setDrag({ index, frame: frameAt(e.clientX) });
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      if (drag?.index !== index) return;

      moved.current = true;
      setDrag({ index, frame: frameAt(e.clientX) });
    },
    onPointerUp: () => {
      if (drag?.index === index && moved.current) onMove(index, drag.frame);

      setDrag(null);
    },
  });

  return { drag, handle, frameAt };
}
