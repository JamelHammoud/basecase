import { Box3, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { collisionPairs, type SkipPair } from './collisionPairs';

interface Boxed {
  id: string;
  box: Box3;
}

interface Options {
  focus?: string[];
  straddle?: string[];
}

function originalPairs(placed: Boxed[], options: Options, skip?: SkipPair): Array<[Boxed, Boxed]> {
  const focus = options.focus?.length ? new Set(options.focus) : null;
  const straddle = options.straddle ? new Set(options.straddle) : null;
  const focused = placed.filter((p) => focus?.has(p.id)).map((p) => p.box.clone().expandByScalar(0.5));
  const solids = focus
    ? placed.filter((p) => focus.has(p.id) || focused.some((b) => b.intersectsBox(p.box.clone().expandByScalar(0.5))))
    : placed;
  const pairs: Array<[Boxed, Boxed]> = [];

  for (let i = 0; i < solids.length; i++) {
    const a = solids[i];
    const grown = a.box.clone().expandByScalar(0.1);

    for (let j = i + 1; j < solids.length; j++) {
      const b = solids[j];
      const selected = !focus || focus.has(a.id) || focus.has(b.id);
      const crosses = !straddle || straddle.has(a.id) !== straddle.has(b.id);

      if (selected && crosses && !skip?.(a.id, b.id) && grown.intersectsBox(b.box)) pairs.push([a, b]);
    }
  }

  return pairs;
}

const box = (id: string, min: number[], max: number[]): Boxed => ({
  id,
  box: new Box3(new Vector3().fromArray(min), new Vector3().fromArray(max)),
});

const idsOf = (pairs: Array<[Boxed, Boxed]>) => pairs.map(([a, b]) => [a.id, b.id]);

function subsets(ids: string[]): string[][] {
  return Array.from({ length: 1 << ids.length }, (_, mask) => ids.filter((_, i) => mask & (1 << i)));
}

describe('collision pair planning', () => {
  it('keeps the ordered pairs for every focus and straddle subset, with skipped pairs and unknown ids', () => {
    const solids = [
      box('a', [0, 0, 0], [2, 2, 2]),
      box('b', [1, 1, 1], [3, 3, 3]),
      box('c', [-1, -1, -1], [1, 1, 1]),
      box('d', [100, 100, 100], [101, 101, 101]),
      box('e', [2, 0, 0], [4, 2, 2]),
    ];
    const lists = [undefined, ...subsets(solids.map((p) => p.id)), ['missing'], ['missing', 'a', 'a']];
    const skip = (a: string, b: string) => a === 'b' && b === 'e';
    const before = solids.map((p) => p.box.clone());

    for (const focus of lists) {
      for (const straddle of lists) {
        const options = { focus, straddle };

        expect(idsOf(collisionPairs(solids, options, skip))).toEqual(idsOf(originalPairs(solids, options, skip)));
      }
    }

    expect(solids.map((p) => p.box)).toEqual(before);
  });

  it('keeps touching, padding-boundary, empty and zero-volume boxes in both scene orders', () => {
    const solids = [
      box('a', [0, 0, 0], [1, 1, 1]),
      box('touch', [1, 0, 0], [2, 1, 1]),
      box('padding', [1.1, 0, 0], [2.1, 1, 1]),
      box('beyond', [1.100001, 0, 0], [2.2, 1, 1]),
      box('point', [0, 0, 0], [0, 0, 0]),
      { id: 'empty', box: new Box3() },
    ];

    for (const ordered of [solids, solids.toReversed(), []]) {
      for (const focus of [undefined, ['a'], ['point'], ['empty']]) {
        expect(idsOf(collisionPairs(ordered, { focus }))).toEqual(idsOf(originalPairs(ordered, { focus })));
      }
    }
  });

  it.each([600, 1200])('classifies each id once for a one-part sweep through %i nearby parts', (count) => {
    let reads = 0;
    let sceneReads = 0;
    const solids = Array.from({ length: count }, (_, i) => ({
      get id() {
        reads++;

        return String(i);
      },
      box: new Box3(new Vector3(), new Vector3(1, 1, 1)),
    }));
    const scene = new Proxy(solids, {
      get(target, key, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key)) sceneReads++;

        return Reflect.get(target, key, receiver);
      },
    });
    const pairs = collisionPairs(scene, { focus: ['0'], straddle: ['0'] });

    expect(reads).toBe(count);
    expect(sceneReads).toBeLessThanOrEqual(count * 4);
    expect(pairs).toHaveLength(count - 1);
    expect(idsOf(pairs)).toEqual(Array.from({ length: count - 1 }, (_, i) => ['0', String(i + 1)]));
  });
});
