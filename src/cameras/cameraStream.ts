import { snakeKey } from '../datasets/cameras';
import type { FeedStream } from './liveFeed';
import { OPERATOR_KEY } from './operator/operatorCamera';
import type { StreamAsk } from './operator/operatorStream';
import { findView, type CameraView } from './views';

type OnFrame = (bitmap: ImageBitmap) => void;

export type CameraStream = (camera: string, ask: StreamAsk, onFrame: OnFrame) => (() => void) | string;

export interface CameraStreamSources {
  views: CameraView[];
  feed: (stream: FeedStream) => () => void;
  operator: (ask: StreamAsk, onFrame: OnFrame) => (() => void) | string;
  operatorOpen: () => boolean;
}

export const unknownCamera = (camera: string, keys: string[]) =>
  `${camera} isn’t a camera here. Cameras: ${keys.join(', ')}`;

export function cameraStream({ views, feed, operator, operatorOpen }: CameraStreamSources): CameraStream {
  return (camera, ask, onFrame) => {
    const view = findView(views, camera);

    if (view) return feed({ key: view.key, size: [ask.width, ask.height], fps: ask.fps, onFrame });

    if (snakeKey(camera) === OPERATOR_KEY) return operator(ask, onFrame);

    const keys = views.map((v) => v.key);

    return unknownCamera(camera.trim(), operatorOpen() ? [...keys, OPERATOR_KEY] : keys);
  };
}
