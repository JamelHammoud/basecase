import { describe, expect, it } from 'vitest';
import { solveSketch } from './solver';
import type { Sketch, SketchEntity } from './types';

function countedEntities(entities: SketchEntity[]) {
  let reads = 0;
  const values = new Proxy(entities, {
    get(target, key, receiver) {
      if (typeof key === 'string' && /^\d+$/.test(key)) reads++;

      return Reflect.get(target, key, receiver);
    },
  });

  return { values, reads: () => reads };
}

function mixedSketch(size: number): Sketch {
  return {
    points: [
      { id: 'o', x: 0, y: 0, fixed: true },
      { id: 'a', x: 10, y: 0, fixed: true },
      { id: 'b', x: 0, y: 8 },
      ...Array.from({ length: size }, (_, i) => ({ id: `p${i}`, x: i + 1, y: 0 })),
    ],
    entities: [
      ...Array.from({ length: size }, (_, i): SketchEntity => ({
        id: `l${i}`,
        kind: 'line',
        a: 'o',
        b: `p${i}`,
      })),
      { id: 'circle', kind: 'circle', c: 'o', r: 7 },
      { id: 'arc', kind: 'arc', c: 'o', a: 'a', b: 'b' },
    ],
    constraints: [{ id: 'radius', kind: 'radius', entity: 'circle', value: 12 }],
  };
}

describe('sketch solve preparation', () => {
  it.each([1, 80])('reads %i lines, a circle and an arc a bounded number of times per solve', (size) => {
    const sketch = mixedSketch(size);

    const before = structuredClone(sketch);
    const entities = countedEntities(sketch.entities);
    const result = solveSketch({ ...sketch, entities: entities.values }, { point: `p${size - 1}`, to: [30, 4] });

    expect(result.status).toBe('ok');
    expect(entities.reads()).toBeLessThanOrEqual(sketch.entities.length * 5);

    if (result.status !== 'ok') return;

    expect(result.dof).toBe(size * 2 + 1);
    expect(result.sketch.entities.find((e) => e.id === 'circle')).toMatchObject({ r: 12 });
    expect(result.sketch.points.find((p) => p.id === 'b')).toMatchObject({ x: 0, y: 10 });
    expect(result.sketch.points.find((p) => p.id === `p${size - 1}`)).toMatchObject({ x: 30, y: 4 });
    expect(sketch).toEqual(before);
  });

  it('prepares each edit again when its entities and constraints change', () => {
    const sketch = mixedSketch(1);

    const first = solveSketch(sketch);

    expect(first.status).toBe('ok');

    if (first.status !== 'ok') return;

    const edited: Sketch = {
      ...first.sketch,
      entities: first.sketch.entities.map((e) => (e.id === 'arc' ? { ...e, a: 'p0' } : e)),
      constraints: [{ id: 'radius', kind: 'radius', entity: 'circle', value: 15 }],
    };
    const next = solveSketch(edited);

    expect(next.status).toBe('ok');

    if (next.status !== 'ok') return;

    expect(next.sketch.entities.find((e) => e.id === 'circle')).toMatchObject({ r: 15 });

    const p = next.sketch.points.find((p) => p.id === 'p0')!;
    const b = next.sketch.points.find((p) => p.id === 'b')!;

    expect(Math.hypot(p.x, p.y)).toBeCloseTo(Math.hypot(b.x, b.y), 8);
    expect(first.sketch.entities.find((e) => e.id === 'circle')).toMatchObject({ r: 12 });
  });
});
