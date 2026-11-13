import { streamFps, streamSize } from '../streamPace';
import { operatorCameraSnapshot } from './operatorCamera';

export const OPERATOR_STREAM_REFUSAL = 'operator needs the camera input running';

export interface StreamAsk {
  width: number;
  height: number;
  fps: number;
}

interface Grabber {
  grab: (size: ImageBitmapOptions) => Promise<ImageBitmap>;
  stop: () => void;
}

const resized = (full: ImageBitmap, size: ImageBitmapOptions) =>
  createImageBitmap(full, size).finally(() => full.close());

function videoGrabber(stream: MediaStream): Grabber {
  const video = document.createElement('video');

  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  video.play().catch(() => undefined);

  return {
    grab: (size) => createImageBitmap(video, size),
    stop: () => {
      video.srcObject = null;
    },
  };
}

function grabber(track: MediaStreamTrack, stream: MediaStream): Grabber {
  if (typeof ImageCapture !== 'function') return videoGrabber(stream);

  const capture = new ImageCapture(track);

  return { grab: (size) => capture.grabFrame().then((full) => resized(full, size)), stop: () => undefined };
}

export function streamOperator(ask: StreamAsk, onFrame: (bitmap: ImageBitmap) => void): (() => void) | string {
  const { stream } = operatorCameraSnapshot();
  const track = stream?.getVideoTracks()[0];

  if (!stream || !track || track.readyState === 'ended') return OPERATOR_STREAM_REFUSAL;

  const [resizeWidth, resizeHeight] = streamSize([ask.width, ask.height]);
  const size: ImageBitmapOptions = { resizeWidth, resizeHeight, resizeQuality: 'low' };
  const source = grabber(track, stream);
  let busy = false;
  let stopped = false;

  const stop = () => {
    if (stopped) return;

    stopped = true;
    clearInterval(timer);
    source.stop();
  };
  const deliver = (bitmap: ImageBitmap) => (stopped ? bitmap.close() : onFrame(bitmap));
  const tick = () => {
    if (busy || stopped) return;

    if (operatorCameraSnapshot().stream !== stream || track.readyState === 'ended') return stop();

    busy = true;
    source
      .grab(size)
      .then(deliver, () => undefined)
      .finally(() => {
        busy = false;
      });
  };
  const timer = setInterval(tick, 1000 / streamFps(ask.fps));

  return stop;
}
