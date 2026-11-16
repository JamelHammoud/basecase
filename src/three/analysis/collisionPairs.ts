import { Box3 } from 'three';

interface Boxed {
  id: string;
  box: Box3;
}

interface PairOptions {
  focus?: string[];
  straddle?: string[];
}

export type SkipPair = (a: string, b: string) => boolean;

function partnerIndices(solids: Boxed[], options: PairOptions) {
  const focus = options.focus?.length ? new Set(options.focus) : null;
  const straddle = options.straddle ? new Set(options.straddle) : null;
  const kinds = solids.map(({ id }) => (focus?.has(id) ? 1 : 0) | (straddle?.has(id) ? 2 : 0));
  const present = new Set(kinds);
  const partners = Array.from({ length: 4 }, (_, kind) => {
    if (!present.has(kind)) return [];

    const indices: number[] = [];

    for (let i = 0; i < kinds.length; i++) {
      const focused = !focus || ((kind | kinds[i]) & 1) !== 0;
      const crosses = !straddle || ((kind ^ kinds[i]) & 2) !== 0;

      if (focused && crosses) indices.push(i);
    }

    return indices;
  });

  return { kinds, partners };
}

export function collisionPairs<T extends Boxed>(solids: T[], options: PairOptions, skip?: SkipPair): Array<[T, T]> {
  const { kinds, partners } = partnerIndices(solids, options);
  const cursors = [0, 0, 0, 0];
  const pairs: Array<[T, T]> = [];
  const grown = new Box3();

  for (let i = 0; i < solids.length; i++) {
    const kind = kinds[i];
    const indices = partners[kind];

    while (cursors[kind] < indices.length && indices[cursors[kind]] <= i) cursors[kind]++;

    if (cursors[kind] === indices.length) continue;

    const a = solids[i];

    grown.copy(a.box).expandByScalar(0.1);

    for (let at = cursors[kind]; at < indices.length; at++) {
      const b = solids[indices[at]];

      if (!skip?.(a.id, b.id) && grown.intersectsBox(b.box)) pairs.push([a, b]);
    }
  }

  return pairs;
}
