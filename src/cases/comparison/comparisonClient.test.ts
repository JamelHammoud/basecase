import { afterEach, describe, expect, it, vi } from 'vitest';
import { comparisonConsumer } from './comparisonClient';

class ControlledWorker {
  static readonly instances: ControlledWorker[] = [];
  onmessage: ((event: { data: { id: number; result?: unknown; error?: string } }) => void) | null = null;
  onerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  constructor() {
    ControlledWorker.instances.push(this);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  ControlledWorker.instances.splice(0);
});

const seek = (time: number) => ({ time, rule: { kind: 'previous' as const, maxAge: 0.5 }, topic: '/same' });

describe('bounded comparison worker requests', () => {
  it('keeps one seek in flight and the latest pending seek per source', async () => {
    vi.stubGlobal('Worker', ControlledWorker);

    const a = comparisonConsumer();
    const b = comparisonConsumer();
    const [aWorker, bWorker] = ControlledWorker.instances;
    const first = a.call('seek', seek(2));
    const obsolete = a.call('seek', seek(3)).catch((error: Error) => error.name);
    const backward = a.call('seek', seek(1));
    const other = b.call('seek', seek(40));

    expect(aWorker.postMessage).toHaveBeenCalledTimes(1);
    expect(bWorker.postMessage).toHaveBeenCalledTimes(1);
    expect(await obsolete).toBe('AbortError');
    aWorker.onmessage?.({ data: { id: 1, result: { time: 2 } } });
    expect(await first).toEqual({ time: 2 });
    expect(aWorker.postMessage).toHaveBeenCalledTimes(2);
    expect(aWorker.postMessage.mock.calls[1][0]).toMatchObject({ id: 3, payload: { time: 1 } });
    aWorker.onmessage?.({ data: { id: 3, result: { time: 1 } } });
    bWorker.onmessage?.({ data: { id: 1, result: { time: 40 } } });
    expect(await backward).toEqual({ time: 1 });
    expect(await other).toEqual({ time: 40 });
    a.dispose();
    b.dispose();
  });

  it('rejects in-flight and queued work on close and ignores late replies without a local fallback', async () => {
    vi.stubGlobal('Worker', ControlledWorker);

    const consumer = comparisonConsumer();
    const worker = ControlledWorker.instances[0];
    const first = consumer.call('seek', seek(2)).catch((error: Error) => error.name);
    const second = consumer.call('seek', seek(3)).catch((error: Error) => error.name);

    consumer.dispose();

    const bitmap = { close: vi.fn() };

    worker.onmessage?.({ data: { id: 1, result: { bitmap } } });
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(await first).toBe('AbortError');
    expect(await second).toBe('AbortError');
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    await expect(consumer.call('seek', seek(0))).rejects.toMatchObject({ name: 'AbortError' });
  });
});
