import { describe, expect, it } from 'vitest';
import { weld } from './threeMf';

function reference(tris: Float32Array) {
  const vertices: number[] = [];
  const ids = new Map<string, number>();
  const indices: number[] = [];

  for (let i = 0; i < tris.length; i += 3) {
    const point = Array.from(tris.subarray(i, i + 3));
    const key = point.map((v) => Math.round(v * 1e4)).join(',');

    if (!ids.has(key)) {
      ids.set(key, vertices.length / 3);
      vertices.push(...point);
    }

    indices.push(ids.get(key)!);
  }

  const kept: number[] = [];

  for (let i = 0; i < indices.length; i += 3) {
    const triangle = indices.slice(i, i + 3);

    if (new Set(triangle).size === 3) kept.push(...triangle);
  }

  return { vertices: new Float32Array(vertices), indices: new Uint32Array(kept) };
}

describe('triangle welding', () => {
  it('preserves quantized vertices, winding and triangle order across mixed collapsed faces', () => {
    for (let variant = 0; variant < 80; variant++) {
      const soup = new Float32Array(90 * 9);

      for (let i = 0; i < soup.length; i++) {
        soup[i] = ((i * 17 + variant * 13) % 43) - 21 + (i % 4) * 0.00001;
      }

      for (let t = variant % 3; t < 90; t += 3) {
        soup.copyWithin(t * 9 + 3, t * 9, t * 9 + 3);
      }

      const before = soup.slice();
      const result = weld(soup);

      expect(result).toEqual(reference(soup));
      expect(soup).toEqual(before);
      expect(result.indices.byteLength).toBe(result.indices.buffer.byteLength);
      expect(result.indices.byteOffset).toBe(0);
    }
  });

  it('keeps first coordinates even when their triangle collapses after quantization', () => {
    const soup = Float32Array.from([0.00001, 0, 0, 0.00002, 0, 0, 2, 0, 0, 0, 0, 0, 2, 0, 0, 0, 2, 0]);
    const result = weld(soup);

    expect(result.indices).toEqual(Uint32Array.from([0, 1, 2]));
    expect(result.vertices).toEqual(Float32Array.from([0.00001, 0, 0, 2, 0, 0, 0, 2, 0]));
    soup.fill(99);
    expect(result.vertices[0]).toBeCloseTo(0.00001);
  });

  it.each([new Float32Array(), new Float32Array(18)])('handles empty and fully collapsed meshes', (soup) => {
    const result = weld(soup);

    expect(result).toEqual(reference(soup));
    expect(result.indices.buffer.byteLength).toBe(0);
  });
});
