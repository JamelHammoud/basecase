import type { StoredTry, TryOrigin, TrySource, TryVerdict } from '../../tryFile';
import { MOTION_SAMPLES, type BodyClass, type MotionTrace } from '../types';

type Curve = (t: number) => [number, number, number];

export function trace(body: BodyClass, joints: number, path: Curve, speed: (t: number) => number): MotionTrace {
  const at = (i: number) => i / (MOTION_SAMPLES - 1);

  return {
    body,
    joints,
    path: Array.from({ length: MOTION_SAMPLES }, (_, i) => path(at(i))).flat(),
    speed: Array.from({ length: MOTION_SAMPLES }, (_, i) => speed(at(i))),
  };
}

export const graspMotion = (scale = 1, wobble = 0) =>
  trace(
    'fixed',
    6,
    (t) => [0.2 * scale * Math.min(1, t * 2), 0.1 * scale * Math.max(0, t * 2 - 1), wobble * Math.sin(t * 9)],
    (t) => (t < 0.5 ? 1 : 0.4) + wobble,
  );

export const waveMotion = () =>
  trace(
    'fixed',
    6,
    (t) => [0, 0.1 * Math.sin(t * 20), 0.02 * t],
    (t) => Math.abs(Math.cos(t * 20)),
  );

export const walkMotion = (joints = 18) =>
  trace(
    'mobile',
    joints,
    (t) => [t * 1.5, 0, 0.01 * Math.sin(t * 40)],
    (t) => 2 + Math.sin(t * 40),
  );

export interface TrySpec {
  id: string;
  robot?: string;
  sceneId?: string;
  caseName?: string | null;
  source?: TrySource;
  input?: string | null;
  startedAt?: string;
  seconds?: number;
  verdict?: TryVerdict;
  task?: string;
  origin?: TryOrigin;
  motion?: MotionTrace;
  faulted?: boolean;
}

export function storedTry(spec: TrySpec): StoredTry {
  return {
    version: 1,
    id: spec.id,
    sceneId: spec.sceneId ?? 'scene-a',
    robot: { name: spec.robot ?? 'SO-101 Arm', modelHash: 'm', joints: [] },
    case: spec.caseName === null ? null : { id: 'case', name: spec.caseName ?? 'Grasp the Red Block', hash: 'c' },
    source: spec.source ?? 'case',
    input: spec.input === undefined ? 'leader-arm' : spec.input,
    startedAt: spec.startedAt ?? '2026-11-14T09:00:00.000Z',
    seconds: spec.seconds ?? 12,
    rate: 50,
    frames: 600,
    outcome: { verdict: spec.verdict ?? 'passed', margin: null },
    seed: 0,
    sourceTry: null,
    faults: spec.faulted ? [{ joint: 'elbow', kind: 'stuck', at: 1 }] : [],
    ...(spec.task ? { task: spec.task } : {}),
    ...(spec.origin ? { origin: spec.origin } : {}),
    ...(spec.motion ? { motion: spec.motion } : {}),
  };
}
