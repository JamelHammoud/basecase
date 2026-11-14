/// <reference lib="webworker" />
import type { CaseMat } from '../../cases/mat/matLayout';
import { renderMatFrame } from './matFrames';
import { createMatTracker, trackMat, type MatTracker } from './matTracker';
import { loadTagDetector, type TagDetector } from './tagDetector';
import { FEED_FPS, type MatFeed, type TagsEvent, type TagsRequest } from './tagsProtocol';

type Picture = VideoFrame | ImageBitmap;

const scope = self as unknown as DedicatedWorkerGlobalScope;

let mat: CaseMat | null = null;
let tracker: MatTracker | null = null;
let detector: TagDetector | null = null;
let reader: ReadableStreamDefaultReader<VideoFrame> | null = null;
let latest: Picture | null = null;
let scheduled = false;
let fed = false;
let pendingFeed: MatFeed | null = null;
let feedTimer: ReturnType<typeof setTimeout> | null = null;
let told = false;
let closed = false;
let canvas: OffscreenCanvas | null = null;

const post = (event: TagsEvent) => scope.postMessage(event);

const fail = (e: unknown) => post({ type: 'error', message: e instanceof Error ? e.message : String(e) });

const nowSeconds = () => (performance.timeOrigin + performance.now()) / 1000;

function track(gray: Uint8Array, size: { width: number; height: number }, t: number) {
  if (!detector || !tracker) return;

  const sample = tracker.push(detector.detect(gray, size.width, size.height), size, t);
  const refusal = tracker.refusal();

  post({ type: 'sample', sample });

  if (!refusal || told) return;

  told = true;
  post({ type: 'refused', message: refusal });
}

function grayOf(picture: Picture): { gray: Uint8Array; width: number; height: number } {
  const width = 'displayWidth' in picture ? picture.displayWidth : picture.width;
  const height = 'displayHeight' in picture ? picture.displayHeight : picture.height;

  if (!canvas || canvas.width !== width || canvas.height !== height) canvas = new OffscreenCanvas(width, height);

  const context = canvas.getContext('2d', { willReadFrequently: true })!;

  context.drawImage(picture, 0, 0);

  const rgba = context.getImageData(0, 0, width, height).data;
  const gray = new Uint8Array(width * height);

  for (let i = 0; i < gray.length; i++)
    gray[i] = (rgba[i * 4] * 77 + rgba[i * 4 + 1] * 150 + rgba[i * 4 + 2] * 29) >> 8;

  return { gray, width, height };
}

function trackLatest() {
  scheduled = false;

  const picture = latest;

  latest = null;

  if (!picture) return;

  try {
    const { gray, width, height } = grayOf(picture);

    track(gray, { width, height }, nowSeconds());
  } catch (e) {
    fail(e);
  } finally {
    picture.close();
  }
}

function take(picture: Picture) {
  if (fed || closed || !detector) return picture.close();

  latest?.close();
  latest = picture;

  if (scheduled) return;

  scheduled = true;
  setTimeout(trackLatest, 0);
}

async function pump(frames: ReadableStream<VideoFrame>) {
  reader = frames.getReader();

  for (;;) {
    const { value, done } = await reader.read();

    if (done) return;

    take(value);
  }
}

function runFeed(feed: MatFeed) {
  const start = nowSeconds();
  const period = 1 / (feed.fps ?? FEED_FPS);
  let next = 0;

  const step = () => {
    const pose = feed.poses[next++];

    feedTimer = null;

    if (!pose || closed || !mat) return;

    try {
      const gray = renderMatFrame({
        mat,
        camera: feed.camera,
        width: feed.width,
        height: feed.height,
        base: pose.base,
      });

      track(gray, feed, start + pose.t);
    } catch (e) {
      return fail(e);
    }

    const due = feed.poses[next] ? start + feed.poses[next].t - nowSeconds() : period;

    feedTimer = setTimeout(step, Math.max(0, due * 1000));
  };

  step();
}

function feed(next: MatFeed) {
  fed = true;
  latest?.close();
  latest = null;

  if (feedTimer !== null) clearTimeout(feedTimer);

  if (!detector) {
    pendingFeed = next;

    return;
  }

  runFeed(next);
}

function ready(loaded: TagDetector) {
  if (closed) return loaded.dispose();

  detector = loaded;
  post({ type: 'ready' });

  if (pendingFeed) runFeed(pendingFeed);

  pendingFeed = null;
}

function open(msg: Extract<TagsRequest, { type: 'open' }>) {
  mat = msg.mat;
  tracker = createMatTracker(trackMat(msg.mat));
  fed = !!msg.standIn;

  if (msg.frames) pump(msg.frames).catch(fail);

  loadTagDetector().then(ready, fail);
}

function close() {
  closed = true;

  if (feedTimer !== null) clearTimeout(feedTimer);

  latest?.close();
  latest = null;
  void reader?.cancel().catch(() => undefined);
  detector?.dispose();
  detector = null;
  scope.close();
}

const handlers: { [K in TagsRequest['type']]: (msg: Extract<TagsRequest, { type: K }>) => void } = {
  open,
  frame: ({ bitmap }) => take(bitmap),
  feed: (msg) => feed(msg.feed),
  close,
};

scope.onmessage = (ev: MessageEvent<TagsRequest>) => {
  const msg = ev.data;

  (handlers[msg.type] as (m: TagsRequest) => void)(msg);
};
