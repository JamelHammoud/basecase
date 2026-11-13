import type { Inference } from '../../utils/sketch/infer';
import { arcPoints } from '../../utils/sketch/profile';
import type { Vec2 } from '../../utils/sketch/types';
import type { PreviewShape } from './SketchShapes';
import { circleRadius, lineEnd, rectangleSize, type Pending, type Typed } from './useSketchDrawing';

const EMPTY: PreviewShape = { lines: [], guides: [] };

function rectangleCorners(first: Vec2, end: Vec2, typed: Typed | null): Vec2[] {
  const { width, height, opposite } = rectangleSize(end, typed);
  const sx = opposite[0] >= first[0] ? 1 : -1;
  const sy = opposite[1] >= first[1] ? 1 : -1;
  const x1 = width ? first[0] + sx * width : opposite[0];
  const y1 = height ? first[1] + sy * height : opposite[1];

  return [first, [x1, first[1]], [x1, y1], [first[0], y1]];
}

const loopLines = (pts: Vec2[]): Array<[Vec2, Vec2]> => pts.map((p, i) => [p, pts[(i + 1) % pts.length]]);

export function previewShape(pending: Pending | null, hover: Inference | null, typed: Typed | null): PreviewShape {
  if (!pending || !hover) return EMPTY;

  const first = pending.first.at;

  if (pending.kind === 'line') return { lines: [[first, lineEnd(first, hover, typed)]], guides: [] };

  if (pending.kind === 'rect') return { lines: loopLines(rectangleCorners(first, hover.at, typed)), guides: [] };

  if (pending.kind === 'circle')
    return { lines: [], circle: { c: first, r: circleRadius(first, hover.at, typed).radius }, guides: [] };

  if (!pending.second) return { lines: [], guides: [[first, hover.at]] };

  return { lines: [], arc: arcPoints(first, pending.second.at, hover.at), guides: [[first, pending.second.at]] };
}

export function typedAnchor(pending: Pending | null, hover: Inference | null, typed: Typed | null): Vec2 | null {
  if (!pending || !hover) return null;

  const shape = previewShape(pending, hover, typed);

  if (shape.circle) return [shape.circle.c[0] + shape.circle.r, shape.circle.c[1]];

  const [a, b] =
    shape.lines.length === 4 ? [shape.lines[0][0], shape.lines[1][1]] : (shape.lines[0] ?? [hover.at, hover.at]);

  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}
