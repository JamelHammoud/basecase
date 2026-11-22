import { describe, expect, it, vi } from 'vitest';
import type { VisionResult } from '../vision/types';
import { cameraVision, cameraVisionSignals, invalidateVisionCamera, publishCameraVision } from './visionSession';

vi.mock('../vision/runtime', () => ({ visionRuntime: () => ({ subscribe: vi.fn(), onError: vi.fn() }) }));

const result = (timestamp: number): VisionResult => ({
  modelId: 'objects',
  camera: 'playback',
  timestamp,
  width: 320,
  height: 240,
  detections: [{ label: 'cup', score: 0.9, box: [0.1, 0.2, 0.3, 0.4] }],
});

describe('camera vision playhead', () => {
  it('rejects old inference after a seek and clears its signal before the new frame arrives', () => {
    publishCameraVision(result(10));
    expect(cameraVision('playback')?.timestamp).toBe(10);
    expect(cameraVisionSignals(['playback'])['vision.playback.cup']).toBe(1);

    invalidateVisionCamera('playback', 20);
    publishCameraVision(result(19));
    expect(cameraVision('playback')).toBeNull();
    expect(cameraVisionSignals(['playback'])['vision.playback.cup']).toBe(0);

    publishCameraVision(result(20));
    expect(cameraVision('playback')?.timestamp).toBe(20);
    expect(cameraVisionSignals(['playback'])['vision.playback.cup']).toBe(1);
  });

  it('keeps private camera-shot results out of live overlays and signals', () => {
    publishCameraVision({ ...result(100000), camera: 'camera-shot:request:wrist' });
    expect(cameraVision('camera-shot:request:wrist')).toBeNull();
    expect(cameraVisionSignals()['vision.camera-shot:request:wrist.cup']).toBeUndefined();
  });
});

describe('tracked camera vision', () => {
  const tracked = (timestamp: number, lines = 1): VisionResult => ({
    ...result(timestamp),
    camera: 'door-camera',
    tracking: { tracks: [], zones: [], lines: [{ name: 'door', in: lines, out: 0, recent: [] }] },
  });

  it('rejects a stale tracked reply after a scene switch and zeroes the line counts', () => {
    publishCameraVision(tracked(10));
    expect(cameraVisionSignals(['door-camera'])['vision.door-camera.line.door.in']).toBe(1);

    invalidateVisionCamera('door-camera', 20);
    publishCameraVision(tracked(19, 5));
    expect(cameraVisionSignals(['door-camera'])['vision.door-camera.line.door.in']).toBe(0);

    publishCameraVision(tracked(21, 2));
    expect(cameraVisionSignals(['door-camera'])['vision.door-camera.line.door.in']).toBe(2);
  });

  it('keeps the counts of a paused source and ignores a reordered older reply', () => {
    publishCameraVision(tracked(100, 3));
    publishCameraVision(tracked(90, 1));
    expect(cameraVisionSignals(['door-camera'])['vision.door-camera.line.door.in']).toBe(3);
    expect(cameraVisionSignals(['door-camera'])['vision.door-camera.line.door.in']).toBe(3);
  });
});
