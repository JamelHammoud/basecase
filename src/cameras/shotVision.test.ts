import { describe, expect, it, vi } from 'vitest';
import type { VisionResult } from '../vision/types';
import { createShotVision } from './shotVision';

function setup() {
  const port = { postMessage: vi.fn(), close: vi.fn(), onmessage: null } as unknown as MessagePort;
  const image = { close: vi.fn() } as unknown as ImageBitmap;
  const copy = vi.fn(() => ({ close: vi.fn() }) as unknown as ImageBitmap);
  const client = createShotVision(copy);

  const source = { scene: 'kitchen', kind: 'simulated' as const, id: 'kitchen-feed' };

  client.connect(port, [{ camera: 'wrist', modelId: 'objects', fps: 5, source }]);

  return { port, image, client, source };
}

const result = (camera: string, modelId = 'objects'): VisionResult => ({
  camera,
  modelId,
  timestamp: 100,
  width: 320,
  height: 240,
  detections: [{ label: 'cup', score: 0.9, box: [0.1, 0.2, 0.3, 0.4] }],
});

describe('exact camera shot inference', () => {
  it('ignores a newer live result and another model until the originating shot result arrives', async () => {
    const { port, image, client, source } = setup();
    let settled = false;
    const pending = client.infer('wrist', image).then((value) => {
      settled = true;

      return value;
    });
    const message = vi.mocked(port.postMessage).mock.calls[0][0] as { camera: string };

    port.onmessage?.call(port, {
      data: { type: 'result', result: { ...result('wrist'), timestamp: 100000 } },
    } as MessageEvent);
    port.onmessage?.call(port, { data: { type: 'result', result: result(message.camera, 'faces') } } as MessageEvent);
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(message.camera).toMatch(/^camera-shot:/);
    expect(message).toMatchObject({ source });
    port.onmessage?.call(port, { data: { type: 'result', result: result(message.camera) } } as MessageEvent);

    expect((await pending).detections[0].label).toBe('cup');
    client.close();
  });

  it('does not let one shot satisfy another shot from the same camera', async () => {
    const { port, image, client } = setup();
    const first = client.infer('wrist', image);
    const second = client.infer('wrist', image);
    const sent = vi.mocked(port.postMessage).mock.calls.map(([message]) => message as { camera: string });

    expect(sent[0].camera).not.toBe(sent[1].camera);
    port.onmessage?.call(port, { data: { type: 'result', result: result(sent[1].camera) } } as MessageEvent);
    expect((await second).detections).toHaveLength(1);
    port.onmessage?.call(port, {
      data: { type: 'dropped', camera: sent[0].camera, modelId: 'objects' },
    } as MessageEvent);
    expect((await first).error).toContain('replaced');
    expect(port.postMessage).toHaveBeenCalledTimes(2);
    client.close();
  });
});
