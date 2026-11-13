import { useEffect, useEffectEvent, useRef } from 'react';
import type { SimModel } from '../sim/mjcfTypes';
import type { CameraLink } from '../sim/useSimWorker';
import type { ScenePart } from '../types/robotics';
import { LiveFeed, type Canvases, type FeedStream } from './liveFeed';
import { streamFps, streamSize } from './streamPace';
import type { CameraView } from './views';

export interface CameraFeedInput {
  active: boolean;
  tiles?: boolean;
  parts: ScenePart[];
  world: ScenePart[];
  model: SimModel | null;
  views: CameraView[];
  enlarged: string | null;
  connectCameras: (link: CameraLink | null) => void;
  onFrames: (frames: number) => void;
}

export interface CameraFeed {
  canvasRef: (key: string) => (canvas: HTMLCanvasElement | null) => void;
  stream: (stream: FeedStream) => () => void;
}

export function useCameraFeed(input: CameraFeedInput): CameraFeed {
  const canvases = useRef<Canvases>(new Map());
  const streams = useRef(new Set<FeedStream>());
  const feedRef = useRef<LiveFeed | null>(null);
  const { active, parts, world, model, views, enlarged, connectCameras } = input;
  const tiles = input.tiles ?? true;
  const onFrames = useEffectEvent((frames: number) => input.onFrames(frames));

  useEffect(() => {
    if (!active) return;

    const feed = new LiveFeed(canvases.current, (frames) => onFrames(frames));

    feedRef.current = feed;
    connectCameras(() => feed.link());

    for (const stream of streams.current) feed.stream(stream);

    return () => {
      connectCameras(null);
      feed.dispose();
      feedRef.current = null;
    };
  }, [active, connectCameras]);

  useEffect(() => {
    if (active) void feedRef.current?.scene(parts, world);
  }, [active, parts, world]);

  useEffect(() => {
    if (active) feedRef.current?.model(model);
  }, [active, model]);

  useEffect(() => {
    if (active) feedRef.current?.views(views, tiles ? { enlarged } : null);
  }, [active, views, tiles, enlarged]);

  return {
    canvasRef: (key) => (canvas) => {
      if (canvas) canvases.current.set(key, canvas);
      else canvases.current.delete(key);
    },
    stream: (asked) => {
      const stream = { ...asked, size: streamSize(asked.size), fps: streamFps(asked.fps) };

      streams.current.add(stream);
      feedRef.current?.stream(stream);

      return () => {
        streams.current.delete(stream);
        feedRef.current?.unstream(stream);
      };
    },
  };
}
