import { Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { forwardKinematics, type Rig, type V3 } from './kinematics';
import { humanoid } from './mocap.fixtures';
import { groundFeet } from './mocapGround';
import type { RetargetStep } from './retargeter';

function reference(rig: Rig, soles: Array<{ part: string; p: V3 }>, frames: RetargetStep[], near: number) {
  const ground = Math.min(...frames.map((frame) => frame.lowestAnkle));

  for (const { keyframe, lowestAnkle } of frames) {
    const posed = forwardKinematics(rig, keyframe);
    const low = Math.min(
      ...soles.map(
        (sole) => new Vector3(...sole.p).applyMatrix4(posed.joint.get(rig.ownerOf.get(sole.part)!) ?? posed.root).y,
      ),
    );

    if (low < 0 || lowestAnkle - ground < near)
      keyframe.root.position[1] = Math.round((keyframe.root.position[1] - low) * 10) / 10;
  }
}

function frames(rig: Rig, seed: number): RetargetStep[] {
  return Array.from({ length: 4 }, (_, index) => {
    const root = {
      position: [seed - 40, (index - 2) * 100, -seed] as V3,
      rotation: [seed, index * 15, -seed / 2] as V3,
    };
    const values = Object.fromEntries(rig.joints.map((joint, at) => [joint.id, Math.sin(seed + at + index) * 70]));

    return {
      keyframe: { t: index / 30, root, values },
      root,
      values,
      error: { leftAnkle: index },
      lowestAnkle: index * 10,
    };
  });
}

describe('motion clip grounding', () => {
  it('preserves grounded poses, root fallbacks and independent calls across changing clips', () => {
    const { rig } = humanoid();
    const owners = [...rig.ownerOf.keys()];

    for (let seed = 0; seed < 80; seed++) {
      const soles = [
        { part: owners[seed % owners.length], p: [seed, seed - 30, -seed] as V3 },
        { part: 'unowned', p: [-seed, 10, seed] as V3 },
      ];
      const input = frames(rig, seed);
      const expected = structuredClone(input);
      const actual = structuredClone(input);
      const savedSoles = structuredClone(soles);

      reference(rig, soles, expected, seed % 3 === 0 ? 0 : 10);
      groundFeet(rig, soles, actual, seed % 3 === 0 ? 0 : 10);
      expect(actual).toEqual(expected);
      expect(soles).toEqual(savedSoles);
      expect(input).toEqual(frames(rig, seed));
    }
  });

  it('preserves empty and nonfinite extrema and resolves each sole owner once per call', () => {
    const { rig } = humanoid();
    const soles = [{ part: 'unowned', p: [0, -0, 0] as V3 }];

    for (const height of [-0, Infinity, -Infinity, NaN]) {
      const input = frames(rig, 0);
      const expected = structuredClone(input);

      input[1].lowestAnkle = height;
      expected[1].lowestAnkle = height;
      reference(rig, soles, expected, 10);

      const readOwner = vi.spyOn(rig.ownerOf, 'get');

      groundFeet(rig, soles, input, 10);
      expect(readOwner).toHaveBeenCalledTimes(soles.length);
      readOwner.mockRestore();
      expect(input).toEqual(expected);
    }

    expect(() => groundFeet(rig, soles, [], 10)).not.toThrow();
  });
});
