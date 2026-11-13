import { loadEstimator, type Estimator } from './estimator';
import { fromRows, type LandmarkRow, type PoseLandmark } from './landmarks';
import { createOperatorDriver, type OperatorDriver } from './operatorDriver';
import type { OperatorRequest, OperatorResponse } from './operatorProtocol';
import { drawFrame, drawSkeleton, imageFromWorld, type Picture } from './skeleton';

const ctx = self as unknown as {
  postMessage: (msg: OperatorResponse) => void;
  onmessage: ((e: MessageEvent<OperatorRequest>) => void) | null;
};

let driver: OperatorDriver | null = null;
let estimator: Estimator | null = null;
let picture: Picture | null = null;
let reader: ReadableStreamDefaultReader<VideoFrame> | null = null;
let fed: ReturnType<typeof setInterval> | null = null;
let stopped = false;
let overlay: { image: readonly PoseLandmark[]; at: number } | null = null;

const OVERLAY_MS = 500;
const TIMING_FRAMES = 30;
const detectTimes: number[] = [];
let timingFrom = 0;

const now = () => performance.timeOrigin + performance.now();

function landed(world: readonly PoseLandmark[], image: readonly PoseLandmark[], at: number) {
  overlay = { image, at };

  const command = driver?.step(world, at / 1000);

  if (command) ctx.postMessage({ type: 'command', command, at });
}

function paint(frame: VideoFrame | ImageBitmap, at: number) {
  if (!picture) return;

  drawFrame(picture, frame);

  if (overlay && at - overlay.at < OVERLAY_MS) drawSkeleton(picture, overlay.image);
}

function guarded(from: Estimator, frame: VideoFrame | ImageBitmap, at: number) {
  try {
    return from.detect(frame, at);
  } catch (err) {
    estimator = null;
    ctx.postMessage({ type: 'estimator', ready: false, message: err instanceof Error ? err.message : String(err) });

    return null;
  }
}

function timed(frame: VideoFrame | ImageBitmap, at: number) {
  if (!estimator || fed) return null;

  const seen = guarded(estimator, frame, at);

  if (!detectTimes.length) timingFrom = at;

  detectTimes.push(now() - at);

  if (detectTimes.length >= TIMING_FRAMES) {
    const detectMs = detectTimes.sort((a, b) => a - b)[TIMING_FRAMES >> 1];

    ctx.postMessage({ type: 'timing', detectMs, fps: ((TIMING_FRAMES - 1) * 1000) / Math.max(at - timingFrom, 1) });
    detectTimes.length = 0;
  }

  return seen;
}

function look(frame: VideoFrame | ImageBitmap) {
  const at = now();
  const seen = timed(frame, at);

  if (seen) landed(seen.world, seen.image, at);

  paint(frame, at);
  frame.close();
}

async function readFrames(frames: ReadableStream<VideoFrame>) {
  reader = frames.getReader();

  while (!stopped) {
    const { value, done } = await reader.read();

    if (done || !value) return;

    look(value);
  }
}

async function startEstimator() {
  try {
    estimator = await loadEstimator();

    if (stopped) estimator.close();
    else ctx.postMessage({ type: 'estimator', ready: true });
  } catch (err) {
    ctx.postMessage({ type: 'estimator', ready: false, message: err instanceof Error ? err.message : String(err) });
  }
}

function feed(frames: LandmarkRow[][], fps: number) {
  if (fed) clearInterval(fed);

  let i = 0;

  fed = setInterval(
    () => {
      const world = fromRows(frames[Math.min(i, frames.length - 1)]);

      landed(world, imageFromWorld(world), now());
      i++;
    },
    1000 / Math.max(fps, 1),
  );
}

function stop() {
  stopped = true;

  if (fed) clearInterval(fed);

  void reader?.cancel().catch(() => undefined);
  estimator?.close();
  estimator = null;
  driver = null;
}

function begin(msg: Extract<OperatorRequest, { type: 'start' }>) {
  driver = createOperatorDriver(msg.target);

  if (msg.frames) void readFrames(msg.frames);

  if (msg.estimate) void startEstimator();
}

function paintOn(msg: Extract<OperatorRequest, { type: 'canvas' }>) {
  const c2d = msg.canvas.getContext('2d');

  picture = c2d ? { ctx: c2d, mirror: msg.mirror } : null;
}

const HANDLERS: { [K in OperatorRequest['type']]: (msg: Extract<OperatorRequest, { type: K }>) => void } = {
  start: begin,
  frame: (msg) => look(msg.bitmap),
  canvas: paintOn,
  landmarks: (msg) => feed(msg.frames, msg.fps),
  stop,
};

ctx.onmessage = ({ data: msg }) => {
  (HANDLERS[msg.type] as (m: OperatorRequest) => void)(msg);
};
