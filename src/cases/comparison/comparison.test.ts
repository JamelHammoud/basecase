import { describe, expect, it } from 'vitest';
import { comparisonFixture } from './comparisonFixtures';
import { differenceAt, prepareSource, sampleAt } from './comparison';

const speed = 'topic./same.speed';
const state = 'topic./same.state';
const rule = { kind: 'previous' as const, maxAge: 0.5 };

describe('saved recording comparison production pipeline', () => {
  it('requires explicit signal matches, equal known units and a bounded sampling rule', async () => {
    const a = await prepareSource(comparisonFixture({ id: 'a', times: [0, 1, 3], values: [2, 5, 11] }));
    const b = await prepareSource(comparisonFixture({ id: 'b', times: [0, 0.5, 1], values: [3, 6, 9] }));
    const pair = [
      { source: a, offset: 0 },
      { source: b, offset: 0 },
    ] as const;
    const match = { left: speed, right: speed, leftUnit: 'm/s', rightUnit: 'm/s', rule };

    expect(differenceAt(pair, 1, null)).toBeNull();
    expect(differenceAt(pair, 1, match)).toBeNull();
    a.channels[0].unit = 'm/s';
    b.channels[0].unit = 'm/s';
    expect(differenceAt(pair, 1, { ...match, rightUnit: 'rad/s' })).toBeNull();
    expect(differenceAt(pair, 1, { ...match, leftUnit: '', rightUnit: '' })).toBeNull();
    expect(differenceAt(pair, 1, match)).toBe(-4);
    expect(differenceAt(pair, 2, match)).toBeNull();
    expect(sampleAt(a, speed, 2, rule)).toEqual({ status: 'stale', at: 1 });
    expect(sampleAt(a, speed, 2, rule).value).toBeUndefined();
    expect(sampleAt(b, speed, 2, rule).status).toBe('outside');
    expect(sampleAt(a, 'absent', 1, rule).status).toBe('missing');
    expect(sampleAt(a, state, 0.5, rule).value).toBe('idle');
    expect(sampleAt(a, speed, -1, rule).status).toBe('outside');
  });

  it('reports clipped tails separately and refuses corrupt or oversized content', async () => {
    const file = comparisonFixture({ id: 'a', times: [0, 1], values: [0, Number.NaN], clipped: true });
    const source = await prepareSource(file);

    expect(sampleAt(source, speed, 0, rule)).toMatchObject({ status: 'sample', value: 0, clipped: true });
    expect(sampleAt(source, speed, 1, rule).status).toBe('missing');
    expect(sampleAt(source, speed, 2, rule).status).toBe('clipped');
    await expect(prepareSource({ ...file, bytes: file.bytes.subarray(0, 25) })).rejects.toThrow();
    await expect(prepareSource({ ...file, bytes: new Uint8Array(64 * 1024 * 1024 + 1) })).rejects.toThrow();
  });
});
