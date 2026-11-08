import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { fixtureModel } from '../skills/fixtureModels';
import { SimEngine } from './engine';
import { obsSize, POLICY_FORMAT, POLICY_VERSION, type PolicySpec } from './policy';

function forwardEcho(model: ReturnType<typeof fixtureModel>): PolicySpec {
  const joints = model.joints.map((j) => j.id);
  const size = obsSize(joints.length);
  const w = new Array<number>(size * joints.length).fill(0);

  joints.forEach((_, o) => (w[o * size + 9] = 1));

  return {
    format: POLICY_FORMAT,
    version: POLICY_VERSION,
    task: 'walk',
    robot: model.robots[0].key,
    joints,
    defaultPose: joints.map(() => 0),
    actionScale: 0.25,
    controlDt: 0.02,
    command: [0.2, 0, 0],
    obsMean: new Array<number>(size).fill(0),
    obsStd: new Array<number>(size).fill(1),
    layers: [{ in: size, out: joints.length, w, b: joints.map(() => 0) }],
    activation: 'elu',
    trainedSteps: 0,
    mujoco: 'none',
    createdAt: '2026-11-07T00:00:00.000Z',
  };
}

describe('live commands on a policy', () => {
  it('start from the spec, and a command replaces it from the next control tick', async () => {
    const mj = await loadMujoco();
    const model = fixtureModel('quad-servo');
    const engine = new SimEngine(mj, model);
    const actuator = model.joints[0].actuator;

    try {
      engine.setController({ kind: 'policy', policy: forwardEcho(model), robot: model.robots[0].key });
      engine.step(0.01);
      expect(engine.data.ctrl[actuator]).toBeCloseTo(0.25 * 0.2, 6);

      engine.command({ v: [-0.6, 0, 0] });
      engine.step(0.02);
      expect(engine.data.ctrl[actuator]).toBeCloseTo(0.25 * -0.6, 6);

      engine.reset(model.initial);
      engine.step(0.01);
      expect(engine.data.ctrl[actuator]).toBeCloseTo(0.25 * 0.2, 6);
    } finally {
      engine.dispose();
    }
  });
});
