import React, { useRef, useState } from 'react';

export interface PanelResizerProps {
  /** Which edge of the panel the handle sits on */
  edge: 'left' | 'right';
  width: number;
  min: number;
  max: number;
  defaultWidth: number;
  onResize: (width: number) => void;
  /** Dragging well past the minimum collapses the panel */
  onCollapse: () => void;
  onResizingChange?: (resizing: boolean) => void;
}

/** How far past the minimum a drag must go before the panel collapses */
const COLLAPSE_SLACK = 90;

/**
 * Figma-style panel edge: a thin hit area that shows a blue line on hover. Drag to resize,
 * double-click to reset, drag far past the minimum to collapse.
 */
export const PanelResizer: React.FC<PanelResizerProps> = ({
  edge,
  width,
  min,
  max,
  defaultWidth,
  onResize,
  onCollapse,
  onResizingChange,
}) => {
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{ x: number; width: number } | null>(null);

  const end = (el: HTMLElement, pointerId: number) => {
    startRef.current = null;
    setDragging(false);
    onResizingChange?.(false);
    document.body.style.cursor = '';
    if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={Math.round(width)}
      aria-valuemin={min}
      aria-valuemax={max}
      title=""
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        startRef.current = { x: e.clientX, width };
        setDragging(true);
        onResizingChange?.(true);
        document.body.style.cursor = 'col-resize';
      }}
      onPointerMove={(e) => {
        const start = startRef.current;
        if (!start) return;
        const dx = e.clientX - start.x;
        const raw = start.width + (edge === 'right' ? dx : -dx);
        if (raw < min - COLLAPSE_SLACK) {
          end(e.currentTarget, e.pointerId);
          onCollapse();
          return;
        }
        onResize(Math.round(Math.min(max, Math.max(min, raw))));
      }}
      onPointerUp={(e) => end(e.currentTarget, e.pointerId)}
      onPointerCancel={(e) => end(e.currentTarget, e.pointerId)}
      onDoubleClick={() => onResize(defaultWidth)}
      // Fills the gap between a panel card and the canvas card
      className={`group absolute top-0 bottom-0 z-30 w-[8px] cursor-col-resize ${edge === 'right' ? 'right-0' : 'left-0'}`}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <span
        className={`absolute top-0 bottom-0 left-[3px] w-[2px] rounded-full transition-colors duration-150 ${
          dragging ? 'bg-[#0d99ff]' : 'bg-transparent group-hover:bg-[#0d99ff]/70'
        }`}
      />
    </div>
  );
};
