import { useEffect, useEffectEvent, useRef } from 'react';
import type { SimModel } from '../sim/mjcfTypes';
import type { CameraLink } from '../sim/useSimWorker';
import { sourcedMeshFiles } from '../three/componentMeshes';
import { packParts } from '../three/packedMesh';
import type { ScenePart } from '../types/robotics';
import type { FeedEvent, FeedRequest } from './feedProtocol';
import type { FrameHub, FrameSink } from './frameHub';
import type { FrameSpec } from './frameStreams';
import { LARGE_SIZE, TILE_SIZE } from './liveStage';
import type { CameraView } from './views';

export interface CameraFeedInput {
  active: boolean;
  tiles: boolean;
  hub: FrameHub;
  parts: ScenePart[];
  world: ScenePart[];
  model: SimModel | null;
  views: CameraView[];
  enlarged: string | null;
  connectCameras: (link: CameraLink | null) => void;
  onFrames: (frames: number) => void;
}

type Canvases = Map<string, HTMLCanvasElement>;

const same = <T>(a: T[], b: T[]) => a.length === b.length && a.every((x, i) => x === b[i]);

class LiveFeed implements FrameSink {
  private readonly worker = new Worker(new URL('./feed.worker.ts', import.meta.url), { type: 'module' });

  private sceneTicket = 0;

  private sent: { parts: ScenePart[]; world: ScenePart[]; model?: SimModel | null; views?: string } = {
    parts: [],
    world: [],
  };

  constructor(canvases: Canvases, onFrames: (frames: number) => void) {
    this.worker.onmessage = ({ data }: MessageEvent<FeedEvent>) => {
      for (const [key, bitmap] of Object.entries(data.bitmaps)) {
        const ctx = canvases.get(key)?.getContext('bitmaprenderer');

        if (ctx) ctx.transferFromImageBitmap(bitmap);
        else bitmap.close();
      }

      onFrames(data.frames);
    };
  }

  link(): MessagePort {
    const channel = new MessageChannel();

    this.post({ type: 'port', port: channel.port1 }, [channel.port1]);

    return channel.port2;
  }

  stream(id: string, { key, size, fps }: { key: string } & FrameSpec, port: MessagePort): void {
    this.post({ type: 'stream', id, key, size, fps, port }, [port]);
  }

  unstream(id: string): void {
    this.post({ type: 'unstream', id });
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

  views(views: CameraView[], enlarged: string | null, tiles: boolean): void {
    const shown = tiles ? views : [];
    const sizes = Object.fromEntries(shown.map((v) => [v.key, v.key === enlarged ? LARGE_SIZE : TILE_SIZE]));
    const key = JSON.stringify([views, sizes]);

    if (this.sent.views === key) return;

    this.sent.views = key;
    this.post({ type: 'views', views, sizes });
  }

  dispose(): void {
    this.worker.terminate();
  }

  private post(message: FeedRequest, transfer: Transferable[] = []): void {
    this.worker.postMessage(message, transfer);
  }
}

export function useCameraFeed(input: CameraFeedInput) {
  const canvases = useRef<Canvases>(new Map());
  const feedRef = useRef<LiveFeed | null>(null);
  const { active, tiles, hub, parts, world, model, views, enlarged, connectCameras } = input;
  const onFrames = useEffectEvent((frames: number) => input.onFrames(frames));

  useEffect(() => {
    if (!active) return;

    const feed = new LiveFeed(canvases.current, (frames) => onFrames(frames));

    feedRef.current = feed;
    connectCameras(() => feed.link());
    hub.attach(feed);

    return () => {
      hub.attach(null);
      connectCameras(null);
      feed.dispose();
      feedRef.current = null;
    };
  }, [active, connectCameras, hub]);

  useEffect(() => {
    if (active) void feedRef.current?.scene(parts, world);
  }, [active, parts, world]);

  useEffect(() => {
    if (active) feedRef.current?.model(model);
  }, [active, model]);

  useEffect(() => {
    if (active) feedRef.current?.views(views, enlarged, tiles);
  }, [active, views, enlarged, tiles]);

  return (key: string) => (canvas: HTMLCanvasElement | null) => {
    if (canvas) canvases.current.set(key, canvas);
    else canvases.current.delete(key);
  };
}
