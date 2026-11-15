import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOperatorVision } from './liveVision';
import type { Picture } from './runners';

afterEach(() => vi.unstubAllGlobals());

describe('live operator vision frames', () => {
  it('tees the estimator’s actual frame to the vision port and owns every cloned frame', async () => {
    const clones: FakeFrame[] = [];

    class FakeFrame {
      close = vi.fn();
      readonly source: unknown;

      constructor(source: unknown) {
        this.source = source;
        clones.push(this);
      }

      clone() {
        return new FakeFrame(this);
      }
    }

    vi.stubGlobal('VideoFrame', FakeFrame);

    const port = { postMessage: vi.fn(), close: vi.fn() } as unknown as MessagePort;
    const fail = vi.fn();
    const vision = createOperatorVision(fail);
    const picture = { close: vi.fn() } as unknown as Picture;

    vision.connect(port);
    vision.configure([{ camera: 'operator', modelId: 'faces', fps: 5 }]);
    expect(vision.wanted()).toBe(true);
    vision.take(picture);
    await vi.waitFor(() => expect(port.postMessage).toHaveBeenCalledOnce());
    expect(clones[0].source).toBe(picture);
    expect(clones[0].close).toHaveBeenCalledOnce();
    expect(port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ camera: 'operator', modelId: 'faces', frame: clones[1] }),
      [clones[1]],
    );
    expect(picture.close).not.toHaveBeenCalled();
    expect(fail).not.toHaveBeenCalled();
    vision.close();
    expect(vision.wanted()).toBe(false);
    expect(port.close).toHaveBeenCalledOnce();
  });
});
