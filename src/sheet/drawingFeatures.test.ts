import { expect, it } from 'vitest';
import { measuredHole } from './drawingFeatures';
import type { DrawingPoint } from './drawingTypes';

const loop = (steps: number): DrawingPoint[] =>
  Array.from({ length: steps }, (_, i) => [
    10 + 2 * Math.cos((i * 2 * Math.PI) / steps),
    20 + 2 * Math.sin((i * 2 * Math.PI) / steps),
  ]);

it('refuses coarse, elliptical, incomplete and multiply wound circle fits', () => {
  expect(measuredHole(loop(48))).toMatchObject({ center: [10, 20], diameterMm: 4, approximate: true });
  expect(measuredHole(loop(6))).toBeNull();
  expect(measuredHole(loop(48).map(([x, y]) => [x * 1.05, y]))).toBeNull();
  expect(measuredHole(loop(48).slice(0, 24))).toBeNull();
  expect(measuredHole([...loop(48), ...loop(48)])).toBeNull();
});
