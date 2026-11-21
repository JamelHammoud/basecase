import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { place, type Placed } from '../three/analysis/collide';
import { solidFromPositions } from '../three/analysis/shapeSolid';
import { insideSolid } from './probe';
import * as samples from './samples';
import { splitPlanes, type SplitPlane } from './splitTest';

function box(id: string, size: number[], position: number[], turn = 0): Placed {
  const geometry = new THREE.BoxGeometry(...(size as [number, number, number])).toNonIndexed();
  const solid = solidFromPositions(new Float32Array(geometry.getAttribute('position').array));
  const matrix = new THREE.Matrix4().makeRotationY(turn).setPosition(...(position as [number, number, number]));

  geometry.dispose();

  return place(id, solid, matrix);
}

function previous(part: Placed, others: Placed[]): SplitPlane[] {
  const points = samples.worldPoints(samples.gridSamples(part.solid, 14), part.matrix);
  const centre = part.box.getCenter(new THREE.Vector3());

  return (['x', 'y', 'z'] as const).map((axis) => {
    const v = new THREE.Vector3();

    v[axis] = 1;

    const halves = [1, -1].map((sign) => {
      const blocked = new Set<string>();
      const dir = v.clone().multiplyScalar(sign);

      for (const o of points.filter((p) => p.clone().sub(centre).dot(v) * sign >= 0)) {
        for (const q of others) {
          if (blocked.has(q.id)) continue;

          const ray = new THREE.Ray().set(o.clone().addScaledVector(dir, 0.15), dir);

          if (!ray.intersectsBox(q.box)) continue;

          ray.applyMatrix4(q.inverse);

          if (q.solid.bvh.raycastFirst(ray, THREE.DoubleSide) && !insideSolid(q, o.clone().addScaledVector(dir, 0.3)))
            blocked.add(q.id);
        }
      }

      return [...blocked];
    });

    return { axis, blockers: halves as [string[], string[]] };
  });
}

describe('enclosure split probes', () => {
  it('preserves complete blockers through placement edits, containment, misses and duplicate identities', () => {
    const part = box('part', [8, 6, 4], [0, 0, 0]);
    const others = [
      box('right', [2, 30, 30], [12, 0, 0]),
      box('left', [2, 30, 30], [-12, 0, 0]),
      box('above', [30, 2, 30], [0, 12, 0]),
      box('inside', [40, 40, 40], [0, 0, 0]),
      box('miss', [2, 2, 2], [80, 80, 80]),
    ];

    expect(splitPlanes(part, others)[0].blockers).toEqual([['right'], ['left']]);

    for (let i = 0; i < 24; i++) {
      const matrix = new THREE.Matrix4().makeRotationY(i * 0.17).setPosition(i - 12, i % 3, -i);
      const moved = place(part.id, part.solid, matrix);
      const candidates = others.map((q) => place(q.id, q.solid, matrix.clone().multiply(q.matrix)));
      const before = candidates.map((q) => q.matrix.toArray());
      const expected = previous(moved, [...candidates, candidates[0]]);

      expect(splitPlanes(moved, [...candidates, candidates[0]])).toEqual(expected);
      expect(splitPlanes(moved, [...candidates].reverse())).toEqual(previous(moved, [...candidates].reverse()));
      expect(candidates.map((q) => q.matrix.toArray())).toEqual(before);
    }

    expect(splitPlanes(part, [])).toEqual(previous(part, []));
  });

  it('does not clone sampled origins for candidate probes', () => {
    for (const count of [30, 60]) {
      const part = box('part', [8, 6, 4], [0, 0, 0]);
      const others = Array.from({ length: count }, (_, i) => box(`wall${i}`, [2, 30, 30], [12 + i, 0, 0]));
      const worldPoints = samples.worldPoints;
      const clone = THREE.Vector3.prototype.clone;
      const sources = new WeakSet<THREE.Vector3>();
      let points = 0;
      let clones = 0;
      const sampling = vi.spyOn(samples, 'worldPoints').mockImplementation((coordinates, matrix) => {
        const result = worldPoints(coordinates, matrix);

        points = result.length;
        result.forEach((point) => sources.add(point));

        return result;
      });
      const cloning = vi.spyOn(THREE.Vector3.prototype, 'clone').mockImplementation(function (this: THREE.Vector3) {
        if (sources.has(this)) clones++;

        return clone.call(this);
      });

      try {
        splitPlanes(part, others);
        expect(clones).toBe(points * 6);
      } finally {
        sampling.mockRestore();
        cloning.mockRestore();
      }
    }
  });
});
