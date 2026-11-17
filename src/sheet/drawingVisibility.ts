import type { Triangle, Vector3 } from 'three';
import type { ShapeSolid } from '../three/analysis/shapeSolid';
import { DRAWING_LIMITS } from './drawingTypes';

export interface ProjectionAxes {
  u: number;
  v: number;
  depth: number;
  sign: number;
}

type Interval = [number, number];

function clip(interval: Interval, start: number, end: number): boolean {
  const change = end - start;

  if (Math.abs(change) < 1e-12) return start >= 0;

  const crossing = -start / change;

  if (change > 0) interval[0] = Math.max(interval[0], crossing);
  else interval[1] = Math.min(interval[1], crossing);

  return interval[0] < interval[1];
}

function weights(point: Vector3, triangle: Triangle, axes: ProjectionAxes) {
  const x = point.getComponent(axes.u) - triangle.a.getComponent(axes.u);
  const y = point.getComponent(axes.v) - triangle.a.getComponent(axes.v);
  const bx = triangle.b.getComponent(axes.u) - triangle.a.getComponent(axes.u);
  const by = triangle.b.getComponent(axes.v) - triangle.a.getComponent(axes.v);
  const cx = triangle.c.getComponent(axes.u) - triangle.a.getComponent(axes.u);
  const cy = triangle.c.getComponent(axes.v) - triangle.a.getComponent(axes.v);
  const determinant = bx * cy - by * cx;

  if (Math.abs(determinant) < 1e-12) return null;

  const b = (x * cy - y * cx) / determinant;
  const c = (bx * y - by * x) / determinant;

  return [1 - b - c, b, c];
}

function hiddenInterval(triangle: Triangle, a: Vector3, b: Vector3, axes: ProjectionAxes): Interval | null {
  const first = weights(a, triangle, axes);
  const last = weights(b, triangle, axes);

  if (!first || !last) return null;

  const interval: Interval = [0, 1];

  for (let i = 0; i < 3; i++) {
    if (!clip(interval, first[i], last[i])) return null;
  }

  const depths = [triangle.a, triangle.b, triangle.c].map((p) => p.getComponent(axes.depth));
  const depthAt = (w: number[], p: Vector3) =>
    w.reduce((sum, value, i) => sum + value * depths[i], 0) - p.getComponent(axes.depth) - DRAWING_LIMITS.toleranceMm;

  return clip(interval, depthAt(first, a), depthAt(last, b)) ? interval : null;
}

export function edgeVisibility(solid: ShapeSolid, axes: ProjectionAxes) {
  let visits = 0;

  return (a: Vector3, b: Vector3) => {
    const hidden: Interval[] = [];
    const lowU = Math.min(a.getComponent(axes.u), b.getComponent(axes.u));
    const highU = Math.max(a.getComponent(axes.u), b.getComponent(axes.u));
    const lowV = Math.min(a.getComponent(axes.v), b.getComponent(axes.v));
    const highV = Math.max(a.getComponent(axes.v), b.getComponent(axes.v));

    solid.bvh.shapecast({
      intersectsBounds: (box) =>
        box.min.getComponent(axes.u) <= highU &&
        box.max.getComponent(axes.u) >= lowU &&
        box.min.getComponent(axes.v) <= highV &&
        box.max.getComponent(axes.v) >= lowV,
      intersectsTriangle: (triangle) => {
        visits++;

        if (visits > 10000000) throw new Error('Reduce the geometry complexity before exporting drawings.');

        const interval = hiddenInterval(triangle, a, b, axes);

        if (interval) hidden.push(interval);

        return false;
      },
    });
    hidden.sort((x, y) => x[0] - y[0]);

    const intervals: Array<{ start: number; end: number; hidden: boolean }> = [];
    let at = 0;

    for (const [start, end] of hidden) {
      if (end <= at) continue;

      if (start > at) intervals.push({ start: at, end: start, hidden: false });

      intervals.push({ start: Math.max(at, start), end, hidden: true });
      at = end;
    }

    if (at < 1) intervals.push({ start: at, end: 1, hidden: false });

    return intervals;
  };
}
