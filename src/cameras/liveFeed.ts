import type { SimModel } from '../sim/mjcfTypes';
import { sourcedMeshFiles } from '../three/componentMeshes';
import { packParts } from '../three/packedMesh';
import type { ScenePart } from '../types/robotics';
import type { FeedEvent, FeedRequest } from './feedProtocol';
import { LARGE_SIZE, TILE_SIZE } from './liveStage';
import type { CameraView } from './views';

export type Canvases = Map<string, HTMLCanvasElement>;

export interface FeedStream {
  key: string;
  size: [number, number];
  fps: number;
  onFrame: (bitmap: ImageBitmap) => void;
}

export const streamCost = { frames: 0, ms: 0 };

function handOver(stream: FeedStream, bitmap: ImageBitmap) {
  const start = performance.now();

  stream.onFrame(bitmap);
  streamCost.frames++;
  streamCost.ms += performance.now() - start;
}

const same = <T>(a: T[], b: T[]) => a.length === b.length && a.every((x, i) => x === b[i]);

function showTiles(canvases: Canvases, bitmaps: Record<string, ImageBitmap>) {
  for (const [key, bitmap] of Object.entries(bitmaps)) {
    const ctx = canvases.get(key)?.getContext('bitmaprenderer');

    if (ctx) ctx.transferFromImageBitmap(bitmap);
    else bitmap.close();
  }
}

export function feedReceiver(
  canvases: Canvases,
  streams: Map<number, FeedStream>,
  onFrames: (frames: number) => void,
): (event: FeedEvent) => void {
  return (event) => {
    if (event.type === 'stream') {
      const stream = streams.get(event.id);

      return stream ? handOver(stream, event.bitmap) : event.bitmap.close();
    }

    showTiles(canvases, event.bitmaps);
    onFrames(event.frames);
  };
}

export class LiveFeed {
  private readonly worker = new Worker(new URL('./feed.worker.ts', import.meta.url), { type: 'module' });

  private readonly streams = new Map<number, FeedStream>();

  private readonly ids = new Map<FeedStream, number>();

  private streamId = 0;

  private sceneTicket = 0;

  private sent: { parts: ScenePart[]; world: ScenePart[]; model?: SimModel | null; views?: string } = {
    parts: [],
    world: [],
  };

  constructor(canvases: Canvases, onFrames: (frames: number) => void) {
    const receive = feedReceiver(canvases, this.streams, onFrames);

    this.worker.onmessage = ({ data }: MessageEvent<FeedEvent>) => receive(data);
  }

  link(): MessagePort {
    const channel = new MessageChannel();

    this.post({ type: 'port', port: channel.port1 }, [channel.port1]);

    return channel.port2;
  }

  async scene(parts: ScenePart[], world: ScenePart[]): Promise<void> {
    if (this.sceneTicket && same(this.sent.parts, parts) && same(this.sent.world, world)) return;

    this.sent = { ...this.sent, parts, world };

    const ticket = ++this.sceneTicket;
    const meshes = await sourcedMeshFiles([...parts, ...world]);

    if (ticket === this.sceneTicket)
      this.post({ type: 'scene', parts: packParts(parts), world: packParts(world), meshes });
  }

  model(model: SimModel | null): void {
    if (this.sent.model === model) return;

    this.sent.model = model;
    this.post({ type: 'model', model });
  }

  views(views: CameraView[], tiles: { enlarged: string | null } | null): void {
    const sizes = tiles
      ? Object.fromEntries(views.map((v) => [v.key, v.key === tiles.enlarged ? LARGE_SIZE : TILE_SIZE]))
      : {};
    const key = JSON.stringify([views, sizes]);

    if (this.sent.views === key) return;

    this.sent.views = key;
    this.post({ type: 'views', views, sizes });
  }

  stream(stream: FeedStream): void {
    const id = ++this.streamId;

    this.streams.set(id, stream);
    this.ids.set(stream, id);
    this.post({ type: 'stream', id, key: stream.key, size: stream.size, fps: stream.fps });
  }

  unstream(stream: FeedStream): void {
    const id = this.ids.get(stream);

    if (id === undefined) return;

    this.ids.delete(stream);
    this.streams.delete(id);
    this.post({ type: 'unstream', id });
  }

  dispose(): void {
    this.worker.terminate();
    this.streams.clear();
    this.ids.clear();
  }

  private post(message: FeedRequest, transfer: Transferable[] = []): void {
    this.worker.postMessage(message, transfer);
  }
}
