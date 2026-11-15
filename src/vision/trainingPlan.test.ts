import { describe, expect, it } from 'vitest';
import { presetCase } from '../cases/testing';
import { jitteredWorld, worldRandom } from '../cases/caseRandom';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildRig } from '../utils/kinematics';
import { trainingImageClasses, trainingPlan, requestForImage, classForInstance } from './trainingPlan';

const robot = fixtureRobots().find((r) => r.id === 'arm-3dof')!;
const rig = buildRig(robot.joints, robot.parts);
const kase = presetCase(robot, 'touch-the-dots');
const views = [
  {
    key: 'wrist',
    label: 'Wrist',
    part: null,
    position: [0, 300, 500] as [number, number, number],
    target: [0, 0, 0] as [number, number, number],
    up: [0, 1, 0] as [number, number, number],
    fovDeg: 60,
    lens: { model: 'pinhole' as const, hfovDeg: 60 },
  },
];
const job = () => ({
  parts: robot.parts,
  rig,
  kase,
  sceneId: 'scene',
  model: null,
  views,
  count: 20,
  cameras: ['wrist'],
  classes: [],
  seed: 1,
});

describe('training image plans', () => {
  it('uses the Case jitter and repeats each frame seed with a deterministic camera', () => {
    const plan = trainingPlan(job());
    const request = requestForImage(plan, 7);
    const expected = jitteredWorld(kase, worldRandom(request.seed));

    expect(request).toEqual(requestForImage(trainingPlan(job()), 7));
    expect(request.key).toBe('wrist');
    expect(request.width).toBe(640);
    expect(request.height).toBe(480);
    expect(request.randomization?.objects?.[expected.world.objects[0].id]?.position).toEqual(
      expected.world.objects[0].position,
    );
    expect(new Set(Array.from({ length: 20 }, (_, i) => requestForImage(plan, i).seed)).size).toBe(20);
  });

  it('declares object names and kinds, color classes and robot links with named points', () => {
    const mug = {
      ...kase.world.objects[0],
      name: 'Mug',
      points: { handle: [20, 0, 0] as [number, number, number] },
      colors: [
        { name: 'ripe', color: '#ff0000' },
        { name: 'unripe', color: '#00ff00' },
      ],
    };
    const custom = { ...kase, world: { objects: [mug] } };
    const classes = trainingImageClasses(robot.parts, custom, rig);
    const plan = trainingPlan({ ...job(), kase: custom, classes: ['ripe', 'unripe'] });

    expect(classes.map((c) => c.name)).toEqual(expect.arrayContaining(['Mug', mug.kind, 'ripe', 'unripe']));
    expect(classes.find((c) => c.name === 'ripe')?.keypoints).toContain('handle');
    expect(requestForImage(plan, 0).keypoints.find((p) => p.name === 'handle')?.instance).toBe(mug.id);
    expect(classForInstance(plan, mug.id, { [mug.id]: 'ripe' })?.name).toBe('ripe');
    expect(classForInstance(plan, mug.id, {})).toBeNull();
    expect(trainingPlan(job()).keypoints.map((p) => p.name)).toEqual(
      expect.arrayContaining(robot.joints.map((j) => j.name)),
    );
  });

  it('keeps distractors unlabelled unless selected and uses the declared camera tolerance', () => {
    const distractor = { ...kase.world.objects[0], id: 'distractor', name: 'Distractor' };
    const custom = { ...kase, imageRandomization: { cameraTolerance: { mm: 2, deg: 1 }, distractors: [distractor] } };
    const plan = trainingPlan({ ...job(), kase: custom, classes: [kase.world.objects[0].name] });
    const request = requestForImage(plan, 0);

    expect(plan.world.some((p) => p.id === distractor.id)).toBe(true);
    expect(classForInstance(plan, distractor.id, {})).toBeNull();
    expect(request.randomization?.cameraPositionMm).toBe(2);
    expect(request.randomization?.cameraRotationDeg).toBe(1);
    expect(typeof request.randomization?.objects?.distractor?.visible).toBe('boolean');
  });

  it.each([
    { count: 0 },
    { count: 1001 },
    { count: 1.5 },
    { seed: -1 },
    { seed: NaN },
    { cameras: ['missing'] },
    { classes: ['missing'] },
    { cameras: [] },
  ])('refuses a request that cannot be rendered: %j', (patch) => {
    expect(() => trainingPlan({ ...job(), ...patch })).toThrow();
  });
});
