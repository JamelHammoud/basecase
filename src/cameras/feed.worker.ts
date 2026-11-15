/// <reference lib="webworker" />
import { FRAME_MS, type FeedEvent, type FeedRequest } from './feedProtocol';
import { visionBitmapCopier, visionFrameSender, type VisionAssignment } from './visionFrames';
import { visionCameraPaces } from './visionPace';
import { LiveStage, type LiveJob, type LiveTarget } from './liveStage';
import { afterDraw, dueIds, nextDue, startPace, streamSize, type Pace } from './streamPace';

interface Stream {
  key: string;
  target: LiveTarget;
  pace: Pace;
}

const scope = self as unknown as DedicatedWorkerGlobalScope;
const stage = new LiveStage();
const gl = stage.renderer.getContext();
const targets = new Map<string, LiveTarget>();
const streams = new Map<number, Stream>();
const visionTargets = new Map<string, LiveTarget>();
const copyVision = visionBitmapCopier();
const visionSources = new Map<string, OffscreenCanvas>();
let assignments: VisionAssignment[] = [];
let viewKeys = new Set<string>();
let visionPaces = new Map<string, Pace>();
const vision = visionFrameSender(async (camera) => {
  const canvas =
    visionSources.get(camera) ??
    targets.get(camera)?.canvas ??
    visionTargets.get(camera)?.canvas ??
    [...streams.values()].find((stream) => stream.key === camera)?.target.canvas;

  if (!canvas) throw new Error('Camera frame unavailable.');

  return copyVision(camera, canvas);
});

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
  const tilesAt = dirty && (targets.size || visionTargets.size) ? drewAt + FRAME_MS : Infinity;
  const at = Math.min(tilesAt, nextDue([...streams.values()].map((s) => s.pace)), nextDue([...visionPaces.values()]));

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

function render(tiles: LiveJob[], due: StreamJob[], visionJobs: LiveJob[]) {
  drewAt = performance.now();

  const drawn = stage.draw(poses, [...tiles, ...visionJobs, ...due]);
  const tilesDrawn = tiles.filter((job) => drawn.includes(job));

  if (drawn.length) gl.finish();

  for (const job of drawn) visionSources.set(job.key, job.target.canvas);

  for (const key of new Set(drawn.map((job) => job.key))) void vision.send(key, drewAt).catch(() => undefined);

  if (tilesDrawn.length) postTiles(tilesDrawn);

  for (const job of due) if (drawn.includes(job)) postStream(job);
}

function dirtyVisionJobs(tiles: LiveJob[], keys: string[]): LiveJob[] {
  return [...visionTargets]
    .filter(([key]) => keys.includes(key))
    .filter(([key]) => !tiles.some((tile) => tile.key === key))
    .map(([key, target]) => ({ key, target }));
}

function setVisionTargets() {
  visionPaces = visionCameraPaces(assignments, viewKeys, performance.now());

  const keys = new Set(assignments.map((a) => a.camera).filter((key) => viewKeys.has(key)));

  for (const key of visionTargets.keys()) if (!keys.has(key)) visionTargets.delete(key);

  for (const key of keys) {
    if (visionTargets.has(key)) continue;

    const made = target([320, 240]);

    if (made) visionTargets.set(key, made);
  }
}

function draw() {
  timer = null;
  timerAt = Infinity;

  const tiles: LiveJob[] = dirty ? [...targets].map(([key, target]) => ({ key, target })) : [];
  const now = performance.now();
  const due = dueStreams(now);
  const visionDue = dueIds([...visionPaces], now);
  const visionKeys = dirty ? [...visionTargets.keys()] : visionDue;
  const visionJobs = dirtyVisionJobs(tiles, visionKeys);

  for (const key of visionDue) {
    const pace = visionPaces.get(key);

    if (pace) visionPaces.set(key, afterDraw(pace, now));
  }

  dirty = false;

  if (tiles.length || due.length || visionJobs.length) render(tiles, due, visionJobs);

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
  'vision-port': ({ port, timeOrigin }) => vision.connect(port, timeOrigin),
  vision: (message) => {
    assignments = message.assignments;
    vision.configure(assignments);
    setVisionTargets();
    schedule();
  },
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
    viewKeys = new Set(views.map((view) => view.key));
    setTargets(sizes);
    setVisionTargets();
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
