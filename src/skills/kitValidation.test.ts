import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { POLICY_FORMAT, POLICY_VERSION, type PolicySpec } from '../sim/policy';
import { fixtureModel } from './fixtureModels';
import { evaluateContract } from './contract';
import { kitEnvironment, kitSpeedContract } from './kitEnvironment';
import { kitRobot, rootHeight } from './kitModel';
import { validationChecks, validationScore } from './kitValidation';

function standingPolicy(joints: string[]): PolicySpec {
  const n = joints.length;
  const nobs = 12 + 3 * n;

  return {
    format: POLICY_FORMAT,
    version: POLICY_VERSION,
    task: 'walk',
    robot: 'Robot',
    joints,
    defaultPose: Array(n).fill(0),
    actionScale: 0.5,
    controlDt: 0.02,
    command: [0.2, 0, 0],
    obsMean: Array(nobs).fill(0),
    obsStd: Array(nobs).fill(1),
    layers: [{ in: nobs, out: n, w: Array(nobs * n).fill(0), b: Array(n).fill(0) }],
    activation: 'elu',
    trainedSteps: 0,
    mujoco: '4.0.0',
    createdAt: '',
  };
}

describe('Kit validation', () => {
  it('checks the gate’s three speeds and a turn each way', () => {
    const model = fixtureModel('quad-servo');
    const environment = kitEnvironment(model, 'velocity-tracking');
    const commands = validationChecks({ model, entry: 'velocity-tracking', environment }).map((c) => c.command);

    expect(commands).toEqual([
      [0.2, 0, 0],
      [0.1, 0, 0],
      [0, 0, 0],
      [0.1, 0, 0.5],
      [0.1, 0, -0.5],
    ]);
  });

  it('also checks half the top speed backwards when the gait was trained to reverse', () => {
    const model = fixtureModel('hexapod');
    const environment = kitEnvironment(model, 'velocity-tracking');
    const checks = validationChecks({ model, entry: 'velocity-tracking', environment, reverse: true });

    expect(checks.map((c) => c.command)).toContainEqual([-0.1, 0, 0]);
    expect(checks.find((c) => c.command[0] < 0)?.contract).toEqual(kitSpeedContract(model, -0.1));
  });

  it('judges a backward speed as the mirror of the forward one', async () => {
    const model = fixtureModel('hexapod');
    const ticks = 401;
    const walked = (speed: number) => ({
      dt: 0.02,
      signals: {
        forward: Array.from({ length: ticks }, (_, i) => speed * i * 0.02),
        height: Array(ticks).fill(rootHeight(model)),
        tilt: Array(ticks).fill(0),
      },
    });
    const backward = kitSpeedContract(model, -0.1);

    expect((await evaluateContract(backward, walked(-0.1))).passed).toBe(true);
    expect((await evaluateContract(backward, walked(0.1))).passed).toBe(false);
    expect((await evaluateContract(backward, walked(0))).passed).toBe(false);
    expect((await evaluateContract(backward, walked(-0.25))).passed).toBe(false);
  });

  it('checks Stand against its own contract, with as many draws as all the walking checks together', () => {
    const model = fixtureModel('biped-servo');
    const environment = kitEnvironment(model, 'stand');
    const walking = validationChecks({
      model,
      entry: 'velocity-tracking',
      environment: kitEnvironment(model, 'velocity-tracking'),
    });

    expect(validationChecks({ model, entry: 'stand', environment })).toEqual([
      { command: [0, 0, 0], contract: environment.contract, draws: walking.reduce((sum, c) => sum + c.draws, 0) },
    ]);
  });

  it('scores a robot that only stands near zero, since Arena needs every speed', async () => {
    const mj = await loadMujoco();
    const model = fixtureModel('quad-servo');
    const policy = standingPolicy(kitRobot(model).joints);
    const environment = kitEnvironment(model, 'velocity-tracking');
    const score = await validationScore({
      mj,
      model,
      entry: 'velocity-tracking',
      environment,
      policy,
      draws: 1,
      salt: 'a',
    });

    expect(score).toBeLessThan(0.05);
  }, 60_000);
});
