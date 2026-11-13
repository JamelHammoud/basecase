/// <reference lib="webworker" />
import { FRAME_MS, type FeedEvent, type FeedRequest } from './feedProtocol';
import { LiveStage, type LiveTarget } from './liveStage';
import { GpuFence } from '../three/gpuFence';

const FENCE_POLL_MS = 4;

const scope = self as unknown as DedicatedWorkerGlobalScope;
const stage = new LiveStage();
const fence = new GpuFence(stage.renderer.getContext() as WebGL2RenderingContext);
const targets = new Map<string, LiveTarget>();

let poses: Float64Array | null = null;
let scheduled = false;
let drewAt = -Infinity;
let frames = 0;

function draw() {
  scheduled = false;

  if (fence.full()) {
    scheduled = true;
    setTimeout(draw, FENCE_POLL_MS);

    return;
  }

  drewAt = performance.now();

  if (!stage.draw(poses, targets)) return;

  fence.mark();

  const bitmaps: Record<string, ImageBitmap> = {};

  for (const [key, target] of targets) bitmaps[key] = target.canvas.transferToImageBitmap();

  frames++;
  scope.postMessage({ type: 'frame', bitmaps, frames } satisfies FeedEvent, Object.values(bitmaps));
}

function schedule() {
  if (scheduled) return;

  scheduled = true;
  setTimeout(draw, Math.max(0, drewAt + FRAME_MS - performance.now()));
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
};

scope.onmessage = ({ data }: MessageEvent<FeedRequest>) => {
  void (handlers[data.type] as (msg: FeedRequest) => unknown)(data);
};
