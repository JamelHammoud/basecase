import { decodeRecording } from '../cases/recordingFile';
import type { Recording } from '../sim/recorder';
import { labelSegments } from './segmentRows';
import type { FrozenTrySample } from './snapshotTypes';

export function readSnapshotRecording(bytes: Uint8Array): Recording {
  const recording = decodeRecording(bytes);

  if (!recording) throw new Error('The dataset recording content is damaged.');

  return recording;
}

export function sampleRecording(recording: Recording, sample: Pick<FrozenTrySample, 'from' | 'to'>): Recording {
  const { from, to } = sample;

  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to > recording.frames || from >= to)
    throw new Error('The selected dataset frames are missing.');

  if (from === 0 && to === recording.frames) return recording;

  const start = recording.t[from];
  const end = recording.t[to - 1] + recording.dt;
  const timed = <T extends { at: number }>(items: T[] | undefined) =>
    items?.filter((item) => item.at < end).map((item) => ({ ...item, at: Math.max(0, item.at - start) }));

  return {
    ...recording,
    frames: to - from,
    t: recording.t.slice(from, to).map((t) => t - start),
    ctrl: recording.ctrl.slice(from * recording.nu, to * recording.nu),
    qpos: recording.qpos.slice(from * recording.nq, to * recording.nq),
    qvel: recording.qvel.slice(from * recording.nv, to * recording.nv),
    poses: recording.poses.slice(from * recording.nbody * 7, to * recording.nbody * 7),
    ...(recording.scan ? { scan: recording.scan.slice(from * recording.scanWidth!, to * recording.scanWidth!) } : {}),
    ...(recording.torque ? { torque: recording.torque.slice(from, to) } : {}),
    faults: recording.faults
      ?.filter((fault) => fault.at < end && (fault.until === undefined || fault.until > start))
      .map((fault) => ({
        ...fault,
        at: Math.max(0, fault.at - start),
        ...(fault.until === undefined ? {} : { until: Math.min(end, fault.until) - start }),
      })),
    inputs: timed(recording.inputs),
    commands: timed(recording.commands),
    world: timed(recording.world),
  };
}

export const sampleSegments = (sample: FrozenTrySample) =>
  labelSegments(sample.stored.labels)
    .map((segment) => ({
      ...segment,
      from: Math.max(segment.from, sample.from) - sample.from,
      to: Math.min(segment.to, sample.to) - sample.from,
    }))
    .filter((segment) => segment.to > segment.from);
