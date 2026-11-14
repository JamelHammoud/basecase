import type { V3 } from '../../utils/kinematics';
import { point, type GestureFrame } from './gestureFrame';

export const BUILTIN_GESTURES = [
  'wave',
  'raise-hand',
  'raise-both-hands',
  'point-left',
  'point-right',
  'thumbs-up',
  'open-palm',
  'clap',
  'nod',
  'shake-head',
] as const;

export type BuiltinGesture = (typeof BUILTIN_GESTURES)[number];

export const isBuiltinGesture = (name: string): name is BuiltinGesture =>
  (BUILTIN_GESTURES as readonly string[]).includes(name);

export const WINDOW_S = 1.5;

type Side = 'left' | 'right';

interface Arm {
  shoulder: V3;
  elbow: V3;
  wrist: V3;
  index: V3;
  pinky: V3;
  thumb: V3;
}

const SIDES: readonly Side[] = ['left', 'right'];
const R2D = 180 / Math.PI;

const arm = (f: GestureFrame, side: Side): Arm => ({
  shoulder: [side === 'left' ? 0.5 : -0.5, 0, 0],
  elbow: point(f, `${side}Elbow`),
  wrist: point(f, `${side}Wrist`),
  index: point(f, `${side}Index`),
  pinky: point(f, `${side}Pinky`),
  thumb: point(f, `${side}Thumb`),
});

const other = (side: Side): Side => (side === 'left' ? 'right' : 'left');

const gap = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const span = (values: number[]) => (values.length ? Math.max(...values) - Math.min(...values) : 0);

export function legs(series: number[], amplitude: number): number {
  let count = 0;
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  let rising: boolean | null = null;

  for (const v of series.filter(Number.isFinite)) {
    low = Math.min(low, v);
    high = Math.max(high, v);

    if (rising !== true && v - low >= amplitude) {
      count++;
      rising = true;
      high = v;
    } else if (rising !== false && high - v >= amplitude) {
      count++;
      rising = false;
      low = v;
    }
  }

  return count;
}

export const smoothed = (series: number[], reach = 2) =>
  series.map((_, i) => {
    const near = series.slice(Math.max(0, i - reach), i + reach + 1).filter(Number.isFinite);

    return near.length ? near.reduce((sum, v) => sum + v, 0) / near.length : Number.NaN;
  });

const since = (w: GestureFrame[], seconds: number) => {
  const end = w[w.length - 1]?.t ?? 0;

  return w.filter((f) => f.t >= end - seconds);
};

const covers = (w: GestureFrame[], seconds: number) => w.length > 1 && w[w.length - 1].t - w[0].t >= seconds * 0.9;

function held(w: GestureFrame[], seconds: number, holds: (f: GestureFrame) => boolean): GestureFrame[] | null {
  const recent = since(w, seconds);

  return covers(w, seconds) && recent.every(holds) ? recent : null;
}

const stillHand = (frames: GestureFrame[], side: Side, most = 0.2) => {
  const wrists = frames.map((f) => arm(f, side).wrist);

  return [0, 1, 2].every((k) => span(wrists.map((p) => p[k])) < most);
};

const handSize = (a: Arm) => Math.max(gap(a.index, a.wrist), gap(a.pinky, a.wrist));

function heldBySide(w: GestureFrame[], seconds: number, pose: (a: Arm, f: GestureFrame, side: Side) => boolean) {
  return SIDES.some((side) => {
    const frames = held(w, seconds, (f) => pose(arm(f, side), f, side));

    return !!frames && stillHand(frames, side);
  });
}

const raised = (a: Arm) => a.wrist[1] > 1 && a.elbow[1] > 0.25;

const lowered = (a: Arm) => Number.isNaN(a.wrist[1]) || a.wrist[1] < 0.3;

function waving(w: GestureFrame[]) {
  return SIDES.some((side) => {
    const frames = w.filter((f) => {
      const a = arm(f, side);

      return a.wrist[1] > 0.2 && a.wrist[1] > a.elbow[1];
    });

    if (!covers(w, 1) || frames.length < w.length * 0.8) return false;

    return (
      legs(
        smoothed(
          frames.map((f) => arm(f, side).wrist[0] - arm(f, side).elbow[0]),
          1,
        ),
        0.2,
      ) >= 3
    );
  });
}

function pointing(toward: 1 | -1) {
  return (a: Arm) => {
    const d: V3 = [a.wrist[0] - a.shoulder[0], a.wrist[1] - a.shoulder[1], a.wrist[2] - a.shoulder[2]];
    const length = Math.hypot(...d);
    const reach = gap(a.elbow, a.shoulder) + gap(a.wrist, a.elbow);

    return length > 0.85 * reach && (d[0] * toward) / length > 0.8;
  };
}

const thumbUp = (a: Arm) => {
  const size = handSize(a);

  return (
    size > 0.05 &&
    a.thumb[1] - Math.max(a.index[1], a.pinky[1]) > 0.4 * size &&
    a.wrist[1] > -1.4 &&
    a.wrist[1] < 0.6 &&
    a.wrist[2] > 0.15
  );
};

const palmUp = (a: Arm) => {
  const size = handSize(a);

  return (
    size > 0.05 &&
    a.index[1] - a.wrist[1] > 0.6 * size &&
    a.pinky[1] - a.wrist[1] > 0.5 * size &&
    a.wrist[1] > -0.3 &&
    a.wrist[1] < 1 &&
    a.wrist[1] > a.elbow[1] &&
    a.wrist[2] > 0.5
  );
};

function clapping(w: GestureFrame[]) {
  if (!covers(w, 0.9)) return false;

  const end = w[w.length - 1].t;
  const apart = (f: GestureFrame) => gap(point(f, 'leftWrist'), point(f, 'rightWrist'));
  const recent = since(w, 0.25).map(apart);
  const before = w.filter((f) => f.t >= end - 0.9 && f.t < end - 0.25).map(apart);

  return Math.min(...recent) < 0.35 && Math.max(...before) > 0.8;
}

function headAngles(f: GestureFrame) {
  const nose = point(f, 'nose');
  const l = point(f, 'leftEar');
  const r = point(f, 'rightEar');
  const ears: V3 = [(l[0] + r[0]) / 2, (l[1] + r[1]) / 2, (l[2] + r[2]) / 2];
  const forward = nose[2] - ears[2];

  return { pitch: Math.atan2(ears[1] - nose[1], forward) * R2D, yaw: Math.atan2(nose[0] - ears[0], forward) * R2D };
}

function shaking(w: GestureFrame[], along: 'pitch' | 'yaw') {
  if (!covers(w, 0.8)) return false;

  const angles = w.map(headAngles);
  const turn = smoothed(angles.map((a) => a[along]));
  const across = smoothed(angles.map((a) => a[along === 'pitch' ? 'yaw' : 'pitch']));

  return along === 'pitch' ? legs(turn, 10) >= 2 && span(across) < 12 : legs(turn, 15) >= 3 && span(across) < 12;
}

export const BUILTIN_DETECTORS: Record<BuiltinGesture, (w: GestureFrame[]) => boolean> = {
  wave: waving,
  'raise-hand': (w) =>
    heldBySide(w, 0.5, (a, f, side) => raised(a) && lowered(arm(f, other(side))) && a.wrist[1] > a.elbow[1]),
  'raise-both-hands': (w) => !!held(w, 0.4, (f) => raised(arm(f, 'left')) && raised(arm(f, 'right'))),
  'point-left': (w) => heldBySide(w, 0.5, pointing(1)),
  'point-right': (w) => heldBySide(w, 0.5, pointing(-1)),
  'thumbs-up': (w) => heldBySide(w, 0.5, thumbUp),
  'open-palm': (w) => heldBySide(w, 0.5, palmUp),
  clap: clapping,
  nod: (w) => shaking(w, 'pitch'),
  'shake-head': (w) => shaking(w, 'yaw'),
};
