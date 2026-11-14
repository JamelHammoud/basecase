import { describe, expect, it } from 'vitest';
import { toScene } from '../agent/agentFrame';
import { portsOf, worldPort } from '../agent/ports';
import type { ScenePart } from '../types/robotics';
import type { RobotSkeleton } from '../types/skeleton';
import { waveBvh } from '../utils/mocap.fixtures';
import { servoShortfall } from '../utils/motionServos';
import { planarArmBvh } from '../utils/motionSkeleton.fixtures';
import { skeletonFromMotionRequest, type MotionPayload } from './agentMotion';
import { fitBvh } from './motionFitOps';

function run(payload: MotionPayload) {
  const placed: Array<{ parts: ScenePart[]; skeleton: RobotSkeleton }> = [];
  const reply = skeletonFromMotionRequest(payload, {
    solve: async (request) => fitBvh(request),
    parts: () => [],
    skeleton: () => undefined,
    place: (parts, skeleton) => placed.push({ parts, skeleton }),
  });

  return reply.then(({ text }) => ({ text, placed }));
}

const distanceToLine = (p: number[], at: number[], axis: number[]) => {
  const d = p.map((v, k) => v - at[k]);
  const along = d.reduce((s, v, k) => s + v * axis[k], 0);

  return Math.sqrt(Math.max(0, d.reduce((s, v) => s + v * v, 0) - along * along));
};

describe('skeleton_from_motion', () => {
  it('places the fitted skeleton and a servo on each joint axis, and reports them', async () => {
    const { text, placed } = await run({ text: waveBvh(), file: 'evidence/wave.bvh', height_mm: 300 });
    const [{ parts, skeleton }] = placed;

    expect(skeleton.joints.map((j) => j.id)).toEqual(['right_shoulder_roll', 'right_elbow_roll']);
    expect(parts.map((p) => p.frame)).toEqual(skeleton.joints.map((j) => j.id));
    expect(parts.every((p) => p.kind === 'component' && p.group?.name === 'wave')).toBe(true);

    for (const [i, part] of parts.entries()) {
      const joint = skeleton.joints[i];
      const output = worldPort(
        part,
        portsOf(part).find((p) => p.kind === 'output')!,
      );
      const axis = toScene(joint.axis);

      expect(distanceToLine(output.position, toScene(joint.origin), axis)).toBeLessThan(0.5);
      expect(Math.abs(output.axis.reduce((s, v, k) => s + v * axis[k], 0))).toBeCloseTo(1, 3);
      expect(joint.actuator).toBe(
        `component:${part.componentId}${part.componentVariant ? `|${part.componentVariant}` : ''}`,
      );
    }

    expect(text).toMatch(/^Fitted 2 joints to wave at 300 mm tall, every limb within 3 mm/);
    expect(text).toMatch(/right_elbow_roll \(Right hand, on right_shoulder_roll\): range −\d/);
    expect(text).toMatch(/Servos \$\d+\.\d\d/);
    expect(text).toMatch(/Still in the clip, so no joints: .*Left hand/);
  });

  it('places nothing and names the limb when the tolerance is out of reach', async () => {
    const { text, placed } = await run({ text: planarArmBvh(), name: 'Arm', height_mm: 290, tolerance_mm: 1e-6 });

    expect(text).toMatch(/^No skeleton: Tip can’t follow the clip within/);
    expect(placed).toEqual([]);
  });

  it('lists the clip’s limbs when no name in limbs matches one', async () => {
    const { text, placed } = await run({ text: waveBvh(), name: 'wave', height_mm: 300, limbs: ['Tail'] });

    expect(text).toMatch(/^No skeleton: No limb in wave is named Tail\. Its limbs are .*Right hand/);
    expect(placed).toEqual([]);
  });

  it('names the joints no servo carries, and says when no servo set fits', () => {
    const servos = { keys: {}, names: {}, volts: 7.4, rail: '2S', servosUsd: 0, costUsd: 0, failing: [] };

    expect(servoShortfall(servos)).toBeNull();
    expect(servoShortfall({ ...servos, failing: ['Elbow', 'Wrist'] })).toBe(
      'No servo is fast or strong enough for Elbow, Wrist.',
    );
    expect(servoShortfall(null)).toMatch(/none were placed/);
  });

  it('asks for a height, a tolerance and a clip it can read', async () => {
    expect((await run({ text: waveBvh() })).text).toMatch(/^Give height_mm/);
    expect((await run({ text: waveBvh(), height_mm: 300, tolerance_mm: 0 })).text).toMatch(/^Give tolerance_mm/);
    expect((await run({ height_mm: 300 })).text).toMatch(/^Give the BVH/);
    expect((await run({ text: 'HIERARCHY', name: 'Broken', height_mm: 300 })).text).toMatch(
      /^No skeleton: Couldn’t read Broken/,
    );
  });
});
