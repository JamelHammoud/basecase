import { isHash } from '../skills/hash';
import type { Recording } from './recorder';
import type { AppliedOwner, TeachingSource } from './teaching';

export interface TeachingRecording extends TeachingSource {
  boundaries: number;
  ownership?: OwnershipInterval[];
}

export const TEACHING_ARRAYS = [
  'actionTime',
  'actionOwner',
  'actionCtrl',
  'actionQpos',
  'actionQvel',
  'actionPrevious',
] as const;

export type TeachingArrayKey = (typeof TEACHING_ARRAYS)[number];

export interface OwnershipInterval {
  owner: AppliedOwner;
  at: number;
  until: number;
}

export function ownershipIntervals(recording: Recording): OwnershipInterval[] {
  const { actionTime: time, actionOwner: owners, teaching } = recording;

  if (!time?.length || !owners || !teaching) return [];

  const intervals: OwnershipInterval[] = [];
  let from = 0;

  for (let i = 1; i <= time.length; i++) {
    if (i < time.length && owners[i] === owners[from]) continue;

    intervals.push({
      owner: (['policy', 'operator', 'context'] as const)[owners[from]],
      at: time[from],
      until: i < time.length ? time[i] : time[i - 1] + teaching.physicsDt,
    });
    from = i;
  }

  return intervals;
}

export const correctionFrames = (recording: Recording) =>
  ownershipIntervals(recording)
    .filter((window) => window.owner === 'operator')
    .map((window) => ({
      from: Math.max(0, Math.floor((window.at + 1e-7) / recording.dt)),
      to: Math.min(recording.frames, Math.ceil((window.until - 1e-7) / recording.dt)),
    }));

export function teachingLengths(recording: Pick<Recording, 'nq' | 'nv' | 'nu' | 'teaching'>) {
  const boundaries = recording.teaching?.boundaries ?? 0;
  const width = recording.teaching?.joints.length ?? 0;

  return {
    actionTime: boundaries,
    actionOwner: boundaries,
    actionCtrl: boundaries * recording.nu,
    actionQpos: boundaries * recording.nq,
    actionQvel: boundaries * recording.nv,
    actionPrevious: boundaries * width,
  };
}

const finitePositive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
const finiteArray = (v: unknown, size: number): v is number[] =>
  Array.isArray(v) && v.length === size && v.every((n) => typeof n === 'number' && Number.isFinite(n));

function sourceFits(v: TeachingRecording) {
  return (
    isHash(v.policy) &&
    (v.skill === undefined || isHash(v.skill)) &&
    isHash(v.model) &&
    typeof v.robot === 'string' &&
    v.robot.length <= 128 &&
    typeof v.fingerprint === 'string' &&
    v.fingerprint.length <= 1024 &&
    finiteArray(v.command, 3) &&
    finitePositive(v.actionScale) &&
    finitePositive(v.physicsDt) &&
    finitePositive(v.controlDt) &&
    v.controlDt >= v.physicsDt
  );
}

export function isTeachingRecording(value: unknown): value is TeachingRecording {
  const v = value as TeachingRecording | null;

  if (!v || typeof v !== 'object' || !Array.isArray(v.joints)) return false;

  const width = v.joints.length;

  return (
    sourceFits(v) &&
    width > 0 &&
    width <= 4096 &&
    v.joints.every((id) => typeof id === 'string' && id.length <= 128) &&
    new Set(v.joints).size === width &&
    finiteArray(v.defaultPose, width) &&
    Number.isSafeInteger(v.boundaries) &&
    v.boundaries > 0 &&
    v.boundaries <= 3_600_000
  );
}

export function teachingArraysFit(recording: Recording): boolean {
  const source = recording.teaching;

  if (!source) return TEACHING_ARRAYS.every((key) => recording[key] === undefined);

  if (!isTeachingRecording(source) || TEACHING_ARRAYS.some((key) => !recording[key])) return false;

  const { actionTime, actionOwner } = recording;
  const lastFrame = recording.t.at(-1);
  const lengths = teachingLengths(recording);

  return (
    TEACHING_ARRAYS.every((key) => recording[key]!.length === lengths[key] && recording[key]!.every(Number.isFinite)) &&
    actionTime!.every(
      (time, i, all) =>
        time >= 0 && (i === 0 || Math.abs(time - all[i - 1] - source.physicsDt) < source.physicsDt * 1e-5),
    ) &&
    actionOwner!.every((owner) => owner === 0 || owner === 1 || owner === 2) &&
    ownershipFits(recording) &&
    lastFrame !== undefined &&
    actionTime!.at(-1)! < lastFrame + recording.dt + 1e-7
  );
}

function ownershipFits(recording: Recording) {
  const declared = recording.teaching?.ownership;

  if (declared === undefined) return true;

  if (!Array.isArray(declared)) return false;

  const actual = ownershipIntervals(recording);

  return (
    declared.length === actual.length &&
    declared.every(
      (value, i) =>
        value &&
        value.owner === actual[i].owner &&
        Math.abs(value.at - actual[i].at) < 1e-7 &&
        Math.abs(value.until - actual[i].until) < 1e-7,
    )
  );
}

export function sliceTeaching(recording: Recording, start: number, end: number): Partial<Recording> {
  const source = recording.teaching;

  if (!source || !recording.actionTime) return {};

  const tolerance = source.physicsDt / 4;
  const from = recording.actionTime.findIndex((t) => t >= start - tolerance);
  const after = recording.actionTime.findIndex((t) => t >= end - tolerance);
  const to = after < 0 ? source.boundaries : after;

  if (from < 0 || from >= to)
    return { teaching: undefined, ...Object.fromEntries(TEACHING_ARRAYS.map((key) => [key, undefined])) };

  const lengths = teachingLengths({ ...recording, teaching: { ...source, boundaries: 1 } });
  const arrays = Object.fromEntries(
    TEACHING_ARRAYS.map((key) => [key, recording[key]!.slice(from * lengths[key], to * lengths[key])]),
  );
  const first = recording.actionTime[from];
  const origin = Math.abs(first - start) < tolerance ? first : start;

  return {
    ...arrays,
    actionTime: recording.actionTime.slice(from, to).map((t) => t - origin),
    teaching: { ...source, boundaries: to - from, ownership: undefined },
  };
}
