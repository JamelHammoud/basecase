import React, { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { LinkageSolution } from '../../utils/linkage';
import type { Vec2 } from '../../utils/sketch/types';
import { SketchOverlay } from './SketchOverlay';
import { pathExtent, SketchPathLayer } from './SketchPathLayer';
import { previewShape, typedAnchor } from './sketchPreview';
import { SketchEntities, SketchGrid, SketchPreview } from './SketchShapes';
import {
  fitView,
  insideView,
  panned,
  snapStep,
  snapTolerance,
  toMm,
  viewBox,
  zoomed,
  type Box,
  type SketchView,
} from './sketchView';
import { useSketchDrawing, type SketchEditor } from './useSketchDrawing';
import { useSketchKeys } from './useSketchKeys';
import { useSketchPath, type SketchPathEditor } from './useSketchPath';
import { useSketchSelection } from './useSketchSelection';
import type { SketchTool } from './useStudioDraft';

const REFUSE_MS = 700;
const ZOOM_SPEED = 0.01;

export interface SketchPathMode {
  editor: SketchPathEditor;
  solutions: LinkageSolution[];
  highlighted: number;
  unsolvable: boolean;
}

interface SketchCanvasProps {
  editor: SketchEditor;
  tool: SketchTool | null;
  onTool: (tool: SketchTool | null) => void;
  snap: boolean;
  path?: SketchPathMode;
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

function useFramedSolutions(path: SketchPathMode | undefined, view: SketchView, setView: (view: SketchView) => void) {
  const [framed, setFramed] = useState<LinkageSolution[] | null>(null);

  if (!path?.solutions.length || path.solutions === framed) return;

  const extent = pathExtent(path.editor.points, path.solutions);

  setFramed(path.solutions);

  if (!insideView(view, extent)) setView(fitView(extent));
}

export const SketchCanvas: React.FC<SketchCanvasProps> = ({ editor, tool, onTool, snap, path }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [view, setView] = useState(() => fitView(editor.sketch));
  const { refused, refuse } = useRefusal();
  const grid = snap ? snapStep(view) : null;
  const drawing = useSketchDrawing({ editor, tool, grid, onRefuse: refuse });
  const selection = useSketchSelection({ editor, grid, onRefuse: refuse });
  const pathing = useSketchPath(path?.editor ?? { points: [], onChange: () => {} }, grid);
  const shown = selection.preview ?? editor.sketch;

  useFramedSolutions(path, view, setView);

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

  const gestures = path
    ? { press: pathing.press, move: pathing.move, release: pathing.release, captures: true }
    : {
        press: (at: Vec2, tolerance: number, shift: boolean) =>
          tool ? drawing.press(at, tolerance) : selection.press(at, tolerance, shift),
        move: (at: Vec2, tolerance: number) => (selection.dragging ? selection.move(at) : drawing.move(at, tolerance)),
        release: selection.release,
        captures: !tool,
      };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;

    containerRef.current?.focus({ preventScroll: true });

    const { at, tolerance } = pointer(e);

    gestures.press(at, tolerance, e.shiftKey);

    if (gestures.captures) e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const { at, tolerance } = pointer(e);

    gestures.move(at, tolerance);
  };

  const sketchKeys = useSketchKeys({ editor, drawing, selection, tool, onTool, rootRef: containerRef });

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!path) return sketchKeys(e);

    if (e.key !== 'Backspace' && e.key !== 'Delete') return;

    e.preventDefault();
    pathing.dropLast();
  };

  const ringClass = refused || path?.unsolvable ? 'ring-red-500' : 'ring-white/[0.06] focus-visible:ring-white/20';

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      data-testid="sketch-plane"
      data-own-edits
      onKeyDown={onKeyDown}
      className={`relative rounded-xl bg-black/30 ring-1 ring-inset aspect-square overflow-hidden outline-none transition-shadow ${ringClass}`}
    >
      <svg
        ref={svgRef}
        viewBox={viewBox(view)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={gestures.release}
        onPointerLeave={drawing.leave}
        className={`w-full h-full touch-none ${tool || path ? 'cursor-crosshair' : 'cursor-default'}`}
      >
        <SketchGrid view={view} />
        <SketchEntities sketch={shown} selected={selection.selected} view={view} />
        {path ? (
          <SketchPathLayer
            points={pathing.shown}
            solutions={path.solutions}
            highlighted={path.highlighted}
            view={view}
          />
        ) : (
          <SketchPreview preview={previewShape(drawing.pending, drawing.hover, drawing.typed)} />
        )}
      </svg>
      {!path && (
        <SketchOverlay
          sketch={shown}
          view={view}
          drawing={drawing}
          selection={selection}
          typedAt={typedAnchor(drawing.pending, drawing.hover, drawing.typed)}
          refused={refused}
        />
      )}
    </div>
  );
};
