import type { Eye } from '../sim/eyes';
import type { PolicySpec } from '../sim/policy';
import type { StartArea } from './environment';
import type { SimModel } from '../sim/mjcfTypes';
import { kitCommand, type TrainedEntry } from './kitEnvironment';
import { KIT_ACTION_SCALE, kitRobot, kitTopSpeed, rootHeight } from './kitModel';
import { kitReward } from './kitRewards';
import { NEAR_DELAYS, type DelaySteps } from './kitSchedule';
import { servoGains } from './servoDraws';

const D2R = Math.PI / 180;
const LOG_STD_MIN = -2.5;

export interface KitStart {
  joints: Record<string, number>;
  liftM: number;
}

export interface KitJobOptions {
  minutes: number;
  seed: number;
  start?: KitStart | null;
  reward?: string;
  maxIterations?: number;
  delaySteps?: DelaySteps;
  delayRamp?: number;
  warmStart?: string | null;
  warmPolicy?: PolicySpec | null;
  reverse?: boolean;
  eyes?: Eye[];
  startArea?: StartArea;
}

const ROBUST = Object.freeze({
  delaySteps: NEAR_DELAYS,
  encoderBias: 0.015,
  imuBias: 0.03,
  actorLinvel: false,
});

const REACH = 1.25;

function commandRanges(model: SimModel, reverse: boolean) {
  const top = kitTopSpeed(model);

  return {
    ranges: [
      [reverse ? -REACH * top : 0, REACH * top],
      [-0.25 * top, 0.25 * top],
      [-0.6, 0.6],
    ],
    resampleS: [2, 4],
    stillShare: 0.2,
  };
}

const GPU_ENVS = 1024;

const GPU_LEARNER = Object.freeze({ backend: 'metal', gpuEnvs: GPU_ENVS, squash: 'tanh', logStdMin: LOG_STD_MIN });

function entryFields(model: SimModel, entry: TrainedEntry, options: { start: KitStart | null; reverse: boolean }) {
  const { start, reverse } = options;

  if (entry === 'velocity-tracking')
    return { task: 'walk', resetNoise: 0.1, commands: commandRanges(model, reverse), ...GPU_LEARNER, ...ROBUST };

  if (entry === 'get-up')
    return {
      task: 'stand',
      resetNoise: 0.15,
      standHeight: rootHeight(model),
      fallResets: false,
      pushes: false,
      episodeS: 6,
      ...ROBUST,
      ...(start ? { rootOffsetLift: start.liftM } : {}),
    };

  if (entry === 'settle-to-neutral') return { task: 'stand', resetNoise: 0.3, episodeS: 6, ...ROBUST };

  return { task: 'stand', resetNoise: 0.3, ...GPU_LEARNER, ...ROBUST };
}

const unit = (j: SimModel['joints'][number], v: number) => (j.type === 'revolute' ? v * D2R : v / 1000);

function startJoints(model: SimModel, start: KitStart | null) {
  return model.joints.map((j) => start?.joints[j.name] ?? unit(j, model.initial.values[j.id] ?? 0));
}

export function kitJob(model: SimModel, entry: TrainedEntry, options: KitJobOptions) {
  const robot = kitRobot(model);
  const sim = model.robots[0];
  const byId = new Map(model.joints.map((j) => [j.id, j]));
  const start = options.start ?? null;
  const pose = startJoints(model, start);
  const root = model.initial.roots?.[robot.key]?.position ?? [0, 0, 0];
  const { rootOffsetLift, ...fields } = {
    rootOffsetLift: 0,
    ...entryFields(model, entry, { start, reverse: !!options.reverse }),
  };

  return {
    name: `Motor Kit: ${entry}`,
    modelVersion: model.version,
    minutes: options.minutes,
    command: kitCommand(model, entry),
    robotKey: robot.key,
    robotName: sim.name,
    root: robot.root,
    joints: robot.joints.map((id) => ({ id, name: byId.get(id)!.name })),
    defaultPose: robot.joints.map((id) => unit(byId.get(id)!, model.initial.values[id] ?? 0)),
    ctrlDefault: pose,
    initialJoints: Object.fromEntries(model.joints.map((j, i) => [j.name, pose[i]])),
    rootOffset: [root[0] / 1000, -root[2] / 1000, root[1] / 1000 + rootOffsetLift],
    actionScale: KIT_ACTION_SCALE,
    controlDt: 0.02,
    seed: options.seed,
    reward: options.reward ?? kitReward(model, entry, { reverse: options.reverse }),
    ...(options.maxIterations ? { maxIterations: options.maxIterations } : {}),
    ...fields,
    ...(options.delaySteps ? { delaySteps: options.delaySteps } : {}),
    ...(options.delayRamp ? { delayRamp: options.delayRamp } : {}),
    ...(options.warmStart ? { warmStart: options.warmStart, logStdMin: LOG_STD_MIN } : {}),
    ...(!options.warmStart && options.warmPolicy ? { warmPolicy: options.warmPolicy, logStdMin: LOG_STD_MIN } : {}),
    ...(options.eyes?.length ? { eyes: options.eyes } : {}),
    ...(options.startArea ? { startArea: options.startArea } : {}),
    ...servoGains(model, { seed: options.seed, joints: robot.joints }),
  };
}
