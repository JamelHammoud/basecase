import loadMujoco from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { routineBody } from '../routines/physicsBody';
import { scriptedDrive } from '../routines/physicsDrive';
import { atHandoffPhase, Prover } from '../routines/physicsProver';
import { kitBehavior, KIT_BEHAVIOR } from '../routines/kitBehavior';
import { fixtureRobot, modelOf } from './fixtureModels';
import { POLICY_FORMAT, POLICY_VERSION, type PolicySpec } from '../sim/policy';
import { kitRobot } from './kitModel';

let mj: Awaited<ReturnType<typeof loadMujoco>>;

beforeAll(async () => {
  mj = await loadMujoco();
});

describe('Motor Kit starts shared with Routines', () => {
  const cases = ['quad-servo', 'hexapod'].flatMap((id) => [
    { id, from: 'settle', to: 'walk', moves: {} },
    { id, from: 'walk', to: 'settle', moves: {} },
    { id, from: 'turn-away', to: 'walk', moves: { fromMove: { turn: -90 } } },
    { id, from: 'turn-away', to: 'walk', moves: { fromMove: { turn: 90 } } },
    { id, from: 'settle', to: 'turn-away', moves: { toMove: { turn: -90 } } },
    { id, from: 'settle', to: 'turn-away', moves: { toMove: { turn: 90 } } },
    { id, from: 'settle', to: 'walk', moves: { toMove: { distance: -1, speed: -0.1 } } },
  ]);

  it.each(cases)('$id $from to $to $moves', ({ id, from, to, moves }) => {
    const robot = fixtureRobot(id);
    const model = modelOf(robot);
    const body = routineBody(model, robot.joints, {
      skills: [],
      drive: scriptedDrive(model, robot.joints, robot.parts),
    })!;
    const prover = new Prover(mj, body);

    try {
      const run = prover.run(from, to, atHandoffPhase(from), moves);

      expect(run.falls).toBe(0);
      expect(run.sampled.filter((sample) => !kitBehavior(to, sample, moves.toMove))).toEqual([]);
    } finally {
      prover.dispose();
    }
  });

  it('refuses an upright stationary candidate after Settle', () => {
    const robot = fixtureRobot('quad-servo');
    const model = modelOf(robot);
    const joints = kitRobot(model).joints;
    const n = joints.length;
    const obs = 12 + 3 * n;
    const policy: PolicySpec = {
      format: POLICY_FORMAT,
      version: POLICY_VERSION,
      task: 'walk',
      robot: 'Robot',
      joints,
      defaultPose: Array(n).fill(0),
      actionScale: 0.5,
      controlDt: 0.02,
      command: [0.2, 0, 0],
      obsMean: Array(obs).fill(0),
      obsStd: Array(obs).fill(1),
      layers: [{ in: obs, out: n, w: Array(obs * n).fill(0), b: Array(n).fill(0) }],
      activation: 'elu',
      trainedSteps: 0,
      mujoco: '4.0.0',
      createdAt: '',
    };
    const body = routineBody(model, robot.joints, { skills: [] })!;

    body.policies.velocity = policy;

    const prover = new Prover(mj, body);

    try {
      const run = prover.run('settle', 'walk', atHandoffPhase('settle'));

      expect(run.falls).toBe(0);
      expect(run.sampled.some((sample) => kitBehavior('walk', sample))).toBe(false);
      expect(run.starts).toHaveLength(8);
    } finally {
      prover.dispose();
    }
  });

  it('rejects a turn that only works while travelling, the wrong direction and a walk that stays upright', () => {
    const pose = { base: [0, 0, 0.2] as [number, number, number], yaw: 0, tilt: 0 };
    const sample = { start: pose, late: pose, end: { ...pose, yaw: 0.4 } };

    expect(kitBehavior('turn-away', sample, { turn: 90 })).toBe(true);
    expect(kitBehavior('turn-away', sample, { turn: -90 })).toBe(false);
    expect(kitBehavior('turn-away', { ...sample, end: { ...sample.end, base: [0.1, 0, 0.2] } })).toBe(false);
    expect(kitBehavior('turn-away', { ...sample, driftM: 0.1 })).toBe(false);
    expect(kitBehavior('walk', { ...sample, end: pose })).toBe(false);
    expect(kitBehavior('walk', { ...sample, end: { ...pose, base: [0, -KIT_BEHAVIOR.walkM, 0.2] } })).toBe(true);
  });
});
