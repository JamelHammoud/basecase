import * as THREE from 'three';
import type { AssemblyGeometry } from '../../assembly/assemblyGeometry';
import { planRemoval, type RemovalPlan } from '../../assembly/removalOrder';
import type { Placed } from '../../three/analysis/collide';
import { pairsWithin } from '../../three/analysis/gaps';
import { connectedGroups, isConnected, joinedPairs, joiningHardware, type Pair } from './mergeJoins';
import { guideSteps, stepsSaved } from './mergeGuide';
import { orderProblem } from './mergeOrder';
import { printProblem } from './mergePrint';
import type { LeftOut, LeftOutReason, MergeCandidate, MergeGroup, MergeInput, MergePlan } from './mergeTypes';

export const TOUCH_MM = 0.5;

const MAX_TRIES = 64;
const PLAN_MS = 10000;

interface Planner {
  g: AssemblyGeometry;
  input: MergeInput;
  placed: Map<string, Placed>;
  byId: Map<string, MergeCandidate>;
  pairs: Pair[];
  before: RemovalPlan;
  roles: Record<string, string>;
  tried: Map<string, LeftOutReason | null>;
  steps: number;
}

const volumeOf = (p: Planner, id: string) => {
  const size = p.placed.get(id)!.box.getSize(new THREE.Vector3());

  return Math.round(size.x * size.y * size.z);
};

function keepOf(p: Planner, members: string[]): string {
  const rank = (id: string) => [p.byId.get(id)!.anchors, volumeOf(p, id)];

  return [...members].sort((a, b) => {
    const [ra, rb] = [rank(a), rank(b)];

    return rb[0] - ra[0] || rb[1] - ra[1] || Number(a > b) - Number(a < b);
  })[0];
}

function problemOf(p: Planner, members: string[]): LeftOutReason | null {
  const key = members.join('|');

  if (p.tried.has(key)) return p.tried.get(key)!;

  const set = new Set(members);
  const { hardware } = joiningHardware(p.g.chains, set);
  const order = orderProblem(p.g, p.before, {
    members: set,
    keep: keepOf(p, members),
    dropped: new Set(hardware),
    groups: p.input.groups,
    roles: p.roles,
  });
  const problem =
    order ??
    printProblem(
      members.map((id) => p.placed.get(id)!),
      p.input.bed,
    );

  p.tried.set(key, problem);

  return problem;
}

function* subsets(members: string[], size: number, from = 0, picked: string[] = []): Generator<string[]> {
  if (picked.length === size) {
    yield picked;

    return;
  }

  for (let i = from; i <= members.length - (size - picked.length); i++)
    yield* subsets(members, size, i + 1, [...picked, members[i]]);
}

function largestPassing(p: Planner, members: string[]): string[] | null {
  for (let size = members.length - 1; size >= 2; size--) {
    for (const subset of subsets(members, size)) {
      if (p.tried.size >= MAX_TRIES) return null;

      if (isConnected(subset, p.pairs) && !problemOf(p, subset)) return subset;
    }
  }

  return null;
}

function leftOut(p: Planner, members: string[], kept: string[], whole: LeftOutReason): LeftOut[] {
  return members
    .filter((id) => !kept.includes(id))
    .map((id) => {
      const withIt = [...kept, id].sort((a, b) => Number(a > b) - Number(a < b));
      const own = isConnected(withIt, p.pairs) ? problemOf(p, withIt) : null;

      return { id, why: own ?? whole };
    });
}

function groupOf(p: Planner, ids: string[], left: LeftOut[]): MergeGroup {
  const keep = keepOf(p, ids);
  const { screws, hardware } = joiningHardware(p.g.chains, new Set(ids));
  const first = p.byId.get(keep)!;
  const ordered = [keep, ...ids.filter((id) => id !== keep)];

  return {
    keep,
    ids: ordered,
    link: first.link,
    material: first.material,
    screws,
    hardware,
    steps: stepsSaved(p.input.guide, p.steps, { ids: ordered, hardware }),
    left,
  };
}

function planGroup(p: Planner, members: string[]): MergeGroup | null {
  const whole = problemOf(p, members);

  if (!whole) return groupOf(p, members, []);

  const kept = largestPassing(p, members);

  return kept ? groupOf(p, kept, leftOut(p, members, kept, whole)) : null;
}

function touchingPairs(placed: Placed[], pairs: Pair[]): Pair[] {
  return pairsWithin(placed, pairs, TOUCH_MM).map(([a, b]) => [a, b] as Pair);
}

export interface MergeScene {
  placed: Placed[];
  geometry: AssemblyGeometry;
  roles: Record<string, string>;
}

export function planMerges({ placed: placedAll, geometry: g, roles }: MergeScene, input: MergeInput): MergePlan {
  const started = performance.now();

  if (g.timedOut) return { groups: [], ms: 0 };

  const placed = new Map(placedAll.map((x) => [x.id, x]));
  const candidates = input.candidates.filter((c) => placed.has(c.id) && g.moves[c.id]);
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const pairs = touchingPairs(placedAll, joinedPairs(g.chains, candidates));
  const planner: Planner = {
    g,
    input,
    placed,
    byId,
    pairs,
    before: planRemoval(g, input.groups),
    roles,
    tried: new Map(),
    steps: 0,
  };
  const joined = connectedGroups(
    candidates.map((c) => c.id),
    pairs,
  );

  planner.steps = joined.length ? guideSteps(input.guide) : 0;

  const deadline = started + PLAN_MS;
  const groups = joined.flatMap((members) => {
    if (performance.now() > deadline) return [];

    planner.tried = new Map();

    return planGroup(planner, members) ?? [];
  });

  return { groups, ms: Math.round(performance.now() - started) };
}
