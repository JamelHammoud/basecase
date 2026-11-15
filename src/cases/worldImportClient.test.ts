import { afterEach, describe, expect, it, vi } from 'vitest';
import { importWorldInWorker } from './worldImportClient';

const createdWorkers: ImportWorker[] = [];

class ImportWorker {
  onmessage?: (event: { data: unknown }) => void;
  onerror?: (event: { message: string }) => void;
  terminate = vi.fn();
  postMessage = vi.fn();

  constructor() {
    createdWorkers.push(this);
  }
}

afterEach(() => vi.unstubAllGlobals());

describe('world import worker lifetime', () => {
  it('transfers file bytes, returns its result and releases the entire WASM worker', async () => {
    vi.stubGlobal('Worker', ImportWorker);

    const bytes = new Uint8Array([1, 2, 3]);
    const waiting = importWorldInWorker({ files: [{ name: 'room.glb', bytes }] });
    const worker = createdWorkers.at(-1)!;
    const result = { kind: 'room', room: {} };

    expect(worker.postMessage).toHaveBeenCalledWith(
      { id: 1, op: 'importWorld', payload: { files: [{ name: 'room.glb', bytes }] } },
      [bytes.buffer],
    );
    worker.onmessage?.({ data: { result } });
    await expect(waiting).resolves.toEqual(result);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('releases a cancelled worker and a worker whose file transfer fails', async () => {
    vi.stubGlobal('Worker', ImportWorker);

    const abort = new AbortController();
    const waiting = importWorldInWorker({ files: [] }, abort.signal);
    const worker = createdWorkers.at(-1)!;

    abort.abort();
    await expect(waiting).rejects.toThrow('stopped');
    expect(worker.terminate).toHaveBeenCalledOnce();

    class FailedWorker extends ImportWorker {
      postMessage = vi.fn(() => {
        throw new Error('Transfer failed');
      });
    }

    vi.stubGlobal('Worker', FailedWorker);
    await expect(importWorldInWorker({ files: [] })).rejects.toThrow('Transfer failed');
    expect(createdWorkers.at(-1)!.terminate).toHaveBeenCalledOnce();
  });

  it('refuses an unavailable worker without running geometry in the page', async () => {
    vi.stubGlobal('Worker', undefined);

    await expect(importWorldInWorker({ files: [] })).rejects.toThrow();
  });
});
