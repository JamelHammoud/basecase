import { describe, expect, it, vi } from 'vitest';
import { ProducerPorts } from './producerPorts';
import { LatestFrameQueue } from './frameQueue';

const port = () => ({ onmessage: null, start: vi.fn(), close: vi.fn() });

describe('inference producer teardown', () => {
  it('closes queued frames through runtime detach while another producer remains connected', async () => {
    let finish: (() => void) | undefined;
    const seen = vi.fn();
    const queue = new LatestFrameQueue(async (job: { frame: { close(): void }; modelId: string; producer: object }) => {
      seen(job);
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    const ports = new ProducerPorts(
      (message, producer) => queue.push({ ...message, modelId: 'test', producer } as Parameters<typeof queue.push>[0]),
      (producer) => queue.removeProducer(producer),
    );
    const first = port() as unknown as MessagePort;
    const other = port() as unknown as MessagePort;
    const active = { type: 'frame', frame: { close: vi.fn() } };
    const pending = { type: 'frame', frame: { close: vi.fn() } };

    ports.attach(1, first);
    ports.attach(2, other);
    first.onmessage!(new MessageEvent('message', { data: active }));
    first.onmessage!(new MessageEvent('message', { data: pending }));
    ports.detach(1);
    ports.detach(1);
    expect(pending.frame.close).toHaveBeenCalledOnce();
    expect(first.close).toHaveBeenCalledOnce();
    expect(first.onmessage).toBeNull();
    expect(ports.has(1, first)).toBe(false);
    expect(ports.has(2, other)).toBe(true);
    finish!();
    await vi.waitFor(() => expect(active.frame.close).toHaveBeenCalledOnce());
    expect(seen).toHaveBeenCalledOnce();
    ports.close();
    expect(other.close).toHaveBeenCalledOnce();
  });
});
