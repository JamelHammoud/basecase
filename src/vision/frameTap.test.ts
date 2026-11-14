import { afterEach, describe, expect, it, vi } from 'vitest';
import { VisionFrameTap } from './frameTap';

const ports: MessagePort[] = [];

afterEach(() => {
  ports.forEach((port) => port.close());
  ports.length = 0;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('camera frame handoff', () => {
  it('caps a 30 fps camera at five bitmap copies and worker transfers per second', async () => {
    const postMessage = vi.fn();
    const close = vi.fn();
    const copy = vi.fn(async () => ({ close }));
    const clock = vi.spyOn(performance, 'now');
    const tap = new VisionFrameTap();

    vi.stubGlobal('createImageBitmap', copy);
    tap.configure({ postMessage, close } as unknown as MessagePort, ['wrist']);

    for (let frame = 0; frame < 30; frame++) {
      clock.mockReturnValue((frame * 1000) / 30);
      tap.send('wrist', {} as ImageBitmap, 10000 + (frame * 1000) / 30);
      await Promise.resolve();
    }

    expect(copy).toHaveBeenCalledTimes(5);
    expect(postMessage).toHaveBeenCalledTimes(5);
    expect(postMessage.mock.calls[0][0]).toEqual(expect.objectContaining({ camera: 'wrist', timestamp: 10000 }));
    expect(postMessage.mock.calls[0][1]).toEqual([expect.objectContaining({ close })]);
  });

  it('closes a bitmap prepared for a source port that was replaced before the copy completed', async () => {
    const first = new MessageChannel();
    const next = new MessageChannel();
    const close = vi.fn();
    let finish: ((bitmap: { close: () => void }) => void) | null = null;

    ports.push(
      first.port1 as unknown as MessagePort,
      first.port2 as unknown as MessagePort,
      next.port1 as unknown as MessagePort,
      next.port2 as unknown as MessagePort,
    );
    vi.stubGlobal(
      'createImageBitmap',
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );

    const tap = new VisionFrameTap();

    tap.configure(first.port1 as unknown as MessagePort, ['wrist']);
    tap.send('wrist', {} as ImageBitmap, 100);
    tap.configure(next.port1 as unknown as MessagePort, []);
    finish!({ close });
    await Promise.resolve();
    expect(close).toHaveBeenCalledOnce();
  });
});
