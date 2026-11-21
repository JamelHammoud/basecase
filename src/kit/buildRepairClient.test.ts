import { afterEach, expect, it, vi } from 'vitest';
import { prepareBuildRepair } from './buildRepairClient';
import type { PreparedFrozenKit } from './frozenContent';

class RepairWorker {
  static readonly instances: RepairWorker[] = [];
  static get latest() {
    return RepairWorker.instances.at(-1)!;
  }
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn();

  constructor() {
    RepairWorker.instances.push(this);
  }
}

const source: PreparedFrozenKit = { hash: 'a'.repeat(64), text: '{}', bytes: 2, assets: {} };
const target: PreparedFrozenKit = { hash: 'b'.repeat(64), text: '{}', bytes: 2, assets: {} };

afterEach(() => vi.unstubAllGlobals());

it('cancels outstanding repair preparation and discards a late reply without changing input', async () => {
  vi.stubGlobal('Worker', RepairWorker);

  const controller = new AbortController();
  const pending = prepareBuildRepair(source, target, controller.signal);
  const worker = RepairWorker.latest;
  const sent = worker.postMessage.mock.calls[0][0];

  expect(sent.op).toBe('prepare');
  expect(sent.payload).toEqual({ source, target });
  controller.abort();
  worker.onmessage!({ data: { id: sent.id, result: { source: source.hash, target: target.hash } } });
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(worker.terminate).toHaveBeenCalledOnce();
  await expect(prepareBuildRepair(source, target, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
});

it('releases the worker after success and preserves the worker-verified revision hashes', async () => {
  vi.stubGlobal('Worker', RepairWorker);

  const pending = prepareBuildRepair(source, target, new AbortController().signal);
  const worker = RepairWorker.latest;
  const result = { source: source.hash, target: target.hash, refusal: null, phases: [] };

  worker.onmessage!({ data: { id: worker.postMessage.mock.calls[0][0].id, result } });
  await expect(pending).resolves.toEqual(result);
  expect(worker.terminate).toHaveBeenCalledOnce();
});

it('refuses worker failure in a document without falling back to geometry on the interaction thread', async () => {
  vi.stubGlobal('Worker', RepairWorker);
  vi.stubGlobal('document', {});

  const pending = prepareBuildRepair(source, target, new AbortController().signal);
  const worker = RepairWorker.latest;

  worker.onerror!({ message: 'Stopped worker' });
  await expect(pending).rejects.toThrow('Repair needs a worker.');
  expect(worker.postMessage).toHaveBeenCalledOnce();
  expect(worker.terminate).toHaveBeenCalled();
});
