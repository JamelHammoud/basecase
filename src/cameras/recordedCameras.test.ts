import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredTry } from '../cases/tryFile';
import type { RecordedCameraEvent } from './recordedProtocol';
import {
  createRecordedCameras,
  closeRecordedCameras,
  openRecordedCameras,
  recordedCameraError,
  seekRecordedCameras,
} from './recordedCameras';

const session = vi.hoisted(() => ({ error: vi.fn(), disconnect: vi.fn() }));

vi.mock('./visionSession', () => ({
  connectVisionFrames: async () => ({ port: { close: vi.fn() }, disconnect: session.disconnect }),
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
  it('disconnects inference before terminating a playback worker', async () => {
    openRecordedCameras({ videos: [{ camera: 'front', from: 0, to: 10 }] } as StoredTry);
    await Promise.resolve();

    const worker = CameraWorker.instances.at(-1)!;

    worker.terminate.mockImplementation(() => expect(session.disconnect).toHaveBeenCalledOnce());
    closeRecordedCameras();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

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

it('keeps two scenes’ playback workers, seeks and close operations independent', () => {
  const a = createRecordedCameras();
  const b = createRecordedCameras();
  const manifest = { videos: [{ camera: 'front', from: 0, to: 10 }] } as StoredTry;

  a.openRecordedCameras(manifest);

  const workerA = CameraWorker.instances.at(-1)!;

  b.openRecordedCameras(manifest);

  const workerB = CameraWorker.instances.at(-1)!;
  const timeA = a.seekRecordedCameras(1);
  const timeB = b.seekRecordedCameras(2);

  expect(workerA.terminate).not.toHaveBeenCalled();
  expect(workerA.postMessage).toHaveBeenLastCalledWith({ type: 'seek', seconds: 1, timestamp: timeA }, []);
  expect(workerB.postMessage).toHaveBeenLastCalledWith({ type: 'seek', seconds: 2, timestamp: timeB }, []);
  workerA.onmessage?.({
    data: { type: 'error', camera: 'front', message: 'Decode failed.', timestamp: timeA },
  } as MessageEvent<RecordedCameraEvent>);
  expect(a.recordedCameraError('front')).toBe('Decode failed.');
  expect(b.recordedCameraError('front')).toBeNull();
  a.closeRecordedCameras();
  expect(workerA.terminate).toHaveBeenCalledOnce();
  expect(workerB.terminate).not.toHaveBeenCalled();
  expect(b.recordedCameraViews()).toHaveLength(1);
  b.closeRecordedCameras();
});
