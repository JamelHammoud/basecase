import { describe, expect, it } from 'vitest';
import type { V3 } from './kinematics';
import { autoMapBones, KEYPOINTS, parseBvh, retarget, type Keypoint, type Mocap } from './mocap';
import { humanoid, walkBvh } from './mocap.fixtures';
import { createRetargeter, type HumanFrame, type RetargetStep } from './retargeter';

const mocap = () => parseBvh(walkBvh(), 'Walk');

function keypointFrame(m: Mocap, pos: Map<string, { x: number; y: number; z: number }>): Record<string, V3> {
  const bones = autoMapBones(m);
  const out: Record<string, V3> = {};

  for (const k of KEYPOINTS) {
    const p = bones[k] && pos.get(bones[k]);

    if (p) out[k] = [p.x, p.y, p.z];
  }

  return out;
}

const timesOf = (m: Mocap, n = 15) => Array.from({ length: n }, (_, f) => (f / (n - 1)) * m.duration);

const without = (frame: HumanFrame, k: Keypoint): HumanFrame =>
  Object.fromEntries(Object.entries(frame).filter(([n]) => n !== k));

const LEGS = /hip|knee|ankle/;

const ARM = (side: string) => new RegExp(`^${side}_(shoulder|elbow|wrist)`);

describe('createRetargeter', () => {
  it('steps a clip frame by frame to the batch keyframes', () => {
    const { rig, pointOf } = humanoid();
    const m = mocap();
    const batch = retarget(m, rig, pointOf);
    const rt = createRetargeter({ rig, pointOf, rest: keypointFrame(m, m.rest) });
    const steps = timesOf(m).map((t, f) => rt.step(keypointFrame(m, m.sample(t)), f / 30, m.rootQuaternion(t))!);

    if (typeof batch === 'string') throw new Error(batch);

    expect(steps.map((s) => s.keyframe.values)).toEqual(batch.animation.keyframes.map((k) => k.values));
    expect(steps.map((s) => s.keyframe.t)).toEqual(batch.animation.keyframes.map((k) => k.t));
    expect(steps.map((s) => s.root.rotation)).toEqual(batch.animation.keyframes.map((k) => k.root!.rotation));
  });

  it('moves only the arms, waist and head for an upper body', () => {
    const { rig, pointOf } = humanoid();
    const m = mocap();
    const rt = createRetargeter({ rig, pointOf, rest: keypointFrame(m, m.rest), upperBody: true });
    const first = rt.step(keypointFrame(m, m.sample(0)), 0)!;
    const steps = timesOf(m).map((t) => rt.step(keypointFrame(m, m.sample(t)), t)!);
    const legs = rig.joints.map((j) => j.id).filter((id) => LEGS.test(id));

    expect(legs).toHaveLength(12);
    expect(first.values.left_knee_joint).toBe(20);

    for (const s of steps) {
      expect(s.root).toEqual({ position: [0, 0, 0], rotation: [0, 0, 0] });

      for (const id of legs) expect(s.values[id]).toBe(first.values[id]);
    }

    const elbows = new Set(steps.map((s) => s.keyframe.values.left_elbow_joint));

    expect(elbows.size).toBeGreaterThan(5);
  });

  it('holds the right arm while the right wrist is missing', () => {
    const { rig, pointOf } = humanoid();
    const m = mocap();
    const rt = createRetargeter({ rig, pointOf, rest: keypointFrame(m, m.rest) });
    const [a, b, c] = [0, 0.2, 0.4].map((t) => keypointFrame(m, m.sample(t)));
    const before = rt.step(a, 0)!;
    const held = rt.step(without(b, 'rightWrist'), 0.2)!;
    const back: RetargetStep = rt.step(c, 0.4)!;
    const right = rig.joints.map((j) => j.id).filter((id) => ARM('right').test(id));
    const left = rig.joints.map((j) => j.id).filter((id) => ARM('left').test(id));

    expect(right).toHaveLength(7);

    for (const id of right) expect(held.values[id]).toBe(before.values[id]);

    expect(left.some((id) => held.values[id] !== before.values[id])).toBe(true);
    expect(right.some((id) => back.values[id] !== held.values[id])).toBe(true);
  });

  it('calibrates a live source on its first steady frames', () => {
    const { rig, pointOf } = humanoid();
    const m = mocap();
    const scale = (f: Record<string, V3>, wobble: number): HumanFrame =>
      Object.fromEntries(Object.entries(f).map(([k, p]) => [k, [p[0] / 100 + wobble, p[1] / 100, p[2] / 100] as V3]));
    const stand = keypointFrame(m, m.rest);
    const rt = createRetargeter({ rig, pointOf, restFrames: 5 });

    expect(rt.step(scale(stand, 0), 0)).toBeNull();
    expect(rt.step(scale(stand, 0.5), 0.03)).toBeNull();

    const waiting = [0.001, -0.001, 0.002, 0, 0.001].map((w, i) => rt.step(scale(stand, w), 0.06 + i * 0.03));

    expect(waiting.slice(0, 4)).toEqual([null, null, null, null]);
    expect(waiting[4]).not.toBeNull();
    expect(rt.body()!.scale).toBeGreaterThan(500);

    const moving = rt.step(scale(keypointFrame(m, m.sample(0.25)), 0), 0.3)!;

    expect(moving.values.left_elbow_joint).not.toBe(waiting[4]!.values.left_elbow_joint);
  });

  it('turns the body by the hips when a live source has no root rotation', () => {
    const { rig, pointOf } = humanoid();
    const m = mocap();
    const stand = keypointFrame(m, m.rest);
    const turn = (deg: number): HumanFrame => {
      const [c, s] = [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];

      return Object.fromEntries(
        Object.entries(stand).map(([k, p]) => [k, [c * p[0] + s * p[2], p[1], c * p[2] - s * p[0]] as V3]),
      );
    };
    const rt = createRetargeter({ rig, pointOf, rest: stand });
    const yaw = (f: HumanFrame, t: number) => rt.step(f, t)!.root.rotation.map((v) => v + 0);

    expect(yaw(turn(0), 0)).toEqual([0, 0, 0]);
    expect(yaw(turn(30), 0.03)).toEqual([0, 30, 0]);
    expect(yaw(without(turn(45), 'hips'), 0.06)).toEqual([0, 30, 0]);
  });
});
