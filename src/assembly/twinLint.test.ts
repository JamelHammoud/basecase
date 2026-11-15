import { describe, expect, it } from 'vitest';
import type { MeshMeasure } from '../three/meshMeasure';
import type { ScenePart } from '../types/robotics';
import { twinDifferences } from './twinLint';

const part = (id: string, overrides: Partial<ScenePart> = {}): ScenePart => ({
  id,
  name: id,
  kind: 'box',
  category: 'primitives',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 10, height: 10, depth: 10 },
  color: '#808080',
  note: '',
  visible: true,
  locked: false,
  ...overrides,
});

const measure = (width: number): MeshMeasure => ({
  volumeMm3: width * 100,
  areaMm2: 400 + width * 40,
  min: [0, 0, 0],
  max: [width, 10, 10],
  centroid: [width / 2, 5, 5],
  triangles: 12,
});

const clashReport = (left: string, right: string, counts: string) =>
  `${left} / ${right} aren’t mirror twins: clashes ${counts}. Mirror the side that’s right onto the other, or fix the one that changed.`;

describe('mirror-twin clash counts', () => {
  it('counts either endpoint, repeated records and self clashes without changing pair order', () => {
    const input = {
      parts: ['right-leg', 'left-arm', 'right-arm', 'left-leg'].map((id) => part(id)),
      clashes: [
        { a: 'left-arm', b: 'body' },
        { a: 'body', b: 'left-arm' },
        { a: 'left-arm', b: 'left-arm' },
        { a: 'left-arm', b: 'right-arm' },
        { a: 'left-arm', b: 'right-arm' },
        { a: 'body', b: 'right-leg' },
        { a: 'unrelated', b: 'body' },
      ],
      measures: {},
    };
    const before = structuredClone(input);

    expect(twinDifferences(input)).toEqual([
      clashReport('left-arm', 'right-arm', '5 vs 2'),
      clashReport('left-leg', 'right-leg', '0 vs 1'),
    ]);
    expect(input).toEqual(before);
  });

  it.each([{ visible: false }, { role: 'cutout' }, { role: 'reference' }, { kind: 'hardware' }] satisfies Array<
    Partial<ScenePart>
  >)('ignores ineligible pairs %o without reading clashes', (overrides) => {
    const clashes = [
      {
        get a(): string {
          throw new Error('Clashes should not be read without twins');
        },
        b: 'body',
      },
    ];

    expect(twinDifferences({ parts: [part('left-arm'), part('right-arm', overrides)], clashes, measures: {} })).toEqual(
      [],
    );
    expect(twinDifferences({ parts: [part('body')], clashes, measures: {} })).toEqual([]);
  });

  it('keeps the strict ten-percent threshold and reads changed inputs on later calls', () => {
    const input = {
      parts: [part('left-arm'), part('right-arm')],
      clashes: Array.from({ length: 10 }, () => ({ a: 'left-arm', b: 'body' })),
      measures: {},
    };

    input.clashes.push(...Array.from({ length: 9 }, () => ({ a: 'body', b: 'right-arm' })));
    expect(twinDifferences(input)).toEqual([]);
    input.clashes.pop();
    expect(twinDifferences(input)).toEqual([clashReport('left-arm', 'right-arm', '10 vs 8')]);
    input.clashes.splice(0);
    expect(twinDifferences(input)).toEqual([]);
  });

  it('retains geometry differences after clash counts match, including with no clashes', () => {
    const input = {
      parts: [part('left-arm'), part('right-arm')],
      clashes: [{ a: 'left-arm', b: 'right-arm' }],
      measures: { 'left-arm': measure(10), 'right-arm': measure(12) },
    };
    const expected = [
      'left-arm / right-arm aren’t mirror twins: volume 20%, size x 10 vs 12 mm. Mirror the side that’s right onto the other, or fix the one that changed.',
    ];

    expect(twinDifferences(input)).toEqual(expected);
    expect(twinDifferences({ ...input, clashes: [] })).toEqual(expected);
    expect(twinDifferences({ ...input, measures: { 'left-arm': measure(10) } })).toEqual([]);
  });

  it.each([150, 300])('reads clash endpoints once for %i twin pairs', (count) => {
    const parts = Array.from({ length: count }, (_, i) => [part(`left-${i}`), part(`right-${i}`)]).flat();
    let reads = 0;
    const clashes = parts.map(({ id }) => ({
      get a() {
        reads += 1;

        return id;
      },
      get b() {
        reads += 1;

        return 'body';
      },
    }));

    expect(twinDifferences({ parts, clashes, measures: {} })).toEqual([]);
    expect(reads).toBeLessThanOrEqual(clashes.length * 2);
  });
});
