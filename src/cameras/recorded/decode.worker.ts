import { ALL_FORMATS, BlobSource, CanvasSink, Input, UrlSource, type WrappedCanvas } from 'mediabunny';
import { VISION_FRAME_MS, VisionFrameTap } from '../../vision/frameTap';
import { loadVideoBlob } from './videoStore';
import { videoTime } from './videoTime';
import { PlayheadFrames } from './playheadFrames';
import type { RecordedVideoReply, RecordedVideoRequest } from './protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const tap = new VisionFrameTap();
let frames: PlayheadFrames<WrappedCanvas | null> | null = null;
let requested = 0;
let current: { camera: string; canvas: OffscreenCanvas } | null = null;
let trailing: ReturnType<typeof setTimeout> | undefined;
let timestamp = 0;
let visible = false;
let mediaTime = 0;
let mediaSource = '';

const reply = (value: RecordedVideoReply) => scope.postMessage(value);
const failed = () => reply({ type: 'error', message: 'Couldn’t open the recorded video.' });

function paint(frame: WrappedCanvas | null, time: number) {
  if (!current) return;

  clearTimeout(trailing);
  timestamp = performance.timeOrigin + performance.now();
  mediaTime = time;
  visible = !!frame;

  if (!frame) {
    current.canvas.getContext('2d')?.clearRect(0, 0, current.canvas.width, current.canvas.height);
    reply({ type: 'frame', time, timestamp });

    return;
  }

  const source = frame.canvas;
  const { canvas } = current;

  if (canvas.width !== source.width || canvas.height !== source.height) {
    canvas.width = source.width;
    canvas.height = source.height;
  }

  canvas.getContext('2d')?.drawImage(source, 0, 0);
  inferCurrent();
  trailing = setTimeout(inferCurrent, VISION_FRAME_MS);
  reply({ type: 'frame', time, timestamp });
}

async function open(request: Extract<RecordedVideoRequest, { type: 'open' }>) {
  const blob = await loadVideoBlob(request.id, request.video.path);

  if (!blob && request.video.path !== 'operator.mp4') {
    reply({ type: 'error', message: 'Recorded video unavailable.' });

    return;
  }

  const url = new URL('/api/try-video', scope.location.href);

  url.searchParams.set('id', request.id);

  const source = blob ? new BlobSource(blob) : new UrlSource(url.href);
  const input = new Input({ source, formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();

  if (!track || !(await track.canDecode())) {
    input.dispose();
    failed();

    return;
  }

  const sink = new CanvasSink(track, { width: 640, height: 480, fit: 'contain', poolSize: 2 });

  current = { camera: request.video.camera, canvas: request.canvas };
  mediaSource = request.id;
  frames = new PlayheadFrames({
    decode: (time) => {
      const at = videoTime(request.video, request.source, time);

      return at === null ? Promise.resolve(null) : sink.getCanvas(at);
    },
    paint,
    error: failed,
  });
  frames.seek(requested);
}

scope.onmessage = ({ data }: MessageEvent<RecordedVideoRequest>) => {
  if (data.type === 'open') void open(data).catch(failed);
  else if (data.type === 'seek') {
    clearTimeout(trailing);
    requested = data.time;
    frames?.seek(data.time);
  } else configureVision(data);
};

function configureVision(data: Extract<RecordedVideoRequest, { type: 'vision' }>) {
  tap.configure(data.port, data.cameras);

  inferCurrent();
}

function inferCurrent() {
  if (current && visible)
    tap.send(current.camera, current.canvas, performance.timeOrigin + performance.now(), { mediaTime, mediaSource });
}
