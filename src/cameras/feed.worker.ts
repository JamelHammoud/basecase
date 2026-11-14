/// <reference lib="webworker" />
import { FRAME_MS, type FeedEvent, type FeedRequest } from './feedProtocol';
import { LiveStage, type LiveJob, type LiveTarget } from './liveStage';
import { afterDraw, dueIds, nextDue, startPace, streamSize, type Pace } from './streamPace';
import { GpuFence } from '../three/gpuFence';

const FENCE_POLL_MS = 4;

interface Stream {
  key: string;
  target: LiveTarget;
  pace: Pace;
}

const scope = self as unknown as DedicatedWorkerGlobalScope;
const stage = new LiveStage();
const fence = new GpuFence(stage.renderer.getContext() as WebGL2RenderingContext);
const targets = new Map<string, LiveTarget>();
const streams = new Map<number, Stream>();

let poses: Float64Array | null = null;
let dirty = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let timerAt = Infinity;
let drewAt = -Infinity;
let frames = 0;

function wake(at: number) {
  if (timer !== null && timerAt <= at) return;

  if (timer !== null) clearTimeout(timer);

  timerAt = at;
  timer = setTimeout(draw, Math.max(0, at - performance.now()));
}

function plan() {
  const tilesAt = dirty && targets.size ? drewAt + FRAME_MS : Infinity;
  const at = Math.min(tilesAt, nextDue([...streams.values()].map((s) => s.pace)));

  if (at < Infinity) wake(at);
}

function schedule() {
  dirty = true;
  plan();
}

type StreamJob = LiveJob & { id: number };

function dueStreams(now: number): StreamJob[] {
  const due = dueIds(
    [...streams].map(([id, s]) => [id, s.pace]),
    now,
  );

  return due.map((id) => {
    const stream = streams.get(id)!;

    stream.pace = afterDraw(stream.pace, now);

    return { id, key: stream.key, target: stream.target };
  });
}

function postTiles(drawn: LiveJob[]) {
  const bitmaps: Record<string, ImageBitmap> = {};

  for (const { key, target } of drawn) bitmaps[key] = target.canvas.transferToImageBitmap();

  frames++;
  scope.postMessage({ type: 'frame', bitmaps, frames } satisfies FeedEvent, Object.values(bitmaps));
}

function postStream({ id, target }: StreamJob) {
  const bitmap = target.canvas.transferToImageBitmap();

  scope.postMessage({ type: 'stream', id, bitmap } satisfies FeedEvent, [bitmap]);
}

function render(tiles: LiveJob[], due: StreamJob[]) {
  drewAt = performance.now();

  const drawn = stage.draw(poses, [...tiles, ...due]);
  const tilesDrawn = tiles.filter((job) => drawn.includes(job));

  if (drawn.length) fence.mark();

  if (tilesDrawn.length) postTiles(tilesDrawn);

  for (const job of due) if (drawn.includes(job)) postStream(job);
}

function draw() {
  timer = null;
  timerAt = Infinity;

  if (fence.full()) return wake(performance.now() + FENCE_POLL_MS);

  const tiles: LiveJob[] = dirty ? [...targets].map(([key, target]) => ({ key, target })) : [];
  const due = dueStreams(performance.now());

  dirty = false;

  if (tiles.length || due.length) render(tiles, due);

  plan();
}

function target([width, height]: [number, number]): LiveTarget | null {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { alpha: false });

  return ctx && { canvas, ctx };
}

function setTargets(sizes: Record<string, [number, number]>) {
  for (const key of targets.keys()) if (!sizes[key]) targets.delete(key);

  for (const [key, size] of Object.entries(sizes)) {
    const known = targets.get(key)?.canvas;

    if (known?.width === size[0] && known.height === size[1]) continue;

    const made = target(size);

    if (made) targets.set(key, made);
  }
}

const handlers: { [K in FeedRequest['type']]: (msg: Extract<FeedRequest, { type: K }>) => unknown } = {
  scene: async ({ parts, world, meshes }) => {
    if (await stage.setScene(parts, world, meshes)) schedule();
  },
  model: ({ model }) => {
    stage.setModel(model);

    if (!model) poses = null;

    schedule();
  },
  views: ({ views, sizes }) => {
    stage.setViews(views);
    setTargets(sizes);
    schedule();
  },
  port: ({ port }) => {
    port.onmessage = ({ data }: MessageEvent<Float64Array>) => {
      poses = data;
      schedule();
    };
  },
  stream: ({ id, key, size, fps }) => {
    const made = target(streamSize(size));

    if (!made) return;

    streams.set(id, { key, target: made, pace: startPace(fps, performance.now()) });
    plan();
  },
  unstream: ({ id }) => {
    streams.delete(id);
  },
};

scope.onmessage = ({ data }: MessageEvent<FeedRequest>) => {
  void (handlers[data.type] as (msg: FeedRequest) => unknown)(data);
};
