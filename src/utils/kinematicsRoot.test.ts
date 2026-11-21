import { Euler, Matrix4, MathUtils, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { RootOffset } from '../types/robotics';
import { isRestPose, isZeroRoot, rootMatrix } from './kinematicsMotion';
import type { V3 } from './kinematicsRig';

function composedRoot(pivot: V3, root?: RootOffset): Matrix4 {
  const m = new Matrix4();

  if (!root) return m;

  const rotation = root.rotation ?? [0, 0, 0];

  if (rotation.some(Boolean)) {
    m.makeTranslation(...pivot)
      .multiply(new Matrix4().makeRotationFromEuler(new Euler(...(rotation.map(MathUtils.degToRad) as V3), 'XYZ')))
      .multiply(new Matrix4().makeTranslation(-pivot[0], -pivot[1], -pivot[2]));
  }

  const position = root.position ?? [0, 0, 0];

  if (position.some(Boolean)) m.premultiply(new Matrix4().makeTranslation(...position));

  return m;
}

describe('robot root transforms', () => {
  it('preserves rest classification for partial offsets, tolerance boundaries and nonfinite coordinates', () => {
    const values = [-Infinity, -1, -1e-6, -0.999e-6, -0, 0, 0.999e-6, 1e-6, 1, Infinity, NaN];
    const roots: Array<RootOffset | undefined> = [undefined, {}];

    for (const value of values) {
      for (let axis = 0; axis < 3; axis++) {
        const coordinates: V3 = [0, -0, 0];

        coordinates[axis] = value;
        roots.push(
          { position: coordinates },
          { rotation: coordinates },
          { position: coordinates, rotation: coordinates },
        );
      }
    }

    const before = structuredClone(roots);

    for (const root of roots) {
      const expected = !root || [...(root.position ?? []), ...(root.rotation ?? [])].every((v) => Math.abs(v) < 1e-6);

      expect(isZeroRoot(root)).toBe(expected);
      expect(isRestPose({ values: {}, root })).toBe(expected);
      expect(isRestPose({ values: {}, roots: root ? { robot: root } : {} })).toBe(expected);
    }

    expect(roots).toEqual(before);
  });

  it('matches composed transforms for partial roots, signed angles and offset pivots', () => {
    for (let i = 0; i < 120; i++) {
      const pivot: V3 = [i * 7 - 400, Math.sin(i) * 900, i * -13];
      const position: V3 = [i - 30, i * -3, Math.cos(i) * 400];
      const rotation: V3 = [i * 17 - 720, Math.sin(i) * 180, i * -11];
      const roots: Array<RootOffset | undefined> = [
        undefined,
        {},
        { position },
        { rotation },
        { position, rotation },
        { position: [-0, 0, -0], rotation: [0, -0, 0] },
      ];

      for (const root of roots) {
        const snapshot = structuredClone({ pivot, root });
        const actual = rootMatrix(pivot, root);
        const expected = composedRoot(pivot, root);

        actual.elements.forEach((value, k) => expect(value).toBeCloseTo(expected.elements[k], 10));
        expect({ pivot, root }).toEqual(snapshot);
      }
    }
  });

  it('keeps rotation centered on the pivot and applies translation in world axes', () => {
    const pivot: V3 = [123, -47, 89];
    const position: V3 = [-18, 29, 40];
    const rotation: V3 = [37, -81, 142];
    const root = rootMatrix(pivot, { position, rotation });
    const retained = root.toArray();
    const point = new Vector3(31, 57, -23);
    const expected = point
      .clone()
      .sub(new Vector3(...pivot))
      .applyEuler(new Euler(...(rotation.map(MathUtils.degToRad) as V3), 'XYZ'))
      .add(new Vector3(...pivot))
      .add(new Vector3(...position));

    expect(point.applyMatrix4(root).distanceTo(expected)).toBeLessThan(1e-12);
    expect(
      new Vector3(...pivot).applyMatrix4(root).distanceTo(new Vector3(...pivot).add(new Vector3(...position))),
    ).toBeLessThan(1e-12);
    rootMatrix([0, 0, 0], { position: [1, 2, 3] });
    expect(root.toArray()).toEqual(retained);
  });
});
