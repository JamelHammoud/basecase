import { describe, expect, it } from 'vitest';
import { obsSize } from '../sim/policy';
import type { Contract } from './contract';
import {
  environmentHash,
  observationSize,
  policyObservation,
  validateEnvironment,
  type Environment,
} from './environment';
import { fixtureModel } from './fixtureModels';

const model = fixtureModel('quad-servo');
const joints = model.joints.map((j) => j.id);
const upright: Contract = {
  version: 1,
  success: {
    always: { window: 'whole', state: { atom: { expr: { signal: 'tilt' }, cmp: '<', value: 0.5, scale: 0.5 } } },
  },
  failures: [
    {
      label: 'fell',
      formula: {
        eventually: { window: 'whole', state: { atom: { expr: { signal: 'h' }, cmp: '<', value: 0.05, scale: 0.05 } } },
      },
    },
  ],
};

const stand = (): Environment => ({
  version: 1,
  robot: model.robots[0].key,
  horizonS: 8,
  traceDt: 0.02,
  observation: policyObservation(joints),
  action: { kind: 'position-offset', joints, scale: 0.25, controlDt: 0.02 },
  reset: { jointNoiseDeg: 3, baseYawDeg: 180, baseOffsetMm: 0 },
  randomization: { friction: [0.6, 1.3], mass: [0.85, 1.15], strength: [0.85, 1.15], latencyMs: [0, 20] },
  reward: { kind: 'contract-robustness' },
  contract: upright,
  signals: { tilt: { kind: 'base-tilt' }, h: { kind: 'base-height' } },
});

describe('the environment interface', () => {
  it('accepts a complete stand task', async () => {
    expect(await validateEnvironment(stand(), model)).toEqual([]);
  });

  it('describes today’s policy observation exactly', () => {
    expect(observationSize(stand())).toBe(obsSize(joints.length));
  });

  it('names every problem in plain words', async () => {
    const env = stand();
    const broken: Environment = {
      ...env,
      robot: 'nobody',
      horizonS: -1,
      action: { ...env.action, joints: ['tail'], scale: 0 },
      randomization: { ...env.randomization, friction: [1.3, 0.6], latencyMs: [0, 9999] },
      reward: { kind: 'rewardlang', hash: 'abc' },
      signals: { tilt: { kind: 'joint-position', joint: 'tail' } },
    };
    const problems = await validateEnvironment(broken, model);

    expect(problems).toEqual(
      expect.arrayContaining([
        'The environment names a robot this scene lacks.',
        'The horizon runs from 0.1 to 600 s.',
        'The action scale is above 0 and at most 100.',
        'Friction scales run from 0.05 to 5.',
        'Latency runs from 0 to 500 ms.',
        'The reward reference is unknown.',
        'Signal tilt reads a missing joint.',
        'The contract reads h, which no signal provides.',
      ]),
    );
  });

  it('reports a contract the evaluator refuses', async () => {
    const env = {
      ...stand(),
      contract: {
        ...upright,
        success: { always: { window: { last: 0 }, state: upright.failures[0].formula as never } },
      },
    };

    expect((await validateEnvironment(env as Environment, model)).join(' ')).toMatch(/contract is refused/);
  });

  it('starts from another skill’s states only when each state fits the robot', async () => {
    const state = {
      joints: joints.map(() => 0.1),
      jointVels: joints.map(() => 0),
      height: 0.12,
      quat: [1, 0, 0, 0] as [number, number, number, number],
      linear: [0.2, 0, 0] as [number, number, number],
      angular: [0, 0, 0] as [number, number, number],
    };
    const from = (states: NonNullable<Environment['reset']['states']>): Environment => ({
      ...stand(),
      reset: { ...stand().reset, states },
    });

    expect(await validateEnvironment(from({ skill: 'walk', joints, samples: [state] }), model)).toEqual([]);
    expect(await validateEnvironment(from({ skill: 'walk', joints, samples: [] }), model)).toEqual([
      'Start states hold 1 to 256 states.',
    ]);
    expect(await validateEnvironment(from({ skill: 'walk', joints: ['tail'], samples: [state] }), model)).toEqual([
      'A start state names tail, which this robot lacks.',
    ]);
    expect(
      await validateEnvironment(from({ skill: 'walk', joints, samples: [{ ...state, quat: [2, 0, 0, 0] }] }), model),
    ).toEqual([
      `Each start state has a finite position and speed for each of its ${joints.length} joints, a height above 0 and a unit quaternion.`,
    ]);
  });

  it('hashes by content', () => {
    expect(environmentHash(stand())).toBe(environmentHash(stand()));
    expect(environmentHash({ ...stand(), horizonS: 9 })).not.toBe(environmentHash(stand()));
  });
});
