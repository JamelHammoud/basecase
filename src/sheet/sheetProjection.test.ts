import { Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SheetProfile } from '../types/sheet';
import { detectSheet } from './detectSheet';
import { plateTriangles } from './sheet.fixtures';

afterEach(() => vi.restoreAllMocks());

function nearProfile(profile: SheetProfile) {
  const coordinates = (values: number[]) => values.map((value) => expect.closeTo(value, 10));

  return {
    thicknessMm: expect.closeTo(profile.thicknessMm, 10),
    outline: profile.outline.map(coordinates),
    holes: profile.holes.map((hole) => hole.map(coordinates)),
    normal: coordinates(profile.normal),
    center: profile.center && coordinates(profile.center),
  };
}

describe('sheet projection reuse', () => {
  it.each([300, 600])('bounds projection work for a plate with %i wall subdivisions', (steps) => {
    const triangles = plateTriangles({ holes: false, steps });
    const original = triangles.slice();
    const dot = vi.spyOn(Vector3.prototype, 'dot');
    const profile = detectSheet(triangles);
    const projections = dot.mock.calls.length;

    expect(profile).toEqual({
      thicknessMm: 3,
      outline: [
        [0, 0],
        [80, 0],
        [80, 60],
        [0, 60],
      ],
      holes: [],
      normal: [0, 0, 1],
      center: [0, 0, 1.5],
    });
    expect(triangles).toEqual(original);
    expect(projections).toBeLessThanOrEqual((triangles.length / 9) * 4 + 32);
  });

  it('keeps profiles through reversed winding and face order, and measures moved vertices afresh', () => {
    const triangles = plateTriangles({ concave: true });
    const expected = detectSheet(triangles)!;
    const reversed = new Float32Array(triangles.length);

    for (let i = 0; i < triangles.length; i += 9) {
      const start = triangles.length - i - 9;

      reversed.set(triangles.subarray(i, i + 3), start);
      reversed.set(triangles.subarray(i + 6, i + 9), start + 3);
      reversed.set(triangles.subarray(i + 3, i + 6), start + 6);
    }

    expect(expected.holes).toHaveLength(4);
    expect(detectSheet(reversed)).toEqual(nearProfile(expected));

    for (let i = 2; i < triangles.length; i += 3) triangles[i] += 12;

    expect(detectSheet(triangles)).toEqual(nearProfile({ ...expected, center: [0, 0, 13.5] }));
  });
});
