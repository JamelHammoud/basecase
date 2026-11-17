import { describe, expect, it } from 'vitest';
import { binaryStl, StlWriter } from './stlBytes';

const HEADER = 80;
const FACET = 50;

function writeNormal(view: DataView, at: number, t: ArrayLike<number>, i: number) {
  const ux = t[i + 3] - t[i],
    uy = t[i + 4] - t[i + 1],
    uz = t[i + 5] - t[i + 2];
  const vx = t[i + 6] - t[i],
    vy = t[i + 7] - t[i + 1],
    vz = t[i + 8] - t[i + 2];
  const nx = uy * vz - uz * vy,
    ny = uz * vx - ux * vz,
    nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;

  view.setFloat32(at, nx / len, true);
  view.setFloat32(at + 4, ny / len, true);
  view.setFloat32(at + 8, nz / len, true);
}

function writeFacet(view: DataView, at: number, triangles: ArrayLike<number>, i: number) {
  writeNormal(view, at, triangles, i);

  for (let k = 0; k < 9; k++) view.setFloat32(at + 12 + k * 4, triangles[i + k], true);
}

function previousStl(triangles: ArrayLike<number>): Uint8Array {
  const count = Math.floor(triangles.length / 9);
  const bytes = new Uint8Array(HEADER + 4 + count * FACET);
  const view = new DataView(bytes.buffer);

  view.setUint32(HEADER, count, true);

  for (let f = 0; f < count; f++) writeFacet(view, HEADER + 4 + f * FACET, triangles, f * 9);

  return bytes;
}

function streamedStl(triangles: ArrayLike<number>) {
  const count = Math.floor(triangles.length / 9);
  const writer = new StlWriter(count);

  for (let i = 0; i < count; i++) {
    for (let k = 0; k < 9; k++) writer.triangle[k] = triangles[i * 9 + k];

    writer.facet();
  }

  return writer.bytes;
}

describe('binary STL encoding', () => {
  it('preserves complete file bytes across ordinary, degenerate and nonfinite facets', () => {
    const seeds = Array.from({ length: 600 * 9 }, (_, i) => Math.sin(i * 1.7) * 130);
    const cases = [
      [],
      [0, -0, 0, 1, 0, 0, 0, 1, 0],
      Array<number>(18).fill(4),
      [0, 0, 0, 1, 1, 1, 2, 2, 2],
      [NaN, Infinity, -Infinity, -0, 1, 2, 3, 4, 5],
      [1e300, 1e-300, 0, -1e300, 0, 1e-300, 0, 0, -1e-300],
      seeds.slice(0, 300 * 9),
      seeds,
    ];

    for (const values of cases) {
      for (const tail of [[], [1], [1, 2, 3, 4, 5, 6, 7, 8]]) {
        const source = Object.freeze([...values, ...tail]);
        const float32 = new Float32Array(source);

        expect(binaryStl(source)).toEqual(previousStl(source));
        expect(binaryStl(new Float64Array(source))).toEqual(previousStl(source));
        expect(binaryStl(float32)).toEqual(previousStl(float32));
        expect(streamedStl(source)).toEqual(previousStl(float32));
      }
    }
  });

  it('keeps independent output and reads later source edits', () => {
    const source = new Float32Array([0, 0, 0, 2, 0, 0, 0, 3, 0]);
    const first = binaryStl(source);
    const saved = first.slice();

    source[4] = 5;

    const edited = binaryStl(source);

    expect(edited).toEqual(previousStl(source));
    expect(edited).not.toEqual(first);
    expect(first).toEqual(saved);
    expect(binaryStl(source).buffer).not.toBe(edited.buffer);
  });
});
