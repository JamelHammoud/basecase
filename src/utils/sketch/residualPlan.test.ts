import { describe, expect, it } from 'vitest';
import { numericJacobian, prepareResidualPlan } from './residualPlan';
import { allResiduals, type Geometry } from './residuals';
import { solveSketch } from './solver';
import type { Sketch, SketchArc, SketchConstraint, SketchEntity, Vec2 } from './types';

function problem(sketch: Sketch) {
  const index = new Map<string, number>();
  const fixed = new Map<string, Vec2>();
  const entities = new Map(sketch.entities.map((entity) => [entity.id, entity]));
  const arcs = sketch.entities.filter((entity): entity is SketchArc => entity.kind === 'arc');
  const x: number[] = [];
  let reads = 0;

  for (const point of sketch.points) {
    if (point.fixed) {
      fixed.set(point.id, [point.x, point.y]);

      continue;
    }

    index.set(point.id, x.length);
    x.push(point.x, point.y);
  }

  for (const entity of sketch.entities) {
    if (entity.kind !== 'circle') continue;

    index.set(entity.id, x.length);
    x.push(entity.r);
  }

  const geometryAt = (values: number[]): Geometry => ({
    point: (id) => {
      const offset = index.get(id);

      return offset === undefined ? (fixed.get(id) ?? [0, 0]) : [values[offset], values[offset + 1]];
    },
    radius: (circle) => {
      const offset = index.get(circle.id);

      return offset === undefined ? circle.r : values[offset];
    },
    entity: (id) => {
      reads++;

      return entities.get(id);
    },
  });
  const plan = prepareResidualPlan({
    geometry: geometryAt(x),
    arcs,
    constraints: sketch.constraints,
    index,
    size: x.length,
  });

  return { x, geometryAt, plan, arcs, reads: () => reads };
}

function denseJacobian(sketch: Sketch, prepared: ReturnType<typeof problem>) {
  const { x, geometryAt, arcs, plan } = prepared;
  const matrix = Array.from({ length: plan.rows }, () => new Array<number>(x.length).fill(0));
  const probe = [...x];

  for (let column = 0; column < x.length; column++) {
    const h = 1e-7 * Math.max(1, Math.abs(x[column]));

    probe[column] = x[column] + h;

    const up = allResiduals(geometryAt(probe), arcs, sketch.constraints);

    probe[column] = x[column] - h;

    const down = allResiduals(geometryAt(probe), arcs, sketch.constraints);

    probe[column] = x[column];

    for (let row = 0; row < plan.rows; row++) matrix[row][column] = (up[row] - down[row]) / (2 * h);
  }

  return matrix;
}

function mixedSketch(seed: number): Sketch {
  const value = (offset: number) => Math.sin(seed * 13 + offset * 7) * (seed % 9);
  const pairs: Array<[string, string]> = [
    ['a', 'b'],
    ['a', 'circle'],
    ['arc', 'a'],
    ['circle', 'other'],
    ['circle', 'arc'],
    ['missing', 'a'],
    ['p0', 'p1'],
    ['p1', 'circle'],
  ];
  const pairConstraints = pairs.flatMap(([a, b], pair) =>
    (['coincident', 'parallel', 'perpendicular', 'equal', 'tangent', 'distance'] as const).map(
      (kind): SketchConstraint => ({ id: `${kind}${pair}`, kind, a, b, value: value(pair) }),
    ),
  );

  return {
    points: Array.from({ length: 6 }, (_, i) => ({
      id: `p${i}`,
      x: value(i),
      y: value(i + 6),
      fixed: (seed + i) % 4 === 0,
    })),
    entities: [
      { id: 'a', kind: 'line', a: 'p0', b: 'p1' },
      { id: 'b', kind: 'line', a: 'p2', b: 'p3' },
      { id: 'circle', kind: 'circle', c: 'p4', r: Math.abs(value(12)) },
      { id: 'other', kind: 'circle', c: 'p5', r: Math.abs(value(13)) },
      { id: 'arc', kind: 'arc', c: 'p0', a: 'p2', b: 'p3' },
    ],
    constraints: [
      ...pairConstraints,
      { id: 'h', kind: 'horizontal', line: 'a' },
      { id: 'v', kind: 'vertical', line: 'b' },
      { id: 'length', kind: 'length', line: 'a', value: value(14) },
      { id: 'radius', kind: 'radius', entity: 'circle', value: 3 },
      { id: 'arcRadius', kind: 'radius', entity: 'arc', value: 4 },
      { id: 'angle', kind: 'angle', line: 'a', other: 'b', value: value(15) },
      { id: 'absolute', kind: 'angle', line: 'b', value: 45 },
      { id: 'missingAngle', kind: 'angle', line: 'missing', value: 0 },
      { id: 'missingRadius', kind: 'radius', entity: 'missing', value: 3 },
      { id: 'missingLength', kind: 'length', line: 'circle', value: 5 },
    ],
  };
}

function circles(size: number): Sketch {
  return {
    points: [{ id: 'o', x: 0, y: 0, fixed: true }],
    entities: Array.from({ length: size }, (_, i): SketchEntity => ({ id: `c${i}`, kind: 'circle', c: 'o', r: i + 1 })),
    constraints: Array.from({ length: size }, (_, i) => ({
      id: `r${i}`,
      kind: 'radius',
      entity: `c${i}`,
      value: i + 2,
    })),
  };
}

describe('Sketch residual dependencies', () => {
  it('matches every dense derivative across mixed geometry, all constraint kinds and fixed points', () => {
    for (let seed = 0; seed < 120; seed++) {
      const sketch = mixedSketch(seed);
      const before = structuredClone(sketch);
      const prepared = problem(sketch);
      const coordinates = [...prepared.x];

      expect(numericJacobian(prepared.plan, prepared.geometryAt, prepared.x)).toEqual(denseJacobian(sketch, prepared));
      expect(prepared.x).toEqual(coordinates);
      expect(sketch).toEqual(before);
    }
  });

  it.each([Number.NaN, Infinity, -Infinity])('preserves dense propagation of %s residuals and coordinates', (value) => {
    const sketch = circles(3);

    sketch.points.push({ id: 'unused', x: value, y: 1 });
    sketch.constraints.push({ id: 'nonfinite', kind: 'distance', a: 'o', b: 'unused', value: 1 });

    const prepared = problem(sketch);

    expect(numericJacobian(prepared.plan, prepared.geometryAt, prepared.x)).toEqual(denseJacobian(sketch, prepared));
    expect(solveSketch(sketch)).toEqual({ status: 'over' });
  });

  it('rebuilds dependencies after entity, fixed-point and constraint edits without sharing results', () => {
    const first = mixedSketch(3);
    const prepared = problem(first);
    const initial = numericJacobian(prepared.plan, prepared.geometryAt, prepared.x);
    const saved = structuredClone(initial);
    const edited = mixedSketch(4);

    edited.entities[0] = { id: 'a', kind: 'line', a: 'p4', b: 'p5' };
    edited.constraints[0] = { id: 'changed', kind: 'coincident', a: 'p5', b: 'p0' };

    const next = problem(edited);

    expect(numericJacobian(next.plan, next.geometryAt, next.x)).toEqual(denseJacobian(edited, next));
    expect(numericJacobian(prepared.plan, prepared.geometryAt, prepared.x)).toEqual(saved);
    expect(initial).toEqual(saved);
  });

  it.each([300, 600])('probes each of %i independent circle constraints only for its own radius', (size) => {
    const prepared = problem(circles(size));
    const before = prepared.reads();
    const matrix = numericJacobian(prepared.plan, prepared.geometryAt, prepared.x);

    expect(before).toBe(size);
    expect(prepared.reads() - before).toBe(2 * size);
    expect(matrix).toHaveLength(size);

    for (let row = 0; row < size; row++) {
      expect(matrix[row][row]).toBeCloseTo(1, 8);
      expect(matrix[row].filter((value) => value !== 0)).toHaveLength(1);
    }
  });

  it('solves independent dimensions, retains fixed centers and applies later dimension edits', () => {
    const sketch = circles(12);
    const before = structuredClone(sketch);
    const result = solveSketch(sketch);

    expect(result.status).toBe('ok');

    if (result.status !== 'ok') return;

    expect(result.dof).toBe(0);
    expect(result.sketch.points).toEqual(sketch.points);
    expect(result.sketch.entities.map((entity) => entity.kind === 'circle' && entity.r)).toEqual(
      Array.from({ length: 12 }, (_, i) => i + 2),
    );
    expect(sketch).toEqual(before);

    const edited: Sketch = {
      ...result.sketch,
      constraints: result.sketch.constraints.map((constraint) => ({ ...constraint, value: 20 })),
    };
    const next = solveSketch(edited);

    expect(next.status).toBe('ok');

    if (next.status !== 'ok') return;

    expect(next.sketch.entities.every((entity) => entity.kind === 'circle' && entity.r === 20)).toBe(true);
    expect(result.sketch).not.toEqual(next.sketch);
  });
});
