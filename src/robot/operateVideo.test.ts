import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cutOperateVideo,
  operateVideoRecording,
  releaseOperateVideo,
  setOperateVideoWorker,
  startOperateVideo,
  stopOperateVideo,
  type VideoReply,
  type VideoRequest,
  type VideoWorker,
} from './operateVideo';

class FakeWorker implements VideoWorker {
  readonly requests: VideoRequest[] = [];

  private listener: ((event: MessageEvent<VideoReply>) => void) | null = null;

  seconds = 2;

  postMessage(message: VideoRequest) {
    this.requests.push(message);

    if (message.type !== 'cut') return;

    const segment = this.seconds ? { bytes: new Uint8Array([1, 2, 3]), seconds: this.seconds } : null;
    const reply: VideoReply = { type: 'segment', id: message.id, cut: message.cut, segment };

    queueMicrotask(() => this.listener?.({ data: reply } as MessageEvent<VideoReply>));
  }

  addEventListener(_type: 'message', listener: (event: MessageEvent<VideoReply>) => void) {
    this.listener = listener;
  }
}

class FakeProcessor {
  readonly readable = { locked: false } as unknown as ReadableStream<VideoFrame>;

  readonly init: { track: MediaStreamTrack };

  constructor(init: { track: MediaStreamTrack }) {
    this.init = init;
  }
}

const stoppedTracks: number[] = [];

const fakeTrack = (n = 0): object => ({
  kind: 'video',
  clone: () => fakeTrack(n + 1),
  stop: () => stoppedTracks.push(n),
});

const fakeStream = () => ({ getVideoTracks: () => [fakeTrack()] }) as unknown as MediaStream;

let workers: FakeWorker[] = [];

beforeEach(() => {
  workers = [];
  stoppedTracks.length = 0;
  vi.stubGlobal('MediaStreamTrackProcessor', FakeProcessor);
  vi.stubGlobal('VideoEncoder', class {});
  setOperateVideoWorker(() => {
    const worker = new FakeWorker();

    workers.push(worker);

    return worker;
  });
});

afterEach(() => {
  stopOperateVideo();
  vi.unstubAllGlobals();
});

describe('operate video', () => {
  it('cuts the worker’s segment and keeps recording', async () => {
    expect(startOperateVideo(fakeStream())).toBe(true);
    expect(workers[0].requests[0]).toMatchObject({ type: 'start', frames: { locked: false } });

    const segment = await cutOperateVideo();

    expect(segment).toEqual({ bytes: new Uint8Array([1, 2, 3]), seconds: 2, startedAt: expect.any(Number) });
    expect(operateVideoRecording()).toBe(true);

    workers[0].seconds = 0;

    expect(await cutOperateVideo()).toBeNull();
    expect(workers[0].requests.map((r) => r.type)).toEqual(['start', 'cut', 'cut']);
  });

  it('starts once per stream', () => {
    const stream = fakeStream();

    expect(startOperateVideo(stream)).toBe(true);
    expect(startOperateVideo(stream)).toBe(true);
    expect(workers).toHaveLength(1);
    expect(workers[0].requests.filter((r) => r.type === 'start')).toHaveLength(1);
  });

  it('records a new stream in place of the old one', () => {
    startOperateVideo(fakeStream());
    startOperateVideo(fakeStream());

    expect(workers).toHaveLength(2);
    expect(workers[0].requests.at(-1)?.type).toBe('stop');
  });

  it('discards on stop, so a later cut is empty', async () => {
    startOperateVideo(fakeStream());
    stopOperateVideo();

    expect(operateVideoRecording()).toBe(false);
    expect(workers[0].requests.at(-1)?.type).toBe('stop');
    expect(await cutOperateVideo()).toBeNull();
    expect(workers[0].requests.filter((r) => r.type === 'cut')).toHaveLength(0);
  });

  it('finishes a cut in flight before it stops the worker, so a disconnect keeps the last segment', async () => {
    startOperateVideo(fakeStream());

    const pending = cutOperateVideo();

    stopOperateVideo();

    expect(workers[0].requests.map((r) => r.type)).toEqual(['start', 'cut']);
    expect(await pending).toMatchObject({ seconds: 2 });
    expect(workers[0].requests.at(-1)?.type).toBe('stop');
  });

  it('stops its own copy of the camera when the camera closes, and still cuts what it took', async () => {
    startOperateVideo(fakeStream());
    releaseOperateVideo();

    expect(stoppedTracks).toEqual([1]);
    expect(await cutOperateVideo()).toMatchObject({ seconds: 2 });
  });

  it('refuses without MediaStreamTrackProcessor or VideoEncoder', () => {
    vi.stubGlobal('MediaStreamTrackProcessor', undefined);

    expect(startOperateVideo(fakeStream())).toBe(false);

    vi.stubGlobal('MediaStreamTrackProcessor', FakeProcessor);
    vi.stubGlobal('VideoEncoder', undefined);

    expect(startOperateVideo(fakeStream())).toBe(false);
    expect(operateVideoRecording()).toBe(false);
    expect(workers).toHaveLength(0);
  });
});
