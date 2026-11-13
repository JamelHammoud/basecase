import { describe, expect, it } from 'vitest';
import { box, cylinder, holedSolid, soupOf, squareOutline } from './axisFinder.fixtures';
import { placeJoint, worldSoup } from './placeJoint';

const at = (x: number, y: number, z: number) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
const IDENTITY = at(0, 0, 0);

describe('placeJoint', () => {
  it('moves each soup by its part matrix', () => {
    const turned = [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 5, 0, 0, 1];

    expect([...worldSoup({ soup: new Float32Array([1, 2, 3]), matrix: turned })]).toEqual([3, 1, 3]);
  });

  it('finds the shared axis of a pin and a plate placed apart', () => {
    const plate = soupOf(holedSolid({ inner: 4.1, outer: squareOutline(15), length: 6, segments: 48 }));
    const pin = soupOf(cylinder({ radius: 4, length: 20, segments: 48 }));
    const placement = placeJoint({
      parent: { soup: plate, matrix: at(30, 0, 0) },
      child: { soup: pin, matrix: at(30, 0, 0) },
      slide: false,
    });

    expect(placement?.travel).toBeNull();
    expect(Math.abs(placement?.at.axis[2] ?? 0)).toBeGreaterThan(0.999);
    expect(placement?.at.origin[0]).toBeCloseTo(30, 3);
    expect(placement?.at.origin[1]).toBeCloseTo(0, 3);
  });

  it('gives a slider its travel along the axis it was handed', () => {
    const placement = placeJoint({
      parent: { soup: soupOf(box([0, -5, -5], [100, 5, 5])), matrix: IDENTITY },
      child: { soup: soupOf(box([0, -8, 5], [20, 8, 12])), matrix: at(10, 0, 0) },
      at: { origin: [0, 0, 0], axis: [1, 0, 0] },
      slide: true,
    });

    expect(placement).toEqual({ at: { origin: [0, 0, 0], axis: [1, 0, 0] }, travel: [-10, 70] });
  });

  it('returns null for two plain boxes with no axis given', () => {
    const parent = { soup: soupOf(box([0, 0, 0], [10, 10, 10])), matrix: IDENTITY };
    const child = { soup: soupOf(box([2, 2, 10], [8, 8, 20])), matrix: IDENTITY };

    expect(placeJoint({ parent, child, slide: true })).toBeNull();
  });
});
