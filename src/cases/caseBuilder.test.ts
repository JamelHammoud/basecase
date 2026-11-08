import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildRig } from '../utils/kinematics';
import { buildCase, builderRobot, caseName, fittingTemplates, goalsFor, worldsFor, type CaseSpec } from './caseBuilder';
import type { Case } from './schema';
import { caseTemplates } from './templates';
import { parseCase, runCase } from './testing';

const fixture = (id: string) => fixtureRobots().find((r) => r.id === id)!;

const robotOf = (id: string) => {
  const r = fixture(id);

  return builderRobot(buildRig(r.joints, r.parts), r.parts);
};

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

  it('lists only the examples that fit the robot', () => {
    const ids = (id: string) => {
      const r = fixture(id);

      return fittingTemplates(caseTemplates(buildRig(r.joints, r.parts), r.parts)).map((t) => t.id);
    };

    expect(ids('arm-3dof')).toEqual(['touch-the-dots']);
    expect(ids('rover-diff')).toEqual(['reach-the-flag']);
  });
});

describe('a built Case in MuJoCo', () => {
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
});
