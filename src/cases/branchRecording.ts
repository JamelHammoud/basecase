import type { ContinuationCheckpoint } from '../sim/continuationFile';
import { canonicalJson } from '../skills/hash';
import type { RecordedFault } from '../sim/faults';
import type { Recording } from '../sim/recorder';

interface BranchInput {
  source: Recording;
  checkpoint: Pick<ContinuationCheckpoint, 'frame' | 'time'>;
  suffix: Recording;
}

function samples<T extends Float32Array | Float64Array>(input: {
  source: T;
  suffix: T;
  frame: number;
  width: number;
}): T {
  const { source, suffix, frame, width } = input;
  const prefix = source.subarray(0, (frame + 1) * width);
  const tail = suffix.subarray(width);
  const length = prefix.length + tail.length;
  const out = source instanceof Float64Array ? new Float64Array(length) : new Float32Array(length);

  out.set(prefix);
  out.set(tail, prefix.length);

  return out as T;
}

function events<T extends { at: number }>(source: T[] = [], suffix: T[] = [], time: number): T[] {
  return structuredClone([
    ...source.filter((event) => event.at <= time + 1e-9),
    ...suffix.map((event) => ({ ...event, at: event.at + time })),
  ]);
}

function faults(source: RecordedFault[] = [], suffix: RecordedFault[] = [], time: number): RecordedFault[] {
  const prefix: RecordedFault[] = source
    .filter((fault) => fault.at <= time + 1e-9)
    .map((fault) => ({
      ...fault,
      until: Math.min(fault.until ?? time, time),
    }));

  for (const fault of suffix) {
    const until = fault.until === undefined ? undefined : fault.until + time;
    const previous = prefix.findLast((f) => f.joint === fault.joint && f.kind === fault.kind && f.until === time);

    if (fault.at === 0 && previous) {
      previous.until = until;

      continue;
    }

    prefix.push({ ...fault, at: fault.at + time, until });
  }

  return prefix;
}

function contacts({ source, suffix, checkpoint }: BranchInput) {
  if (!source.contacts || !source.contactOffsets || !suffix.contacts || !suffix.contactOffsets) return {};

  const boundary = source.contactOffsets[checkpoint.frame + 1];
  const skip = suffix.contactOffsets[1];
  const pairs = new Int32Array(boundary + suffix.contacts.length - skip);
  const offsets = new Int32Array(checkpoint.frame + suffix.frames + 1);

  pairs.set(source.contacts.subarray(0, boundary));
  pairs.set(suffix.contacts.subarray(skip), boundary);
  offsets.set(source.contactOffsets.subarray(0, checkpoint.frame + 2));

  for (let i = 2; i < suffix.contactOffsets.length; i++)
    offsets[checkpoint.frame + i] = boundary + suffix.contactOffsets[i] - skip;

  return { contacts: pairs, contactOffsets: offsets };
}

function sameRecordingLayout({ source, suffix, checkpoint }: BranchInput): boolean {
  if (!Number.isInteger(checkpoint.frame) || checkpoint.frame < 0 || checkpoint.frame >= source.frames) return false;

  if (!Number.isFinite(checkpoint.time) || Math.abs(source.t[checkpoint.frame] - checkpoint.time) > 1e-4) return false;

  if (suffix.timeOffset !== undefined && Math.abs(suffix.timeOffset - checkpoint.time) > 1e-8) return false;

  if (suffix.frames < 1 || checkpoint.frame + suffix.frames > 30_000 || source.dt !== suffix.dt) return false;

  return (
    ['nq', 'nv', 'nu', 'nbody'].every((key) => source[key as 'nq'] === suffix[key as 'nq']) &&
    canonicalJson(source.transmission) === canonicalJson(suffix.transmission) &&
    [source, suffix].every((recording) => !recording.scan && !recording.topics)
  );
}

export function branchRecording(input: BranchInput): Recording | null {
  if (!sameRecordingLayout(input)) return null;

  const {
    source,
    suffix,
    checkpoint: { frame, time },
  } = input;
  const append = <T extends Float32Array | Float64Array>(left: T, right: T, width: number) =>
    samples({ source: left, suffix: right, frame, width });
  const t = append(source.t, suffix.t, 1);
  const inputs = events(source.inputs, suffix.inputs, time);

  if (suffix.timeOffset === undefined) for (let i = frame + 1; i < t.length; i++) t[i] += time;

  if (!t.every((at, i) => Number.isFinite(at) && (!i || at > t[i - 1]))) return null;

  return {
    ...(source.transmission ? { transmission: structuredClone(source.transmission) } : {}),
    dt: source.dt,
    frames: frame + suffix.frames,
    nq: source.nq,
    nv: source.nv,
    nu: source.nu,
    nbody: source.nbody,
    t,
    qpos: append(source.qpos, suffix.qpos, source.nq),
    qvel: append(source.qvel, suffix.qvel, source.nv),
    ctrl: append(source.ctrl, suffix.ctrl, source.nu),
    poses: append(source.poses, suffix.poses, source.nbody * 7),
    jointQpos: source.jointQpos?.slice(),
    jointDof: source.jointDof?.slice(),
    root: source.root ? [...source.root] : undefined,
    ...(source.torque && suffix.torque ? { torque: append(source.torque, suffix.torque, 1) } : {}),
    ...contacts(input),
    faults: faults(source.faults, suffix.faults, time),
    commands: events(source.commands, suffix.commands, time),
    controller: structuredClone(source.controller),
    world: events(source.world, suffix.world, time),
    ...(inputs.length ? { inputs } : {}),
  };
}
