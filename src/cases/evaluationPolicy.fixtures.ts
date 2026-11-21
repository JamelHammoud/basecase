import { obsSize, type PolicySpec } from '../sim/policy';
import type { CaseRobot } from './runCase';

export function stationaryEvaluationPolicy(robot: CaseRobot, mujoco: string): PolicySpec {
  const joints = robot.joints.filter((joint) => joint.actuation !== 'passive').map((joint) => joint.id);
  const size = obsSize(joints.length);

  return {
    format: 'basecase-policy',
    version: 1,
    task: 'stand',
    robot: robot.id,
    joints,
    defaultPose: joints.map(() => 0),
    actionScale: 0.25,
    controlDt: 0.02,
    command: [0, 0, 0],
    obsMean: new Array(size).fill(0),
    obsStd: new Array(size).fill(1),
    layers: [{ in: size, out: joints.length, w: new Array(size * joints.length).fill(0), b: joints.map(() => 0) }],
    activation: 'elu',
    trainedSteps: 0,
    mujoco,
    createdAt: '2026-11-21T00:00:00.000Z',
  };
}
