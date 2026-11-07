export interface SketchPoint {
  x: number;
  y: number;
}

export type SketchStroke = SketchPoint[];

export interface InkedStroke {
  color: string;
  points: SketchStroke;
}

export type SketchPen = Pick<CanvasRenderingContext2D, 'moveTo' | 'lineTo' | 'quadraticCurveTo'>;

export interface SketchFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const SKETCH_LINE_WIDTH = 2.5;

const FRAME_MARGIN = 16;
const MIN_FRAME_SIDE = 96;

const midpoint = (a: SketchPoint, b: SketchPoint): SketchPoint => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export function traceSegment(pen: SketchPen, stroke: SketchStroke, end: number): void {
  const target = midpoint(stroke[end - 1], stroke[end]);

  if (end === 1) {
    pen.moveTo(stroke[0].x, stroke[0].y);
    pen.lineTo(target.x, target.y);

    return;
  }

  const start = midpoint(stroke[end - 2], stroke[end - 1]);

  pen.moveTo(start.x, start.y);
  pen.quadraticCurveTo(stroke[end - 1].x, stroke[end - 1].y, target.x, target.y);
}

export function traceStroke(pen: SketchPen, stroke: SketchStroke): void {
  for (let end = 1; end < stroke.length; end++) traceSegment(pen, stroke, end);

  const last = stroke.at(-1);

  if (!last) return;

  const from = stroke.length > 1 ? midpoint(stroke.at(-2)!, last) : last;

  pen.moveTo(from.x, from.y);
  pen.lineTo(last.x, last.y);
}

function centredSpan(low: number, high: number): { start: number; size: number } {
  const size = Math.max(high - low + FRAME_MARGIN * 2, MIN_FRAME_SIDE);

  return { start: (low + high - size) / 2, size };
}

export function sketchFrame(strokes: SketchStroke[]): SketchFrame | null {
  const points = strokes.flat();

  if (!points.length) return null;

  const across = centredSpan(Math.min(...points.map((p) => p.x)), Math.max(...points.map((p) => p.x)));
  const down = centredSpan(Math.min(...points.map((p) => p.y)), Math.max(...points.map((p) => p.y)));

  return { x: across.start, y: down.start, width: across.size, height: down.size };
}
