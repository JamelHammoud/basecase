import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RobotEvent } from './robotState';

const wired = vi.hoisted(() => ({
  robot: [] as ((event: RobotEvent) => void)[],
  camera: [] as (() => void)[],
  snapshot: { open: false, stream: null as MediaStream | null },
  closed: [] as [string, boolean][],
}));

vi.mock('./robotStore', () => ({
  subscribeRobotEvents: (listener: (event: RobotEvent) => void) => wired.robot.push(listener),
}));
vi.mock('../cameras/operator/operatorCamera', () => ({
  operatorCameraSnapshot: () => wired.snapshot,
  subscribeOperatorCamera: (listener: () => void) => wired.camera.push(listener),
}));
vi.mock('../cases/tryStore', () => ({
  closeTryVideo: async (id: string, keep: boolean) => {
    wired.closed.push([id, keep]);
  },
}));
vi.mock('./takeVideoRecorder', () => ({
  workerRecorder: () => ({ finish: async () => true, drop: async () => undefined }),
}));

const { createTakeVideo, KEPT_GRACE_MS, startTakeVideo } = await import('./takeVideo');

const stream = { id: 'camera' } as unknown as MediaStream;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

interface FakeRecorder {
  id: string;
  stream: MediaStream;
  lead: number;
  finish: ReturnType<typeof vi.fn>;
  drop: ReturnType<typeof vi.fn>;
}

function fakeEncoder(made = true) {
  const recorders: FakeRecorder[] = [];
  const closed: [string, boolean][] = [];
  const clock = { ms: 0 };
  const takes = createTakeVideo({
    now: () => clock.ms,
    record: (id, from, lead) => {
      const recorder = { id, stream: from, lead, finish: vi.fn(async () => made), drop: vi.fn(async () => undefined) };

      recorders.push(recorder);

      return recorder;
    },
    close: async (id, keep) => {
      closed.push([id, keep]);
    },
  });

  return { takes, recorders, closed, clock };
}

const take = (state: string, id = 'take-1'): RobotEvent => ({ event: 'take', state, id });

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));

afterEach(() => vi.useRealTimers());

describe('the operator video kept with a take', () => {
  it('records from the open take’s frames and keeps the video once the take is kept', async () => {
    const { takes, recorders, closed } = fakeEncoder();

    takes.camera(stream);
    takes.event(take('open'));

    expect(recorders).toHaveLength(1);
    expect(recorders[0]).toMatchObject({ id: 'take-1', stream, lead: 0 });

    takes.event(take('kept'));
    takes.event(take('kept'));
    await vi.runAllTimersAsync();

    expect(recorders[0].finish).toHaveBeenCalledTimes(1);
    expect(recorders[0].drop).not.toHaveBeenCalled();
    expect(closed).toEqual([['take-1', true]]);
  });

  it('records nothing without the camera, and starts mid-take at the camera’s lead into the take', async () => {
    const { takes, recorders, closed, clock } = fakeEncoder();

    takes.event(take('open'));
    clock.ms = 3500;

    expect(recorders).toHaveLength(0);

    takes.camera(stream);

    expect(recorders).toHaveLength(1);
    expect(recorders[0].lead).toBe(3.5);

    takes.event(take('kept'));
    await vi.runAllTimersAsync();

    expect(closed).toEqual([['take-1', true]]);
  });

  it('discards the staged video of a dropped take', async () => {
    const { takes, recorders, closed } = fakeEncoder();

    takes.camera(stream);
    takes.event(take('open'));
    takes.event(take('dropped'));
    takes.event(take('kept'));
    await vi.runAllTimersAsync();

    expect(recorders[0].drop).toHaveBeenCalledTimes(1);
    expect(recorders[0].finish).not.toHaveBeenCalled();
    expect(closed).toEqual([['take-1', false]]);
  });

  it('ends the video when the link is lost and discards it unless the take is kept soon after', async () => {
    const { takes, recorders, closed } = fakeEncoder();

    takes.camera(stream);
    takes.event(take('open', 'lost'));
    takes.event({ event: 'link', state: 'disconnected' });

    expect(recorders[0].finish).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(KEPT_GRACE_MS);
    takes.event(take('kept', 'lost'));
    await vi.runAllTimersAsync();

    expect(closed).toEqual([['lost', false]]);

    takes.event(take('open', 'saved'));
    takes.event({ event: 'link', state: 'disconnected' });
    takes.event(take('kept', 'saved'));
    await vi.runAllTimersAsync();

    expect(closed).toEqual([
      ['lost', false],
      ['saved', true],
    ]);
  });

  it('finishes the video when the camera is switched off mid-take, and starts no second one', async () => {
    const { takes, recorders, closed } = fakeEncoder();

    takes.camera(stream);
    takes.event(take('open'));
    takes.camera(null);

    expect(recorders[0].finish).toHaveBeenCalledTimes(1);

    takes.camera(stream);

    expect(recorders).toHaveLength(1);

    takes.event(take('kept'));
    await vi.runAllTimersAsync();

    expect(recorders[0].finish).toHaveBeenCalledTimes(1);
    expect(closed).toEqual([['take-1', true]]);
  });

  it('keeps each take’s video when the next take opens before the last is kept', async () => {
    const { takes, recorders, closed } = fakeEncoder();

    takes.camera(stream);
    takes.event(take('open', 'first'));
    takes.event(take('open', 'second'));

    expect(recorders).toHaveLength(2);
    expect(recorders[0].finish).toHaveBeenCalledTimes(1);

    takes.event(take('kept', 'first'));
    takes.event(take('dropped', 'second'));
    await vi.runAllTimersAsync();

    expect(recorders[1].drop).toHaveBeenCalledTimes(1);
    expect([...closed].sort()).toEqual([
      ['first', true],
      ['second', false],
    ]);
  });

  it('discards the staged video when the encoder made no whole video', async () => {
    const { takes, closed } = fakeEncoder(false);

    takes.camera(stream);
    takes.event(take('open'));
    takes.event(take('kept'));
    await vi.runAllTimersAsync();

    expect(closed).toEqual([['take-1', false]]);
  });
});

describe('startTakeVideo', () => {
  it('subscribes once, and closes the operator camera’s video through the try store', async () => {
    vi.useRealTimers();
    wired.snapshot = { open: true, stream };
    startTakeVideo();
    startTakeVideo();

    expect(wired.robot).toHaveLength(1);
    expect(wired.camera).toHaveLength(1);

    wired.robot[0](take('open', 'live'));
    wired.robot[0](take('kept', 'live'));
    await settle();

    expect(wired.closed).toEqual([['live', true]]);
  });
});
