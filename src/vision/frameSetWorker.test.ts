import { afterEach, describe, expect, it, vi } from 'vitest';
import { visionFixture } from './fixtures';

const encode = vi.hoisted(() => vi.fn());
const save = vi.hoisted(() => vi.fn());

vi.mock('./frameSetPersistence', () => ({ persistenceHandlers: { encodeFrame: encode } }));
vi.mock('./frameSetBackends', () => ({ desktopFrameSets: { saveFrame: save }, webFrameSets: {} }));

class CrashedWorker {
  onerror: ((event: { message: string }) => void) | null = null;

  postMessage() {
    queueMicrotask(() => this.onerror?.({ message: 'Worker stopped' }));
  }

  terminate() {}
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.clearAllMocks();
});

describe('browser frame persistence workers', () => {
  it.each([undefined, CrashedWorker])(
    'refuses an unavailable worker without hashing on the main thread',
    async (worker) => {
      vi.stubGlobal('window', {});
      vi.stubGlobal('Worker', worker);

      const { saveFrame } = await import('./frameSetStore');

      await expect(saveFrame(visionFixture().frames[0])).rejects.toThrow('Image storage is unavailable.');
      expect(encode).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    },
  );
});
