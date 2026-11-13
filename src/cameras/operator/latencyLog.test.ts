import { describe, expect, it } from 'vitest';
import { createLatencyLog } from './latencyLog';

describe('the operator camera’s latency log', () => {
  it('reports nothing until a result is read, then the median and 90th percentile of the last samples', () => {
    const log = createLatencyLog(10);

    expect(log.stats()).toBeNull();

    for (let ms = 1; ms <= 20; ms++) log.add(ms);

    expect(log.stats()).toEqual({ median: 16, p90: 20, count: 10 });
    log.clear();
    expect(log.stats()).toBeNull();
  });
});
