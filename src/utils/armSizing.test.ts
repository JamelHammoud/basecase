import { describe, expect, it } from 'vitest';
import { buildSkeleton } from '../agent/skeleton';
import type { ZUpVec } from '../types/skeleton';
import { ratingAt } from './actuatorRules';
import { jointVerdict } from './actuatorSizing';
import { innerRange, reachTargets, REACH_MM } from './armReach';
import { armShapes, armTargets, shapedSkeleton, shapeReaches, sizeArm, type SizedArm } from './armSizing';
import { actuatorSpec } from './skeletonMargins';
import { skeletonSizing } from './skeletonSizing';

const DESK: ZUpVec[] = [
  [0, -260, 0],
  [150, -200, 160],
  [-130, -170, 60],
];

function sized(targets: ZUpVec[], payloadG: number): SizedArm {
  const result = sizeArm({ targets, payloadG });

  if (!result.ok) throw new Error(`no arm: ${JSON.stringify(result)}`);

  return result.arm;
}

const total = (s: SizedArm['shape']) => s.upperArm + s.forearm + s.riser;

describe('sizeArm', () => {
  const arm = sized(DESK, 200);
  const skeleton = buildSkeleton(arm.skeleton).skeleton;

  it('reaches every target within 2 mm, with every joint at least 10% inside its range', () => {
    const reached = reachTargets(skeleton, DESK);

    expect(reached.map((r) => r.errorMm).every((e) => e <= REACH_MM)).toBe(true);
    expect(arm.errorsMm.every((e) => e <= REACH_MM)).toBe(true);

    for (const pose of arm.poses)
      for (const j of skeleton.joints) {
        const [lo, hi] = innerRange(j.range!);

        expect(pose[j.id]).toBeGreaterThanOrEqual(lo - 1e-6);
        expect(pose[j.id]).toBeLessThanOrEqual(hi + 1e-6);
      }
  });

  it('is the shortest link set on the 5 mm grid that reaches them', () => {
    const { options } = armTargets({ targets: DESK, payloadG: 200 });
    const shorter: SizedArm['shape'][] = [];

    for (const s of armShapes()) {
      if (total(s) >= total(arm.shape)) break;

      shorter.push(s);
    }

    expect(shorter.length).toBeGreaterThan(0);
    expect(shorter.filter((s) => shapeReaches(options, s, 0.25))).toEqual([]);

    const neighbours = [
      { ...arm.shape, upperArm: arm.shape.upperArm - 5 },
      { ...arm.shape, forearm: arm.shape.forearm - 5 },
      { ...arm.shape, riser: arm.shape.riser - 5 },
    ].filter((s) => s.upperArm >= 75 && s.forearm >= 75 && s.riser >= 0);

    for (const shape of neighbours) {
      const near = buildSkeleton(shapedSkeleton(shape, arm)).skeleton;

      expect(Math.max(...reachTargets(near, DESK).map((r) => r.errorMm))).toBeGreaterThan(REACH_MM);
    }
  });

  it('picks a servo per joint that passes its load at the supply voltage', () => {
    const input = skeletonSizing(skeleton);

    if (typeof input === 'string') throw new Error(input);

    expect(arm.picks).toHaveLength(skeleton.joints.length);

    for (const pick of arm.picks) {
      const joint = input.joints.find((j) => j.id === pick.joint)!;

      expect(jointVerdict(joint, joint, actuatorSpec(pick.servo)!, arm.volts).status).toBe('pass');
    }
  });

  it('never picks a weaker shoulder servo for twice the payload', () => {
    const shoulderNm = (a: SizedArm) => {
      const pick = a.picks.find((p) => p.joint === 'shoulder_pitch')!;

      return ratingAt(actuatorSpec(pick.servo)!, a.volts).stallNm;
    };

    for (const grams of [100, 200])
      expect(shoulderNm(sized(DESK, grams * 2))).toBeGreaterThanOrEqual(shoulderNm(sized(DESK, grams)));
  });

  it('returns no arm for a target 2 m away, and names it', () => {
    const far: ZUpVec[] = [DESK[0], [0, -2000, 100], DESK[2]];

    expect(sizeArm({ targets: far, payloadG: 200 })).toEqual({
      ok: false,
      reason: 'reach',
      target: 1,
      distanceMm: 2002,
    });
  });

  it('gives the same arm for the same input', () => {
    expect(sized(DESK, 200)).toEqual(arm);
  });
});
