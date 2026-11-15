import { describe, expect, it } from 'vitest';
import { axisClusters, collinear, type AxisLink } from './axisClusters';
import type { Pairing } from './axisFinder';
import type { V3 } from './meshIndex';

function link(shaft: string, x = 0, angle = 0, radius = 4): AxisLink {
  const axis: V3 = [Math.sin(angle), 0, Math.cos(angle)];
  const cylinder = { axis, center: [x, 0, 0] as V3, radius, length: 10, spanDeg: 360, convex: true };

  return {
    shaft,
    bore: `bore-${shaft}-${x}-${angle}`,
    pairing: {
      score: 0,
      origin: [x, 0, 0],
      axis,
      radius,
      shaft: cylinder,
      bore: { ...cylinder, convex: false },
      shaftOn: 'a',
      fit: 1,
      engaged: 10,
    },
  };
}

function previousClusters(links: AxisLink[]) {
  const out: AxisLink[][] = [];

  for (const item of links) {
    const home = out.find((group) => group[0].shaft === item.shaft && collinear(group[0].pairing, item.pairing));

    if (home) home.push(item);
    else out.push([item]);
  }

  return out;
}

function expectSameMembers(actual: AxisLink[][], expected: AxisLink[][]) {
  expect(actual.map((group) => group.length)).toEqual(expected.map((group) => group.length));

  actual.forEach((group, i) => group.forEach((item, j) => expect(item).toBe(expected[i][j])));
}

describe('shaft-indexed axis clusters', () => {
  it('keeps global creation order, member order and the first matching representative', () => {
    const links = [link('a'), link('b'), link('a', 0.9), link('c'), link('a', 0.45), link('b', 0.2)];

    expect(axisClusters(links)).toEqual([[links[0], links[4]], [links[1], links[5]], [links[2]], [links[3]]]);
    expect(axisClusters([])).toEqual([]);
  });

  it('preserves angular and radius-dependent distance thresholds', () => {
    const base = link('a').pairing;
    const wide = link('a', 0, 0, 20).pairing;
    const reversed: Pairing = { ...base, axis: [0, 0, -1], origin: [0, 0, 500] };

    expect(collinear(base, link('a', 0.5).pairing)).toBe(true);
    expect(collinear(base, link('a', 0.500001).pairing)).toBe(false);
    expect(collinear(wide, link('a', 1).pairing)).toBe(true);
    expect(collinear(wide, link('a', 1.000001).pairing)).toBe(false);
    expect(collinear(base, link('a', 0, Math.PI / 180).pairing)).toBe(true);
    expect(collinear(base, link('a', 0, Math.PI / 180 + 1e-8).pairing)).toBe(false);
    expect(collinear(base, reversed)).toBe(true);
  });

  it('matches the previous scan across mixed shafts, axes, radii and source orders', () => {
    const names = ['', '__proto__', 'constructor', 'a\nb', 'pin', 'PIN', 'long-shaft'];

    for (let seed = 0; seed < 160; seed++) {
      const links = Array.from({ length: seed % 80 }, (_, i) =>
        link(
          names[(i * 13 + seed) % names.length],
          ((i * 31 + seed * 17) % 23) / 10,
          (((i * 7 + seed) % 5) * Math.PI) / 360,
          4 + ((i + seed) % 4) * 8,
        ),
      );
      const before = structuredClone(links);

      expectSameMembers(axisClusters(links), previousClusters(links));
      expectSameMembers(axisClusters([...links].reverse()), previousClusters([...links].reverse()));
      expect(links).toEqual(before);
    }
  });

  it('reads edits on the next call and returns independent group arrays', () => {
    const links = [link('a'), link('b'), link('a', 0.2)];
    const first = axisClusters(links);

    links[2].shaft = 'b';
    links[2].pairing.origin[0] = 3;

    const second = axisClusters(links);

    expectSameMembers(second, previousClusters(links));
    expect(first).toHaveLength(2);
    expect(first[0]).toHaveLength(2);
    expect(second).toHaveLength(3);
    second[0].push(links[1]);
    expect(first[0]).toHaveLength(2);
    expect(axisClusters(links)[0]).toHaveLength(1);
  });

  it('retains the previous handling of nonfinite geometry', () => {
    const links = [link('a'), link('a', NaN), link('a', Infinity), link('b', 0, NaN), link('b', 0, Infinity)];

    expectSameMembers(axisClusters(links), previousClusters(links));
  });

  it.each([300, 600])('reads each shaft once across two passes over %i shafts', (count) => {
    let reads = 0;
    const links = Array.from({ length: count * 2 }, (_, i) => {
      const shaft = `shaft-${i % count}`;
      const item = link(shaft, i < count ? 0 : 0.2);

      return {
        ...item,
        get shaft() {
          reads++;

          return shaft;
        },
      };
    });
    const expected = previousClusters(links);

    expect(reads).toBe(2 * count * count);
    reads = 0;

    const actual = axisClusters(links);

    expect(reads).toBe(links.length);
    expectSameMembers(actual, expected);
  });
});
