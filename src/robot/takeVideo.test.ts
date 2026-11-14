import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RobotEvent } from './robotState';

const wired = vi.hoisted(() => ({
  robot: [] as ((event: RobotEvent) => void)[],
  camera: [] as (() => void)[],
  snapshot: { open: false, stream: null as MediaStream | null },
  saved: [] as [string, number[]][],
}));

vi.mock('./robotStore', () => ({
  subscribeRobotEvents: (listener: (event: RobotEvent) => void) => wired.robot.push(listener),
}));
vi.mock('../cameras/operator/operatorCamera', () => ({
  operatorCameraSnapshot: () => wired.snapshot,
  subscribeOperatorCamera: (listener: () => void) => wired.camera.push(listener),
}));
vi.mock('../cases/tryStore', () => ({
  saveTryVideo: async (id: string, bytes: Uint8Array) => {
    wired.saved.push([id, [...bytes]]);
  },
}));
vi.mock('./takeVideoRecorder', () => ({
  workerRecorder: () => ({ finish: async () => new Uint8Array([4, 2]), drop: () => undefined }),
}));

const { createTakeVideo, KEPT_GRACE_MS, startTakeVideo } = await import('./takeVideo');

const stream = { id: 'camera' } as unknown as MediaStream;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

interface FakeRecorder {
  stream: MediaStream;
  lead: number;
  finish: ReturnType<typeof vi.fn>;
  drop: ReturnType<typeof vi.fn>;
}

function fakeEncoder(bytes = [1, 2, 3]) {
  const recorders: FakeRecorder[] = [];
  const kept: [string, number[]][] = [];
  const clock = { ms: 0 };
  const takes = createTakeVideo({
    now: () => clock.ms,
    record: (from, lead) => {
      const recorder = { stream: from, lead, finish: vi.fn(async () => new Uint8Array(bytes)), drop: vi.fn() };

      recorders.push(recorder);

      return recorder;
    },
    keep: async (id, video) => {
      kept.push([id, [...video]]);
    },
  });

  return { takes, recorders, kept, clock };
}

const take = (state: string, id = 'take-1'): RobotEvent => ({ event: 'take', state, id });

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));

afterEach(() => vi.useRealTimers());

describe('the operator video kept with a take', () => {
  it('records from the open take’s frames and saves the video once it’s kept', async () => {
    const { takes, recorders, kept } = fakeEncoder();

    takes.camera(stream);
    takes.event(take('open'));

    expect(recorders).toHaveLength(1);
    expect(recorders[0]).toMatchObject({ stream, lead: 0 });

    takes.event(take('kept'));
    takes.event(take('kept'));
    await vi.runAllTimersAsync();

    expect(recorders[0].finish).toHaveBeenCalledTimes(1);
    expect(recorders[0].drop).not.toHaveBeenCalled();
    expect(kept).toEqual([['take-1', [1, 2, 3]]]);
  });

  it('records nothing without the camera, and starts mid-take at the camera’s lead into the take', async () => {
    const { takes, recorders, kept, clock } = fakeEncoder();

    takes.event(take('open'));
    clock.ms = 3500;

    expect(recorders).toHaveLength(0);

    takes.camera(stream);

    expect(recorders).toHaveLength(1);
    expect(recorders[0].lead).toBe(3.5);

    takes.event(take('kept'));
    await vi.runAllTimersAsync();

    expect(kept).toEqual([['take-1', [1, 2, 3]]]);
  });

  it('discards the video of a dropped take', async () => {
    const { takes, recorders, kept } = fakeEncoder();

    takes.camera(stream);
    takes.event(take('open'));
    takes.event(take('dropped'));
    takes.event(take('kept'));
    await vi.runAllTimersAsync();

    expect(recorders[0].drop).toHaveBeenCalledTimes(1);
    expect(recorders[0].finish).not.toHaveBeenCalled();
    expect(kept).toEqual([]);
  });

  it('ends the video when the link is lost and discards it unless the take is kept soon after', async () => {
    const { takes, recorders, kept } = fakeEncoder();

    takes.camera(stream);
    takes.event(take('open', 'lost'));
    takes.event({ event: 'link', state: 'disconnected' });

    expect(recorders[0].finish).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(KEPT_GRACE_MS);
    takes.event(take('kept', 'lost'));
    await vi.runAllTimersAsync();

    expect(kept).toEqual([]);

    takes.event(take('open', 'saved'));
    takes.event({ event: 'link', state: 'disconnected' });
    takes.event(take('kept', 'saved'));
    await vi.runAllTimersAsync();

    expect(kept).toEqual([['saved', [1, 2, 3]]]);
  });

  it('finishes the video when the camera is switched off mid-take, and starts no second one', async () => {
    const { takes, recorders, kept } = fakeEncoder();

    takes.camera(stream);
    takes.event(take('open'));
    takes.camera(null);

    expect(recorders[0].finish).toHaveBeenCalledTimes(1);

    takes.camera(stream);

    expect(recorders).toHaveLength(1);

    takes.event(take('kept'));
    await vi.runAllTimersAsync();

    expect(recorders[0].finish).toHaveBeenCalledTimes(1);
    expect(kept).toEqual([['take-1', [1, 2, 3]]]);
  });

  it('keeps each take’s video when the next take opens before the last is kept', async () => {
    const { takes, recorders, kept } = fakeEncoder();

    takes.camera(stream);
    takes.event(take('open', 'first'));
    takes.event(take('open', 'second'));

    expect(recorders).toHaveLength(2);
    expect(recorders[0].finish).toHaveBeenCalledTimes(1);

    takes.event(take('kept', 'first'));
    takes.event(take('dropped', 'second'));
    await vi.runAllTimersAsync();

    expect(recorders[1].drop).toHaveBeenCalledTimes(1);
    expect(kept).toEqual([['first', [1, 2, 3]]]);
  });

  it('saves nothing when the encoder made no video', async () => {
    const { takes, kept } = fakeEncoder([]);

    takes.camera(stream);
    takes.event(take('open'));
    takes.event(take('kept'));
    await vi.runAllTimersAsync();

    expect(kept).toEqual([]);
  });
});

describe('startTakeVideo', () => {
  it('subscribes once, and keeps the operator camera’s video through the try store', async () => {
    vi.useRealTimers();
    wired.snapshot = { open: true, stream };
    startTakeVideo();
    startTakeVideo();

    expect(wired.robot).toHaveLength(1);
    expect(wired.camera).toHaveLength(1);

    wired.robot[0](take('open', 'live'));
    wired.robot[0](take('kept', 'live'));
    await settle();

    expect(wired.saved).toEqual([['live', [4, 2]]]);
  });
});
