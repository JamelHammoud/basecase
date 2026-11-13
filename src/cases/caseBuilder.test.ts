import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildRig } from '../utils/kinematics';
import {
  buildCase,
  builderRobot,
  caseName,
  goalOf,
  goalsFor,
  goalValues,
  presetsFor,
  worldsFor,
  type CaseSpec,
} from './caseBuilder';
import type { Case } from './schema';
import { parseCase, presetCase, runCase, touchTheDots } from './testing';

const fixture = (id: string) => fixtureRobots().find((r) => r.id === id)!;

const robotOf = (id: string) => {
  const r = fixture(id);

  return builderRobot(buildRig(r.joints, r.parts), r.parts);
};

const goalValuesOf = (id: string) => goalValues(goalOf('touch')!, robotOf(id));

function built(id: string, spec: CaseSpec): Case {
  const result = buildCase(spec, robotOf(id));

  if (!result.ok) throw new Error(result.problem);

  return result.kase;
}

describe('the Case builder', () => {
  it('offers only the goals a robot can try', () => {
    expect(goalsFor(robotOf('arm-3dof')).map((g) => g.kind)).toEqual(['touch']);
    expect(goalsFor(robotOf('rover-diff')).map((g) => g.kind)).toEqual(['reach', 'push', 'path']);
    expect(goalsFor(robotOf('hexapod')).map((g) => g.kind)).toEqual(['reach', 'push', 'path', 'walk']);
  });

  it('offers the worlds that suit each goal', () => {
    expect(worldsFor('touch').map((w) => w.kind)).toEqual(['floor', 'shelf']);
    expect(worldsFor('reach').map((w) => w.kind)).toEqual(['floor', 'corridor', 'block']);
    expect(worldsFor('walk').map((w) => w.kind)).toEqual(['floor', 'corridor', 'block']);
  });

  it('builds every goal in every world it suits, and each one passes the Case validator', () => {
    for (const id of ['arm-6dof', 'rover-four', 'hexapod']) {
      const robot = robotOf(id);

      for (const goal of goalsFor(robot))
        for (const world of worldsFor(goal.kind)) {
          const kase = built(id, { goal: goal.kind, world: world.kind });

          expect(parseCase(JSON.parse(JSON.stringify(kase)))).toEqual(JSON.parse(JSON.stringify(kase)));
          expect(kase.reference.timeline.length).toBeGreaterThan(0);
        }
    }
  });

  it('names a Case from its goal and world unless given a name', () => {
    expect(caseName('push', 'corridor')).toBe('Push a Box in a Corridor');
    expect(built('rover-diff', { goal: 'reach', world: 'floor' })).toMatchObject({
      id: 'reach-a-spot',
      name: 'Reach a Spot',
      brief: 'Reach the spot 900 mm ahead and stop on it.',
    });
    expect(built('rover-diff', { goal: 'reach', world: 'block', name: '  Dodge It ' }).name).toBe('Dodge It');
  });

  it('uses the numbers it is given, clamped to their range', () => {
    const path = built('rover-diff', { goal: 'path', world: 'floor', values: { stops: 5, spacingMm: 400 } });
    const far = built('rover-diff', { goal: 'reach', world: 'floor', values: { distanceMm: 1e9, seconds: -4 } });

    expect(path.world.objects).toHaveLength(5);
    expect(path.task.probes.map((p) => p.signal)).toEqual(['spot0', 'spot1', 'spot2', 'spot3', 'spot4']);
    expect(path.world.objects[1].position[2] - path.world.objects[0].position[2]).toBeCloseTo(400);
    expect(far.world.objects[0].position[2]).toBe(robotOf('rover-diff').pivot[2] + 5000);
    expect(far.task.seconds).toBe(2);
  });

  it('puts walls and blocks clear of the robot, and a shelf under the point', () => {
    const corridor = built('rover-four', { goal: 'push', world: 'corridor' });
    const shelf = built('arm-6dof', { goal: 'touch', world: 'shelf', values: { heightMm: 200 } });

    expect(corridor.world.objects.map((o) => o.id)).toEqual(['box', 'goal', 'wall-left', 'wall-right']);
    expect(corridor.world.objects.find((o) => o.id === 'box')?.behavior).toBe('dynamic');
    expect(shelf.world.objects.map((o) => o.id)).toEqual(['point', 'shelf']);
    expect(shelf.world.objects[1].size[1]).toBeLessThan(200);
  });

  it('refuses a goal the robot cannot try, and a point out of reach, with the fix', () => {
    const arm = robotOf('arm-3dof');
    const wrong = buildCase({ goal: 'reach', world: 'floor' }, arm);
    const far = buildCase({ goal: 'touch', world: 'floor', values: { distanceMm: 3000 } }, arm);

    expect(wrong).toEqual({ ok: false, problem: expect.stringMatching(/touch/) });
    expect(far).toEqual({ ok: false, problem: expect.stringMatching(/^Bring the point within \d+ mm/) });
  });

  it('fails a legged robot that falls, whatever its goal', () => {
    const reach = built('hexapod', { goal: 'reach', world: 'floor' });
    const rover = built('rover-diff', { goal: 'reach', world: 'floor' });

    expect(reach.task.contract.failures.map((f) => f.label)).toEqual(['fell']);
    expect(reach.task.probes.map((p) => p.signal)).toEqual(['spot', 'height']);
    expect(rover.task.contract.failures).toEqual([]);
  });
});

describe('presets and dots', () => {
  it('fits each preset only to robots that can try its goal', () => {
    expect(presetsFor(robotOf('arm-3dof'))).toEqual(['touch-the-dots']);
    expect(presetsFor(robotOf('rover-diff'))).toEqual(['reach-the-flag']);
    expect(presetsFor(robotOf('hexapod'))).toEqual(['reach-the-flag']);
  });

  it('touches several dots in order when Touch a Point is given a dot count', () => {
    const one = built('arm-6dof', { goal: 'touch', world: 'floor' });
    const three = built('arm-6dof', { goal: 'touch', world: 'floor', values: { dots: 3 } });
    const radius = Math.round(Math.max(12, robotOf('arm-6dof').facts.reachMm * 0.08));
    const { sequence } = three.task.contract.success as { sequence: Array<{ hold_for: unknown }> };

    expect(one.world.objects.map((o) => o.id)).toEqual(['point']);
    expect(three).toMatchObject({
      id: 'touch-the-dots',
      name: 'Touch the Dots',
      brief: 'Touch each dot in order with the end effector.',
      task: { seconds: 6 },
    });
    expect(three.world.objects.map((o) => [o.id, o.name, o.size[0]])).toEqual([
      ['dot0', 'Dot 1', radius * 2],
      ['dot1', 'Dot 2', radius * 2],
      ['dot2', 'Dot 3', radius * 2],
    ]);
    expect(three.reference.timeline).toEqual(
      three.world.objects.map((o, i) => ({ at: expect.closeTo(0.2 + i * 1.8), target: o.position })),
    );
    expect(sequence.map((step) => step.hold_for)).toEqual(
      ['dot0', 'dot1', 'dot2'].map((signal) => ({
        seconds: 0.2,
        within: 'whole',
        state: { atom: { expr: { signal }, cmp: '<', value: radius, scale: radius } },
      })),
    );
    expect(caseName('touch', 'shelf', { ...goalValuesOf('arm-6dof'), dots: 2 })).toBe('Touch the Dots on a Shelf');
  });

  it('asks for fewer dots than the arm can reach', () => {
    const arm = { ...robotOf('arm-6dof') };

    arm.armSpots = arm.armSpots.slice(0, 2);
    expect(buildCase({ goal: 'touch', world: 'floor', values: { dots: 3 } }, arm)).toEqual({
      ok: false,
      problem: 'Set Dots to 2 or fewer.',
    });
  });

  it('reaches the flag as Reach a Spot on open floor: 900 mm ahead, within 160 mm for 0.3 s', () => {
    for (const [id, seconds] of [
      ['rover-diff', 8],
      ['hexapod', 14],
    ] as const) {
      const [x, y, z] = robotOf(id).pivot;
      const kase = built(id, { goal: 'reach', world: 'floor' });

      expect(kase.world.objects).toEqual([
        expect.objectContaining({ id: 'spot', kind: 'cylinder', position: [x, Math.max(y, 40), z + 900] }),
      ]);
      expect(kase.world.objects[0].size[0]).toBe(320);
      expect(kase.reference.timeline).toEqual([{ at: 0.5, target: [x, y, z + 900] }]);
      expect(kase.task.seconds).toBe(seconds);
      expect(kase.task.contract.success).toEqual({
        hold_for: {
          seconds: 0.3,
          within: 'whole',
          state: { atom: { expr: { signal: 'spot' }, cmp: '<', value: 160, scale: 160 } },
        },
      });
    }
  });
});

describe('a built Case in MuJoCo', () => {
  it.each([
    { preset: 'touch-the-dots', id: 'arm-3dof' },
    { preset: 'touch-the-dots', id: 'arm-6dof' },
    { preset: 'reach-the-flag', id: 'rover-diff' },
    { preset: 'reach-the-flag', id: 'rover-four' },
    { preset: 'reach-the-flag', id: 'hexapod' },
    { preset: 'reach-the-flag', id: 'quad-servo' },
    { preset: 'reach-the-flag', id: 'quad-big' },
  ] as const)('$preset on $id: the reference passes and a limp robot misses', async ({ preset, id }) => {
    const mj = await loadMujoco();
    const kase = presetCase(fixture(id), preset);
    const reference = await runCase(mj, kase, fixture(id), { controller: 'reference' });
    const limp = await runCase(mj, kase, fixture(id), { controller: 'limp' });

    expect(reference.passed).toBe(true);
    expect(limp.passed).toBe(false);
  });

  it('Touch a Point: limp misses, the reference touches it', async () => {
    const mj = await loadMujoco();
    const kase = built('arm-3dof', { goal: 'touch', world: 'floor' });
    const limp = await runCase(mj, kase, fixture('arm-3dof'), { controller: 'limp' });
    const reference = await runCase(mj, kase, fixture('arm-3dof'), { controller: 'reference' });

    expect(limp.passed).toBe(false);
    expect(reference.passed).toBe(true);
  });

  it('Walk Without Falling: a limp quadruped stands but goes nowhere, so it fails', async () => {
    const mj = await loadMujoco();
    const kase = built('quad-servo', { goal: 'walk', world: 'floor' });
    const limp = await runCase(mj, kase, fixture('quad-servo'), { controller: 'limp' });

    expect(limp.passed).toBe(false);
  });

  it('Reach a Spot: a limp rover stays put and misses', async () => {
    const mj = await loadMujoco();
    const kase = built('rover-diff', { goal: 'reach', world: 'corridor' });
    const limp = await runCase(mj, kase, fixture('rover-diff'), { controller: 'limp' });

    expect(limp.passed).toBe(false);
    expect(limp.margin).toBeLessThan(0);
  });

  it.each([
    { id: 'rover-four', goal: 'push', world: 'block' },
    { id: 'rover-diff', goal: 'path', world: 'block' },
    { id: 'hexapod', goal: 'path', world: 'block' },
    { id: 'quad-servo', goal: 'push', world: 'floor' },
  ] as const)('the reference passes $goal in $world on $id', async ({ id, goal, world }) => {
    const mj = await loadMujoco();
    const reference = await runCase(mj, built(id, { goal, world }), fixture(id), { controller: 'reference' });

    expect(reference.passed).toBe(true);
  });

  it('Touch the Dots written on six joints runs unchanged on three', async () => {
    const mj = await loadMujoco();
    const six = fixture('arm-6dof');
    const kase = JSON.parse(JSON.stringify(touchTheDots(six))) as Case;
    const three = fixture('arm-3dof');

    expect((await runCase(mj, kase, three, { controller: 'reference' })).passed).toBe(true);
    expect((await runCase(mj, kase, three, { controller: 'limp' })).passed).toBe(false);
  });
});
