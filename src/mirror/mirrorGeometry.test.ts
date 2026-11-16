import { expect, it } from 'vitest';
import { mirrorMesh, mirrorSculpt } from './mirrorGeometry';
import type { MirrorAxis } from './plane';

function previousPositions(source: number[], axis: MirrorAxis, indexed: boolean): number[] {
  const flipped = source.slice();

  for (let i = axis; i < flipped.length; i += 3) flipped[i] = -flipped[i];

  if (indexed) return flipped;

  const out = flipped.slice();

  for (let t = 0; t + 8 < out.length; t += 9)
    for (let c = 0; c < 3; c++) [out[t + 3 + c], out[t + 6 + c]] = [out[t + 6 + c], out[t + 3 + c]];

  return out;
}

it('preserves mirrored coordinates, winding and source ownership for imported and sculpted meshes', () => {
  for (const length of [0, 3, 8, 9, 18, 29, 900]) {
    const positions = Array.from({ length }, (_, i) => (i % 7 === 0 ? -0 : Math.sin(i) * 100));
    const original = positions.slice();

    Object.freeze(positions);

    for (const axis of [0, 1, 2] as MirrorAxis[]) {
      for (const indices of [undefined, [], [0, 1, 2]]) {
        const originalIndices = indices?.slice();

        Object.freeze(indices);

        const sculpt = { positions, indices };
        const mesh = { positions, indices: indices ?? [], baseSize: [1, 1, 1] as [number, number, number] };
        const expected = previousPositions(positions, axis, Boolean(indices?.length));
        const mirroredMesh = mirrorMesh(mesh, axis);
        const mirroredSculpt = mirrorSculpt(sculpt, axis);

        expect(mirroredMesh.positions).toEqual(expected);
        expect(mirroredSculpt.positions).toEqual(expected);
        expect(mirroredMesh.positions).not.toBe(positions);
        expect(mirroredSculpt.positions).not.toBe(positions);
        expect(mirroredMesh.positions).not.toBe(mirroredSculpt.positions);
        expect(mirrorMesh(mirroredMesh, axis).positions).toEqual(original);
        expect(mirrorSculpt(mirroredSculpt, axis).positions).toEqual(original);
        expect(mirroredMesh.indices).toEqual(indices?.length ? [0, 2, 1] : []);
        expect(mirroredSculpt.indices).toEqual(indices?.length ? [0, 2, 1] : indices);
        expect(positions).toEqual(original);
        expect(sculpt.indices).toEqual(originalIndices);
      }
    }
  }
});
