import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredTry } from '../cases/tryFile';
import type { RecordedCameraEvent } from './recordedProtocol';
import { closeRecordedCameras, openRecordedCameras, recordedCameraError, seekRecordedCameras } from './recordedCameras';

const session = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock('./visionSession', () => ({
  connectVisionFrames: async () => ({ close: vi.fn() }),
  ensureVisionCamera: async () => undefined,
  invalidateVisionCamera: vi.fn(),
  onVisionAssignments: () => () => undefined,
  registerVisionCameras: () => () => undefined,
  setCameraVisionError: session.error,
  visionAssignments: () => [],
}));

class CameraWorker {
  static readonly instances: CameraWorker[] = [];
  onmessage: ((event: MessageEvent<RecordedCameraEvent>) => void) | null = null;
  onerror = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  constructor() {
    CameraWorker.instances.push(this);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('Worker', CameraWorker);
});

afterEach(() => {
  closeRecordedCameras();
  vi.unstubAllGlobals();
});

describe('recorded camera error ordering', () => {
  it('discards failures from before a seek and preserves the current seek token on errors', () => {
    openRecordedCameras({ videos: [{ camera: 'front', from: 0, to: 10 }] } as StoredTry);

    const first = seekRecordedCameras(1);
    const second = seekRecordedCameras(2);
    const receive = (timestamp: number) =>
      CameraWorker.instances.at(-1)!.onmessage?.({
        data: { type: 'error', camera: 'front', message: 'Decode failed.', timestamp },
      } as MessageEvent<RecordedCameraEvent>);

    receive(first);
    expect(recordedCameraError('front')).toBeNull();
    expect(session.error).not.toHaveBeenCalled();
    receive(second);
    expect(recordedCameraError('front')).toBe('Decode failed.');
    expect(session.error).toHaveBeenCalledExactlyOnceWith('front', 'Decode failed.', second);
  });
});
