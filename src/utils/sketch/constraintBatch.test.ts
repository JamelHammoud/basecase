import { describe, expect, it } from 'vitest';
import { nextId, withConstraints } from './edit';
import type { Sketch, SketchConstraint } from './types';

type Added = Parameters<typeof withConstraints>[1];

const additions: Added = [
  { kind: 'horizontal', line: 'l1' },
  { kind: 'vertical', line: 'l2' },
  { kind: 'length', line: 'l1', value: 40 },
  { kind: 'radius', entity: 'c1', value: 10 },
  { kind: 'angle', line: 'l1', other: 'l2', value: 90 },
  { kind: 'distance', a: 'p1', b: 'p2', value: 20 },
  { kind: 'coincident', a: 'p1', b: 'p2' },
  { kind: 'parallel', a: 'l1', b: 'l2' },
  { kind: 'perpendicular', a: 'l1', b: 'l2' },
  { kind: 'equal', a: 'c1', b: 'c2' },
  { kind: 'tangent', a: 'l1', b: 'c1' },
];

function previousBatch(sketch: Sketch, added: Added): Sketch {
  return added.reduce<Sketch>((current, constraint) => {
    const numbers = [...current.points, ...current.entities, ...current.constraints].map((item) =>
      item.id.startsWith('k') ? Number(item.id.slice(1)) || 0 : 0,
    );
    const id = `k${Math.max(0, ...numbers) + 1}`;

    return { ...current, constraints: [...current.constraints, { ...constraint, id } as SketchConstraint] };
  }, sketch);
}

function fixture(size: number): Sketch {
  return {
    points: Array.from({ length: size }, (_, i) => ({ id: `p${i}`, x: i, y: -i })),
    entities: Array.from({ length: size }, (_, i) => ({ id: `l${i}`, kind: 'line', a: `p${i}`, b: 'p0' })),
    constraints: Array.from({ length: size }, (_, i) => ({ id: `k${i * 2}`, kind: 'horizontal', line: `l${i}` })),
  };
}

function counted(sketch: Sketch) {
  let reads = 0;
  const count = <T extends { id: string }>(items: T[]) =>
    items.map((item) => ({
      ...item,
      get id() {
        reads++;

        return item.id;
      },
    }));

  return {
    sketch: { points: count(sketch.points), entities: count(sketch.entities), constraints: count(sketch.constraints) },
    reads: () => reads,
  };
}

describe('Sketch constraint batches', () => {
  it('preserves complete batches, order and source data across mixed ids and later edits', () => {
    const ids = ['k-5', 'k0', 'k2.5', 'k1e2', 'kfoo', 'kInfinity', 'k9007199254740992', 'p900', 'k 8'];

    for (let i = 0; i < 100; i++) {
      const sketch = fixture(i % 12);

      sketch.points.push({ id: ids[i % ids.length], x: 1, y: 2 });
      sketch.entities.push({ id: ids[(i + 1) % ids.length], kind: 'circle', c: 'p0', r: 5 });
      sketch.constraints.push({ id: ids[(i + 2) % ids.length], kind: 'vertical', line: 'l0' });

      const source = structuredClone(sketch);
      const added = structuredClone(additions);
      const result = withConstraints(sketch, added);

      expect(result).toEqual(previousBatch(sketch, added));
      expect(sketch).toEqual(source);
      expect(added).toEqual(additions);
      expect(result.points).toBe(sketch.points);
      expect(result.entities).toBe(sketch.entities);
      expect(result.constraints[0]).toBe(sketch.constraints[0]);
      expect(result.constraints.at(-1)).not.toBe(added.at(-1));
      expect(withConstraints(result, added)).toEqual(previousBatch(result, added));

      sketch.points.push({ id: 'k20000', x: 0, y: 0 });
      expect(withConstraints(sketch, added)).toEqual(previousBatch(sketch, added));
    }
  });

  it('keeps empty batches identical and names new geometry across every collection', () => {
    const sketch = fixture(3);

    sketch.constraints.push({ id: 'p50', kind: 'vertical', line: 'l0' });
    sketch.points.push({ id: 'l75', x: 0, y: 0 });
    expect(withConstraints(sketch, [])).toBe(sketch);
    expect(nextId(sketch, 'p')).toBe('p51');
    expect(nextId(sketch, 'l')).toBe('l76');
    expect(nextId({ points: [], entities: [], constraints: [] }, 'k')).toBe('k1');
  });

  it.each([300, 600])('reads existing ids once for a six-constraint batch on %i items per collection', (size) => {
    const before = counted(fixture(size));
    const after = counted(fixture(size));
    const batch = additions.slice(0, 6);
    const expected = previousBatch(before.sketch, batch);
    const result = withConstraints(after.sketch, batch);

    expect(before.reads()).toBe(size * 24);
    expect(after.reads()).toBe(size * 3);
    expect(result).toEqual(expected);
  });
});
