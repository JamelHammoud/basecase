import { describe, expect, it } from 'vitest';
import { orientJointGraph } from './jointGraph';

interface Joint {
  a: string;
  b: string;
  id: number;
  axis: number[];
}

const jointsOf = (edges: Array<[string, string]>): Joint[] =>
  edges.map(([a, b], id) => ({ a, b, id, axis: [0, 0, 1] }));

const endsOf = (joints: Joint[]) => joints.map(({ a, b, id }) => [a, b, id]);

function scanGraph(roots: string[], joins: Joint[], fixed: Array<[string, string]>) {
  const edges: Array<[string, string]> = [...joins.map((j): [string, string] => [j.a, j.b]), ...fixed];
  const seen = new Set<string>();
  const order: Joint[] = [];

  for (const root of roots) {
    if (seen.has(root) || !edges.some((e) => e.includes(root))) continue;

    seen.add(root);

    const queue = [root];

    for (let i = 0; i < queue.length; i++) scanNeighbours({ edges, joins, seen, order }, queue, i);
  }

  return order;
}

interface Scan {
  edges: Array<[string, string]>;
  joins: Joint[];
  seen: Set<string>;
  order: Joint[];
}

function scanNeighbours(scan: Scan, queue: string[], i: number) {
  const at = queue[i];

  for (const [a, b] of scan.edges) {
    const next = a === at ? b : a;

    if ((a !== at && b !== at) || scan.seen.has(next)) continue;

    const join = scan.joins.find((j) => (j.a === a && j.b === b) || (j.a === b && j.b === a));

    scan.seen.add(next);
    queue.push(next);

    if (join) scan.order.push({ ...join, a: at, b: next });
  }
}

describe('joint candidate graph orientation', () => {
  it('keeps breadth-first discovery and join order before fixed edges', () => {
    const joins = jointsOf([
      ['branch', 'leaf'],
      ['root', 'branch'],
      ['root', 'side'],
      ['mount', 'tip'],
      ['side', 'end'],
    ]);
    const oriented = orientJointGraph(['root', 'tip', 'leaf'], joins, [['root', 'mount']]);

    expect(endsOf(oriented)).toEqual([
      ['root', 'branch', 1],
      ['root', 'side', 2],
      ['branch', 'leaf', 0],
      ['side', 'end', 4],
      ['mount', 'tip', 3],
    ]);
  });

  it('carries the walk across fixed-only bodies and keeps separate roots in priority order', () => {
    const joins = jointsOf([
      ['hand', 'wrist'],
      ['leg', 'hip'],
    ]);

    expect(
      endsOf(
        orientJointGraph(['isolated', 'base', 'leg', 'wrist'], joins, [
          ['base', 'bracket'],
          ['bracket', 'wrist'],
        ]),
      ),
    ).toEqual([
      ['wrist', 'hand', 0],
      ['leg', 'hip', 1],
    ]);
    expect(orientJointGraph(['base'], [], [['base', 'bracket']])).toEqual([]);
    expect(orientJointGraph([], joins, [])).toEqual([]);
    expect(orientJointGraph(['isolated'], [], [])).toEqual([]);
  });

  it('visits cycles and self links once, keeping the first discovery for shared children', () => {
    const joins = jointsOf([
      ['root', 'root'],
      ['left', 'root'],
      ['right', 'root'],
      ['tip', 'left'],
      ['tip', 'right'],
      ['tip', 'root'],
    ]);

    expect(
      endsOf(
        orientJointGraph(['root', 'tip', 'root'], joins, [
          ['right', 'left'],
          ['left', 'left'],
        ]),
      ),
    ).toEqual([
      ['root', 'left', 1],
      ['root', 'right', 2],
      ['root', 'tip', 5],
    ]);
  });

  it('preserves input records and metadata, and rebuilds after endpoint, connection and root edits', () => {
    const joins = jointsOf([
      ['a', 'b'],
      ['b', 'c'],
    ]);
    const fixed: Array<[string, string]> = [['c', 'd']];
    const roots = ['a', 'd'];
    const before = structuredClone({ joins, fixed, roots });
    const first = orientJointGraph(roots, joins, fixed);

    expect({ joins, fixed, roots }).toEqual(before);
    expect(first[0]).not.toBe(joins[0]);
    expect(first[0].axis).toBe(joins[0].axis);

    joins[0].a = 'e';
    roots.reverse();
    fixed.push(['d', 'e']);

    expect(endsOf(orientJointGraph(roots, joins, fixed))).toEqual([['c', 'b', 1]]);
    expect(first).toEqual(before.joins);
    expect(endsOf(orientJointGraph(['e'], joins, []))).toEqual([
      ['e', 'b', 0],
      ['b', 'c', 1],
    ]);
  });

  it('matches full-edge scans for mixed forests and cyclic graphs in either root direction', () => {
    for (let seed = 0; seed < 80; seed++) {
      const nodes = Array.from({ length: 6 + (seed % 17) }, (_, i) => `part-${i}`);
      const edges = nodes.flatMap((a, i) =>
        nodes
          .slice(i + 1)
          .flatMap((b, j): Array<[string, string]> => ((i * 31 + j * 17 + seed * 7) % 11 < 2 ? [[a, b]] : [])),
      );
      const joins = jointsOf(edges.filter((_, i) => (i + seed) % 3 !== 0));
      const fixed = edges.filter((_, i) => (i + seed) % 3 === 0);
      const roots = seed % 2 ? nodes.reverse() : nodes;

      expect(orientJointGraph(roots, joins, fixed)).toEqual(scanGraph(roots, joins, fixed));
    }
  });
});

describe('joint candidate graph traversal work', () => {
  it.each([300, 600])('bounds endpoint reads on %i-connection chains and stars', (count) => {
    for (const star of [false, true]) {
      let reads = 0;
      const joins = Array.from({ length: count }, (_, i): Joint => ({
        get a() {
          reads++;

          return star ? '0' : `${i}`;
        },
        get b() {
          reads++;

          return `${i + 1}`;
        },
        id: i,
        axis: [0, 0, 1],
      }));
      const roots = Array.from({ length: count + 1 }, (_, i) => `${i}`);
      const actual = orientJointGraph(roots, joins, []);
      const indexedReads = reads;

      reads = 0;

      const expected = scanGraph(roots, joins, []);

      expect(actual).toEqual(expected);
      expect(actual).toHaveLength(count);
      expect(indexedReads).toBeLessThanOrEqual(4 * count);
      expect(reads).toBeGreaterThan(count ** 2);
    }
  });

  it.each([300, 600])('reads each fixed connection once across %i-connection chains', (count) => {
    let reads = 0;
    const fixed = Array.from({ length: count }, (_, i): [string, string] => {
      const edge: [string, string] = [`${i}`, `${i + 1}`];

      Object.defineProperty(edge, 0, {
        get: () => {
          reads++;

          return `${i}`;
        },
      });

      return edge;
    });
    const roots = Array.from({ length: count + 1 }, (_, i) => `${i}`);

    expect(orientJointGraph(roots, [], fixed)).toEqual([]);
    expect(reads).toBeLessThanOrEqual(count);

    reads = 0;

    expect(scanGraph(roots, [], fixed)).toEqual([]);
    expect(reads).toBeGreaterThan(count ** 2);
  });
});
