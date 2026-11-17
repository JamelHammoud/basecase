import { BoxGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { packedMesh } from './packedMesh';
import { creasedGeometry } from './partMesh/creased';

describe('mesh packing', () => {
  it('converts ordinary arrays once with the existing float and unsigned rounding', () => {
    const source = { positions: [1 / 3, -0, NaN, Infinity], indices: [0, -1, 2.9] };
    const before = structuredClone(source);
    const packed = packedMesh(source);

    expect(packed.positions).toEqual(Float32Array.from(source.positions));
    expect(packed.indices).toEqual(Uint32Array.from(source.indices));
    expect(packedMesh(source)).toBe(packed);
    expect(packedMesh({ ...source })).not.toBe(packed);
    expect(source).toEqual(before);
  });

  it('retains packed subarrays and converts only the unpacked side of mixed sources', () => {
    const positions = new Float32Array([99, 1, 2, 3, 99]).subarray(1, 4);
    const indices = new Uint32Array([99, 0, 1, 2, 99]).subarray(1, 4);
    const packed = packedMesh({ positions, indices });

    expect(packed.positions).toBe(positions);
    expect(packed.indices).toBe(indices);
    expect(packedMesh({ positions, indices: [0, 1, 2] }).positions).toBe(positions);
    expect(packedMesh({ positions: [1, 2, 3], indices }).indices).toBe(indices);
    expect(packedMesh(packed).positions).toBe(positions);
    expect(packedMesh(packed).indices).toBe(indices);
    expect(packedMesh({ positions: new Float32Array(), indices: new Uint32Array() }).positions).toHaveLength(0);
  });

  it('preserves complete crease output and source buffers after a worker-style round trip', () => {
    const box = new BoxGeometry(13, 17, 23, 2, 2, 2);
    const source = {
      positions: Array.from(box.getAttribute('position').array),
      indices: Array.from(box.index!.array),
    };
    const delivered = structuredClone(packedMesh(source));
    const before = structuredClone(delivered);
    const repacked = packedMesh(delivered);
    const expected = creasedGeometry(packedMesh(source), 32, [2, 0.5, -1]);
    const actual = creasedGeometry(repacked, 32, [2, 0.5, -1]);

    expect(repacked.positions).toBe(delivered.positions);
    expect(repacked.indices).toBe(delivered.indices);
    expect(actual.getAttribute('position').array).toEqual(expected.getAttribute('position').array);
    expect(actual.getAttribute('normal').array).toEqual(expected.getAttribute('normal').array);
    expect(delivered).toEqual(before);
    box.dispose();
    expected.dispose();
    actual.dispose();
  });
});
