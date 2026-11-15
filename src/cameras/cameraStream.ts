import type { FeedStream } from './liveFeed';
import type { StreamAsk } from './streamPace';
import { findView, type CameraView } from './views';

type OnFrame = (bitmap: ImageBitmap) => void;

export type CameraStream = (camera: string, ask: StreamAsk, onFrame: OnFrame) => (() => void) | string;

export interface CameraStreamSources {
  views: CameraView[];
  feed: (stream: FeedStream) => () => void;
}

export const unknownCamera = (camera: string, keys: string[]) =>
  `${camera} isn’t a camera here. Cameras: ${keys.join(', ')}`;

export function cameraStream({ views, feed }: CameraStreamSources): CameraStream {
  const available = views.filter((view) => view.key !== 'operator');

  return (camera, ask, onFrame) => {
    const view = findView(available, camera);

    if (view) return feed({ key: view.key, size: [ask.width, ask.height], fps: ask.fps, onFrame });

    return unknownCamera(
      camera.trim(),
      available.map((v) => v.key),
    );
  };
}
