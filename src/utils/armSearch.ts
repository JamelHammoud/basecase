import { ARM_MIN_LINK } from '../../electron/cad-mcp/recipes/templates.mjs';
import type { ZUpVec } from '../types/skeleton';
import { planarReach, planarTargets, reachLimit, shoulderHeight, type ArmShape, type PlanarTarget } from './armReach';

export const STEP_MM = 5;
export const MAX_LINK_MM = 400;
export const MAX_RISE_MM = 300;

const MAX_SOLVES = 400_000;

export interface ArmCandidate {
  shape: ArmShape;
}

export type ArmFound = ArmCandidate | { blame: number | null };

export interface ArmSearch {
  base: ZUpVec;
  yaw: number;
  targets: ZUpVec[];
  confirm: (c: ArmCandidate) => boolean;
}

interface Level {
  planar: PlanarTarget[][];
  height: number;
  l1: number;
}

const SHORTEST = 3 * ARM_MIN_LINK;
const LONGEST = MAX_RISE_MM + 3 * MAX_LINK_MM;

function nearestOption(options: PlanarTarget[], height: number, l1: number): number {
  let distance = Infinity;

  for (const target of options) distance = Math.min(distance, Math.hypot(target.u - l1, target.w - height));

  return distance;
}

function nearest(level: Level): number {
  let distance = -Infinity;

  for (const options of level.planar) distance = Math.max(distance, nearestOption(options, level.height, level.l1));

  return distance;
}

function distanceBounds() {
  const heights = new Map<number, Map<number, number>>();

  return (level: Level): number => {
    const links = heights.get(level.height) ?? new Map<number, number>();
    const found = links.get(level.l1);

    if (found !== undefined) return found;

    const distance = nearest(level);

    links.set(level.l1, distance);
    heights.set(level.height, links);

    return distance;
  };
}

class Budget {
  solves = 0;

  get spent() {
    return this.solves > MAX_SOLVES;
  }
}

function reachesAll(level: Level, l2: number, l3: number, budget: Budget): boolean {
  return level.planar.every((options) =>
    options.some((t) => {
      budget.solves++;

      return planarReach(t.u - level.l1, t.w - level.height, l2, l3) !== null;
    }),
  );
}

function* splits(total: number): Generator<[number, number]> {
  for (let l2 = ARM_MIN_LINK; l2 <= Math.min(MAX_LINK_MM, total - ARM_MIN_LINK); l2 += STEP_MM) {
    const l3 = total - l2;

    if (l3 <= MAX_LINK_MM) yield [l2, l3];
  }
}

function* shapesOf(
  total: number,
  search: ArmSearch,
  planar: PlanarTarget[][],
  bound: ReturnType<typeof distanceBounds>,
): Generator<{ shape: ArmShape; level: Level }> {
  for (let rise = 0; rise <= Math.min(MAX_RISE_MM, total - SHORTEST); rise += STEP_MM) {
    const height = shoulderHeight({ base: search.base, baseHeight: rise });

    for (let l1 = ARM_MIN_LINK; l1 <= Math.min(MAX_LINK_MM, total - rise - 2 * ARM_MIN_LINK); l1 += STEP_MM) {
      const level: Level = { planar, height, l1 };
      const rest = total - rise - l1;

      if (bound(level) > reachLimit(rest, 0)) continue;

      for (const [l2, l3] of splits(rest))
        yield { shape: { links: [l1, l2, l3], baseHeight: rise, base: search.base, yaw: search.yaw }, level };
    }
  }
}

function outOfReach(search: ArmSearch, planar: PlanarTarget[][]): number {
  const longest = reachLimit(MAX_LINK_MM, MAX_LINK_MM);

  return planar.findIndex((options) => {
    for (let rise = 0; rise <= MAX_RISE_MM; rise += STEP_MM) {
      const height = shoulderHeight({ base: search.base, baseHeight: rise });

      for (let l1 = ARM_MIN_LINK; l1 <= MAX_LINK_MM; l1 += STEP_MM)
        if (nearestOption(options, height, l1) <= longest) return false;
    }

    return true;
  });
}

export function searchArm(search: ArmSearch): ArmFound {
  const planar = search.targets.map((at) => planarTargets(search, at));
  const missing = outOfReach(search, planar);

  if (missing >= 0) return { blame: missing };

  const budget = new Budget();
  const bound = distanceBounds();

  for (let total = SHORTEST; total <= LONGEST; total += STEP_MM) {
    for (const { shape, level } of shapesOf(total, search, planar, bound)) {
      if (budget.spent) return { blame: null };

      const [, l2, l3] = shape.links;

      if (reachesAll(level, l2, l3, budget) && search.confirm({ shape })) return { shape };
    }
  }

  return { blame: null };
}
