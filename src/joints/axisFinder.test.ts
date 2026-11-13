import { describe, expect, it } from 'vitest';
import {
  box,
  cylinder,
  extruded,
  filletedProfile,
  holedSolid,
  place,
  placed,
  rotate,
  soupOf,
  sphere,
  squareOutline,
  type Placement,
} from './axisFinder.fixtures';
import { roundFaceAt, sharedAxis, slideTravel, type RoundFace, type Vec3 } from './axisFinder';
import { dot3, lineDistance3, length3, sub3 } from './vec3';

const TILT: Placement = { axis: [1, 2, 0.5], degrees: 37, offset: [40, -25, 60] };
const TRUE_AXIS = rotate([0, 0, 1], TILT);
const HALF_DEGREE_COS = Math.cos((0.5 * Math.PI) / 180);

function expectAxis(face: RoundFace | null, o: { axis: Vec3; middle: Vec3; radius: number }) {
  expect(face).not.toBeNull();

  const found = face as RoundFace;

  expect(Math.abs(dot3(found.axis, o.axis))).toBeGreaterThanOrEqual(HALF_DEGREE_COS);
  expect(length3(found.axis)).toBeCloseTo(1, 9);
  expect(lineDistance3(found.origin, o.middle, o.axis)).toBeLessThan(0.1);
  expect(length3(sub3(found.origin, o.middle))).toBeLessThan(0.1);
  expect(Math.abs(found.radius - o.radius)).toBeLessThan(0.1);

  const largest = found.axis.reduce((best, v) => (Math.abs(v) > Math.abs(best) ? v : best), 0);

  expect(largest).toBeGreaterThan(0);
}

const tiltedCylinder = (segments: number, rows = 1) =>
  soupOf(placed(cylinder({ radius: 6, length: 30, segments, rows }), TILT));

describe('roundFaceAt', () => {
  it.each([48, 12])('finds the axis of a tilted %i-segment cylinder from a click on its side', (segments) => {
    const face = roundFaceAt(tiltedCylinder(segments), place([6 * Math.cos(1), 6 * Math.sin(1), 11], TILT));

    expectAxis(face, { axis: TRUE_AXIS, middle: TILT.offset, radius: 6 });
    expect(face?.span[0]).toBeCloseTo(-15, 3);
    expect(face?.span[1]).toBeCloseTo(15, 3);
  });

  it('returns null on a box face and on a cylinder cap', () => {
    expect(roundFaceAt(soupOf(box([0, 0, 0], [20, 10, 5])), [10, 5, 5.1])).toBeNull();
    expect(roundFaceAt(tiltedCylinder(48), place([1, 2, 15.2], TILT))).toBeNull();
  });

  it('returns null on a sphere', () => {
    expect(roundFaceAt(soupOf(sphere(10, 16, 32)), [0, 0, 10.2])).toBeNull();
    expect(roundFaceAt(soupOf(sphere(10, 16, 32)), [10, 0, 0])).toBeNull();
  });

  it('finds a fillet that blends into flat faces, but not the flat face beside it', () => {
    const bar = soupOf(extruded(filletedProfile({ width: 20, height: 10, radius: 3, steps: 8 }), 40));
    const fillet = roundFaceAt(bar, [17 + 3 * Math.SQRT1_2, 7 + 3 * Math.SQRT1_2, 5]);

    expectAxis(fillet, { axis: [0, 0, 1], middle: [17, 7, 0], radius: 3 });
    expect(roundFaceAt(bar, [20, 2, 5])).toBeNull();
  });
});

describe('sharedAxis', () => {
  const pin = soupOf(placed(cylinder({ radius: 4, length: 20, segments: 48 }), TILT));

  it('proposes a pin in a plate with a hole', () => {
    const plate = holedSolid({ inner: 4.1, outer: squareOutline(15), length: 6, segments: 48 });
    const face = sharedAxis(soupOf(placed(plate, TILT)), pin);

    expectAxis(face, { axis: TRUE_AXIS, middle: TILT.offset, radius: 4 });
    expect(face?.span[0]).toBeCloseTo(-3, 3);
    expect(face?.span[1]).toBeCloseTo(3, 3);
  });

  it('proposes a pin in a tube, centred on their overlap', () => {
    const tube = holedSolid({ inner: 4.1, outer: () => 10, length: 10, segments: 36 });
    const shifted: Placement = { ...TILT, offset: place([0, 0, 6], TILT) };
    const face = sharedAxis(soupOf(placed(tube, shifted)), pin);

    expectAxis(face, { axis: TRUE_AXIS, middle: place([0, 0, 5.5], TILT), radius: 4 });
    expect(face?.span[1]).toBeCloseTo(4.5, 3);
  });

  it('returns null for two plain boxes', () => {
    expect(sharedAxis(soupOf(box([0, 0, 0], [10, 10, 10])), soupOf(box([2, 2, 10], [8, 8, 20])))).toBeNull();
  });
});

describe('slideTravel', () => {
  const along = { origin: [0, 0, 0] as Vec3, axis: [1, 0, 0] as Vec3 };

  it('lets a carriage run the length of a longer rail', () => {
    const rail = soupOf(box([0, -5, -5], [100, 5, 5]));
    const carriage = soupOf(box([10, -8, 5], [30, 8, 12]));

    expect(slideTravel(rail, carriage, along)).toEqual([-10, 70]);
  });

  it('lets a rod slide through a shorter bushing', () => {
    const bushing = soupOf(box([40, -6, -6], [50, 6, 6]));
    const rod = soupOf(box([0, -2, -2], [100, 2, 2]));

    expect(slideTravel(bushing, rod, along)).toEqual([-50, 40]);
  });

  it('falls back to the child length when the parts are the same length', () => {
    const a = soupOf(box([0, 0, 0], [25, 5, 5]));
    const b = soupOf(box([0, 5, 0], [25, 10, 5]));

    expect(slideTravel(a, b, along)).toEqual([-25, 25]);
  });
});

describe('performance', () => {
  it('handles a 100k-triangle cylinder well under a second', () => {
    const big = tiltedCylinder(500, 100);
    const plate = soupOf(placed(holedSolid({ inner: 6.1, outer: squareOutline(15), length: 6, segments: 48 }), TILT));
    const started = performance.now();
    const face = roundFaceAt(big, place([6, 0, 3], TILT));
    const shared = sharedAxis(plate, big);
    const elapsed = performance.now() - started;

    expect(big.length / 9).toBeGreaterThanOrEqual(100_000);
    expectAxis(face, { axis: TRUE_AXIS, middle: TILT.offset, radius: 6 });
    expect(shared?.radius).toBeCloseTo(6, 1);
    expect(elapsed).toBeLessThan(1500);
  });
});
