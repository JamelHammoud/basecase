import type { SimModel } from './mjcfTypes';
import type { TrainTask } from './policy';

export interface TrainOptions {
  task: TrainTask;
  minutes: number;
  command: [number, number, number];
}

const D2R = Math.PI / 180;

export function trainingJob(model: SimModel, robotKey: string, opts: TrainOptions, name: string) {
  const robot = model.robots.find((r) => r.key === robotKey)!;
  const joints = model.joints.filter((j) => j.robot === robotKey);
  const unit = (j: SimModel['joints'][number], v: number) => (j.type === 'revolute' ? v * D2R : v / 1000);
  const initial = (j: SimModel['joints'][number]) => unit(j, model.initial.values[j.id] ?? 0);
  const root = model.initial.roots?.[robotKey]?.position ?? [0, 0, 0];

  return {
    name,
    modelVersion: model.version,
    fingerprint: robot.fingerprint,
    task: opts.task,
    minutes: opts.minutes,
    command: opts.command,
    robotKey,
    robotName: robot.name,
    root: robot.root,
    joints: joints.map((j) => ({ id: j.id, name: j.name })),
    defaultPose: joints.map(initial),
    ctrlDefault: model.joints.map(initial),
    initialJoints: Object.fromEntries(model.joints.map((j) => [j.name, initial(j)])),
    rootOffset: [root[0] / 1000, -root[2] / 1000, root[1] / 1000],
    actionScale: 0.25,
    controlDt: 0.02,
  };
}
