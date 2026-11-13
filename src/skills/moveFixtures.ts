import { CLOCK_SIZE, obsSize, POLICY_FORMAT, POLICY_VERSION, type PolicySpec } from '../sim/policy';
import type { JointValues, RobotAnimation } from '../types/robotics';
import type { SimModel } from '../sim/mjcfTypes';
import { currentDesign, skillFromTraining, type Skill, type SkillController } from './artifacts';
import type { Environment } from './environment';
import { moveEnvironment } from './moveEnvironment';

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

export const quadWave = (): RobotAnimation =>
  keyedMove({
    id: 'wave',
    name: 'Wave',
    seconds: 2,
    keys: [
      [0, {}],
      [0.5, { leg0_swing: 30 }],
      [1, { leg0_swing: 50 }],
      [1.5, { leg0_swing: 30 }],
      [2, {}],
    ],
  });

const FOLDED = { bend: -120, swing: 80 };

export const quadFlop = (): RobotAnimation =>
  keyedMove({
    id: 'flop',
    name: 'Flop',
    seconds: 0.4,
    keys: [
      [0, {}],
      [
        0.4,
        Object.fromEntries(
          [0, 1, 2, 3].flatMap((leg) => [
            [`leg${leg}_bend`, FOLDED.bend],
            [`leg${leg}_swing`, leg % 2 ? -FOLDED.swing : FOLDED.swing],
          ]),
        ),
      ],
    ],
  });

export function fixtureMoveSkill(options: {
  model: SimModel;
  animation: RobotAnimation;
  controller?: SkillController;
  name?: string;
}): Skill {
  const { model, animation } = options;
  const environment = moveEnvironment(model, animation);
  const controller = options.controller ?? { kind: 'animation', animation };
  const current = currentDesign({ design: model.robots[0]?.key ?? 'scene', model, environment });

  return skillFromTraining({ name: options.name ?? animation.name, start: null, current, environment, controller });
}

export const clockSkill = (model: SimModel, animation: RobotAnimation, name = animation.name): Skill =>
  fixtureMoveSkill({
    model,
    animation,
    name,
    controller: { kind: 'policy', policy: clockPolicy(moveEnvironment(model, animation)), robot: model.robots[0].key },
  });
