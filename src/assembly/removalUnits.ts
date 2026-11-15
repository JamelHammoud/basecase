import type { PartMoves } from './assemblyGeometry';

export function mutualRemovalUnits(moves: Record<string, PartMoves>, ids = Object.keys(moves)): string[][] {
  const order = new Map(ids.map((id, i) => [id, i]));
  const blockers = new Map<string, Set<string>>();

  for (const id of ids) {
    const neighbors = new Set<string>();

    for (const path of moves[id].local) for (const blocker of path) neighbors.add(blocker);

    blockers.set(id, neighbors);
  }

  return ids.flatMap((a) =>
    [...blockers.get(a)!]
      .filter((b) => a < b && blockers.get(b)?.has(a))
      .sort((x, y) => order.get(x)! - order.get(y)!)
      .map((b) => [a, b]),
  );
}
