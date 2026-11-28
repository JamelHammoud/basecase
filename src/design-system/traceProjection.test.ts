import { expect, it } from 'vitest';
import { tracePaths, type Range, type Trace, type TraceBox } from './tracePaths';

function referencePath(trace: Trace, box: TraceBox, yRange: Range, xRange: Range) {
  let pen = 'M';
  let path = '';

  for (let i = 0; i < trace.values.length; i++) {
    const value = trace.values[i];
    const x = trace.x?.[i] ?? NaN;

    if (!Number.isFinite(value) || !Number.isFinite(x)) {
      pen = 'M';

      continue;
    }

    const px = ((x - xRange[0]) / (xRange[1] - xRange[0])) * box.width;
    const py = box.inset + (1 - (value - yRange[0]) / (yRange[1] - yRange[0])) * (box.height - 2 * box.inset);
    const point = `${px.toFixed(1)} ${py.toFixed(1)}`;

    path += trace.points ? `M${point}h0` : `${pen}${point}`;
    pen = 'L';
  }

  return path;
}

it('preserves complete XY lines and dots across ranges, gaps, unequal samples and changing plot dimensions', () => {
  const values = Float64Array.from({ length: 103 }, (_, i) => (i % 13 === 0 ? NaN : Math.sin(i * 0.73) * 9));
  const x = Float64Array.from({ length: 101 }, (_, i) => (i % 17 === 0 ? Infinity : Math.cos(i * 0.37) * 12));
  const traces: Trace[] = [
    { id: 'line', tone: 'primary', values: values.subarray(1), x: x.subarray(1) },
    { id: 'dots', tone: 'accent', values, x, points: true },
    { id: 'empty', tone: 'muted', values: [], x: [] },
  ];

  for (const yRange of [
    [-10, 10],
    [0.15, 0.35],
    [-5.5, -4.5],
  ] satisfies Range[]) {
    for (const box of [
      { width: 3.5, height: 50, inset: 5 },
      { width: 1000, height: 96, inset: 8 },
      { width: 272, height: 16, inset: 8 },
    ]) {
      const xRange: Range = [-13.15, 14.35];
      const paths = tracePaths(traces, box, yRange, xRange);

      expect(paths.map((path) => path.d)).toEqual(traces.map((trace) => referencePath(trace, box, yRange, xRange)));
      expect(paths.map((path) => [path.id, path.tone, path.points])).toEqual([
        ['line', 'primary', undefined],
        ['dots', 'accent', true],
        ['empty', 'muted', undefined],
      ]);
    }
  }
});
