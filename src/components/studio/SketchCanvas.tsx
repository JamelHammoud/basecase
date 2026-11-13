import React, { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { Vec2 } from '../../utils/sketch/types';
import { SketchOverlay } from './SketchOverlay';
import { previewShape, typedAnchor } from './sketchPreview';
import { SketchEntities, SketchGrid, SketchPreview } from './SketchShapes';
import { fitView, panned, snapStep, snapTolerance, toMm, viewBox, zoomed, type Box } from './sketchView';
import { useSketchDrawing, type SketchEditor } from './useSketchDrawing';
import { useSketchKeys } from './useSketchKeys';
import { useSketchSelection } from './useSketchSelection';
import type { SketchTool } from './useStudioDraft';

const REFUSE_MS = 700;
const ZOOM_SPEED = 0.01;

interface SketchCanvasProps {
  editor: SketchEditor;
  tool: SketchTool | null;
  onTool: (tool: SketchTool | null) => void;
  snap: boolean;
}

function useWheelView(ref: React.RefObject<HTMLDivElement | null>, onWheel: (e: WheelEvent) => void) {
  const handle = useEffectEvent(onWheel);

  useEffect(() => {
    const el = ref.current;

    if (!el) return;

    const listener = (e: WheelEvent) => handle(e);

    el.addEventListener('wheel', listener, { passive: false });

    return () => el.removeEventListener('wheel', listener);
  }, [ref]);
}

function useRefusal() {
  const [refused, setRefused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refuse = () => {
    setRefused(true);

    if (timer.current) clearTimeout(timer.current);

    timer.current = setTimeout(() => setRefused(false), REFUSE_MS);
  };

  return { refused, refuse };
}

export const SketchCanvas: React.FC<SketchCanvasProps> = ({ editor, tool, onTool, snap }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [view, setView] = useState(() => fitView(editor.sketch));
  const { refused, refuse } = useRefusal();
  const grid = snap ? snapStep(view) : null;
  const drawing = useSketchDrawing({ editor, tool, grid, onRefuse: refuse });
  const selection = useSketchSelection({ editor, grid, onRefuse: refuse });
  const shown = selection.preview ?? editor.sketch;

  const box = (): Box => svgRef.current!.getBoundingClientRect();

  const pointer = (e: React.PointerEvent | WheelEvent): { at: Vec2; tolerance: number } => {
    const b = box();

    return { at: toMm(view, b, e.clientX, e.clientY), tolerance: snapTolerance(view, b) };
  };

  useWheelView(containerRef, (e) => {
    e.preventDefault();

    if (e.ctrlKey) setView(zoomed(view, pointer(e).at, Math.exp(e.deltaY * ZOOM_SPEED)));
    else setView(panned(view, box(), e.deltaX, e.deltaY));
  });

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;

    containerRef.current?.focus({ preventScroll: true });

    const { at, tolerance } = pointer(e);

    if (tool) drawing.press(at, tolerance);
    else selection.press(at, tolerance, e.shiftKey);

    if (!tool) e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const { at, tolerance } = pointer(e);

    if (selection.dragging) selection.move(at);
    else drawing.move(at, tolerance);
  };

  const onKeyDown = useSketchKeys({ editor, drawing, selection, tool, onTool, rootRef: containerRef });

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      data-testid="sketch-plane"
      data-own-edits
      onKeyDown={onKeyDown}
      className={`relative rounded-xl bg-black/30 ring-1 ring-inset aspect-square overflow-hidden outline-none transition-shadow ${
        refused ? 'ring-red-500' : 'ring-white/[0.06] focus-visible:ring-white/20'
      }`}
    >
      <svg
        ref={svgRef}
        viewBox={viewBox(view)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={selection.release}
        onPointerLeave={drawing.leave}
        className={`w-full h-full touch-none ${tool ? 'cursor-crosshair' : 'cursor-default'}`}
      >
        <SketchGrid view={view} />
        <SketchEntities sketch={shown} selected={selection.selected} view={view} />
        <SketchPreview preview={previewShape(drawing.pending, drawing.hover, drawing.typed)} />
      </svg>
      <SketchOverlay
        sketch={shown}
        view={view}
        drawing={drawing}
        selection={selection}
        typedAt={typedAnchor(drawing.pending, drawing.hover, drawing.typed)}
        refused={refused}
      />
    </div>
  );
};
