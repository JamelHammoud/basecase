import { expect, it, vi } from 'vitest';
import { CompositionJobs } from './client';
import { defaultComposition } from './settings';
import type { CompositionOutput } from './render';
import type { RenderMeshFiles } from '../componentMeshes';

function fixture() {
  const workers: Array<{
    terminate: ReturnType<typeof vi.fn>;
    postMessage: ReturnType<typeof vi.fn>;
    onmessage: ((message: { data: unknown }) => void) | null;
    onerror: ((event: { message: string }) => void) | null;
  }> = [];
  const spawn = () => {
    const worker = { terminate: vi.fn(), postMessage: vi.fn(), onmessage: null, onerror: null };

    workers.push(worker);

    return worker as unknown as Worker;
  };

  return { workers, jobs: new CompositionJobs(spawn, async () => ({})) };
}

const request = () => ({ snapshot: { parts: [], pose: {} }, settings: defaultComposition() });

it('bounds concurrency to one and cancels replaced, closed and stale-source work without delivering it', async () => {
  const { jobs, workers } = fixture();
  const first = jobs.run(request(), new AbortController().signal);
  const failed = expect(first).rejects.toMatchObject({ name: 'AbortError' });

  await Promise.resolve();

  const abort = new AbortController();
  const second = jobs.run(request(), abort.signal);

  await failed;
  expect(workers[0].terminate).toHaveBeenCalledOnce();

  const cancelled = expect(second).rejects.toMatchObject({ name: 'AbortError' });

  abort.abort();
  await cancelled;
  expect(workers[1].terminate).toHaveBeenCalledOnce();

  const third = jobs.run(request(), new AbortController().signal);
  const closed = expect(third).rejects.toMatchObject({ name: 'AbortError' });

  jobs.cancel();
  await closed;
});

it('never launches a worker for cancelled asset preparation and releases a completed renderer', async () => {
  let release: (value: RenderMeshFiles) => void = () => {};
  const pending = new Promise<RenderMeshFiles>((resolve) => {
    release = resolve;
  });
  const spawn = vi.fn();
  const jobs = new CompositionJobs(spawn, () => pending);
  const abort = new AbortController();
  const run = jobs.run(request(), abort.signal);
  const refused = expect(run).rejects.toMatchObject({ name: 'AbortError' });

  abort.abort();
  release({});
  await refused;
  await Promise.resolve();
  expect(spawn).not.toHaveBeenCalled();

  const ready = fixture();
  const completed = ready.jobs.run(request(), new AbortController().signal);

  await Promise.resolve();
  ready.workers[0].onmessage!({
    data: { id: 1, result: { png: new Blob(), view: defaultComposition().view } as CompositionOutput },
  });
  expect((await completed).png).toBeInstanceOf(Blob);
  expect(ready.workers[0].terminate).toHaveBeenCalledOnce();
});
