import { describe, expect, it } from 'vitest';
import { bedMatrixOf } from './plan';
import { posedStl } from './posedStl';

const corners = (bytes: Uint8Array) => {
  const view = new DataView(bytes.buffer);
  const count = view.getUint32(80, true);
  const out: number[][] = [];

  for (let f = 0; f < count; f++)
    for (let v = 0; v < 3; v++)
      out.push([0, 1, 2].map((k) => view.getFloat32(84 + f * 50 + 12 + v * 12 + k * 4, true)));

  return out;
};

describe('posedStl', () => {
  it('writes a part off the plates standing Z up, as it lies in the scene', () => {
    const bytes = posedStl([0, 0, 0, 10, 0, 0, 0, 20, 30], bedMatrixOf([], 'loose'));

    expect(corners(bytes).map((c) => c.map((n) => Math.round(n) + 0))).toEqual([
      [0, 0, 0],
      [10, 0, 0],
      [0, -30, 20],
    ]);
  });
});
