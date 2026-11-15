import { describe, expect, it } from 'vitest';
import type { LinkageSolution } from '../utils/linkage';
import { couplerCurve, fourBarPose, type PlacedFourBar, type Vec2 } from '../utils/linkageKinematics';
import { linkageFrame, linkageFrames, tracedPath, type LinkageFrame } from './linkageFrames';

const linkage = (): PlacedFourBar => ({
  origin: [31, -19],
  angle: 37,
  ground: 40,
  crank: 20,
  coupler: 50,
  rocker: 50,
  point: [100, -12],
});

const solution = (l: PlacedFourBar, crank: [number, number]): LinkageSolution => ({
  linkage: l,
  crank,
  maxErrorMm: 0,
  rmsErrorMm: 0,
  minTransmissionDeg: 20,
  grashof: 'crank-rocker',
});

function referenceFrame(l: PlacedFourBar, theta: number): LinkageFrame | null {
  const pose = fourBarPose(l, theta);

  if (!pose) return null;

  const angle = l.angle * (Math.PI / 180);
  const place = ([x, y]: Vec2): Vec2 => [
    l.origin[0] + x * Math.cos(angle) - y * Math.sin(angle),
    l.origin[1] + x * Math.sin(angle) + y * Math.cos(angle),
  ];
  const [a, b, c, d, p] = [[0, 0] as Vec2, pose.b, pose.c, [l.ground, 0] as Vec2, pose.p].map(place);

  return { bars: [a, b, c, d, a], plate: [b, c, p, b], point: p };
}

function countedPlacement(l: PlacedFourBar) {
  let reads = 0;
  const counted = new Proxy(l, {
    get(target, key, receiver) {
      if (key === 'angle') reads++;

      return Reflect.get(target, key, receiver);
    },
  });

  return { linkage: counted, reads: () => reads };
}

describe('four-bar sampling', () => {
  it.each([
    [0, 360],
    [270, -90],
    [40, 40],
  ])('keeps placed curve coordinates from %s to %s with one placement', (from, to) => {
    const l = linkage();
    const saved = structuredClone(l);
    const counted = countedPlacement(l);
    const expected = Array.from({ length: 721 }, (_, i) => referenceFrame(l, from + ((to - from) * i) / 720)!.point);

    expect(couplerCurve(counted.linkage, from, to, 720)).toEqual(expected);
    expect(counted.reads()).toBe(1);
    expect(l).toEqual(saved);
  });

  it('shares placement across all preview frames and preserves the return sweep', () => {
    const l = linkage();
    const counted = countedPlacement(l);
    const expected = Array.from({ length: 61 }, (_, i) => referenceFrame(l, 30 + (240 * i) / 60)!);

    expect(linkageFrames(solution(counted.linkage, [30, 270]), 60)).toEqual([
      ...expected,
      ...expected.slice(1, -1).reverse(),
    ]);
    expect(counted.reads()).toBe(1);
    expect(linkageFrame(solution(l, [30, 270]), 87)).toEqual(referenceFrame(l, 87));
  });

  it('omits unclosed poses from curves and previews', () => {
    const l = { ...linkage(), ground: 80, coupler: 40, rocker: 40 };
    const expected = Array.from({ length: 25 }, (_, i) => referenceFrame(l, i * 15)).filter(
      (frame): frame is LinkageFrame => frame !== null,
    );

    expect(expected.length).toBeGreaterThan(0);
    expect(expected.length).toBeLessThan(25);
    expect(tracedPath(solution(l, [0, 360]), 24)).toEqual(expected.map((frame) => frame.point));
    expect(linkageFrames(solution(l, [0, 360]), 24)).toEqual([...expected, ...expected.slice(1, -1).reverse()]);
    expect(linkageFrame(solution(l, [0, 360]), 180)).toBeNull();
  });

  it('reads edits afresh on the next sampling operation', () => {
    const l = linkage();
    const first = couplerCurve(l, 0, 90, 4);

    l.angle = -53;
    l.origin = [-14, 28];

    const expected = Array.from({ length: 5 }, (_, i) => referenceFrame(l, (90 * i) / 4)!.point);

    expect(couplerCurve(l, 0, 90, 4)).toEqual(expected);
    expect(tracedPath(solution(l, [0, 90]), 4)).toEqual(expected);
    expect(expected).not.toEqual(first);
    expect(linkageFrames(solution(l, [0, 90]), 4)[0]).toEqual(referenceFrame(l, 0));
  });
});
