import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PoseEvent, PoseRequest } from './poseProtocol';
import {
  closeOperatorCamera,
  ensureOperatorPoseVision,
  joinOperatorCamera,
  leaveOperatorCamera,
} from './operatorCamera';

vi.mock('../../vision/client', () => ({ connectVisionSource: () => () => undefined }));
vi.mock('./operatorFrames', () => ({ frameSource: () => ({ frames: undefined, stop: vi.fn() }) }));

const workers: CameraWorker[] = [];
const stop = vi.fn();

class CameraWorker {
  onmessage: ((event: { data: PoseEvent }) => void) | null = null;

  messages: PoseRequest[] = [];

  terminate = vi.fn();

  constructor() {
    workers.push(this);
  }

  postMessage(message: PoseRequest) {
    this.messages.push(message);

    if (message.type === 'join') {
      queueMicrotask(() => this.onmessage?.({ data: { type: 'ready', kind: message.kind, delegate: 'CPU' } }));
    }
  }
}

beforeEach(() => {
  workers.length = 0;
  stop.mockClear();
  vi.stubGlobal('Worker', CameraWorker);
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue({
        getVideoTracks: () => [{ label: 'Camera' }],
        getTracks: () => [{ stop }],
      }),
    },
  });
});

afterEach(() => {
  closeOperatorCamera();
  vi.unstubAllGlobals();
});

describe('Body Pose observation on the operator camera', () => {
  it('shares the driving landmarker and keeps it open until the last observer leaves', async () => {
    await joinOperatorCamera('body', { kind: 'tip', start: [0, 0, 0], reachMm: 100 });

    const releaseFirst = await ensureOperatorPoseVision();
    const releaseLast = await ensureOperatorPoseVision();

    leaveOperatorCamera('body');
    releaseFirst();

    expect(workers).toHaveLength(1);
    expect(workers[0].messages.filter((message) => message.type === 'join')).toHaveLength(1);
    expect(stop).not.toHaveBeenCalled();

    releaseLast();

    expect(stop).toHaveBeenCalledTimes(1);
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
  });

  it('opens a pose observation without a robot or a second camera stream', async () => {
    const releases = await Promise.all([ensureOperatorPoseVision(), ensureOperatorPoseVision()]);

    expect(workers).toHaveLength(1);
    expect(workers[0].messages.filter((message) => message.type === 'join')).toEqual([
      { type: 'join', kind: 'body', robot: null, standIn: false },
    ]);

    releases.forEach((release) => release());

    expect(stop).toHaveBeenCalledTimes(1);
  });
});
