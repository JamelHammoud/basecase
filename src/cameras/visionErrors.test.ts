import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VisionResult } from '../vision/types';

interface VisionFailure {
  camera?: string;
  modelId?: string;
  timestamp?: number;
  error: string;
}

const runtime = vi.hoisted(() => ({
  load: vi.fn<(...args: unknown[]) => Promise<void>>(),
  error: (_failure: VisionFailure) => undefined,
}));

vi.mock('../vision/runtime', () => ({
  visionRuntime: () => ({
    load: runtime.load,
    subscribe: vi.fn(),
    onError: (listener: typeof runtime.error) => {
      runtime.error = listener;
    },
  }),
}));

beforeEach(() => {
  vi.resetModules();
  runtime.load.mockReset().mockResolvedValue();
});

const seen = (timestamp: number): VisionResult => ({
  camera: 'wrist',
  modelId: 'yolo11n',
  timestamp,
  width: 320,
  height: 240,
  detections: [{ label: 'person', score: 0.9, box: [0, 0, 1, 1] }],
});

describe('vision worker errors', () => {
  it('clears detections and loaded state and reports fatal failure on every open camera', async () => {
    const session = await import('./visionSession');

    session.registerVisionCameras({}, ['wrist', 'scene']);
    await session.configureVisionCamera('wrist', { modelId: 'yolo11n' });
    session.publishCameraVision(seen(100));
    expect(session.cameraVisionSignals(['wrist'])['vision.wrist.person']).toBe(1);
    runtime.error({ error: 'The worker stopped.' });
    expect(session.cameraVision('wrist')).toBeNull();
    expect(session.cameraVisionSignals(['wrist'])['vision.wrist.person']).toBe(0);
    expect(session.cameraVisionError('wrist')).toBe('The worker stopped.');
    expect(session.cameraVisionError('scene')).toBe('The worker stopped.');
    runtime.load.mockRejectedValue(new Error('The vision runtime is closed.'));
    await expect(session.ensureVisionModel('yolo11n')).rejects.toThrow('closed');
    expect(runtime.load).toHaveBeenCalledTimes(2);
  });

  it('ignores a failed inference from before the current seek', async () => {
    const session = await import('./visionSession');

    await session.configureVisionCamera('wrist', { modelId: 'yolo11n' });
    session.invalidateVisionCamera('wrist', 100);
    session.publishCameraVision(seen(110));
    runtime.error({ camera: 'wrist', modelId: 'yolo11n', timestamp: 99, error: 'Old frame failed.' });
    expect(session.cameraVision('wrist')?.timestamp).toBe(110);
    expect(session.cameraVisionError('wrist')).toBeNull();
  });

  it('accepts a pending newer seek result after reporting a valid frame failure', async () => {
    const session = await import('./visionSession');
    const timestamp = performance.now() - 1000;

    await session.configureVisionCamera('wrist', { modelId: 'yolo11n' });
    session.invalidateVisionCamera('wrist', timestamp);
    runtime.error({ camera: 'wrist', modelId: 'yolo11n', timestamp, error: 'Frame failed.' });
    expect(session.cameraVisionError('wrist')).toBe('Frame failed.');
    session.publishCameraVision(seen(timestamp + 1));
    expect(session.cameraVision('wrist')?.timestamp).toBe(timestamp + 1);
    expect(session.cameraVisionError('wrist')).toBeNull();
  });

  it('keeps failures from private shot and L2 cameras out of live errors', async () => {
    const session = await import('./visionSession');

    await session.ensureVisionModel('yolo11n');
    runtime.error({ camera: 'camera-shot:request:wrist', timestamp: 10, error: 'Shot failed.' });
    runtime.error({ camera: 'routine-l2:request:wrist', timestamp: 10, error: 'L2 failed.' });
    expect(session.cameraVisionError('camera-shot:request:wrist')).toBeNull();
    expect(session.cameraVisionError('routine-l2:request:wrist')).toBeNull();
  });
});
