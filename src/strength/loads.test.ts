import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { tangentialForces } from './loads';
import type { V3 } from './material';
import type { HexMesh } from './mesh';
import { seededRandom } from '../utils/seededRandom';

type Turn = Parameters<typeof tangentialForces>[2];

function meshOf(points: number[][]): HexMesh {
  return {
    positions: Float64Array.from(points.flat()),
    cells: new Int32Array(),
    nodes: new Int32Array(),
    grid: { origin: [0, 0, 0], h: [1, 1, 1], n: [1, 1, 1], solid: new Uint8Array(1) },
  };
}

function previousForces(mesh: HexMesh, at: Uint8Array, turn: Turn) {
  const length = Math.hypot(...turn.axis) || 1;
  const a = turn.axis.map((v) => v / length);
  const selected = at.reduce<number[]>((out, value, n) => (value ? [...out, n] : out), []);
  const arms = selected.map((n): [number, number[]] => {
    const rel = [0, 1, 2].map((d) => mesh.positions[n * 3 + d] - turn.origin[d]);
    const along = rel[0] * a[0] + rel[1] * a[1] + rel[2] * a[2];

    return [n, rel.map((v, d) => v - along * a[d])];
  });
  const sum = arms.reduce((s, [, r]) => s + r[0] ** 2 + r[1] ** 2 + r[2] ** 2, 0);
  const k = sum > 1e-9 ? turn.torqueNmm / sum : 0;
  const out = new Float64Array(mesh.positions.length);

  for (const [n, r] of arms) {
    const tangent = [a[1] * r[2] - a[2] * r[1], a[2] * r[0] - a[0] * r[2], a[0] * r[1] - a[1] * r[0]];

    for (let d = 0; d < 3; d++) out[n * 3 + d] = k * tangent[d];
  }

  return out;
}

function iterationCount(calculate: () => Float64Array) {
  const iterator = Array.prototype[Symbol.iterator];
  let count = 0;

  Object.defineProperty(Array.prototype, Symbol.iterator, {
    value(this: number[]) {
      count++;

      return iterator.call(this);
    },
  });

  try {
    calculate();

    return count;
  } finally {
    Object.defineProperty(Array.prototype, Symbol.iterator, { value: iterator });
  }
}

describe('tangential node loads', () => {
  it('matches the previous force buffer across dense, sparse, translated and reflected node sets', () => {
    const random = seededRandom('68ad836c68ad836c68ad836c68ad836c');
    const coordinate = () => (random() - 0.5) * 200;

    for (let fixture = 0; fixture < 100; fixture++) {
      const mesh = meshOf(Array.from({ length: fixture + 1 }, () => [coordinate(), coordinate(), coordinate()]));
      const turn: Turn = {
        origin: [coordinate(), coordinate(), coordinate()],
        axis: [coordinate(), coordinate(), coordinate()],
        torqueNmm: coordinate() * 1000,
      };
      const before = structuredClone({ mesh, turn });

      for (const stride of [1, 2, 7]) {
        const at = Uint8Array.from({ length: fixture + 1 }, (_, n) => (n % stride === 0 ? 255 : 0));
        const saved = at.slice();

        expect(tangentialForces(mesh, at, turn)).toEqual(previousForces(mesh, at, turn));
        expect(at).toEqual(saved);
      }

      expect({ mesh, turn }).toEqual(before);
    }
  });

  it('applies the requested moment along an oblique axis without force along that axis', () => {
    const mesh = meshOf([
      [8, 2, 3],
      [-4, 5, 1],
      [2, -8, 4],
      [100, 200, 300],
    ]);
    const at = new Uint8Array([1, 1, 1, 0]);
    const turn: Turn = { origin: [2, -1, 3], axis: [2, -3, 4], torqueNmm: -770 };
    const force = tangentialForces(mesh, at, turn);
    const axis = new THREE.Vector3(...turn.axis).normalize();
    const moment = new THREE.Vector3();

    for (let n = 0; n < at.length; n++) {
      const f = new THREE.Vector3().fromArray(force, n * 3);
      const r = new THREE.Vector3().fromArray(mesh.positions, n * 3).sub(new THREE.Vector3(...turn.origin));

      expect(f.dot(axis)).toBeCloseTo(0, 10);
      moment.add(r.cross(f));
    }

    expect(moment.dot(axis)).toBeCloseTo(turn.torqueNmm, 10);
    expect(force.slice(9)).toEqual(new Float64Array(3));
  });

  it('keeps the moment cutoff, zero axes, nonfinite values and signed zeros', () => {
    const points = [
      [0, 0, 0],
      [0, 0, 10],
      [Math.sqrt(1e-9), 0, 0],
      [Math.sqrt(1.000001e-9), 0, 0],
    ];
    const axes: V3[] = [
      [0, 0, 1],
      [0, 0, 0],
      [-0, 0, -1],
      [Infinity, 0, 1],
      [NaN, 1, 0],
    ];

    for (const axis of axes) {
      for (const torqueNmm of [0, -0, 770, -770, Infinity, NaN]) {
        const turn = { origin: [0, 0, 0] as V3, axis, torqueNmm };

        for (const point of points) {
          const mesh = meshOf([point]);

          expect(tangentialForces(mesh, new Uint8Array([1]), turn)).toEqual(
            previousForces(mesh, new Uint8Array([1]), turn),
          );
        }
      }
    }

    const turn: Turn = { origin: [0, 0, 0], axis: [0, 0, 1], torqueNmm: 1 };

    expect(tangentialForces(meshOf([points[2]]), new Uint8Array([1]), turn)).toEqual(new Float64Array(3));
    expect(tangentialForces(meshOf([points[3]]), new Uint8Array([1]), turn)[1]).toBeGreaterThan(0);
    expect(tangentialForces(meshOf([]), new Uint8Array(), turn)).toEqual(new Float64Array());
    expect(tangentialForces(meshOf(points), new Uint8Array(4), turn)).toEqual(new Float64Array(12));
  });

  it('reads edits on each call and returns independent buffers', () => {
    const mesh = meshOf([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    const at = new Uint8Array([1, 0]);
    const turn: Turn = { origin: [0, 0, 0], axis: [0, 0, 1], torqueNmm: 50 };
    const first = tangentialForces(mesh, at, turn);
    const saved = first.slice();

    mesh.positions[0] = -8;
    at[1] = 1;
    turn.origin[1] = 5;
    turn.axis = [1, 0, 0];
    turn.torqueNmm = -70;

    const next = tangentialForces(mesh, at, turn);

    expect(next).toEqual(previousForces(mesh, at, turn));
    expect(next).not.toEqual(first);
    expect(first).toEqual(saved);
  });

  it.each([300, 600])('avoids growing node-list copies for %i selected nodes', (count) => {
    const mesh = meshOf(Array.from({ length: count }, (_, n) => [n + 1, n % 7, n % 13]));
    const at = new Uint8Array(count).fill(1);
    const turn: Turn = { origin: [1, -2, 3], axis: [3, 4, 5], torqueNmm: 770 };
    const before = iterationCount(() => previousForces(mesh, at, turn));
    const after = iterationCount(() => tangentialForces(mesh, at, turn));

    expect(before).toBe(3 * count + 2);
    expect(after).toBeLessThanOrEqual(2);
    expect(tangentialForces(mesh, at, turn)).toEqual(previousForces(mesh, at, turn));
  });
});
