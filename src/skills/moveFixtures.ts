import { CLOCK_SIZE, obsSize, POLICY_FORMAT, POLICY_VERSION, type PolicySpec } from '../sim/policy';
import type { JointValues, RobotAnimation } from '../types/robotics';
import type { Environment } from './environment';

export interface KeyedMove {
  id: string;
  name: string;
  seconds: number;
  loop?: boolean;
  source?: RobotAnimation['source'];
  keys: Array<[number, JointValues]>;
}

export function keyedMove(move: KeyedMove): RobotAnimation {
  const joints = [...new Set(move.keys.flatMap(([, values]) => Object.keys(values)))];

  return {
    id: move.id,
    name: move.name,
    duration: move.seconds,
    loop: !!move.loop,
    interpolation: 'linear',
    source: move.source ?? 'user',
    keyframes: move.keys.map(([t, values]) => ({
      t,
      values: Object.fromEntries(joints.map((j) => [j, values[j] ?? 0])),
    })),
  };
}

export const quadSit = (): RobotAnimation =>
  keyedMove({
    id: 'sit',
    name: 'Sit',
    seconds: 1,
    keys: [
      [0, {}],
      [1, { leg2_swing: 40, leg2_bend: -70, leg3_swing: 40, leg3_bend: -70 }],
    ],
  });

export function clockPolicy(environment: Environment): PolicySpec {
  const reference = environment.reference;

  if (!reference || reference.loop) throw new Error('A clock policy plays a one-shot reference.');

  const n = reference.joints.length;
  const size = obsSize(n) + CLOCK_SIZE;
  const first = reference.frames[0];
  const last = reference.frames[reference.frames.length - 1];
  const scale = environment.action.scale;
  const w = new Array<number>(n * size).fill(0);

  reference.joints.forEach((_, j) => {
    w[j * size + size - 1] = (first[j] - last[j]) / 2 / scale;
  });

  return {
    format: POLICY_FORMAT,
    version: POLICY_VERSION,
    task: 'stand',
    robot: environment.robot,
    joints: reference.joints,
    defaultPose: reference.joints.map(() => 0),
    actionScale: scale,
    controlDt: reference.controlDt,
    command: [0, 0, 0],
    obsMean: new Array<number>(size).fill(0),
    obsStd: new Array<number>(size).fill(1),
    layers: [{ in: size, out: n, w, b: reference.joints.map((_, j) => (first[j] + last[j]) / 2 / scale) }],
    activation: 'elu',
    trainedSteps: 1,
    mujoco: '',
    createdAt: '',
    clock: { frames: reference.frames.length, loop: false },
  };
}
