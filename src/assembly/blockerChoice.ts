import type { PartMoves } from './assemblyGeometry';
import type { SplitPlane } from './splitTest';

export function fewestBlockers(ways: string[][]): string[] {
  let best: string[] = [];
  let count = Infinity;

  for (const way of ways) {
    const blockers = way.length;

    if (blockers >= count) continue;

    best = way;
    count = blockers;
  }

  return best;
}

export function leastBlockedSplit(planes: SplitPlane[]): SplitPlane {
  let best = planes[0];
  let count = Infinity;

  for (const plane of planes) {
    const blockers = plane.blockers[0].length + plane.blockers[1].length;

    if (blockers >= count) continue;

    best = plane;
    count = blockers;
  }

  return best;
}

export function hookedBy(moves: PartMoves): string[] {
  let best: string[] = [];
  let solids = Infinity;
  let lips = Infinity;

  for (let i = 0; i < moves.local.length; i++) {
    const solidCount = moves.local[i].length;
    const candidates = moves.lips[i];
    const lipCount = candidates.length;

    if (solidCount > solids || (solidCount === solids && lipCount >= lips)) continue;

    best = candidates;
    solids = solidCount;
    lips = lipCount;
  }

  return best;
}
