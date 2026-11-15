import { describe, expect, it } from 'vitest';
import { unit } from './loads';
import { failureIndex, LAYERED, type LayeredMaterial, type V3 } from './material';
import { stressIndices, stressRatios } from './stressIndices';

function reference(nodal: Float64Array, read: Uint8Array, options: { normal: V3; material: LayeredMaterial }) {
  const indices = new Float32Array(read.length);
  const normal = unit(options.normal);
  let worst = 0;
  let worstNode = 0;

  for (let k = 0; k < indices.length; k++) {
    if (!read[k]) continue;

    indices[k] = failureIndex(nodal.subarray(k * 6, k * 6 + 6), normal, options.material);

    if (indices[k] <= worst) continue;

    worst = indices[k];
    worstNode = k;
  }

  return { indices, worst, worstNode };
}

const referenceRatios = (nodes: Int32Array, indices: Float32Array) =>
  Float32Array.from({ length: nodes.length / 8 }, (_, e) =>
    Math.max(...Array.from(nodes.subarray(e * 8, e * 8 + 8), (k) => indices[k])),
  ).map(Math.sqrt);

describe('Strength orientation indices', () => {
  it('matches the previous rounded indices, worst node and cell field across reused orientations and edits', () => {
    const normals: V3[] = [
      [0, 0, 1],
      [1, 0, 0],
      [0, -2, 0],
      [1, 2, -3],
      [0, 0, 0],
    ];

    for (let seed = 0; seed < 80; seed++) {
      const count = 8 + seed;
      const nodal = Float64Array.from({ length: count * 6 }, (_, i) => Math.sin(i * 1.3 + seed) * (seed + 1));
      const read = Uint8Array.from({ length: count }, (_, i) => Number((i + seed) % 5 !== 0));
      const nodes = Int32Array.from({ length: 8 * (seed + 1) }, (_, i) => (i * 7 + seed) % count);
      const indices = new Float32Array(count);
      const before = { nodal: nodal.slice(), read: read.slice(), nodes: nodes.slice() };

      for (const normal of normals) {
        const material = Object.values(LAYERED)[seed % Object.values(LAYERED).length]!;
        const options = { normal, material };
        const expected = reference(nodal, read, options);

        expect(stressIndices(nodal, read, { ...options, indices })).toEqual({
          worst: expected.worst,
          worstNode: expected.worstNode,
        });
        expect(indices).toEqual(expected.indices);
        expect(stressRatios(nodes, indices)).toEqual(referenceRatios(nodes, expected.indices));
      }

      expect({ nodal, read, nodes }).toEqual(before);
      nodal[0] += 200;
      read[0] = 1;
      read[1] = 0;

      const options = { normal: normals[seed % normals.length], material: LAYERED.PLA! };
      const expected = reference(nodal, read, options);

      expect(stressIndices(nodal, read, { ...options, indices })).toEqual({
        worst: expected.worst,
        worstNode: expected.worstNode,
      });
      expect(indices).toEqual(expected.indices);
    }
  });

  it('keeps first-node ties after Float32 rounding and clears unread nodes in a reused buffer', () => {
    const nodal = new Float64Array(18);
    const indices = Float32Array.of(99, 99, 99);
    const read = Uint8Array.of(1, 1, 0);
    const options = { normal: [0, 0, 1] as V3, material: LAYERED.PLA!, indices };

    nodal[2] = 25;
    nodal[8] = 25 + 1e-8;
    expect(stressIndices(nodal, read, options)).toEqual({ worst: 1, worstNode: 0 });
    expect(indices).toEqual(Float32Array.of(1, 1, 0));
    read.fill(0);
    expect(stressIndices(nodal, read, options)).toEqual({ worst: 0, worstNode: 0 });
    expect(indices).toEqual(new Float32Array(3));
  });

  it('preserves nonfinite propagation, zero fields, empty inputs and independent result arrays', () => {
    for (const value of [NaN, Infinity, -Infinity, 0, -0]) {
      const nodal = Float64Array.of(value, 1, 2, 3, 4, 5, 2, 3, 4, 5, 6, 7);
      const read = Uint8Array.of(1, 1);
      const options = { normal: [1, 2, 3] as V3, material: LAYERED.PETG! };
      const indices = new Float32Array(2);
      const expected = reference(nodal, read, options);
      const nodes = Int32Array.of(0, 1, 0, 1, 0, 1, 0, 1);

      expect(stressIndices(nodal, read, { ...options, indices })).toEqual({
        worst: expected.worst,
        worstNode: expected.worstNode,
      });
      expect(stressRatios(nodes, indices)).toEqual(referenceRatios(nodes, expected.indices));
    }

    const nodes = new Int32Array(8);
    const indices = Float32Array.of(4);
    const first = stressRatios(nodes, indices);

    indices[0] = 9;
    expect(stressRatios(nodes, indices)).toEqual(Float32Array.of(3));
    expect(first).toEqual(Float32Array.of(2));
    expect(stressRatios(new Int32Array(), indices)).toEqual(new Float32Array());
    expect(stressRatios(nodes, Float32Array.of(0))).toEqual(Float32Array.of(0));
  });
});
