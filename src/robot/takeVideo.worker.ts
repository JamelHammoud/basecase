/// <reference lib="webworker" />
import { QUALITY_MEDIUM, VideoSample } from 'mediabunny';
import { encodableCodec, mp4Writer, type Mp4Writer } from '../utils/mp4Writer';
import type { TakeVideoReply, TakeVideoRequest } from './takeVideoProtocol';

type Picture = VideoFrame | ImageBitmap;

const scope = self as unknown as DedicatedWorkerGlobalScope;
const MAX_SECONDS = 30 * 60;
const MAX_BYTES = 500 * 1024 * 1024;

let writer: Promise<Mp4Writer | null> | null = null;
let reader: ReadableStreamDefaultReader<VideoFrame> | null = null;
let encoding: Promise<void> | null = null;
let firstAt: number | null = null;
let failed = false;
let ended = false;
let full = false;
let lead = 0;

const secondsOf = (picture: Picture) =>
  picture instanceof VideoFrame ? picture.timestamp / 1e6 : performance.now() / 1000;

const sizeOf = (picture: Picture) =>
  picture instanceof VideoFrame
    ? { width: picture.displayWidth, height: picture.displayHeight }
    : { width: picture.width, height: picture.height };

const sampleOf = (picture: CanvasImageSource, timestamp: number) => new VideoSample(picture, { timestamp });

function blankOf({ width, height }: { width: number; height: number }) {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');

  if (context) {
    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);
  }

  return canvas;
}

async function addSample(live: Mp4Writer, picture: CanvasImageSource, timestamp: number) {
  const sample = sampleOf(picture, timestamp);

  try {
    await live.add(sample);
  } finally {
    sample.close();
  }

  full = live.encodedBytes() >= MAX_BYTES;
}

async function opened(size: { width: number; height: number }): Promise<Mp4Writer | null> {
  const codec = await encodableCodec(size);

  if (!codec) return null;

  const next = mp4Writer({ codec, quality: QUALITY_MEDIUM, realtime: true });

  await next.start();

  if (lead > 0) await addSample(next, blankOf(size), 0);

  return next;
}

async function encode(picture: Picture, timestamp: number) {
  writer ??= opened(sizeOf(picture));

  const live = await writer;

  if (live) await addSample(live, picture, timestamp);
}

function take(picture: Picture) {
  const at = secondsOf(picture);

  firstAt ??= at;

  const timestamp = lead + at - firstAt;

  if (ended || failed || full || encoding || timestamp > MAX_SECONDS) return picture.close();

  encoding = encode(picture, timestamp)
    .catch(() => {
      failed = true;
    })
    .finally(() => {
      picture.close();
      encoding = null;
    });
}

async function pump(frames: ReadableStream<VideoFrame>) {
  reader = frames.getReader();

  for (;;) {
    const { value, done } = await reader.read();

    if (done) return;

    take(value);
  }
}

async function finished(): Promise<Uint8Array | null> {
  ended = true;
  await reader?.cancel().catch(() => undefined);
  await encoding;

  const live = await writer;

  if (!live) return null;

  if (!failed) return live.finish();

  await live.cancel();

  return null;
}

function finish() {
  void finished()
    .catch(() => null)
    .then((bytes) => {
      scope.postMessage({ type: 'done', bytes } satisfies TakeVideoReply, bytes ? [bytes.buffer] : []);
      scope.close();
    });
}

scope.onmessage = (ev: MessageEvent<TakeVideoRequest>) => {
  const msg = ev.data;

  if (msg.type === 'open') lead = msg.lead;

  if (msg.type === 'open' && msg.frames) pump(msg.frames).catch(() => undefined);

  if (msg.type === 'frame') take(msg.bitmap);

  if (msg.type === 'finish') finish();
};
