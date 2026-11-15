import { afterEach, describe, expect, it, vi } from 'vitest';
import { ARM_TOOL, armTemplate } from '../../electron/cad-mcp/recipes/templates.mjs';
import { anglesTo, armTool, innerRange, planarReach, type ArmAngles, type ArmShape } from './armReach';

afterEach(() => vi.restoreAllMocks());

const SHAPE: ArmShape = { links: [90, 200, 150], baseHeight: 20, base: [10, -30, 5], yaw: 30 };
const POSES = [-50, 0, 50].flatMap((shoulder) =>
  [-80, 20, 80].flatMap((elbow) =>
    [-40, 0, 40].map((wrist) => ({
      base_yaw: 20,
      shoulder_pitch: shoulder,
      elbow_pitch: elbow,
      wrist_pitch: wrist,
    })),
  ),
);

describe('analytic arm reach', () => {
  it.each([
    { at: [300, 100], pitches: [-12.617839515386512, 74.5066411001553, -43.45385276184675] },
    { at: [200, -200], pitches: [-4.105424573630004, -87.37453651101362, 8.479961084643605] },
    { at: [300, -200], pitches: [-52.57195262987188, 44.44410794451063, -25.56222284061846] },
  ])('keeps the first admissible branch for $at', ({ at, pitches }) => {
    const result = planarReach(at[0], at[1], 200, 150);

    expect(result).not.toBeNull();
    expect(result!.shoulder_pitch).toBeCloseTo(pitches[0], 10);
    expect(result!.elbow_pitch).toBeCloseTo(pitches[1], 10);
    expect(result!.wrist_pitch).toBeCloseTo(pitches[2], 10);
  });

  it('recovers generated tool targets inside every joint limit without changing the shape', () => {
    const original = structuredClone(SHAPE);
    let reached = 0;

    for (const pose of POSES) {
      const target = armTool(SHAPE, pose);
      const result = anglesTo(SHAPE, target);

      expect(result).not.toBeNull();

      const actual = armTool(SHAPE, result!);

      actual.forEach((value, k) => expect(value).toBeCloseTo(target[k], 9));

      for (const joint of armTemplate().joints) {
        const [lo, hi] = innerRange(joint.range);
        const angle = result![joint.id as keyof ArmAngles];

        expect(angle).toBeGreaterThanOrEqual(lo + 0.5);
        expect(angle).toBeLessThanOrEqual(hi - 0.5);
      }

      reached++;
    }

    expect(reached).toBe(27);
    expect(SHAPE).toEqual(original);
  });

  it('shares the bend and shoulder offset when the negative branch is needed', () => {
    const acos = vi.spyOn(Math, 'acos');
    const atan2 = vi.spyOn(Math, 'atan2');
    const result = planarReach(0, -300, 200, 150);

    expect(result?.elbow_pitch).toBeLessThan(0);
    expect(acos).toHaveBeenCalledTimes(1);
    expect(atan2).toHaveBeenCalledTimes(3);
  });

  it('rejects elbow limits before evaluating shoulders', () => {
    const acos = vi.spyOn(Math, 'acos');
    const atan2 = vi.spyOn(Math, 'atan2');

    expect(planarReach(100, 0, 200, 150)).toBeNull();
    expect(acos).toHaveBeenCalled();
    expect(atan2).toHaveBeenCalledTimes(1);
  });

  it.each([
    [400, 0],
    [0, 0],
    [200, 100],
    [Number.NaN, 0],
    [0, Number.POSITIVE_INFINITY],
  ])('refuses unreachable or nonfinite coordinates %s, %s', (u, w) => {
    expect(planarReach(u, w, 200, 150)).toBeNull();
  });

  it('keeps a straight elbow at full extension and refuses a point beyond it', () => {
    const reach = 200 + 150 + ARM_TOOL.x;

    expect(planarReach(reach, 0, 200, 150)).toEqual({ shoulder_pitch: 0, elbow_pitch: 0, wrist_pitch: 0 });
    expect(planarReach(reach + 0.001, 0, 200, 150)).toBeNull();
  });
});
