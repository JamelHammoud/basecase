import { describe, expect, it } from 'vitest';
import { SketchPen, sketchFrame, traceSegment, traceStroke } from './sketchStrokes';

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
});
