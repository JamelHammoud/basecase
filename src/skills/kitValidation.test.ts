import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { POLICY_FORMAT, POLICY_VERSION, type PolicySpec } from '../sim/policy';
import { fixtureModel } from './fixtureModels';
import { kitEnvironment } from './kitEnvironment';
import { kitRobot } from './kitModel';
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
    const commands = validationChecks(fixtureModel('quad-servo')).map((c) => c.command);

    expect(commands).toEqual([
      [0.2, 0, 0],
      [0.1, 0, 0],
      [0, 0, 0],
      [0.1, 0, 0.5],
      [0.1, 0, -0.5],
    ]);
  });

  it('scores a robot that only stands on the still check alone', async () => {
    const mj = await loadMujoco();
    const model = fixtureModel('quad-servo');
    const policy = standingPolicy(kitRobot(model).joints);
    const environment = kitEnvironment(model, 'velocity-tracking');
    const score = await validationScore({ mj, model, environment, policy, draws: 1, salt: 'a' });

    expect(score).toBeGreaterThan(0.15);
    expect(score).toBeLessThan(0.25);
  }, 60_000);
});
