import { afterEach, expect, it, vi } from 'vitest';
import { browserWorkerDiagnostics } from './browserDiagnostics';

const worker = (evaluate = vi.fn(async () => ({ clock: 1, resources: [] }))) => ({
  url: () => 'https://example.test/body.worker.js?token=hidden',
  evaluate,
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('retains bounded worker resources without URL query data', async () => {
  vi.spyOn(performance, 'getEntriesByType').mockReturnValue(
    Array.from({ length: 20 }, (_, i) => ({
      name: `https://example.test/model-${i}.wasm?token=hidden`,
      startTime: i,
      duration: 2,
    })),
  );

  const result = await browserWorkerDiagnostics({ workers: () => [worker(async (read) => read())] });

  expect(result[0].url).toBe('/body.worker.js');
  expect(result[0].value.resources).toHaveLength(8);
  expect(result[0].value.resources[0]).toEqual({ path: '/model-12.wasm', startMs: 12, durationMs: 2 });
  expect(JSON.stringify(result)).not.toContain('hidden');
});

it('caps capture at sixteen workers', async () => {
  const workers = Array.from({ length: 17 }, () => worker());

  expect(await browserWorkerDiagnostics({ workers: () => workers })).toHaveLength(16);
  expect(workers[16].evaluate).not.toHaveBeenCalled();
});

it('bounds all busy workers together instead of waiting on each in sequence', async () => {
  vi.useFakeTimers();

  const pending = browserWorkerDiagnostics({
    workers: () => Array.from({ length: 4 }, () => worker(() => new Promise(() => {}))),
  });

  await vi.advanceTimersByTimeAsync(1000);
  expect(await pending).toEqual(Array.from({ length: 4 }, () => ({ url: '/body.worker.js', unavailable: true })));
});

it('retains a worker failure without rejecting browser cleanup', async () => {
  const result = await browserWorkerDiagnostics({
    workers: () => [
      worker(async () => {
        throw new Error('worker stopped');
      }),
    ],
  });

  expect(result[0].error).toContain('worker stopped');
});
