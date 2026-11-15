import { describe, expect, it, vi } from 'vitest';
import type { SimModel } from './mjcf';
import { createModelLoadLink } from './modelLoad';
import type { SimRequest } from './sim.worker';

describe('simulation model replies', () => {
  it('ignores an old ready reply after a replacement load and resolves only the matching model', async () => {
    const link = createModelLoadLink();
    const worker = { postMessage: vi.fn<(message: SimRequest) => void>() };
    const first = link.load(worker, {} as SimModel, { kind: 'hold' });
    const firstId = (worker.postMessage.mock.calls[0][0] as Extract<SimRequest, { type: 'load' }>).loadId;
    const second = link.load(worker, {} as SimModel, { kind: 'hold' });
    const secondId = (worker.postMessage.mock.calls[1][0] as Extract<SimRequest, { type: 'load' }>).loadId;

    expect(await first).toBe(false);
    expect(link.ready(firstId)).toBe(false);
    expect(link.ready(secondId)).toBe(true);
    expect(await second).toBe(true);
  });

  it('settles a pending startup when Stop happens and ignores its late ready reply', async () => {
    const link = createModelLoadLink();
    const worker = { postMessage: vi.fn<(message: SimRequest) => void>() };
    const pending = link.load(worker, {} as SimModel, { kind: 'hold' });
    const id = (worker.postMessage.mock.calls[0][0] as Extract<SimRequest, { type: 'load' }>).loadId;

    link.cancel();
    expect(await pending).toBe(false);
    expect(link.ready(id)).toBe(false);
  });
});
