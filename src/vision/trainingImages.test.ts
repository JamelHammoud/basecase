import { describe, expect, it } from 'vitest';
import { presetCase } from '../cases/testing';
import { fixtureRobots } from '../sim/fixtures/robots';
import { cameraViews } from '../cameras/views';
import { buildRig } from '../utils/kinematics';
import { decodeMask } from './imageMasks';
import { labelledFrame } from './trainingImages';
import { trainingPlan } from './trainingPlan';

const robot = fixtureRobots().find((r) => r.id === 'arm-3dof')!;
const kase = presetCase(robot, 'touch-the-dots');
const rig = buildRig(robot.joints, robot.parts);
const plan = trainingPlan({
  parts: robot.parts,
  rig,
  kase,
  sceneId: 'scene',
  model: null,
  views: cameraViews(robot.parts, []),
  count: 500,
  cameras: ['scene'],
  classes: [kase.world.objects[0].name],
  seed: 7,
});
const instance = kase.world.objects[0].id;
const raw = () => ({
  width: 4,
  height: 3,
  jpeg: new Uint8Array([255, 216, 255, 217]),
  depth: new Float32Array(12).fill(500),
  instanceIds: new Uint32Array([0, 0, 0, 0, 0, 1, 1, 2, 0, 1, 0, 2]),
  instances: [
    { id: 1, instance },
    { id: 2, instance: 'occluder' },
    { id: 3, instance: 'hidden' },
  ],
  variants: {},
  keypoints: [],
});

describe('labelled training frame assembly', () => {
  it('uses visible pixels only, omits occluders and hidden instances, and hashes all labels and image bytes', async () => {
    const first = await labelledFrame(plan, 0, raw());
    const again = await labelledFrame(plan, 0, raw());

    expect(first).toEqual(again);
    expect(first.annotations).toHaveLength(1);
    expect(first.annotations[0].box).toEqual([1, 1, 2, 2]);
    expect([...decodeMask(first.annotations[0].mask)]).toEqual([0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0, 0]);

    const changed = raw();

    changed.depth[5] += 1;
    expect((await labelledFrame(plan, 0, changed)).id).not.toBe(first.id);
    expect((await labelledFrame(plan, 1, raw())).id).not.toBe(first.id);
  });

  it('keeps color class and named keypoints on the same instance', async () => {
    const object = {
      ...kase.world.objects[0],
      points: { handle: [1, 0, 0] as [number, number, number] },
      colors: [
        { name: 'ripe', color: '#ff0000' },
        { name: 'unripe', color: '#00ff00' },
      ],
    };
    const colored = trainingPlan({
      ...plan,
      cameras: plan.views.map((view) => view.key),
      rig,
      kase: { ...kase, world: { objects: [object] } },
      classes: ['ripe', 'unripe'],
    });
    const frame = await labelledFrame(colored, 0, {
      ...raw(),
      variants: { [instance]: 'ripe' },
      keypoints: [{ instance, name: 'handle', x: 1.5, y: 1.5, visible: true }],
    });

    expect(colored.classes.find((c) => c.id === frame.annotations[0].classId)?.name).toBe('ripe');
    expect(frame.annotations[0].keypoints).toEqual([{ name: 'handle', x: 1.5, y: 1.5, visible: true }]);
  });
});
