import type { SimModel } from '../sim/mjcfTypes';
import { obsSize, observe, type ObsSource, type PolicySpec } from '../sim/policy';
import type { Recording } from '../sim/recorder';
import { canExport, DATASET_FPS, episodeData, robotJoints } from './episodes';

export const DEMO_CONTROL_DT = 1 / DATASET_FPS;

const MIN_ACTION_SCALE = 0.25;
const SCALE_HEADROOM = 1.05;

export interface DemoEpisode {
  obs: number[][];
  actions: number[][];
}

export type DemoSpec = Pick<PolicySpec, 'defaultPose' | 'actionScale' | 'command'>;

export const canTrain = (recording: Recording, model: SimModel): boolean =>
  canExport(recording, model) && recording.jointDof?.length === model.joints.length && !!recording.root;

function obsSource(recording: Recording, model: SimModel): ObsSource {
  const index = robotJoints(model).map((j) => model.joints.indexOf(j));
  const [rootQpos, rootDof] = recording.root ?? [-1, -1];

  return {
    qpos: [],
    qvel: [],
    rootQpos,
    rootDof,
    jointQpos: index.map((i) => recording.jointQpos?.[i] ?? 0),
    jointDof: index.map((i) => recording.jointDof?.[i] ?? 0),
  };
}

export function demoEpisode(recording: Recording, model: SimModel, spec: DemoSpec): DemoEpisode {
  const data = episodeData(recording, model, '');
  const width = robotJoints(model).length;
  const src = obsSource(recording, model);
  const actionAt = (row: number) =>
    Array.from({ length: width }, (_, k) => (data.action[row * width + k] - spec.defaultPose[k]) / spec.actionScale);
  const rows = data.frames.length - 1;
  const obs: number[][] = [];
  const actions: number[][] = [];

  for (let row = 0; row < rows; row++) {
    const f = data.frames[row];

    src.qpos = recording.qpos.subarray(f * recording.nq, (f + 1) * recording.nq);
    src.qvel = recording.qvel.subarray(f * recording.nv, (f + 1) * recording.nv);

    const last = row ? actionAt(row) : Array<number>(width).fill(0);

    obs.push([...observe(src, spec, last, new Float32Array(obsSize(width)))]);
    actions.push(actionAt(row + 1));
  }

  return { obs, actions };
}

export function demoActionScale(recordings: Recording[], model: SimModel, defaultPose: number[]): number {
  const width = robotJoints(model).length;
  let widest = 0;

  for (const recording of recordings) {
    const { action } = episodeData(recording, model, '');

    for (let i = 0; i < action.length; i++) widest = Math.max(widest, Math.abs(action[i] - defaultPose[i % width]));
  }

  return Math.max(MIN_ACTION_SCALE, widest * SCALE_HEADROOM);
}
