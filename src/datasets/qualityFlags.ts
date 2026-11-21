import { FLAG_KINDS, LABEL_LIMITS, type QualityFlag } from '../cases/tryLabels';
import type { SimJoint, SimModel } from '../sim/mjcfTypes';
import type { Recording } from '../sim/recorder';

export const FLAG_RULES = {
  limitDeg: 1,
  limitMm: 1,
  gapFactor: 1.5,
  effortShare: 0.999,
  effortSeconds: 0.1,
  idleSeconds: 2,
  stillMm: 1,
  stillDeg: 0.5,
};

export interface FlagInput {
  recording: Recording;
  model: SimModel | null;
  modelMatches: boolean | null;
}

interface Stretch {
  from: number;
  to: number;
}

const D2R = Math.PI / 180;
const POSE = 7;

const secondsAt = (recording: Recording, frame: number) => Math.round(recording.t[frame] * 1000) / 1000;

function stretches(frames: number, on: (frame: number) => boolean): Stretch[] {
  const found: Stretch[] = [];
  let from = -1;

  for (let f = 0; f <= frames; f++) {
    const lit = f < frames && on(f);

    if (lit && from < 0) from = f;

    if (!lit && from >= 0) {
      found.push({ from, to: f });
      from = -1;
    }
  }

  return found;
}

function limitBand(joint: SimJoint): [number, number] | null {
  if (!joint.range) return null;

  const scale = joint.type === 'revolute' ? D2R : 1 / 1000;
  const slack = joint.type === 'revolute' ? FLAG_RULES.limitDeg : FLAG_RULES.limitMm;
  const [lo, hi] = joint.range;

  return [(lo + slack) * scale, (hi - slack) * scale];
}

function limitFlags(recording: Recording, model: SimModel): QualityFlag[] {
  const addresses = recording.jointQpos;

  if (!addresses || recording.nq === 0 || addresses.length !== model.joints.length) return [];

  return model.joints.flatMap((joint, i) => {
    const band = limitBand(joint);

    if (!band) return [];

    const q = (f: number) => recording.qpos[f * recording.nq + addresses[i]];
    const hit = (f: number) => q(f) <= band[0] || q(f) >= band[1];

    return stretches(recording.frames, hit).map((s) => ({
      kind: 'joint-limit' as const,
      at: secondsAt(recording, s.from),
      joint: joint.name,
    }));
  });
}

function hasNaN(values: ArrayLike<number>, from: number, length: number) {
  for (let i = from; i < from + length; i++) if (Number.isNaN(values[i])) return true;

  return false;
}

const blankFrame = (r: Recording, f: number) =>
  Number.isNaN(r.t[f]) || hasNaN(r.qpos, f * r.nq, r.nq) || hasNaN(r.poses, f * r.nbody * POSE, r.nbody * POSE);

function blankFrames(recording: Recording): Uint8Array {
  const blank = new Uint8Array(recording.frames);

  for (let f = 0; f < recording.frames; f++) blank[f] = Number(blankFrame(recording, f));

  return blank;
}

const lateFrame = (r: Recording, f: number) => f > 0 && r.t[f] - r.t[f - 1] > FLAG_RULES.gapFactor * r.dt;

function gapFlags(recording: Recording, blanks: Uint8Array): QualityFlag[] {
  const missing = (f: number) => Boolean(blanks[f]) || lateFrame(recording, f);
  const start = (s: Stretch) => (lateFrame(recording, s.from) ? s.from - 1 : s.from);

  return stretches(recording.frames, missing).map((s) => ({
    kind: 'frame-gap' as const,
    at: secondsAt(recording, start(s)),
  }));
}

function effortFlags(recording: Recording): QualityFlag[] {
  const { torque } = recording;

  if (!torque?.length) return [];

  const capped = (f: number) => (torque[f] ?? 0) >= FLAG_RULES.effortShare;
  const held = (s: Stretch) => (s.to - s.from) * recording.dt >= FLAG_RULES.effortSeconds - 1e-9;

  return stretches(Math.min(recording.frames, torque.length), capped)
    .filter(held)
    .map((s) => ({ kind: 'effort' as const, at: secondsAt(recording, s.from) }));
}

function bodyStill(poses: ArrayLike<number>, a: number, b: number) {
  const moved = Math.hypot(poses[b] - poses[a], poses[b + 1] - poses[a + 1], poses[b + 2] - poses[a + 2]);
  const withinPositionLimit = moved * 1000 <= FLAG_RULES.stillMm;

  if (!withinPositionLimit) return false;

  let dot = 0;

  for (let k = 3; k < POSE; k++) dot += poses[a + k] * poses[b + k];

  const turned = 2 * Math.acos(Math.min(1, Math.abs(dot)));

  return turned <= FLAG_RULES.stillDeg * D2R;
}

function stillSince(recording: Recording, anchor: number, frame: number) {
  const row = recording.nbody * POSE;

  for (let b = 0; b < recording.nbody; b++) {
    if (!bodyStill(recording.poses, anchor * row + b * POSE, frame * row + b * POSE)) return false;
  }

  return true;
}

function stillStretches(recording: Recording, blanks: Uint8Array): Stretch[] {
  const found: Stretch[] = [];
  let anchor = -1;

  for (let f = 0; f <= recording.frames; f++) {
    const blank = f === recording.frames || Boolean(blanks[f]);
    const moved = !blank && anchor >= 0 && !stillSince(recording, anchor, f);

    if (anchor >= 0 && (blank || moved)) found.push({ from: anchor, to: f });

    if (blank) anchor = -1;
    else if (anchor < 0 || moved) anchor = f;
  }

  return found;
}

function idleFlags(recording: Recording, blanks: Uint8Array): QualityFlag[] {
  const long = (s: Stretch) => recording.t[s.to - 1] - recording.t[s.from] > FLAG_RULES.idleSeconds;

  return stillStretches(recording, blanks)
    .filter(long)
    .map((s) => ({ kind: 'idle' as const, at: secondsAt(recording, s.from) }));
}

const kindOrder = (flag: QualityFlag) => FLAG_KINDS.indexOf(flag.kind);

const byTime = (a: QualityFlag, b: QualityFlag) =>
  a.at - b.at || kindOrder(a) - kindOrder(b) || (a.joint ?? '').localeCompare(b.joint ?? '');

export function qualityFlags({ recording, model, modelMatches }: FlagInput): QualityFlag[] {
  const blanks = blankFrames(recording);
  const flags: QualityFlag[] = [
    ...(modelMatches === false ? [{ kind: 'model' as const, at: 0 }] : []),
    ...(model && modelMatches !== false ? limitFlags(recording, model) : []),
    ...gapFlags(recording, blanks),
    ...effortFlags(recording),
    ...idleFlags(recording, blanks),
  ];

  return flags.sort(byTime).slice(0, LABEL_LIMITS.flags);
}
