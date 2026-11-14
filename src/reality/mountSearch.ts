import { inside, silhouetteDrawer, type JointDegrees, type Silhouette } from '../cameras/silhouette';
import type { DatasetCamera } from '../datasets/cameras';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import type { CalibrationVerdict, JointMount } from './types';

export const COUNTS_PER_TURN = 4096;
export const DEFAULT_MOUNT: JointMount = Object.freeze({ zeroCounts: 2048, direction: 1 });

export const MOUNT_SEARCH = {
  spanDeg: 20,
  coarseDeg: 0.5,
  fineDeg: 0.1,
  distinctDeg: 3,
  sameDeg: 1,
  margin: 0.02,
};

export interface MountFrame {
  counts: number[];
  silhouette: Silhouette;
}

export interface MountRequest {
  parts: ScenePart[];
  joints: RobotJoint[];
  view: DatasetCamera;
  order: string[];
  mounts: JointMount[];
  search: string[];
  frames: MountFrame[];
}

export interface MountResult {
  jointId: string;
  verdict: CalibrationVerdict;
  mount: JointMount;
  offsetDeg: number;
  score: number;
  runnerUp: number;
}

interface Candidate {
  direction: 1 | -1;
  offsetDeg: number;
  score: number;
}

const countsPerDeg = COUNTS_PER_TURN / 360;

export const mountDegrees = (counts: number, mount: JointMount) =>
  (mount.direction * (counts - mount.zeroCounts)) / countsPerDeg;

export const sameMount = (a: JointMount, b: JointMount) => a.zeroCounts === b.zeroCounts && a.direction === b.direction;

const wrapCounts = (counts: number) => ((Math.round(counts) % COUNTS_PER_TURN) + COUNTS_PER_TURN) % COUNTS_PER_TURN;

function steps(from: number, to: number, step: number): number[] {
  const count = Math.round((to - from) / step);

  return Array.from({ length: count + 1 }, (_, i) => Math.round((from + i * step) * 1000) / 1000);
}

interface Scorer {
  order: number[];
  score: (k: number, mount: JointMount, mounts: readonly JointMount[]) => number;
}

function scorer(request: MountRequest): Scorer {
  const rig = buildRig(request.joints, request.parts);
  const draw = silhouetteDrawer({ parts: request.parts, joints: request.joints, view: request.view });
  const own = request.order.map(
    (id) => new Set(request.parts.filter((p) => rig.ownerOf.get(p.id) === id).map((p) => p.id)),
  );
  const pose = (counts: number[], mounts: readonly JointMount[]): JointDegrees =>
    Object.fromEntries(request.order.map((id, k) => [id, mountDegrees(counts[k], mounts[k])]));
  const depth = (k: number) => rig.depth.get(request.order[k]) ?? 0;

  return {
    order: request.order.map((_, k) => k).sort((a, b) => depth(a) - depth(b) || a - b),
    score: (k, mount, mounts) => {
      const trial = mounts.map((m, i) => (i === k ? mount : m));

      return request.frames.reduce((sum, f) => sum + inside(draw(pose(f.counts, trial), own[k]), f.silhouette), 0);
    },
  };
}

const best = (list: Candidate[]) => list.reduce((a, b) => (b.score > a.score ? b : a), list[0]);

const shifted = (base: JointMount, direction: 1 | -1, offsetDeg: number): JointMount => ({
  zeroCounts: base.zeroCounts + offsetDeg * countsPerDeg,
  direction,
});

interface Decision {
  verdict: CalibrationVerdict;
  winner: Candidate;
  runnerUp: number;
}

function decide(k: number, mounts: readonly JointMount[], start: JointMount, { score }: Scorer): Decision {
  const { spanDeg, coarseDeg, fineDeg, distinctDeg, sameDeg, margin } = MOUNT_SEARCH;
  const trial = (direction: 1 | -1, offsetDeg: number): Candidate => ({
    direction,
    offsetDeg,
    score: score(k, shifted(start, direction, offsetDeg), mounts),
  });
  const coarse = ([1, -1] as const).flatMap((d) => steps(-spanDeg, spanDeg, coarseDeg).map((o) => trial(d, o)));
  const bestOf = (d: 1 | -1) => best(coarse.filter((c) => c.direction === d));
  const fine = ([1, -1] as const).flatMap((d) => {
    const around = bestOf(d).offsetDeg;

    return steps(around - coarseDeg, around + coarseDeg, fineDeg).map((o) => trial(d, o));
  });
  const all = [...coarse, ...fine];
  const winner = best(all);
  const distinct = all.filter(
    (c) => c.direction !== winner.direction || Math.abs(c.offsetDeg - winner.offsetDeg) > distinctDeg,
  );
  const runnerUp = Math.max(...distinct.map((c) => c.score));

  if (winner.score - runnerUp < margin) return { verdict: 'cant-tell', winner, runnerUp };

  const same = winner.direction === start.direction && Math.abs(winner.offsetDeg) <= sameDeg;

  return { verdict: same ? 'consistent' : 'measured', winner, runnerUp };
}

const decided = (start: JointMount, d: Decision): JointMount =>
  d.verdict === 'measured' ? shifted(start, d.winner.direction, d.winner.offsetDeg) : start;

const rounded = (mount: JointMount): JointMount => ({
  zeroCounts: wrapCounts(mount.zeroCounts),
  direction: mount.direction,
});

export function findMounts(request: MountRequest): MountResult[] {
  const scoring = scorer(request);
  const estimate = [...request.mounts];
  const decisions = new Map<number, Decision>();

  for (const k of scoring.order.filter((k) => request.search.includes(request.order[k]))) {
    const decision = decide(k, estimate, request.mounts[k], scoring);

    decisions.set(k, decision);
    estimate[k] = decided(request.mounts[k], decision);
  }

  return [...decisions.keys()]
    .sort((a, b) => a - b)
    .map((k) => {
      const d = decisions.get(k)!;

      return {
        jointId: request.order[k],
        verdict: d.verdict,
        mount: rounded(estimate[k]),
        offsetDeg: d.verdict === 'measured' ? d.winner.offsetDeg : 0,
        score: d.winner.score,
        runnerUp: d.runnerUp,
      };
    });
}
