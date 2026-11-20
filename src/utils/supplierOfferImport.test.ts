import { afterEach, expect, it, vi } from 'vitest';
import { importOffersAsync } from './supplierOfferImport';

class ImportWorker {
  static readonly instances: ImportWorker[] = [];
  static get latest() {
    return this.instances.at(-1)!;
  }
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() {
    ImportWorker.instances.push(this);
  }
}

afterEach(() => vi.unstubAllGlobals());

it('owns a disposable worker for success, rejected imports, worker errors and cancellation', async () => {
  vi.stubGlobal('Worker', ImportWorker);

  const controller = new AbortController();
  const first = importOffersAsync('csv', 'quote.csv', controller.signal);
  const worker = ImportWorker.latest;

  expect(worker.postMessage).toHaveBeenCalledWith({ text: 'csv', source: 'quote.csv' });
  worker.onmessage!({ data: { offers: [] } });
  await expect(first).resolves.toEqual([]);
  expect(worker.terminate).toHaveBeenCalledOnce();

  const failed = importOffersAsync('bad csv', 'quote.csv', controller.signal);

  ImportWorker.latest.onmessage!({ data: { error: 'Check the CSV column count.' } });
  await expect(failed).rejects.toThrow('Check the CSV column count.');
  expect(ImportWorker.latest.terminate).toHaveBeenCalledOnce();

  const crashed = importOffersAsync('csv', 'quote.csv', controller.signal);

  ImportWorker.latest.onerror!({ message: 'worker stopped' });
  await expect(crashed).rejects.toThrow('worker stopped');
  expect(ImportWorker.latest.terminate).toHaveBeenCalledOnce();

  const cancelled = importOffersAsync('csv', 'quote.csv', controller.signal);

  controller.abort();
  await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
  expect(ImportWorker.latest.terminate).toHaveBeenCalledOnce();
  await expect(importOffersAsync('csv', 'quote.csv', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
});
