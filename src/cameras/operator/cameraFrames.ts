import type { OperatorRequest } from './operatorProtocol';

interface TrackProcessor {
  readable: ReadableStream<VideoFrame>;
}

type TrackProcessorClass = new (init: { track: MediaStreamTrack }) => TrackProcessor;

export interface FramePump {
  start: Extract<OperatorRequest, { type: 'start' }>['frames'];
  stop: () => void;
}

const processorClass = () =>
  (globalThis as unknown as { MediaStreamTrackProcessor?: TrackProcessorClass }).MediaStreamTrackProcessor;

function videoPump(stream: MediaStream, worker: Worker): FramePump {
  const video = document.createElement('video');
  let live = true;
  let busy = false;

  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;

  const next = () => {
    if (live) video.requestVideoFrameCallback(grab);
  };
  const grab = () => {
    if (busy) return next();

    busy = true;
    void createImageBitmap(video)
      .then((bitmap) => worker.postMessage({ type: 'frame', bitmap } satisfies OperatorRequest, [bitmap]))
      .catch(() => undefined)
      .finally(() => {
        busy = false;
      });
    next();
  };

  void video.play().then(next, () => undefined);

  return {
    start: undefined,
    stop: () => {
      live = false;
      video.pause();
      video.srcObject = null;
    },
  };
}

export function framePump(stream: MediaStream, worker: Worker): FramePump {
  const Processor = processorClass();
  const track = stream.getVideoTracks()[0];

  if (!Processor || !track) return videoPump(stream, worker);

  return { start: new Processor({ track }).readable, stop: () => undefined };
}
