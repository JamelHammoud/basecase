import { describe, expect, it } from 'vitest';
import { polylineSketch } from './edit';
import type { Sketch, Vec2 } from './types';

function previous(loops: Vec2[][]): Sketch {
  return loops.reduce<Sketch>(
    (sketch, loop) => {
      const start = sketch.points.length;
      const points = loop.map(([x, y], i) => ({ id: `p${start + i + 1}`, x, y }));
      const lines = loop.map((_, i) => ({
        id: `l${sketch.entities.length + i + 1}`,
        kind: 'line' as const,
        a: points[i].id,
        b: points[(i + 1) % loop.length].id,
      }));

      return { ...sketch, points: [...sketch.points, ...points], entities: [...sketch.entities, ...lines] };
    },
    { points: [], entities: [], constraints: [] },
  );
}

function loopsFor(seed: number): Vec2[][] {
  return Array.from({ length: seed % 19 }, (_, loop) =>
    Array.from({ length: (seed + loop * 7) % 13 }, (_, vertex): Vec2 => [
      Math.sin(seed + vertex) * (loop + 1),
      Math.cos(seed - vertex) * (loop + 1),
    ]),
  );
}

describe('polyline sketch conversion', () => {
  it('preserves complete geometry and ids across mixed loop sizes and winding', () => {
    for (let seed = 0; seed < 200; seed++) {
      const loops = loopsFor(seed);
      const source = structuredClone(loops);

      expect(polylineSketch(loops)).toEqual(previous(loops));
      expect(loops).toEqual(source);
      expect(polylineSketch(loops.map((loop) => [...loop].reverse()))).toEqual(
        previous(loops.map((loop) => [...loop].reverse())),
      );
    }
  });

  it('closes each loop independently, including empty and degenerate loops', () => {
    const sketch = polylineSketch([
      [],
      [[1, 2]],
      [],
      [
        [3, 4],
        [3, 4],
      ],
      [
        [5, 6],
        [7, 8],
        [9, 10],
      ],
      [],
    ]);

    expect(sketch.entities).toEqual([
      { id: 'l1', kind: 'line', a: 'p1', b: 'p1' },
      { id: 'l2', kind: 'line', a: 'p2', b: 'p3' },
      { id: 'l3', kind: 'line', a: 'p3', b: 'p2' },
      { id: 'l4', kind: 'line', a: 'p4', b: 'p5' },
      { id: 'l5', kind: 'line', a: 'p5', b: 'p6' },
      { id: 'l6', kind: 'line', a: 'p6', b: 'p4' },
    ]);
    expect(sketch.constraints).toEqual([]);
  });

  it('keeps conversions independent across later input and output edits', () => {
    const loops = loopsFor(18);
    const first = polylineSketch(loops);
    const expected = previous(loops);

    loops[0][0][0] = 1000;
    expect(first).toEqual(expected);
    first.points[0].x = -1000;
    first.entities.pop();
    first.constraints.push({ id: 'k1', kind: 'horizontal', line: 'l1' });
    expect(polylineSketch(loops)).toEqual(previous(loops));
  });

  it('converts outlines with many holes without changing their order', () => {
    const loops = Array.from({ length: 1000 }, (_, i): Vec2[] => [
      [i, 0],
      [i + 1, 0],
      [i + 1, 1],
      [i, 1],
    ]);

    expect(polylineSketch(loops)).toEqual(previous(loops));
  });
});
