import { describe, expect, it } from 'vitest';
import type { ScenePart } from '../types/robotics';
import type { RobotSkeleton } from '../types/skeleton';
import { waveBvh } from '../utils/mocap.fixtures';
import { designFromMotion } from '../utils/motionDesign';
import { skeletonFromMotionRequest, type MotionPayload } from './agentMotion';

function run(payload: MotionPayload, parts: ScenePart[] = []) {
  const placed: Array<{ parts: ScenePart[]; skeleton: RobotSkeleton }> = [];
  const reply = skeletonFromMotionRequest(payload, {
    solve: async ({ clip, request }) => designFromMotion(clip, request),
    parts: () => parts,
    skeleton: () => undefined,
    place: (next, skeleton) => placed.push({ parts: next, skeleton }),
  });

  return reply.then(({ text }) => ({ text, placed }));
}

describe('skeleton_from_motion', () => {
  it('places the fitted skeleton and a servo per joint, framed to it, and reports them', async () => {
    const { text, placed } = await run({ text: waveBvh(), name: 'Wave', height_mm: 300 });
    const [{ parts, skeleton }] = placed;

    expect(skeleton.joints.length).toBeGreaterThanOrEqual(2);
    expect(skeleton.joints.every((j) => j.id.startsWith('right_') && j.actuator && j.range)).toBe(true);
    expect(parts.map((p) => p.frame)).toEqual(skeleton.joints.map((j) => j.id));
    expect(parts.map((p) => p.componentId)).toEqual(skeleton.joints.map((j) => j.actuator!.split('|')[0].slice(10)));
    expect(text).toMatch(new RegExp(`^Fitted ${skeleton.joints.length} joints to Wave at 300 mm tall`));
    expect(text).toMatch(/- right_arm: right_shoulder_\w+, .*within \d/);
    expect(text).toMatch(/- left_arm: holds still, no joints/);
    expect(text).toMatch(/Servos at \d+(\.\d)? V from .+: \$\d+\.\d\d/);
  });

  it('keeps the scene’s parts and gives the servos ids the scene doesn’t use', async () => {
    const { placed } = await run({ text: waveBvh(), height_mm: 300 }, [
      { id: 'right_shoulder_roll-servo' } as ScenePart,
    ]);
    const ids = placed[0].parts.map((p) => p.id);

    expect(ids[0]).toBe('right_shoulder_roll-servo');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('names the limb a tolerance can’t hold and places nothing', async () => {
    const { text, placed } = await run({ text: waveBvh(), height_mm: 300, tolerance_mm: 0.01 });

    expect(text).toBe('No skeleton keeps the right arm within 0.01 mm of its path.');
    expect(placed).toEqual([]);
  });

  it('asks for a height and a clip it can read', async () => {
    expect((await run({ text: waveBvh() })).text).toMatch(/^Give height_mm from 50 to 3000/);
    expect((await run({ text: 'HIERARCHY nonsense', height_mm: 300 })).text).toMatch(/^Couldn’t read the BVH:/);
    expect((await run({ height_mm: 300 })).text).toBe('Give the BVH as an evidence path or a URL.');
  });
});
