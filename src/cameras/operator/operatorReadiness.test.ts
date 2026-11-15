import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InputRobot } from '../../sim/inputTypes';
import { closeOperatorCamera, joinOperatorCamera, operatorPoints, operatorPoseReady } from './operatorCamera';
import type { PoseEvent } from './poseProtocol';

const vision = vi.hoisted(() => ({ disconnect: vi.fn() }));

vi.mock('../visionSession', () => ({
  connectVisionFrames: async () => ({ port: { close: vi.fn() }, disconnect: vision.disconnect }),
  ensureVisionCamera: async () => undefined,
  invalidateVisionCamera: vi.fn(),
  onVisionAssignments: () => () => undefined,
  publishCameraVision: vi.fn(),
  registerVisionCameras: () => () => undefined,
  setCameraVisionError: vi.fn(),
  visionAssignments: () => [],
}));

vi.mock('./operatorFrames', () => ({ frameSource: () => ({ stop: vi.fn() }) }));

afterEach(() => {
  closeOperatorCamera();
  vi.unstubAllGlobals();
});

describe('operator body pose readiness', () => {
  it('is ready after the body estimator loads without requiring a person in view', async () => {
    const workers: FakeWorker[] = [];

    class FakeWorker {
      onmessage: ((event: MessageEvent<PoseEvent>) => void) | null = null;
      postMessage = vi.fn();
      terminate = vi.fn();

      constructor() {
        workers.push(this);
      }
    }

    const track = { stop: vi.fn(), label: 'Camera' };
    const stream = { getTracks: () => [track], getVideoTracks: () => [track] };

    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: async () => stream } });
    expect(operatorPoseReady()).toBe(false);

    const body = joinOperatorCamera('body', {} as InputRobot);

    await vi.waitFor(() => expect(workers).toHaveLength(1));
    await vi.waitFor(() =>
      expect(workers[0].postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'join', kind: 'body' })),
    );
    expect(operatorPoseReady()).toBe(false);
    workers[0].onmessage?.({ data: { type: 'ready', kind: 'body', delegate: 'CPU' } } as MessageEvent<PoseEvent>);
    expect(await body).toBeNull();
    expect(operatorPoseReady()).toBe(true);
    expect(operatorPoints()).toBeNull();
    closeOperatorCamera();
    expect(vision.disconnect).toHaveBeenCalledOnce();
    expect(workers[0].postMessage).toHaveBeenLastCalledWith({ type: 'close' });
    expect(workers[0].terminate).not.toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(operatorPoseReady()).toBe(false);

    const hand = joinOperatorCamera('hand', {} as InputRobot);

    await vi.waitFor(() => expect(workers).toHaveLength(2));
    await vi.waitFor(() =>
      expect(workers[1].postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'join', kind: 'hand' })),
    );
    workers[1].onmessage?.({ data: { type: 'ready', kind: 'hand', delegate: 'CPU' } } as MessageEvent<PoseEvent>);
    expect(await hand).toBeNull();
    expect(operatorPoseReady()).toBe(false);
  });
});

it('moves the operator session to its owning scene and discards the previous worker’s events', async () => {
  const workers: Array<{
    onmessage: ((event: MessageEvent<PoseEvent>) => void) | null;
    postMessage: ReturnType<typeof vi.fn>;
    terminate: ReturnType<typeof vi.fn>;
  }> = [];

  class FakeWorker {
    onmessage: ((event: MessageEvent<PoseEvent>) => void) | null = null;
    postMessage = vi.fn();
    terminate = vi.fn();

    constructor() {
      workers.push(this);
    }
  }

  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  const robot = (scene: string): InputRobot => ({
    kind: 'tip',
    start: [0, 0, 0],
    reachMm: 100,
    visionSource: { scene, kind: 'operator', id: scene },
  });

  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: async () => stream } });

  const body = joinOperatorCamera('body', robot('kitchen'));

  await vi.waitFor(() =>
    expect(workers[0]?.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'join' })),
  );
  workers[0].onmessage?.({ data: { type: 'ready', kind: 'body', delegate: 'CPU' } } as MessageEvent<PoseEvent>);
  expect(await body).toBeNull();

  const hand = joinOperatorCamera('hand', robot('workshop'));

  await vi.waitFor(() =>
    expect(workers[1]?.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'join' })),
  );
  expect(workers[0].postMessage).toHaveBeenLastCalledWith({ type: 'close' });
  expect(workers[0].terminate).not.toHaveBeenCalled();
  expect(operatorPoseReady()).toBe(false);
  workers[0].onmessage?.({ data: { type: 'ready', kind: 'body', delegate: 'CPU' } } as MessageEvent<PoseEvent>);
  workers[0].onmessage?.({
    data: { type: 'pose', follow: null, image: [[0.5, 0.5, true]], seenAt: performance.timeOrigin + performance.now() },
  } as MessageEvent<PoseEvent>);
  expect(operatorPoints()).toBeNull();
  expect(operatorPoseReady()).toBe(false);
  workers[1].onmessage?.({ data: { type: 'ready', kind: 'hand', delegate: 'CPU' } } as MessageEvent<PoseEvent>);
  expect(await hand).toBeNull();
});
