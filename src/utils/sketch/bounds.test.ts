import { describe, expect, it } from 'vitest';
import { fitView, insideView, sketchExtent } from '../../components/studio/sketchView';
import { polylineSketch } from './edit';
import { GROUND_PLANE, sketchSolid } from './placement';
import { loopBounds } from './profile';
import type { Sketch, Vec2 } from './types';

function previousBounds(loop: Vec2[]) {
  const xs = loop.map(([x]) => x);
  const ys = loop.map(([, y]) => y);

  return { min: [Math.min(...xs), Math.min(...ys)], max: [Math.max(...xs), Math.max(...ys)] };
}

function previousExtent(sketch: Sketch) {
  const points: Vec2[] = sketch.points.map((p) => [p.x, p.y]);

  for (const entity of sketch.entities) {
    if (entity.kind !== 'circle') continue;

    const center = sketch.points.find((p) => p.id === entity.c);

    if (!center) continue;

    points.push([center.x - entity.r, center.y - entity.r], [center.x + entity.r, center.y + entity.r]);
  }

  return points.length ? previousBounds(points) : null;
}

const look = { id: 'solid', name: 'Outline', color: '#888888' };

describe('Sketch bounds across view fitting and solid output', () => {
  it('matches coordinate extrema including empty, nonfinite and signed-zero inputs', () => {
    const values = [-Infinity, -100, -0, 0, 2.5, Infinity, NaN];
    const fixtures: Vec2[][] = [[], [[-0, 0]], [[0, -0]]];

    for (const x of values) {
      for (const y of values)
        fixtures.push([
          [x, y],
          [0, -0],
          [y, x],
        ]);
    }

    for (const points of fixtures) expect(loopBounds(points)).toEqual(previousBounds(points));
  });

  it('keeps circle extents, first duplicate centers, missing centers and subsequent edits', () => {
    for (let size = 0; size < 100; size++) {
      const sketch: Sketch = {
        points: Array.from({ length: size }, (_, i) => ({ id: `p${i % 7}`, x: i * 1.25 - 80, y: 20 - i * 0.75 })),
        entities: Array.from({ length: size }, (_, i) => ({
          id: `c${i}`,
          kind: 'circle',
          c: `p${i % 9}`,
          r: (i % 13) - 4,
        })),
        constraints: [],
      };
      const before = structuredClone(sketch);
      const first = sketchExtent(sketch);

      expect(first).toEqual(previousExtent(sketch));
      expect(sketch).toEqual(before);

      const edited = { ...sketch, points: sketch.points.map((p) => ({ ...p, x: p.x + 30 })) };

      expect(sketchExtent(edited)).toEqual(previousExtent(edited));
      expect(sketchExtent(sketch)).toEqual(first);
    }
  });

  it('bounds large imported outlines without spreading their coordinates into function arguments', () => {
    const points: Vec2[] = Array.from({ length: 200_000 }, (_, i) => [i - 100_000, 50 - i]);
    const sketch: Sketch = {
      points: points.map(([x, y], i) => ({ id: `p${i}`, x, y })),
      entities: [],
      constraints: [],
    };

    expect(loopBounds(points)).toEqual({ min: [-100_000, -199_949], max: [99_999, 50] });
    expect(sketchExtent(sketch)).toEqual(loopBounds(points));
    expect(fitView(sketch)).toEqual({ cx: -0.5, cy: -99_949.5, span: 4000 });
    expect(insideView({ cx: 0, cy: 0, span: 500_000 }, sketch)).toBe(true);
  });

  it.each([
    [-30, -10, 60],
    [10, 30, 60],
    [-10, 30, 60],
  ])('retains solid dimensions and Revolve radius for x bounds %s to %s', (left, right, diameter) => {
    const points: Vec2[] = [
      [left, -5],
      [right, -5],
      [right, 15],
      [left, 15],
    ];
    const sketch = polylineSketch([points]);
    const before = structuredClone(sketch);
    const extruded = sketchSolid(GROUND_PLANE, { sketch, mode: 'extrude', depth: 4 }, look)!;
    const revolved = sketchSolid(GROUND_PLANE, { sketch, mode: 'revolve', depth: 4 }, look)!;

    expect(extruded.dimensions).toEqual({ width: right - left, height: 4, depth: 20 });
    expect(extruded.record.anchor).toEqual([(left + right) / 2, 5]);
    expect(revolved.dimensions).toEqual({ width: diameter, height: 20, depth: diameter });
    expect(revolved.node.lathe?.profilePoints).toEqual(points.map(([x, y]) => [Math.abs(x) / diameter, (y - 5) / 20]));
    expect(sketch).toEqual(before);
  });
});
