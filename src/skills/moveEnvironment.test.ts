import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { clockAngle } from '../sim/policy';
import { validateEnvironment } from './environment';
import { fixtureModel } from './fixtureModels';
import {
  MOVE_BARS,
  moveAnalysis,
  moveAnimations,
  moveEnvironment,
  moveProblems,
  zeroPolicyMiss,
} from './moveEnvironment';
import { clockPolicy, keyedMove, quadSit } from './moveFixtures';
import { moveJob } from './moveJob';
import { referenceAt } from './moveTube';
import { routeTask } from './router';
import { judgeRollout } from './rollout';

const quad = fixtureModel('quad-servo');
const hexapod = fixtureModel('hexapod');

const dance = () =>
  keyedMove({
    id: 'dance',
    name: 'Dance',
    seconds: 1,
    loop: true,
    keys: [
      [0, { leg0_swing: 0, leg3_swing: 0 }],
      [0.5, { leg0_swing: 35, leg3_swing: -35 }],
    ],
  });

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

describe('a move built from a Pose-tab animation', () => {
  it('samples one frame per control step, every joint plus base height and tilt', async () => {
    const env = moveEnvironment(quad, quadSit());
    const reference = env.reference!;

    expect(reference.frames).toHaveLength(51);
    expect(reference.frames[0]).toHaveLength(reference.joints.length + 2);
    expect(reference.frames[50][reference.joints.indexOf('leg2_bend')]).toBeCloseTo((-70 * Math.PI) / 180);
    expect(env.horizonS).toBe(MOVE_BARS.minHorizonS);
    expect(env.action.scale).toBeGreaterThan((70 * Math.PI) / 180);
    expect(await validateEnvironment(env, quad)).toEqual([]);
  });

  it('adds the clock at the animation’s period', () => {
    expect(moveEnvironment(quad, quadSit()).observation.at(-1)).toEqual({ kind: 'clock', periodS: 1 });

    const loop = moveEnvironment(hexapod, dance());

    expect(loop.reference!.frames).toHaveLength(50);
    expect(loop.observation.at(-1)).toEqual({ kind: 'clock', periodS: 1 });
    expect(clockAngle({ frames: 50, loop: true }, 25)).toBeCloseTo(Math.PI);
    expect(clockAngle({ frames: 50, loop: true }, 50)).toBe(0);
    expect(clockAngle({ frames: 51, loop: false }, 500)).toBeCloseTo(Math.PI);
  });

  it('holds a one-shot move at its last key', () => {
    const reference = moveEnvironment(quad, quadSit()).reference!;

    expect(referenceAt(reference, 400)).toEqual(reference.frames[50]);
    expect(referenceAt(moveEnvironment(hexapod, dance()).reference!, 75)).toEqual(
      moveEnvironment(hexapod, dance()).reference!.frames[25],
    );
  });

  it('judges every joint against the reference, and a fall or drift fails it', () => {
    const env = moveEnvironment(quad, quadSit());
    const success = JSON.stringify(env.contract.success);

    for (const joint of env.reference!.joints) expect(success).toContain(`q_${joint}`);

    expect(env.contract.failures.map((f) => f.label)).toEqual(['fell']);
    expect(success).toContain('"delta":{"signal":"x"}');
  });

  it('refuses a move so small that standing still would pass it', () => {
    const nod = keyedMove({
      id: 'nod',
      name: 'Nod',
      seconds: 1,
      keys: [
        [0, {}],
        [1, { leg0_swing: 5 }],
      ],
    });

    expect(moveProblems(quad, moveEnvironment(quad, nod).reference!)).toHaveLength(1);
    expect(zeroPolicyMiss(quad, moveEnvironment(quad, quadSit()).reference!)).toBeGreaterThan(
      MOVE_BARS.canaryShare * MOVE_BARS.toleranceRad,
    );
  });

  it('fails holding still and passes a policy that follows the clock', async () => {
    const environment = moveEnvironment(quad, quadSit());
    const still = await judgeRollout({ mj, model: quad, environment, controller: { kind: 'hold' }, label: 'still' });
    const played = await judgeRollout({
      mj,
      model: quad,
      environment,
      controller: { kind: 'policy', policy: clockPolicy(environment), robot: environment.robot },
      label: 'clock',
    });

    expect(still.passed).toBe(false);
    expect(played.passed).toBe(true);
  });

  it('routes a legged move to tracking and a fixed arm’s wave to the IK path', () => {
    expect(routeTask(moveAnalysis(fixtureModel('biped-servo'))).method).toBe('tracking');
    expect(routeTask(moveAnalysis(fixtureModel('arm-3dof'))).method).toBe('ik-or-motion-plan');
  });

  it('lists moves only for legged robots', () => {
    expect(moveAnimations(quad, [quadSit()]).map((a) => a.name)).toEqual(['Sit']);
    expect(moveAnimations(fixtureModel('arm-3dof'), [quadSit()])).toEqual([]);
  });

  it('sends Forge the reference as offsets from the default pose, with the clock’s episode', () => {
    const environment = moveEnvironment(quad, quadSit());
    const job = moveJob(quad, environment, { name: 'Sit', minutes: 1, seed: 1 });

    expect(job.reference.loop).toBe(false);
    expect(job.reference.frames).toHaveLength(51);
    expect(job.episodeS).toBe(environment.horizonS);
    expect(job.actionScale).toBe(environment.action.scale);
    expect(job.reward).toContain('state.reference[:12]');
    expect(job.name).toBe('Move: Sit');
  });
});
