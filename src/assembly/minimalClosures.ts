type Closure = Set<number>;

function subset(a: Closure, b: Closure): boolean {
  if (a.size > b.size) return false;

  for (const id of a) {
    if (!b.has(id)) return false;
  }

  return true;
}

export function minimalClosures(sets: Closure[]): Closure[] {
  const kept: Closure[] = [];

  for (const candidate of sets) {
    if (kept.some((other) => subset(other, candidate))) continue;

    let retained = 0;

    for (const other of kept) {
      if (subset(candidate, other)) continue;

      kept[retained++] = other;
    }

    kept.length = retained;
    kept.push(candidate);
  }

  return kept;
}
