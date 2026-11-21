import type { SimModel } from '../mjcfTypes';
import { obsSize, POLICY_FORMAT, POLICY_VERSION, type PolicySpec } from '../policy';

export function teachingPolicy(model: SimModel, command: [number, number, number] = [0, 0, 0]): PolicySpec {
  const joints = model.joints.filter((joint) => joint.actuator >= 0);
  const width = obsSize(joints.length);
  const sizes = [width, 256, 128, 64, joints.length];

  return {
    format: POLICY_FORMAT,
    version: POLICY_VERSION,
    task: 'stand',
    robot: model.robots[0].name,
    joints: joints.map((joint) => joint.id),
    defaultPose: joints.map(
      (joint) => (model.initial.values[joint.id] ?? 0) * (joint.type === 'prismatic' ? 0.001 : Math.PI / 180),
    ),
    actionScale: Math.PI,
    controlDt: 0.04,
    command,
    obsMean: Array<number>(width).fill(0),
    obsStd: Array<number>(width).fill(1),
    activation: 'elu',
    trainedSteps: 1,
    mujoco: '4.0.0',
    createdAt: '2026-11-20T00:00:00Z',
    layers: sizes.slice(1).map((out, i) => ({
      in: sizes[i],
      out,
      w: Array<number>(sizes[i] * out).fill(0),
      b: Array<number>(out).fill(0),
    })),
  };
}
