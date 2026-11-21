import type { SimModel } from '../sim/mjcfTypes';
import { obsSize, observe, type ObsSource, type PolicySpec } from '../sim/policy';
import type { Recording } from '../sim/recorder';
import { canExport, DATASET_FPS, datasetStride, episodeData, robotJoints } from './episodes';
import { jointIndices } from './jointIndices';
import { sha256Hex } from '../skills/hash';
import { teachingArraysFit } from '../sim/teachingRecording';

export const DEMO_CONTROL_DT = 1 / DATASET_FPS;

const MIN_ACTION_SCALE = 0.25;
const SCALE_HEADROOM = 1.05;

export interface DemoEpisode {
  obs: number[][];
  actions: number[][];
}

export type DemoSpec = Pick<PolicySpec, 'defaultPose' | 'actionScale' | 'command'> &
  Partial<Pick<PolicySpec, 'controlDt'>>;

export const differenced = (recording: Recording, model: SimModel) =>
  recording.nv === 0 || recording.jointDof?.length !== model.joints.length;

const fixedBase = (recording: Recording, model: SimModel) =>
  !model.robots[0]?.floating && (!recording.root || recording.root[0] < 0);

export const canTrain = (recording: Recording, model: SimModel): boolean =>
  !recording.teaching &&
  canExport(recording, model) &&
  recording.frames > datasetStride(recording.dt) &&
  (differenced(recording, model) ? fixedBase(recording, model) : !!recording.root);

function obsSource(recording: Recording, model: SimModel): ObsSource {
  const index = jointIndices(model.joints, robotJoints(model));
  const [rootQpos, rootDof] = recording.root ?? [-1, -1];
  const own = differenced(recording, model);

  return {
    qpos: [],
    qvel: [],
    rootQpos: own ? -1 : rootQpos,
    rootDof: own ? -1 : rootDof,
    jointQpos: index.map((i) => recording.jointQpos?.[i] ?? 0),
    jointDof: own ? index.map((_, k) => k) : index.map((i) => recording.jointDof?.[i] ?? 0),
  };
}

function differencedVelocity(data: { state: Float32Array }, width: number, row: number, fps: number): Float32Array {
  const out = new Float32Array(width);

  if (row === 0) return out;

  for (let k = 0; k < width; k++) out[k] = (data.state[row * width + k] - data.state[(row - 1) * width + k]) * fps;

  return out;
}

export function demoEpisode(recording: Recording, model: SimModel, spec: DemoSpec): DemoEpisode {
  if (recording.teaching) throw new Error('Select correction windows from this try.');

  const fps = spec.controlDt ? 1 / spec.controlDt : DATASET_FPS;
  const data = episodeData(recording, model, '', { fps });
  const width = robotJoints(model).length;
  const src = obsSource(recording, model);
  const actionAt = (row: number) =>
    Array.from({ length: width }, (_, k) => (data.action[row * width + k] - spec.defaultPose[k]) / spec.actionScale);
  const own = differenced(recording, model);
  const rows = data.frames.length - 1;
  const obs: number[][] = [];
  const actions: number[][] = [];

  for (let row = 0; row < rows; row++) {
    const f = data.frames[row];

    src.qpos = recording.qpos.subarray(f * recording.nq, (f + 1) * recording.nq);
    src.qvel = own
      ? differencedVelocity(data, width, row, fps)
      : recording.qvel.subarray(f * recording.nv, (f + 1) * recording.nv);

    const last = row ? actionAt(row) : Array<number>(width).fill(0);

    obs.push([...observe(src, spec, last, new Float32Array(obsSize(width)))]);
    actions.push(actionAt(row + 1));
  }

  return { obs, actions };
}

function correctionSource(recording: Recording, model: SimModel) {
  const source = recording.teaching;

  if (!source || !teachingArraysFit(recording) || source.model !== sha256Hex(model.xml))
    throw new Error('Choose corrections recorded on this robot model.');

  const joints = robotJoints(model);

  if (joints.length !== source.joints.length || joints.some((joint, i) => joint.id !== source.joints[i]))
    throw new Error('Choose corrections with the same joint order.');

  if (differenced(recording, model) || recording.jointQpos?.length !== model.joints.length)
    throw new Error('Choose corrections with recorded joint positions and velocities.');

  return { source, joints };
}

function correctionTimes(recording: Recording, selection: { from: number; to: number }) {
  const { from, to } = selection;

  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || from >= to || to > recording.frames)
    throw new Error('The selected dataset frames are missing.');

  return {
    start: recording.t[from],
    end: to < recording.frames ? recording.t[to] : recording.t[to - 1] + recording.dt,
  };
}

export function correctionEpisode(
  recording: Recording,
  model: SimModel,
  selection: { from: number; to: number },
): DemoEpisode {
  const { source, joints } = correctionSource(recording, model);
  const { start, end } = correctionTimes(recording, selection);
  const width = joints.length;
  const src = obsSource(recording, model);
  const obs: number[][] = [];
  const actions: number[][] = [];
  const tolerance = source.physicsDt / 4;
  let next = -Infinity;

  for (let i = 0; i < source.boundaries; i++) {
    const time = recording.actionTime![i];

    if (recording.actionOwner![i] !== 1 || time < start - tolerance || time >= end - tolerance) continue;

    if (i === 0 || recording.actionOwner![i - 1] !== 1) next = -Infinity;

    if (time + 1e-7 < next) continue;

    src.qpos = recording.actionQpos!.subarray(i * recording.nq, (i + 1) * recording.nq);
    src.qvel = recording.actionQvel!.subarray(i * recording.nv, (i + 1) * recording.nv);

    const previous = recording.actionPrevious!.subarray(i * width, (i + 1) * width);
    const action = joints.map(
      (joint, k) =>
        (recording.actionCtrl![i * recording.nu + joint.actuator] - source.defaultPose[k]) / source.actionScale,
    );

    if (action.some((value) => Math.abs(value) > 1 + 1e-6))
      throw new Error('Keep corrections within the source policy’s action range.');

    obs.push([...observe(src, source, previous, new Float32Array(obsSize(width)))]);
    actions.push(action);
    next = time + source.controlDt;
  }

  if (!actions.length) throw new Error('Select a window with operator actions.');

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
