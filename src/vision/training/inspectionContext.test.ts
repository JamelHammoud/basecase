import { describe, expect, it } from 'vitest';
import { inspectionContext, inspectionContextKey } from './inspectionContext';
import { metricReport } from './metricsFixtures';

describe('worker comparison context', () => {
  it('keeps only the latest verified pair and revokes late preparation after closure or replacement', async () => {
    const first = await metricReport();
    const second = structuredClone(first);

    second.evidence!.hash = 'f'.repeat(64);

    const old = { candidate: first, incumbent: first };
    const next = { candidate: second, incumbent: first };
    const context = inspectionContext();
    const pendingOld = context.begin(old);
    const pendingNext = context.begin(next);

    context.remember(pendingNext, next);
    context.remember(pendingOld, old);
    expect(context.read(inspectionContextKey(next))).toBe(next);
    expect(() => context.read(inspectionContextKey(old))).toThrow('unavailable');
    context.release(inspectionContextKey(next));
    context.remember(pendingNext, next);
    expect(() => context.read(inspectionContextKey(next))).toThrow('unavailable');
  });
});
