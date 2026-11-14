/// <reference lib="webworker" />
import {
  BufferTarget,
  getFirstEncodableVideoCodec,
  Mp4OutputFormat,
  Output,
  QUALITY_MEDIUM,
  VideoSample,
  VideoSampleSource,
  type VideoCodec,
} from 'mediabunny';
import type { VideoReply, VideoRequest, VideoSegment } from './operateVideo';

interface Segment {
  output: Output;
  source: VideoSampleSource;
  target: BufferTarget;
  startUs: number;
  lastUs: number;
  frames: number;
  failed: boolean;
  work: Promise<void>;
}

const scope = self as unknown as DedicatedWorkerGlobalScope;

const MAX_WIDTH = 1280;
const MAX_HEIGHT = 720;
const FPS = 30;
const MIN_GAP_US = (1e6 / FPS) * 0.8;
const MAX_SEGMENT_US = 15 * 60 * 1e6;

let recording = 0;
let reader: ReadableStreamDefaultReader<VideoFrame> | null = null;
let current: Segment | null = null;
let codec: Promise<VideoCodec | null> | null = null;
let stopped = false;

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

function fittedSize(width: number, height: number) {
  const scale = Math.min(1, MAX_WIDTH / width, MAX_HEIGHT / height);

  return { width: even(width * scale), height: even(height * scale), scaled: scale < 1 };
}

function openSegment(chosen: VideoCodec, frame: VideoFrame): Segment {
  const size = fittedSize(frame.displayWidth, frame.displayHeight);
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const source = new VideoSampleSource({
    codec: chosen,
    quality: QUALITY_MEDIUM,
    sizeChangeBehavior: 'contain',
    ...(size.scaled ? { transform: { width: size.width, height: size.height } } : {}),
  });

  output.addVideoTrack(source, { frameRate: FPS });

  return {
    output,
    source,
    target,
    startUs: frame.timestamp,
    lastUs: -Infinity,
    frames: 0,
    failed: false,
    work: output.start(),
  };
}

const segmentFull = (segment: Segment, frame: VideoFrame) => frame.timestamp - segment.startUs >= MAX_SEGMENT_US;

const tooSoon = (segment: Segment, frame: VideoFrame) => frame.timestamp - segment.lastUs < MIN_GAP_US;

async function encode(segment: Segment, frame: VideoFrame) {
  const sample = new VideoSample(frame, {
    timestamp: (frame.timestamp - segment.startUs) / 1e6,
    duration: 1 / FPS,
  });

  try {
    await segment.source.add(sample);
    segment.frames += 1;
  } catch {
    segment.failed = true;
  } finally {
    sample.close();
    frame.close();
  }
}

function chooseCodec(frame: VideoFrame) {
  const { width, height } = fittedSize(frame.displayWidth, frame.displayHeight);

  codec ??= getFirstEncodableVideoCodec(['avc', 'vp9', 'av1'], { width, height }).catch(() => null);

  return codec;
}

async function take(frame: VideoFrame) {
  const chosen = await chooseCodec(frame);

  if (stopped || !chosen) return frame.close();

  current ??= openSegment(chosen, frame);

  const segment = current;

  if (segment.failed || segmentFull(segment, frame) || tooSoon(segment, frame)) return frame.close();

  segment.lastUs = frame.timestamp;
  segment.work = segment.work.then(
    () => encode(segment, frame),
    () => {
      segment.failed = true;
      frame.close();
    },
  );
  await segment.work;
}

async function pump(frames: ReadableStream<VideoFrame>) {
  reader = frames.getReader();

  for (;;) {
    const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));

    if (done || !value) return;

    await take(value);
  }
}

async function finish(segment: Segment | null): Promise<{ segment: VideoSegment; buffer: ArrayBuffer } | null> {
  if (!segment) return null;

  await segment.work.catch(() => undefined);

  if (segment.failed || segment.frames === 0) {
    await segment.output.cancel().catch(() => undefined);

    return null;
  }

  await segment.output.finalize();

  const buffer = segment.target.buffer;

  if (!buffer) return null;

  const seconds = (segment.lastUs - segment.startUs) / 1e6 + 1 / FPS;

  return { segment: { bytes: new Uint8Array(buffer), seconds }, buffer };
}

async function cut(id: number, cutId: number) {
  const segment = current;

  current = null;

  const done = await finish(segment).catch(() => null);
  const reply: VideoReply = { type: 'segment', id, cut: cutId, segment: done?.segment ?? null };

  scope.postMessage(reply, done ? [done.buffer] : []);
}

function stop() {
  stopped = true;
  void reader?.cancel().catch(() => undefined);
  void current?.output.cancel().catch(() => undefined);
  current = null;
  scope.close();
}

scope.onmessage = (event: MessageEvent<VideoRequest>) => {
  const request = event.data;

  if (request.type === 'start' && !recording) {
    recording = request.id;
    void pump(request.frames);

    return;
  }

  if (request.id !== recording) return;

  if (request.type === 'cut') void cut(request.id, request.cut);

  if (request.type === 'stop') stop();
};
