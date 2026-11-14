import { afterEach, describe, expect, it, vi } from 'vitest';
import { visionFixture } from '../vision/fixtures';

const encode = vi.hoisted(() => vi.fn());

vi.mock('./imageDatasetFiles', () => ({ imageDatasetFiles: encode }));

class CrashedWorker {
  onerror: ((event: { message: string }) => void) | null = null;

  postMessage(payload: unknown, transfer: Transferable[]) {
    structuredClone(payload, { transfer });
    queueMicrotask(() => this.onerror?.({ message: 'Worker stopped' }));
  }

  terminate() {}
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.clearAllMocks();
});

describe('browser image export worker failures', () => {
  it('refuses a worker crash after transferring image buffers without encoding on the main thread', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('Worker', CrashedWorker);

    const { exportImageDatasetZip } = await import('./imageDatasetClient');
    const set = visionFixture();
    const frame = set.frames[0];

    await expect(exportImageDatasetZip({ sets: [set], name: 'images', seed: 42 })).rejects.toThrow(
      'The image export worker stopped. Export the dataset again.',
    );
    expect(frame.image.byteLength).toBe(0);
    expect(frame.depth.byteLength).toBe(0);
    expect(encode).not.toHaveBeenCalled();
  });

  it('refuses an unavailable browser worker without encoding on the main thread', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('Worker', undefined);

    const { exportImageDatasetFiles } = await import('./imageDatasetClient');

    await expect(exportImageDatasetFiles({ sets: [visionFixture()], name: 'images', seed: 42 })).rejects.toThrow(
      'The image export worker stopped. Export the dataset again.',
    );
    expect(encode).not.toHaveBeenCalled();
  });
});
