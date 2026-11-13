import type { PoseRequest } from './poseProtocol';

type TrackProcessor = new (init: { track: MediaStreamTrack }) => { readable: ReadableStream<VideoFrame> };

export interface FrameSource {
  frames?: ReadableStream<VideoFrame>;
  stop: () => void;
}

const trackProcessor = () =>
  (globalThis as unknown as { MediaStreamTrackProcessor?: TrackProcessor }).MediaStreamTrackProcessor;

function videoFrames(stream: MediaStream, worker: Worker): FrameSource {
  const video = document.createElement('video');
  let stopped = false;
  const send = (bitmap: ImageBitmap) => {
    if (stopped) return bitmap.close();

    worker.postMessage({ type: 'frame', bitmap } satisfies PoseRequest, [bitmap]);
  };
  const onFrame = () => {
    if (stopped) return;

    createImageBitmap(video).then(send, () => undefined);
    video.requestVideoFrameCallback(onFrame);
  };

  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  video.requestVideoFrameCallback(onFrame);
  video.play().catch(() => undefined);

  return {
    stop: () => {
      stopped = true;
      video.srcObject = null;
    },
  };
}

export function frameSource(stream: MediaStream, worker: Worker): FrameSource {
  const Processor = trackProcessor();
  const [track] = stream.getVideoTracks();

  if (Processor && track) return { frames: new Processor({ track }).readable, stop: () => undefined };

  return videoFrames(stream, worker);
}
