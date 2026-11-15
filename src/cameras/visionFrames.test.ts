import { describe, expect, it, vi } from 'vitest';
import { visionFrameSender } from './visionFrames';

const bitmap = () => ({ close: vi.fn() }) as unknown as ImageBitmap;

describe('vision camera frame producer', () => {
  it('caps each camera independently and transfers pixels directly through its worker port', async () => {
    const port = { postMessage: vi.fn(), close: vi.fn() } as unknown as MessagePort;
    const capture = vi.fn(async () => bitmap());
    const sender = visionFrameSender(capture);

    const source = { scene: 'kitchen', kind: 'simulated' as const, id: 'kitchen-feed' };

    sender.connect(port);
    sender.configure([
      { camera: 'scene', modelId: 'objects', fps: 5, source },
      { camera: 'wrist', modelId: 'objects', fps: 5 },
    ]);
    await sender.send('scene', 0);
    await sender.send('scene', 100);
    await sender.send('wrist', 100);
    port.onmessage?.call(port, {
      data: { type: 'result', result: { camera: 'scene', modelId: 'objects' } },
    } as MessageEvent);
    await sender.send('scene', 200);

    expect(capture.mock.calls).toHaveLength(3);
    expect(port.postMessage).toHaveBeenCalledTimes(3);
    expect(port.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'frame', modelId: 'objects', camera: 'scene', timestamp: 200, source }),
      [expect.anything()],
    );
  });

  it('closes a captured bitmap when its camera is disabled while capture is pending', async () => {
    const frame = bitmap();
    let finish = (picture: ImageBitmap) => picture.close();
    const sender = visionFrameSender(
      () =>
        new Promise<ImageBitmap>((resolve) => {
          finish = resolve;
        }),
    );
    const port = { postMessage: vi.fn(), close: vi.fn() } as unknown as MessagePort;

    sender.connect(port);
    sender.configure([{ camera: 'wrist', modelId: 'objects', fps: 10 }]);

    const pending = sender.send('wrist', 0);

    sender.configure([]);
    finish(frame);
    await pending;
    expect(frame.close).toHaveBeenCalledOnce();
    expect(port.postMessage).not.toHaveBeenCalled();
  });
});

describe('vision camera backpressure', () => {
  it('paces recorded captures by elapsed time while preserving close seek timestamps through acknowledgements', async () => {
    const made = [bitmap(), bitmap(), bitmap()];
    let next = 0;
    const sender = visionFrameSender(async () => made[next++]);
    const port = { postMessage: vi.fn(), close: vi.fn() } as unknown as MessagePort;

    sender.connect(port);
    sender.configure([{ camera: 'recorded', modelId: 'faces', fps: 5 }]);
    await sender.send('recorded', 1000, undefined, 0);
    await sender.send('recorded', 1000.001, undefined, 200);
    await sender.send('recorded', 1000.002, undefined, 400);
    expect(next).toBe(3);
    expect(port.postMessage).toHaveBeenCalledOnce();
    expect(made[1].close).toHaveBeenCalledOnce();
    port.onmessage?.call(port, {
      data: { type: 'result', result: { camera: 'recorded', modelId: 'faces' } },
    } as MessageEvent);
    expect(port.postMessage).toHaveBeenCalledTimes(2);
    expect(port.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ frame: made[2], timestamp: 1000.002 }),
      [made[2]],
    );
    sender.close();
  });

  it('holds one in-flight frame and replaces the pending frame until inference acknowledges it', async () => {
    const made = [bitmap(), bitmap(), bitmap()];
    let next = 0;
    const capture = vi.fn(async () => made[next++]);
    const port = { postMessage: vi.fn(), close: vi.fn(), onmessage: null } as unknown as MessagePort;
    const sender = visionFrameSender(capture);

    sender.connect(port);
    sender.configure([{ camera: 'wrist', modelId: 'objects', fps: 10 }]);
    await sender.send('wrist', 0);
    await sender.send('wrist', 100);
    await sender.send('wrist', 200);
    expect(port.postMessage).toHaveBeenCalledOnce();
    expect(made[1].close).toHaveBeenCalledOnce();

    port.onmessage?.call(port, {
      data: { type: 'result', result: { camera: 'wrist', modelId: 'objects' } },
    } as MessageEvent);

    expect(port.postMessage).toHaveBeenCalledTimes(2);
    expect(port.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ frame: made[2], timestamp: 200 }), [
      made[2],
    ]);
    sender.close();
  });

  it('releases a pending bitmap and resumes sending when its inference port is replaced', async () => {
    const made = [bitmap(), bitmap(), bitmap()];
    let next = 0;
    const sender = visionFrameSender(async () => made[next++]);
    const port = { postMessage: vi.fn(), close: vi.fn() } as unknown as MessagePort;
    const replacement = { postMessage: vi.fn(), close: vi.fn() } as unknown as MessagePort;

    sender.connect(port);
    sender.configure([{ camera: 'wrist', modelId: 'objects', fps: 10 }]);
    await sender.send('wrist', 0);
    await sender.send('wrist', 100);
    sender.connect(replacement);
    await sender.send('wrist', 200);
    expect(port.close).toHaveBeenCalledOnce();
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'detach' });
    expect(made[1].close).toHaveBeenCalledOnce();
    expect(replacement.postMessage).toHaveBeenCalledOnce();
    sender.close();
    expect(replacement.postMessage).toHaveBeenLastCalledWith({ type: 'detach' });
  });

  it('closes a frame after a failed transfer and allows the next frame to be sent', async () => {
    const made = [bitmap(), bitmap()];
    let next = 0;
    const sender = visionFrameSender(async () => made[next++]);
    const postMessage = vi.fn().mockImplementationOnce(() => {
      throw new Error('The frame could not be transferred.');
    });
    const port = { postMessage, close: vi.fn() } as unknown as MessagePort;

    sender.connect(port);
    sender.configure([{ camera: 'wrist', modelId: 'objects', fps: 10 }]);
    await expect(sender.send('wrist', 0)).rejects.toThrow('The frame could not be transferred.');
    expect(made[0].close).toHaveBeenCalledOnce();
    await sender.send('wrist', 100);
    expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ frame: made[1] }), [made[1]]);
    sender.close();
  });

  it('acknowledges a dropped inference frame and sends only its latest pending camera frame', async () => {
    const made = [bitmap(), bitmap()];
    let next = 0;
    const sender = visionFrameSender(async () => made[next++]);
    const port = { postMessage: vi.fn(), close: vi.fn() } as unknown as MessagePort;

    sender.connect(port);
    sender.configure([{ camera: 'wrist', modelId: 'objects', fps: 10 }]);
    await sender.send('wrist', 0);
    await sender.send('wrist', 100);
    port.onmessage?.call(port, { data: { type: 'dropped', camera: 'wrist', modelId: 'objects' } } as MessageEvent);
    expect(port.postMessage).toHaveBeenCalledTimes(2);
    expect(port.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ frame: made[1] }), [made[1]]);
    port.onmessage?.call(port, { data: { type: 'dropped', camera: 'wrist', modelId: 'objects' } } as MessageEvent);
    expect(port.postMessage).toHaveBeenCalledTimes(2);
    sender.close();
  });
});
