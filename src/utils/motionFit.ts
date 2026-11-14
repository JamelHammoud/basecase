import * as THREE from 'three';
import { toCad } from '../agent/agentFrame';
import type { JointValues } from '../types/robotics';
import type { RobotSkeleton } from '../types/skeleton';
import { solveIK, type IkTarget } from './kinematicsIk';
import type { V3 } from './kinematicsRig';
import type { BoneTurns } from './motionAxes';
import { skeletonLink, skeletonRig } from './skeletonRig';

export interface Candidate {
  node: number;
  order: number;
  origin: V3;
  axis: V3;
  coords: number[];
  effect: number;
}

export interface LimbTrack {
  targets: V3[][];
  rest: V3[];
}

export interface LimbFit {
  chosen: Candidate[];
  values: number[][];
  errorMm: number;
}

export interface FitOptions {
  toleranceMm: number;
  nodes: number[];
}

const DEG = 180 / Math.PI;
const MIN_SPAN_DEG = 0.1;
const IK_ITERATIONS = 40;

const distance = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function candidatesOf(
  nodes: Array<{ node: number; origin: V3; frame: THREE.Quaternion; turns: BoneTurns }>,
  rest: V3[],
  toleranceMm: number,
): Candidate[] {
  const out: Candidate[] = [];

  for (const { node, origin, frame, turns } of nodes) {
    const lever = Math.max(0, ...rest.map((p) => distance(p, origin)));

    turns.axes.forEach((a, order) => {
      const effect = a.span * lever;

      if (a.span * DEG < MIN_SPAN_DEG || effect < toleranceMm / 2) return;

      const axis = new THREE.Vector3(...a.axis).applyQuaternion(frame).normalize();

      out.push({ node, order, origin, axis: axis.toArray() as V3, coords: a.coords.map((c) => c * DEG), effect });
    });
  }

  return out.sort((a, b) => b.effect - a.effect || a.node - b.node || a.order - b.order);
}

const jointId = (i: number) => `c${i}`;

function chainRig(chosen: Candidate[]) {
  const skeleton: RobotSkeleton = {
    frame: 'z-up',
    pairs: [],
    joints: chosen.map((c, i) => ({
      id: jointId(i),
      ...(i ? { parent: jointId(i - 1) } : {}),
      origin: toCad(c.origin),
      axis: toCad(c.axis),
    })),
  };

  return skeletonRig(skeleton, () => undefined);
}

const seedAt = (chosen: Candidate[], frame: number): JointValues =>
  Object.fromEntries(chosen.map((c, i) => [jointId(i), c.coords[frame]]));

function stillError(track: LimbTrack): number {
  return Math.max(0, ...track.targets.flatMap((frame) => frame.map((t, e) => distance(t, track.rest[e]))));
}

interface FrameSolve {
  rig: ReturnType<typeof chainRig>;
  chosen: Candidate[];
  targets: IkTarget[];
  frame: number;
  toleranceMm: number;
}

function solveFrame({ rig, chosen, targets, frame, toleranceMm }: FrameSolve, previous: JointValues | null) {
  const opts = { iterations: IK_ITERATIONS, tolerance: toleranceMm / 4, preferWeight: 0 };
  const own = solveIK(rig, seedAt(chosen, frame), targets, opts);

  if (own.maxError <= toleranceMm || !previous) return own;

  const warm = solveIK(rig, previous, targets, opts);

  return warm.maxError < own.maxError ? warm : own;
}

function replay(chosen: Candidate[], track: LimbTrack, toleranceMm: number): LimbFit | null {
  if (!chosen.length) {
    const errorMm = stillError(track);

    return errorMm <= toleranceMm ? { chosen, values: track.targets.map(() => []), errorMm } : null;
  }

  const rig = chainRig(chosen);
  const link = skeletonLink(jointId(chosen.length - 1));
  const values: number[][] = [];
  let previous: JointValues | null = null;
  let errorMm = 0;

  for (let f = 0; f < track.targets.length; f++) {
    const targets: IkTarget[] = track.targets[f].map((target, e) => ({ partId: link, point: track.rest[e], target }));
    const solved = solveFrame({ rig, chosen, targets, frame: f, toleranceMm }, previous);

    if (solved.maxError > toleranceMm) return null;

    previous = solved.values;
    errorMm = Math.max(errorMm, solved.maxError);
    values.push(chosen.map((_, i) => solved.values[jointId(i)] ?? 0));
  }

  return { chosen, values, errorMm };
}

const inChain = (a: Candidate, b: Candidate, nodes: number[]) =>
  nodes.indexOf(a.node) - nodes.indexOf(b.node) || a.order - b.order;

export function fitLimb(candidates: Candidate[], track: LimbTrack, { toleranceMm, nodes }: FitOptions): LimbFit | null {
  for (let k = 0; k <= candidates.length; k++) {
    const chosen = candidates.slice(0, k).sort((a, b) => inChain(a, b, nodes));
    const fit = replay(chosen, track, toleranceMm);

    if (fit) return fit;
  }

  return null;
}

export interface JointRates {
  speedDps: number;
  accelDps2: number;
}

const SMOOTH_S = 0.05;
const SMOOTH_SHARE = 1 / 30;

function slope(series: number[], dt: number, h: number): number[] {
  const n = series.length;

  return series.map((_, i) => {
    const lo = Math.max(0, i - h);
    const hi = Math.min(n - 1, i + h);

    return hi > lo ? (series[hi] - series[lo]) / ((hi - lo) * dt) : 0;
  });
}

export function peakRates(series: number[], dt: number): JointRates {
  if (series.length < 2 || dt <= 0) return { speedDps: 0, accelDps2: 0 };

  const h = Math.max(1, Math.min(Math.round(SMOOTH_S / dt), Math.floor(series.length * SMOOTH_SHARE)));
  const speed = slope(series, dt, h);
  const accel = slope(speed, dt, h);

  return {
    speedDps: Math.max(...speed.map(Math.abs)),
    accelDps2: Math.max(...accel.map(Math.abs)),
  };
}
