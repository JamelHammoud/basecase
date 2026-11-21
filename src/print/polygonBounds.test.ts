import { expect, it } from 'vitest';
import { PRINTER_MODELS, resolvePrinter, type Point2 } from '../data/printers';
import { DEFAULT_PROJECT } from '../types/robotics';
import { bedOf } from './bed';
import { jobSpec } from './job';
import { buildPrintPlan } from './plan';
import { polygonBounds } from './polygonBounds';

function previousBounds(points: Point2[]) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);

  return { x, y, w: Math.max(...xs) - x, d: Math.max(...ys) - y };
}

it('preserves polygon extrema across printer profiles, degenerate input and later edits', () => {
  const polygons: Point2[][] = PRINTER_MODELS.flatMap((model) => [
    model.bed,
    ...model.keepOut,
    ...(model.obstacles ?? []).map((obstacle) => obstacle.polygon),
  ]);

  polygons.push(
    [],
    [[-0, 0]],
    [
      [0, -0],
      [-0, 0],
    ],
    [
      [-8, 3],
      [9, -12],
      [0, 20],
    ],
  );

  for (const value of [NaN, Infinity, -Infinity]) {
    polygons.push(
      [
        [value, 3],
        [4, 5],
      ],
      [
        [3, value],
        [4, 5],
      ],
    );
  }

  for (const polygon of polygons) {
    const saved = structuredClone(polygon);

    expect(polygonBounds(polygon)).toEqual(previousBounds(polygon));
    expect(polygon).toEqual(saved);
  }

  const edited: Point2[] = [
    [0, 0],
    [5, 7],
  ];

  expect(polygonBounds(edited)).toEqual({ x: 0, y: 0, w: 5, d: 7 });
  edited[1] = [-8, 9];
  expect(polygonBounds(edited)).toEqual({ x: -8, y: 0, w: 8, d: 9 });
});

it('keeps job plate dimensions and catalog bed envelopes unchanged', () => {
  for (const model of PRINTER_MODELS) {
    const setup = resolvePrinter(model.id, []);
    const bed = bedOf(model);
    const plan = buildPrintPlan([], setup, bed, '');
    const expected = previousBounds(model.bed);

    expect(jobSpec(plan, setup, DEFAULT_PROJECT).plateSize).toEqual([expected.w, expected.d]);
    expect(bed.origin).toEqual([expected.x, expected.y]);
    expect(bed.width).toBeCloseTo(expected.w);
    expect(bed.depth).toBeCloseTo(expected.d);
  }
});

it('measures dense polygons without spreading coordinates into arguments', () => {
  const polygon: Point2[] = Array.from({ length: 200_000 }, (_, i) => [i - 100_000, 50_000 - i]);

  expect(polygonBounds(polygon)).toEqual({ x: -100_000, y: -149_999, w: 199_999, d: 199_999 });
});
