import { describe, expect, it } from 'vitest';
import { addConstraint, addLine, addRectangle, dragPoint, setDimension, withConstraints } from './edit';
import { solveSketch } from './solver';
import type { Sketch } from './types';

const origin: Sketch = { points: [{ id: 'o', x: 0, y: 0, fixed: true }], entities: [], constraints: [] };

const sloppyRectangle = (): Sketch => ({
  points: [
    { id: 'o', x: 0, y: 0, fixed: true },
    { id: 'p1', x: 37, y: 1.5 },
    { id: 'p2', x: 41, y: 23 },
    { id: 'p3', x: -2, y: 18 },
  ],
  entities: [
    { id: 'l1', kind: 'line', a: 'o', b: 'p1' },
    { id: 'l2', kind: 'line', a: 'p1', b: 'p2' },
    { id: 'l3', kind: 'line', a: 'p2', b: 'p3' },
    { id: 'l4', kind: 'line', a: 'p3', b: 'o' },
  ],
  constraints: [
    { id: 'k1', kind: 'horizontal', line: 'l1' },
    { id: 'k2', kind: 'vertical', line: 'l2' },
    { id: 'k3', kind: 'horizontal', line: 'l3' },
    { id: 'k4', kind: 'vertical', line: 'l4' },
    { id: 'k5', kind: 'length', line: 'l1', value: 40 },
    { id: 'k6', kind: 'length', line: 'l4', value: 20 },
  ],
});

const corners = (sketch: Sketch) => sketch.points.map((p) => [p.id, p.x, p.y]);

describe('sketch solver', () => {
  it('solves a rectangle with two lengths, horizontals and verticals to exact corners', () => {
    const result = solveSketch(sloppyRectangle());

    expect(result.status).toBe('ok');

    if (result.status !== 'ok') return;

    expect(corners(result.sketch)).toEqual([
      ['o', 0, 0],
      ['p1', 40, 0],
      ['p2', 40, 20],
      ['p3', 0, 20],
    ]);
    expect(result.dof).toBe(0);
  });

  it('reports an over-constrained set instead of solving it', () => {
    const conflicting = withConstraints(sloppyRectangle(), [{ kind: 'length', line: 'l3', value: 50 }]);
    const redundant = withConstraints(sloppyRectangle(), [{ kind: 'length', line: 'l3', value: 40 }]);

    expect(solveSketch(conflicting)).toEqual({ status: 'over' });
    expect(solveSketch(redundant)).toEqual({ status: 'over' });
  });

  it('keeps every constraint when a point is dragged', () => {
    const loose = { ...sloppyRectangle(), constraints: sloppyRectangle().constraints.slice(0, 4) };
    const moved = dragPoint(loose, 'p2', [55, 31]);

    expect(moved).not.toBeNull();

    const at = Object.fromEntries(moved!.points.map((p) => [p.id, [p.x, p.y]]));

    expect(at.p2).toEqual([55, 31]);
    expect(at.p1[1]).toBeCloseTo(at.o[1], 9);
    expect(at.p1[0]).toBeCloseTo(at.p2[0], 9);
    expect(at.p3[1]).toBeCloseTo(at.p2[1], 9);
    expect(at.p3[0]).toBeCloseTo(at.o[0], 9);
  });

  it('leaves a point its constraints pin where they put it', () => {
    const solved = solveSketch(sloppyRectangle());
    const dragged = solved.status === 'ok' ? dragPoint(solved.sketch, 'p2', [5, 5]) : null;

    expect(dragged?.points.find((p) => p.id === 'p2')).toMatchObject({ x: 40, y: 20 });
    expect(dragPoint(sloppyRectangle(), 'o', [5, 5])).toBeNull();
  });

  it('solves the same way every run', () => {
    const runs = Array.from({ length: 5 }, () => JSON.stringify(solveSketch(sloppyRectangle())));

    expect(new Set(runs).size).toBe(1);
  });

  it('holds parallel, perpendicular, equal and angle constraints', () => {
    const first = addLine(origin, { id: 'o' }, { at: [26, 15] }, { length: 30, angle: 30 })!;
    const second = addLine(first.sketch, { id: first.end }, { at: [10, 40] })!;
    const third = addLine(second.sketch, { at: [-10, 40] }, { at: [10, 47] })!;
    let s = addConstraint(third.sketch, 'perpendicular', [first.line, second.line])!;

    s = addConstraint(s, 'equal', [second.line, first.line])!;
    s = addConstraint(s, 'parallel', [first.line, third.line])!;

    const p = Object.fromEntries(s.points.map((q) => [q.id, [q.x, q.y]]));
    const d1 = [p.p1[0] - p.o[0], p.p1[1] - p.o[1]];
    const d2 = [p.p2[0] - p.p1[0], p.p2[1] - p.p1[1]];
    const d3 = [p.p4[0] - p.p3[0], p.p4[1] - p.p3[1]];

    expect((Math.atan2(d1[1], d1[0]) * 180) / Math.PI).toBeCloseTo(30, 6);
    expect(Math.hypot(d1[0], d1[1])).toBeCloseTo(30, 9);
    expect(Math.hypot(d2[0], d2[1])).toBeCloseTo(30, 9);
    expect(d1[0] * d2[0] + d1[1] * d2[1]).toBeCloseTo(0, 6);
    expect(d1[0] * d3[1] - d1[1] * d3[0]).toBeCloseTo(0, 6);
  });

  it('changes a typed dimension and refuses one the sketch already fixes', () => {
    const rect = addRectangle(origin, { corner: { id: 'o' }, opposite: [10, 10], width: 40, height: 20 })!;
    const wider = setDimension(rect.sketch, rect.lines[0], 50)!;

    expect(Math.max(...wider.points.map((p) => p.x))).toBe(50);
    expect(setDimension(wider, rect.lines[2], 30)).toBeNull();
  });
});
