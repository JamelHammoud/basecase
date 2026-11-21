import { describe, expect, it } from 'vitest';
import { weldImportedMesh } from './importWeld';

describe('exact imported mesh welding', () => {
  it('keeps every source coordinate and triangle, including submillimeter edges and large offsets', () => {
    const soup = new Float32Array([1000, 0, 0, 1000.0001, 0, 0, 1000, 0.0001, 0, 1000, 0, 0, 1000, 0.0001, 0, 0, 1, 0]);
    const result = weldImportedMesh(soup);
    const restored = Array.from(result.indices).flatMap((i) => Array.from(result.positions.slice(i * 3, i * 3 + 3)));

    expect(restored).toEqual(Array.from(soup));
    expect(result.positions).toHaveLength(12);
    expect(result.indices).toHaveLength(6);
  });

  it('preserves vertex color seams at shared positions', () => {
    const soup = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, -1, 0, 0]);
    const colors = new Float32Array([1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);
    const result = weldImportedMesh(soup, colors);

    expect(result.positions).toHaveLength(18);
    expect(result.colors).toEqual(colors);
  });
  it('rejects nonfinite coordinates and incomplete triangles or vertex colors', () => {
    expect(() => weldImportedMesh(new Float32Array([0, 0, 0]))).toThrow('complete triangles');
    expect(() => weldImportedMesh(new Float32Array([0, 0, 0, 1, 0, 0, 0, NaN, 0]))).toThrow('finite coordinates');
    expect(() => weldImportedMesh(new Float32Array(9), new Float32Array(3))).toThrow('RGB value per vertex');
  });
});
