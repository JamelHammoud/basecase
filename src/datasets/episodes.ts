import { eyeSize } from '../sim/eyes';
import type { SimJoint, SimModel } from '../sim/mjcfTypes';
import type { Recording } from '../sim/recorder';
import type { Subtask } from './language';

export const DATASET_FPS = 25;

export interface FeatureStats {
  min: number[];
  max: number[];
  mean: number[];
  std: number[];
  count: number[];
}

export interface EpisodeData {
  task: string;
  frames: number[];
  timestamps: Float32Array;
  state: Float32Array;
  action: Float32Array;
  scan?: Float32Array;
  subtasks?: Subtask[];
}

export const datasetStride = (dt: number) => Math.max(1, Math.round(1 / (dt * DATASET_FPS)));

export function sampledFrames(recording: Pick<Recording, 'frames' | 'dt'>): number[] {
  const stride = datasetStride(recording.dt);

  return Array.from({ length: Math.ceil(recording.frames / stride) }, (_, k) => k * stride);
}

export interface DatasetSlot {
  id: string;
  robot: string;
}

export interface JointGroup {
  name: string;
  start: number;
  end: number;
}

export function robotJoints(model: SimModel, robotKey = model.robots[0]?.key): SimJoint[] {
  const ids = new Set(model.robots.find((r) => r.key === robotKey)?.joints ?? []);

  return model.joints.filter((j) => ids.has(j.id));
}

export const scanWidth = (model: SimModel) => eyeSize(model.scans);

export function datasetJoints(model: SimModel, slots?: DatasetSlot[]) {
  if (!slots || slots.length < 2) {
    const joints = robotJoints(model);

    return { joints, names: joints.map((j) => j.name), groups: [{ name: 'joints', start: 0, end: joints.length }] };
  }

  const per = slots.map((s) => ({ slot: s.id, joints: robotJoints(model, s.robot) }));
  const starts = per.map((_, i) => per.slice(0, i).reduce((n, p) => n + p.joints.length, 0));

  return {
    joints: per.flatMap((p) => p.joints),
    names: per.flatMap((p) => p.joints.map((j) => `${p.slot}.${j.name}`)),
    groups: per.map((p, i): JointGroup => ({ name: p.slot, start: starts[i], end: starts[i] + p.joints.length })),
  };
}

export function canExport(recording: Recording, model: SimModel): boolean {
  const scan = scanWidth(model);

  return (
    !!recording.jointQpos &&
    recording.jointQpos.length === model.joints.length &&
    recording.nbody === model.bodies.length &&
    recording.frames > 1 &&
    (!scan || (recording.scanWidth === scan && !!recording.scan))
  );
}

function scanRows(recording: Recording, frames: number[]): Float32Array | undefined {
  const width = recording.scanWidth ?? 0;
  const source = recording.scan;

  if (!width || !source) return undefined;

  const out = new Float32Array(frames.length * width);

  frames.forEach((f, row) => out.set(source.subarray(f * width, (f + 1) * width), row * width));

  return out;
}

export function episodeData(recording: Recording, model: SimModel, task: string, slots?: DatasetSlot[]): EpisodeData {
  const { joints } = datasetJoints(model, slots);
  const index = joints.map((j) => model.joints.indexOf(j));
  const address = recording.jointQpos ?? new Int32Array();
  const frames = sampledFrames(recording);
  const width = joints.length;
  const state = new Float32Array(frames.length * width);
  const action = new Float32Array(frames.length * width);
  const timestamps = new Float32Array(frames.length);

  frames.forEach((f, row) => {
    timestamps[row] = row / DATASET_FPS;
    index.forEach((jointIndex, col) => {
      state[row * width + col] = recording.qpos[f * recording.nq + address[jointIndex]];
      action[row * width + col] = recording.ctrl[f * recording.nu + joints[col].actuator];
    });
  });

  const scan = scanRows(recording, frames);

  return { task, frames, timestamps, state, action, ...(scan ? { scan } : {}) };
}

export function columnStats(values: ArrayLike<number>, width: number): FeatureStats {
  const rows = width ? Math.floor(values.length / width) : 0;
  const stats: FeatureStats = {
    min: Array<number>(width).fill(Infinity),
    max: Array<number>(width).fill(-Infinity),
    mean: Array<number>(width).fill(0),
    std: Array<number>(width).fill(0),
    count: [rows],
  };
  const squares = Array<number>(width).fill(0);

  for (let i = 0; i < rows * width; i++) {
    const col = i % width;
    const v = values[i];

    stats.min[col] = Math.min(stats.min[col], v);
    stats.max[col] = Math.max(stats.max[col], v);
    stats.mean[col] += v;
    squares[col] += v * v;
  }

  for (let col = 0; col < width; col++) {
    const mean = rows ? stats.mean[col] / rows : 0;

    stats.mean[col] = mean;
    stats.std[col] = rows ? Math.sqrt(Math.max(0, squares[col] / rows - mean * mean)) : 0;
  }

  return stats;
}
