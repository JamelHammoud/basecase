import type { Sketch, Vec2 } from '../../utils/sketch/types';

export interface SketchView {
  cx: number;
  cy: number;
  span: number;
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

const NICE_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
const MIN_SPAN = 4;
const MAX_SPAN = 4000;
const EMPTY_SPAN = 100;
const MARGIN = 1.5;
const SNAP_PX = 9;

export function sketchExtent(sketch: Sketch) {
  const xs: number[] = [];
  const ys: number[] = [];

  for (const p of sketch.points) {
    xs.push(p.x);
    ys.push(p.y);
  }

  for (const e of sketch.entities) {
    if (e.kind !== 'circle') continue;

    const c = sketch.points.find((p) => p.id === e.c);

    if (!c) continue;

    xs.push(c.x - e.r, c.x + e.r);
    ys.push(c.y - e.r, c.y + e.r);
  }

  if (xs.length === 0) return null;

  return { min: [Math.min(...xs), Math.min(...ys)] as Vec2, max: [Math.max(...xs), Math.max(...ys)] as Vec2 };
}

export function fitView(sketch: Sketch): SketchView {
  const extent = sketchExtent(sketch);

  if (!extent) return { cx: 0, cy: 0, span: EMPTY_SPAN };

  const span = Math.max(extent.max[0] - extent.min[0], extent.max[1] - extent.min[1]) * MARGIN;

  return {
    cx: (extent.min[0] + extent.max[0]) / 2,
    cy: (extent.min[1] + extent.max[1]) / 2,
    span: Math.min(MAX_SPAN, Math.max(span, EMPTY_SPAN / 2)),
  };
}

export const niceStep = (target: number) => NICE_STEPS.find((s) => s >= target) ?? NICE_STEPS[NICE_STEPS.length - 1];

export const gridStep = (view: SketchView) => niceStep(view.span / 10);

export const snapStep = (view: SketchView) => niceStep(view.span / 80);

export const viewBox = ({ cx, cy, span }: SketchView) => `${cx - span / 2} ${-cy - span / 2} ${span} ${span}`;

export const toSvg = ([x, y]: Vec2): Vec2 => [x, -y];

export const toMm = (view: SketchView, box: Box, clientX: number, clientY: number): Vec2 => [
  view.cx - view.span / 2 + ((clientX - box.left) / box.width) * view.span,
  view.cy + view.span / 2 - ((clientY - box.top) / box.height) * view.span,
];

export const snapTolerance = (view: SketchView, box: Box) => (SNAP_PX / box.width) * view.span;

export const percentAt = (view: SketchView, [x, y]: Vec2) => ({
  left: `${((x - (view.cx - view.span / 2)) / view.span) * 100}%`,
  top: `${((view.cy + view.span / 2 - y) / view.span) * 100}%`,
});

export function zoomed(view: SketchView, at: Vec2, factor: number): SketchView {
  const span = Math.min(MAX_SPAN, Math.max(MIN_SPAN, view.span * factor));
  const k = span / view.span;

  return { cx: at[0] + (view.cx - at[0]) * k, cy: at[1] + (view.cy - at[1]) * k, span };
}

export const panned = (view: SketchView, box: Box, dx: number, dy: number): SketchView => ({
  ...view,
  cx: view.cx + (dx / box.width) * view.span,
  cy: view.cy - (dy / box.height) * view.span,
});

export function gridLines(view: SketchView): number[] {
  const step = gridStep(view);
  const from = Math.floor((Math.min(view.cx, view.cy) - view.span) / step);
  const to = Math.ceil((Math.max(view.cx, view.cy) + view.span) / step);

  return Array.from({ length: to - from + 1 }, (_, i) => (from + i) * step);
}

export const formatMm = (v: number) => String(Math.round(v * 100) / 100);
