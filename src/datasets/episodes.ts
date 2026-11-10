import type { SimJoint, SimModel } from '../sim/mjcfTypes';
import type { Recording } from '../sim/recorder';

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
}

export const datasetStride = (dt: number) => Math.max(1, Math.round(1 / (dt * DATASET_FPS)));

export function sampledFrames(recording: Pick<Recording, 'frames' | 'dt'>): number[] {
  const stride = datasetStride(recording.dt);

  return Array.from({ length: Math.ceil(recording.frames / stride) }, (_, k) => k * stride);
}

export function robotJoints(model: SimModel, robotIndex = 0): SimJoint[] {
  const ids = new Set(model.robots[robotIndex]?.joints ?? []);

  return model.joints.filter((j) => ids.has(j.id));
}

export function canExport(recording: Recording, model: SimModel): boolean {
  return (
    !!recording.jointQpos &&
    recording.jointQpos.length === model.joints.length &&
    recording.nbody === model.bodies.length &&
    recording.frames > 1
  );
}

export function episodeData(recording: Recording, model: SimModel, task: string): EpisodeData {
  const joints = robotJoints(model);
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

  return { task, frames, timestamps, state, action };
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
