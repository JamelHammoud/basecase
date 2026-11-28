import type { ImportedWorldView } from '../three/viewport/importedWorld';
import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from 'react';
import type { SimModel } from '../sim/mjcfTypes';
import type { CameraLink } from '../sim/useSimWorker';
import type { ScenePart } from '../types/robotics';
import { LiveFeed, type Canvases, type FeedStream } from './liveFeed';
import { streamFps, streamSize } from './streamPace';
import type { CameraView } from './views';
import { useVisionScope } from './visionScope';

export interface CameraFeedInput {
  active: boolean;
  imported?: ImportedWorldView | null;
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
  const { simulated } = useVisionScope();
  const { cameraFeeds, ensureVisionCamera, onVisionAssignments, registerVisionCameras, visionNeedsFrames } = simulated;
  const canvases = useRef<Canvases>(new Map());
  const streams = useRef(new Set<FeedStream>());
  const feedRef = useRef<LiveFeed | null>(null);
  const [streaming, setStreaming] = useState(0);
  const { parts, world, imported, model, views, enlarged, connectCameras } = input;
  const cameraKeys = views.map((view) => view.key).join('\n');
  const visionActive = useSyncExternalStore(
    onVisionAssignments,
    () => visionNeedsFrames(cameraKeys.split('\n')),
    () => false,
  );
  const covered = useSyncExternalStore(
    cameraFeeds.subscribe,
    () => cameraFeeds.covers(cameraKeys.split('\n').filter(Boolean)),
    () => false,
  );
  const presenting = input.active || streaming > 0;
  const active = presenting || (visionActive && !covered);
  const onFrames = useEffectEvent((frames: number) => input.onFrames(frames));
  const synchronize = useEffectEvent((feed: LiveFeed) => {
    void feed.scene(parts, world, imported);
    feed.model(model);
    feed.views(views, input.active ? { enlarged } : null);
  });

  useEffect(() => {
    if (!presenting) return;

    return cameraFeeds.register(canvases, cameraKeys.split('\n').filter(Boolean));
  }, [cameraFeeds, cameraKeys, presenting]);

  useEffect(() => {
    const keys = cameraKeys.split('\n').filter(Boolean);
    const release = registerVisionCameras(canvases, keys);

    return release;
  }, [cameraKeys, registerVisionCameras]);

  useEffect(() => {
    if (!active) return;

    for (const key of cameraKeys.split('\n').filter(Boolean)) void ensureVisionCamera(key).catch(() => undefined);
  }, [active, cameraKeys, ensureVisionCamera]);

  useEffect(() => {
    if (!active) return;

    const feed = new LiveFeed(canvases.current, (frames) => onFrames(frames), simulated);

    feedRef.current = feed;
    synchronize(feed);

    const disconnect = cameraFeeds.connect(feed, connectCameras, () => feed.link());

    for (const stream of streams.current) feed.stream(stream);

    return () => {
      disconnect();
      feed.dispose();
      feedRef.current = null;
    };
  }, [active, cameraFeeds, connectCameras, simulated]);

  useEffect(() => {
    if (active && feedRef.current) synchronize(feedRef.current);
  }, [active, parts, world, imported, model, input.active, views, enlarged]);

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
