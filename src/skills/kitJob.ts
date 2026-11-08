import type { SimModel } from '../sim/mjcfTypes';
import { kitCommand, type TrainedEntry } from './kitEnvironment';
import { KIT_ACTION_SCALE, kitRobot, kitTopSpeed, rootHeight } from './kitModel';
import { kitReward } from './kitRewards';

const D2R = Math.PI / 180;

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
}

const ROBUST = Object.freeze({
  delaySteps: [0, 1],
  encoderBias: 0.015,
  imuBias: 0.03,
  actorLinvel: false,
});

function commandRanges(model: SimModel) {
  const top = kitTopSpeed(model);

  return {
    ranges: [
      [0, 1.25 * top],
      [-0.25 * top, 0.25 * top],
      [-0.6, 0.6],
    ],
    resampleS: [2, 4],
    stillShare: 0.2,
  };
}

function entryFields(model: SimModel, entry: TrainedEntry, start: KitStart | null) {
  if (entry === 'velocity-tracking')
    return { task: 'walk', resetNoise: 0.1, commands: commandRanges(model), ...ROBUST };

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

  return { task: 'stand', resetNoise: 0.3, ...ROBUST };
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
  const { rootOffsetLift, ...fields } = { rootOffsetLift: 0, ...entryFields(model, entry, start) };

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
    reward: options.reward ?? kitReward(model, entry),
    ...(options.maxIterations ? { maxIterations: options.maxIterations } : {}),
    ...fields,
  };
}
