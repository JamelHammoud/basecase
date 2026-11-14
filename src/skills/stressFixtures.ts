import type { PolicySpec } from '../sim/policy';
import { POLICY_FORMAT, POLICY_VERSION } from '../sim/policy';
import type { SimModel } from '../sim/mjcfTypes';
import { kitJob } from './kitJob';

export function standingPolicy(
  model: SimModel,
  options: { stiffness?: number; trainedSteps?: number } = {},
): PolicySpec {
  const job = kitJob(model, 'stand', { minutes: 1, seed: 0 });
  const joints = job.joints.map((j) => j.id);
  const n = joints.length;
  const inputs = 12 + 3 * n;
  const w = new Array<number>(inputs * n).fill(0);

  for (let i = 0; i < n; i++) w[i * inputs + 12 + i] = -(options.stiffness ?? 0);

  return {
    format: POLICY_FORMAT,
    version: POLICY_VERSION,
    task: 'stand',
    robot: job.robotName,
    joints,
    defaultPose: job.defaultPose,
    actionScale: job.actionScale,
    controlDt: job.controlDt,
    command: job.command,
    obsMean: new Array<number>(inputs).fill(0),
    obsStd: new Array<number>(inputs).fill(1),
    layers: [{ in: inputs, out: n, w, b: new Array<number>(n).fill(0) }],
    activation: 'elu',
    trainedSteps: options.trainedSteps ?? 100,
    mujoco: 'stub',
    createdAt: '2026-11-13T00:00:00',
  };
}
