import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { EXTRUSIONS, MGN_RAILS } from '../data/motionTables';
import { holePath } from './hardwarePrimitives';
import { holeRun, rectShape } from './motionHardwareMesh';

function formerOffsetHole(radius: number, center: [number, number]): THREE.Path {
  const path = holePath(radius, 24);

  return new THREE.Path(path.getPoints().map((point) => new THREE.Vector2(point.x + center[0], point.y + center[1])));
}

function extrudedHole(path: THREE.Path): THREE.ExtrudeGeometry {
  const shape = rectShape(-100, -100, 100, 100);

  shape.holes.push(path);

  return new THREE.ExtrudeGeometry(shape, { depth: 10, bevelEnabled: false });
}

function expectSameHole(radius: number, center: [number, number]) {
  const expected = formerOffsetHole(radius, center);
  const actual = holePath(radius, 24, 0, center);

  expect(actual.getPoints()).toEqual(expected.getPoints());

  const before = extrudedHole(expected);
  const after = extrudedHole(actual);

  for (const name of ['position', 'normal', 'uv']) {
    expect(after.getAttribute(name).array).toEqual(before.getAttribute(name).array);
  }

  before.dispose();
  after.dispose();
}

describe('offset hardware holes', () => {
  it('preserves contours and extrusion buffers for every catalog extrusion bore', () => {
    for (const spec of Object.values(EXTRUSIONS)) {
      for (const bore of spec.bores) {
        expectSameHole(bore.diameter / 2, [bore.at[0] - spec.size[0] / 2, bore.at[1] - spec.size[1] / 2]);
      }

      const corner = spec.cornerHoles;

      if (!corner) continue;

      for (const x of [-corner.pitch / 2, corner.pitch / 2]) {
        for (const y of [-corner.pitch / 2, corner.pitch / 2]) expectSameHole(corner.diameter / 2, [x, y]);
      }
    }
  });

  it('preserves both rail layers across short and long hole runs', () => {
    for (const rail of Object.values(MGN_RAILS)) {
      for (const length of [100, 600]) {
        for (const z of holeRun(length, rail.endE, rail.pitchP, rail.endEMin)) {
          expectSameHole(rail.boltHoleD / 2, [0, -z]);
          expectSameHole(rail.counterboreD / 2, [0, -z]);
        }
      }
    }
  });

  it('constructs offset paths without sampling an intermediate contour', () => {
    const sampled = vi.spyOn(THREE.Path.prototype, 'getPoints');

    try {
      const path = holePath(3, 24, 0, [10, -20]);

      expect(path.curves).toHaveLength(24);
      expect(sampled).not.toHaveBeenCalled();
    } finally {
      sampled.mockRestore();
    }
  });
});
