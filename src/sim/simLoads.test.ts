import { describe, expect, it, vi } from 'vitest';
import type { SimModel } from './mjcfTypes';
import { SimLoads } from './simLoads';

describe('simulation worker load replies', () => {
  it('settles superseded loads without accepting their late replies for the current load', async () => {
    const loading = new SimLoads();
    const postMessage = vi.fn();
    const worker = { postMessage } as unknown as Worker;
    const first = loading.load(worker, {} as SimModel, { kind: 'hold' });
    const second = loading.load(worker, {} as SimModel, { kind: 'hold' });
    const ready = { type: 'ready' as const, nq: 0, nv: 0, nu: 0, nbody: 0 };

    expect(await first).toBe(false);
    expect(postMessage.mock.calls.map(([msg]) => msg.loadId)).toEqual([1, 2]);
    expect(loading.stale({ ...ready, loadId: 1 })).toBe(true);
    expect(loading.stale({ type: 'error', loadId: 1, message: 'old' })).toBe(true);
    expect(loading.stale({ ...ready, loadId: 2 })).toBe(false);
    loading.ready();
    expect(await second).toBe(true);
    expect(loading.stale({ ...ready, loadId: 2 })).toBe(true);
  });

  it('settles a canceled load and ignores its later ready reply', async () => {
    const loading = new SimLoads();
    const worker = { postMessage: vi.fn() } as unknown as Worker;
    const pending = loading.load(worker, {} as SimModel, { kind: 'hold' });

    loading.cancel();
    expect(await pending).toBe(false);
    expect(loading.stale({ type: 'ready', nq: 0, nu: 0, nbody: 0, loadId: 1 })).toBe(true);
  });
});
