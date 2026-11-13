import { describe, expect, it } from 'vitest';
import { addCircle, addConstraint, addLine, applicableConstraints, polylineSketch, removeItems } from './edit';
import { referenceSketch } from './face';
import { inferPoint } from './infer';
import type { Sketch } from './types';

const face = () =>
  referenceSketch([
    [
      [-20, -10],
      [20, -10],
    ],
    [
      [20, -10],
      [20, 10],
    ],
  ]);

describe('sketch edits', () => {
  it('snaps to an existing point first, then infers horizontal and vertical from the last point', () => {
    const sketch = face();

    expect(inferPoint({ sketch, cursor: [19.2, -9.5], tolerance: 1.5, grid: 1 })).toMatchObject({
      at: [20, -10],
      pointId: 'r2',
    });
    expect(inferPoint({ sketch, cursor: [7.3, 0.6], from: [0, 0], tolerance: 1, grid: 1 })).toEqual({
      at: [7, 0],
      horizontal: true,
      vertical: false,
    });
  });

  it('offers the constraints that fit the selection', () => {
    const lines = polylineSketch([
      [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
    ]);
    const withCircle = addCircle(lines, { at: [30, 0] }, 5)!;

    expect(applicableConstraints(lines, ['l1'])).toEqual(['horizontal', 'vertical']);
    expect(applicableConstraints(lines, ['l1', 'l2'])).toEqual(['parallel', 'perpendicular', 'equal']);
    expect(applicableConstraints(withCircle.sketch, ['l1', withCircle.circle])).toEqual(['tangent']);
    expect(applicableConstraints(lines, ['p1', 'l2'])).toEqual(['coincident']);
  });

  it('makes a circle tangent to a line', () => {
    const line = addLine(
      { points: [], entities: [], constraints: [] },
      { at: [0, 0] },
      { at: [40, 0] },
      { horizontal: true },
    )!;
    const circle = addCircle(line.sketch, { at: [20, 9] }, 5)!;
    const tangent = addConstraint(circle.sketch, 'tangent', [line.line, circle.circle])!;
    const c = tangent.points.find((p) => p.id === 'p3')!;
    const r = tangent.entities.find((e) => e.kind === 'circle')!;

    expect(r.kind === 'circle' && Math.abs(c.y - tangent.points[0].y) - r.r).toBeCloseTo(0, 6);
  });

  it('deletes drawn geometry with its constraints and keeps the face edges', () => {
    const drawn = addLine(face(), { id: 'r1' }, { at: [-20, 5] }, { vertical: true, length: 15 })!;
    const sketch: Sketch = drawn.sketch;
    const after = removeItems(sketch, [drawn.line, 'e1']);

    expect(after.entities.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(after.constraints).toEqual([]);
    expect(after.points.every((p) => p.fixed)).toBe(true);
  });
});
