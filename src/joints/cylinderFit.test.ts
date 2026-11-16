import { CylinderGeometry } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { fitCylinder } from './cylinderFit';
import { MeshIndex } from './meshIndex';

function cylinder(segments: number, dent = 0, span = Math.PI * 2) {
  const geometry = new CylinderGeometry(6, 6, 40, segments, 4, true, 0, span);
  const positions = geometry.getAttribute('position');

  for (let i = 0; i < positions.count; i++) {
    if (Math.abs(positions.getY(i)) < 1 && positions.getZ(i) > 5.99) {
      positions.setZ(i, positions.getZ(i) + dent);
    }
  }

  const flat = geometry.toNonIndexed();

  return new MeshIndex(Float32Array.from(flat.getAttribute('position').array));
}

function measuredFit(index: MeshIndex, minSpan = 30) {
  const region = Array.from({ length: index.triangles }, (_, i) => i);
  const before = index.vertices.slice();
  const normals = vi.spyOn(index, 'normal');
  const vertices = vi.spyOn(index, 'vertex');
  const found = fitCylinder(index, region, minSpan);
  const rounds = new Map<number, number>();

  for (const [t] of normals.mock.calls) rounds.set(t, (rounds.get(t) ?? 0) + 0.25);

  const vertexRounds = new Map<number, number>();

  for (const [t, count] of rounds) {
    for (let k = 0; k < 3; k++) {
      const v = index.corners[t * 3 + k];

      vertexRounds.set(v, Math.max(vertexRounds.get(v) ?? 0, count));
    }
  }

  const uniqueReads = [...vertexRounds.values()].reduce((sum, count) => sum + count, 0);
  const centroidReads = normals.mock.calls.length * 0.75;

  expect(vertices).toHaveBeenCalledTimes(uniqueReads + centroidReads);
  expect(index.vertices).toEqual(before);
  expect(region).toEqual(Array.from({ length: index.triangles }, (_, i) => i));

  return { found, rounds: Math.max(...rounds.values()) };
}

describe('cylinder fit vertex reuse', () => {
  it('retains first-seen welded vertex order across reordered and repeated triangles', () => {
    const index = cylinder(32);
    const region = Array.from({ length: index.triangles }, (_, i) => index.triangles - i - 1);

    region.push(...region.slice(0, 12));

    const expectedIds = [...new Set(region.flatMap((t) => [0, 1, 2].map((k) => index.corners[t * 3 + k])))];
    const before = [...region];
    const vertices = vi.spyOn(index, 'vertex');
    const first = fitCylinder(index, region, 30);

    expect(first).toMatchObject({ radius: expect.closeTo(6, 5), length: 40, convex: true });
    expect(vertices.mock.calls.slice(0, expectedIds.length).map(([id]) => id)).toEqual(expectedIds);
    expect(region).toEqual(before);
    vertices.mockClear();

    const second = fitCylinder(index, region, 30);

    expect(second).toEqual(first);
    expect(vertices.mock.calls.slice(0, expectedIds.length).map(([id]) => id)).toEqual(expectedIds);
  });

  it.each([64, 128])('reads each fitting vertex once on a %i-segment cylinder', (segments) => {
    const { found, rounds } = measuredFit(cylinder(segments));

    expect(rounds).toBe(1);
    expect(found).toMatchObject({ radius: expect.closeTo(6, 5), length: 40, convex: true });
    expect(found!.center).toEqual([expect.closeTo(0, 5), 0, expect.closeTo(0, 5)]);
    expect(Math.abs(found!.axis[1])).toBeCloseTo(1, 5);
  });

  it('recomputes errors after trimming a distorted patch', () => {
    const { found, rounds } = measuredFit(cylinder(64, 4));

    expect(rounds).toBeGreaterThan(1);
    expect(found).toMatchObject({ radius: expect.closeTo(6, 4), length: 40, convex: true });
  });

  it('keeps the minimum angular span verdict', () => {
    const { found } = measuredFit(cylinder(16, 0, Math.PI / 6), 60);

    expect(found).toBeNull();
  });
});
