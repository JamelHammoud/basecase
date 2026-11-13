import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InputRobot } from '../../sim/inputSources';
import { buildRig } from '../../utils/kinematics';
import { cameraInput, operatorCameraState } from './cameraInput';
import { operatorState } from './operatorStore';

vi.mock('./cameraFrames', () => ({ framePump: () => ({ start: undefined, stop: () => undefined }) }));

const rig = buildRig([], []);
const ARM: InputRobot = {
  cls: 'arm',
  setup: {
    kind: 'arm',
    robot: 'arm',
    rig,
    part: 'hand',
    point: [0, 0, 0],
    joints: [],
    start: {},
    anchor: [0, 0, 0],
    reachMm: 300,
  },
  rig,
  pointOf: () => null,
  changed: () => undefined,
};

interface FakeTrack {
  kind: string;
  label: string;
  readyState: 'live' | 'ended';
  stop: () => void;
}

function fakeStream() {
  const track: FakeTrack = {
    kind: 'video',
    label: 'FaceTime HD Camera',
    readyState: 'live',
    stop: () => {
      track.readyState = 'ended';
    },
  };

  return { track, stream: { getTracks: () => [track], getVideoTracks: () => [track] } };
}

class FakeWorker {
  onmessage: unknown = null;
  postMessage() {}
  terminate() {}
}

describe('camera input', () => {
  const tracks: FakeTrack[] = [];
  const pending: Array<() => void> = [];

  beforeEach(() => {
    tracks.length = 0;
    pending.length = 0;
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal('window', { electronAPI: { askCameraAccess: async () => true } });
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: () =>
          new Promise((resolve) => {
            const { track, stream } = fakeStream();

            tracks.push(track);
            pending.push(() => resolve(stream));
          }),
      },
    });
  });

  afterEach(() => {
    cameraInput.close?.();
    vi.unstubAllGlobals();
  });

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('stops the first stream when a second open overlaps it, and close stops the one left', async () => {
    const first = cameraInput.open?.(ARM);

    await settle();

    const second = cameraInput.open?.(ARM);

    await settle();
    pending.forEach((resolve) => resolve());

    await expect(first).rejects.toThrow();
    await second;

    expect(tracks.map((t) => t.readyState)).toEqual(['ended', 'live']);
    expect(operatorState().failure).toBeNull();

    cameraInput.close?.();

    expect(tracks.every((t) => t.readyState === 'ended')).toBe(true);
    expect(operatorCameraState().on).toBe(false);
  });

  it('stops a stream that arrives after the drive was closed', async () => {
    const opening = cameraInput.open?.(ARM);

    await settle();
    cameraInput.close?.();
    pending.forEach((resolve) => resolve());

    await expect(opening).rejects.toThrow();

    expect(tracks.map((t) => t.readyState)).toEqual(['ended']);
    expect(operatorCameraState().on).toBe(false);
    expect(operatorState().failure).toBeNull();
  });
});
