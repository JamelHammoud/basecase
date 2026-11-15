import { describe, expect, it, vi } from 'vitest';
import { hexElement } from './hexElement';
import { LAYERED, stiffnessFor, type V3 } from './material';
import { hexMesh } from './mesh';
import { sampleStresses, type solveDisplacement } from './solve';

type Solved = NonNullable<ReturnType<typeof solveDisplacement>>;

function fixture(options: { n?: V3; sparse?: boolean; material?: keyof typeof LAYERED; normal?: V3 } = {}) {
  const { n = [4, 3, 2], sparse = false, material = 'PLA', normal = [0, 0, 1] } = options;
  const grid = {
    n,
    h: [1, 1.5, 2] as V3,
    origin: [-2, 3, 1] as V3,
    solid: Uint8Array.from({ length: n[0] * n[1] * n[2] }, (_, i) => Number(!sparse || i % 5 !== 1)),
  };
  const mesh = hexMesh(grid);
  const stiffness = stiffnessFor(LAYERED[material]!, normal);
  const solved: Solved = {
    mesh,
    element: hexElement(grid.h, stiffness),
    u: Float64Array.from(mesh.positions, (_, i) => Math.sin(i * 1.3) * 0.01),
    pinned: new Uint8Array(mesh.positions.length / 3),
    share: Float64Array.from(mesh.cells, (_, e) => (e % 7) / 6),
    iterations: 0,
  };

  return { solved, stiffness };
}

function cornerStresses(solved: Solved, stiffness: Float64Array): Float64Array {
  const { mesh, element, u } = solved;
  const corners = new Float64Array(mesh.cells.length * 48);

  for (let slot = 0; slot < mesh.nodes.length; slot++) {
    const cell = Math.floor(slot / 8);
    const b = element.strains[slot % 8];
    const displacement = Array.from(
      { length: 24 },
      (_, j) => u[mesh.nodes[cell * 8 + Math.floor(j / 3)] * 3 + (j % 3)],
    );
    const strain = Array.from({ length: 6 }, (_, r) =>
      displacement.reduce((sum, value, j) => sum + b[r * 24 + j] * value, 0),
    );

    for (let r = 0; r < 6; r++)
      corners[slot * 6 + r] =
        strain.reduce((sum, value, k) => sum + stiffness[r * 6 + k] * value, 0) * solved.share[cell];
  }

  return corners;
}

function averagedCorners(solved: Solved, stiffness: Float64Array): Float64Array {
  const corners = cornerStresses(solved, stiffness);
  const out = new Float64Array(solved.mesh.positions.length * 2);
  const seen = new Uint32Array(out.length / 6);

  solved.mesh.nodes.forEach((node, slot) => {
    seen[node]++;

    for (let r = 0; r < 6; r++) out[node * 6 + r] += corners[slot * 6 + r];
  });

  return out.map((value, i) => value / seen[Math.floor(i / 6)]);
}

describe('nodal stress sampling', () => {
  it.each(['PLA', 'PETG', 'ABS', 'ASA'] as const)(
    'matches corner averaging for %s across faces and sparse meshes',
    (material) => {
      const normals: V3[] = [
        [1, 0, 0],
        [0, -1, 0],
        [0, 0, 1],
        [1, 2, -3],
      ];

      for (const normal of normals) {
        for (const sparse of [false, true]) {
          const { solved, stiffness } = fixture({ material, normal, sparse });
          const before = structuredClone(solved);
          const savedStiffness = stiffness.slice();
          const result = sampleStresses(solved, stiffness);

          expect(result).toEqual(averagedCorners(solved, stiffness));
          expect(solved).toEqual(before);
          expect(stiffness).toEqual(savedStiffness);

          solved.u[0] += 0.25;
          solved.share.fill(0.75);

          expect(sampleStresses(solved, stiffness)).toEqual(averagedCorners(solved, stiffness));
          expect(result).toEqual(averagedCorners(before, savedStiffness));
        }
      }
    },
  );

  it('keeps constant affine stress at shared nodes and reads fresh strain matrices', () => {
    const { solved, stiffness } = fixture();

    solved.share.fill(1);
    solved.u.fill(0);

    expect(sampleStresses(solved, stiffness).every((value) => value === 0)).toBe(true);

    solved.u = solved.mesh.positions.map((value) => value * 0.01);

    const expected = Array.from(
      { length: 6 },
      (_, r) => (stiffness[r * 6] + stiffness[r * 6 + 1] + stiffness[r * 6 + 2]) * 0.01,
    );
    const result = sampleStresses(solved, stiffness);

    result.forEach((value, i) => expect(value).toBeCloseTo(expected[i % 6], 9));
    solved.element.strains = solved.element.strains.map((b) => b.map((value) => value * 0.5));

    const changed = sampleStresses(solved, stiffness);

    changed.forEach((value, i) => expect(value).toBeCloseTo(result[i] * 0.5, 9));
  });

  it('handles empty meshes and nodes without incident cells', () => {
    const { solved, stiffness } = fixture({ n: [0, 0, 0] });

    expect(sampleStresses(solved, stiffness)).toEqual(new Float64Array());
    solved.mesh.positions = new Float64Array(3);

    expect(sampleStresses(solved, stiffness)).toEqual(Float64Array.of(NaN, NaN, NaN, NaN, NaN, NaN));
  });

  it.each([3, 6])('allocates nodal storage without a corner buffer for a 10 × 10 × %s mesh', (depth) => {
    const { solved, stiffness } = fixture({ n: [10, 10, depth] });
    const lengths: number[] = [];
    const measured = new Proxy(Float64Array, {
      construct(target, args) {
        const array = Reflect.construct(target, args) as Float64Array;

        lengths.push(array.length);

        return array;
      },
    });

    vi.stubGlobal('Float64Array', measured);

    try {
      const result = sampleStresses(solved, stiffness);
      const nodes = solved.mesh.positions.length / 3;

      expect(result).toHaveLength(nodes * 6);
      expect(lengths).toContain(nodes * 6);
      expect(lengths.reduce((sum, length) => sum + length, 0)).toBeLessThanOrEqual(nodes * 7 + 30);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
