import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from 'react';
import { sceneCamera } from '../datasets/cameras';
import { onVisionCameras, visionCameras } from '../vision/client';
import type { SimModel } from '../sim/mjcfTypes';
import type { CameraLink } from '../sim/useSimWorker';
import type { ScenePart } from '../types/robotics';
import { LiveFeed, type Canvases, type FeedStream } from './liveFeed';
import { streamFps, streamSize } from './streamPace';
import type { CameraView } from './views';

export interface CameraFeedInput {
  active: boolean;
  eligible?: boolean;
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

function inferenceViews(input: {
  parts: ScenePart[];
  world: ScenePart[];
  views: CameraView[];
  inferred: readonly string[];
}) {
  const { parts, world, views, inferred } = input;

  if (inferred.includes('scene') && !views.some((view) => view.key === 'scene'))
    return [...views, sceneCamera(parts, world)];

  return views;
}

export function useCameraFeed(input: CameraFeedInput): CameraFeed {
  const canvases = useRef<Canvases>(new Map());
  const streams = useRef(new Set<FeedStream>());
  const feedRef = useRef<LiveFeed | null>(null);
  const [streaming, setStreaming] = useState(0);
  const { parts, world, model, views, enlarged, connectCameras } = input;
  const inferred = useSyncExternalStore(onVisionCameras, visionCameras, visionCameras);
  const drawnViews = inferenceViews({ parts, world, views, inferred });
  const active =
    input.eligible !== false &&
    (input.active || streaming > 0 || drawnViews.some((view) => inferred.includes(view.key)));
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
    if (active) feedRef.current?.views(drawnViews, input.active ? { enlarged } : null);
  }, [active, input.active, drawnViews, enlarged]);

  return {
    canvasRef: (key) => (canvas) => {
      if (canvas) canvases.current.set(key, canvas);
      else canvases.current.delete(key);
    },
    stream: (asked) => {
      const stream = { ...asked, size: streamSize(asked.size), fps: streamFps(asked.fps) };

      streams.current.add(stream);
      setStreaming((n) => n + 1);
      feedRef.current?.stream(stream);

      return () => {
        if (!streams.current.delete(stream)) return;

        setStreaming((n) => n - 1);
        feedRef.current?.unstream(stream);
      };
    },
  };
}
