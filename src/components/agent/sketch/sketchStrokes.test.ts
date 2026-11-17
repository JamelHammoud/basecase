import { describe, expect, it } from 'vitest';
import { SketchPen, SketchStroke, sketchFrame, traceSegment, traceStroke } from './sketchStrokes';

function bufferedFrame(strokes: SketchStroke[]) {
  const points = strokes.flat();

  if (!points.length) return null;

  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));
  const width = Math.max(maxX - minX + 32, 96);
  const height = Math.max(maxY - minY + 32, 96);

  return { x: (minX + maxX - width) / 2, y: (minY + maxY - height) / 2, width, height };
}

function recordingPen() {
  const calls: string[] = [];
  const pen: SketchPen = {
    moveTo: (x, y) => calls.push(`move ${x},${y}`),
    lineTo: (x, y) => calls.push(`line ${x},${y}`),
    quadraticCurveTo: (cx, cy, x, y) => calls.push(`curve ${cx},${cy} ${x},${y}`),
  };

  return { pen, calls };
}

describe('traceStroke', () => {
  it('draws a lone point as a zero-length line, so the round cap paints a dot', () => {
    const { pen, calls } = recordingPen();

    traceStroke(pen, [{ x: 5, y: 7 }]);

    expect(calls).toEqual(['move 5,7', 'line 5,7']);
  });

  it('curves through each point and ends exactly on the last one', () => {
    const { pen, calls } = recordingPen();

    traceStroke(pen, [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);

    expect(calls).toEqual(['move 0,0', 'line 5,0', 'move 5,0', 'curve 10,0 10,5', 'move 10,5', 'line 10,10']);
  });

  it('draws nothing for an empty stroke', () => {
    const { pen, calls } = recordingPen();

    traceStroke(pen, []);

    expect(calls).toEqual([]);
  });

  it('paints the same pieces live, one segment at a time, as the finished stroke', () => {
    const stroke = [
      { x: 0, y: 0 },
      { x: 4, y: 2 },
      { x: 8, y: 0 },
      { x: 12, y: 6 },
    ];
    const live = recordingPen();
    const finished = recordingPen();

    for (let end = 1; end < stroke.length; end++) traceSegment(live.pen, stroke, end);

    traceStroke(finished.pen, stroke);

    expect(finished.calls.slice(0, live.calls.length)).toEqual(live.calls);
  });
});

describe('sketchFrame', () => {
  it('has no frame without a drawing', () => {
    expect(sketchFrame([])).toBeNull();
    expect(sketchFrame([[]])).toBeNull();
  });

  it('crops to the drawing with a margin', () => {
    const frame = sketchFrame([
      [
        { x: 100, y: 50 },
        { x: 300, y: 50 },
      ],
      [{ x: 200, y: 170 }],
    ]);

    expect(frame).toEqual({ x: 84, y: 34, width: 232, height: 152 });
  });

  it('keeps a small drawing centred in a frame big enough to read', () => {
    expect(sketchFrame([[{ x: 40, y: 60 }]])).toEqual({ x: -8, y: 12, width: 96, height: 96 });
  });

  it('matches buffered bounds across multiple strokes, edits and unusual coordinates', () => {
    const values = [-Infinity, -100, -0, 0, 0.125, 64, Infinity, NaN];

    for (let seed = 0; seed < 80; seed++) {
      const strokes = Array.from({ length: seed % 7 }, (_, line) =>
        Array.from({ length: (seed + line) % 19 }, (_, i) => ({
          x: Math.sin(seed + i) * 300,
          y: Math.cos(line - i) * 200,
        })),
      );
      const before = structuredClone(strokes);

      expect(sketchFrame(strokes)).toEqual(bufferedFrame(strokes));
      expect(strokes).toEqual(before);
      strokes.push([{ x: values[seed % values.length], y: values[(seed * 3) % values.length] }]);
      expect(sketchFrame(strokes)).toEqual(bufferedFrame(strokes));
    }
  });

  it('frames long drawings with one read per coordinate and no argument spreading', () => {
    let reads = 0;
    const points = Array.from({ length: 200_000 }, (_, i) => ({
      get x() {
        reads++;

        return i;
      },
      get y() {
        reads++;

        return -i;
      },
    }));

    expect(sketchFrame([[], points, []])).toEqual({ x: -16, y: -200_015, width: 200_031, height: 200_031 });
    expect(reads).toBe(400_000);
  });
});
