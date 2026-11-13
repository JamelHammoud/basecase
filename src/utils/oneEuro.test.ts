import { describe, expect, it } from 'vitest';
import { oneEuro } from './oneEuro';

const noise = (i: number) => (((i * 7919) % 101) / 100 - 0.5) * 0.008;

const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);

describe('oneEuro', () => {
  it('passes the first sample through and holds a still value', () => {
    const f = oneEuro({ minCutoff: 1, beta: 0 });

    expect([...f.filter([0.3, -2], 0)]).toEqual([0.3, -2]);
    expect([...f.filter([0.3, -2], 1 / 30)]).toEqual([0.3, -2]);
  });

  it('cuts jitter on a still point to a fraction of the raw spread', () => {
    const f = oneEuro({ minCutoff: 1.2, beta: 0.5 });
    const raw = Array.from({ length: 90 }, (_, i) => 0.5 + noise(i));
    const out = raw.map((x, i) => f.filter([x], i / 30)[0]);

    expect(spread(out.slice(30))).toBeLessThan(spread(raw.slice(30)) * 0.5);
  });

  it('follows a fast move with little lag, and a higher beta lags less', () => {
    const run = (beta: number) => {
      const f = oneEuro({ minCutoff: 1.2, beta });
      let y = 0;

      for (let i = 0; i <= 15; i++) y = f.filter([i / 15], i / 30)[0];

      return 1 - y;
    };

    expect(run(4)).toBeLessThan(0.1);
    expect(run(4)).toBeLessThan(run(0));
  });

  it('starts over after a reset, a gap or a change of size', () => {
    const f = oneEuro({ minCutoff: 1, beta: 0 });

    f.filter([0], 0);
    f.filter([0], 0.1);
    f.reset();

    expect(f.filter([5], 0.2)[0]).toBe(5);
    expect(f.filter([9], 0.2)[0]).toBe(9);
    expect([...f.filter([1, 2], 0.3)]).toEqual([1, 2]);
  });
});
