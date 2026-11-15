import { ALL_FORMATS, BlobSource, Input, UrlSource, VideoSampleSink, type VideoSample } from 'mediabunny';
import type { StoredTry, TryVideo } from '../cases/tryFile';
import { readWebTryVideo } from '../cases/tryStore/webTryVideos';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import { errorMessage } from '../utils/errorMessage';
import { createRecordedFramePump, recordedVideoTime, type RecordedSeek } from './recordedFrames';
import { recordedVideoUrl, type RecordedCameraEvent, type RecordedCameraRequest } from './recordedProtocol';
import { visionFrameSender, type VisionAssignment } from './visionFrames';

const scope = self as unknown as DedicatedWorkerGlobalScope;

interface Decoder {
  input: Input;
  pump: ReturnType<typeof createRecordedFramePump<VideoSample>>;
}

const decoders = new Map<string, Decoder>();
const sent = new Map<string, { at: number; timestamp: number }>();
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const streams = new Map<number, Extract<RecordedCameraRequest, { type: 'stream' }> & { last: number }>();
let visionConnected = false;
let assignments: VisionAssignment[] = [];
let current: RecordedSeek | null = null;
let opened: StoredTry | null = null;
let closed = false;

const post = (event: RecordedCameraEvent, transfer: Transferable[] = []) => scope.postMessage(event, transfer);
const fail = (camera: string, error: unknown, timestamp?: number) =>
  post({ type: 'error', camera, message: errorMessage(error), timestamp });
const vision = visionFrameSender(async () => {
  throw new Error('The camera frame is missing.');
});

function retryVision(camera: string, seek: RecordedSeek, delay: number) {
  clearTimeout(retryTimers.get(camera));
  retryTimers.delete(camera);

  if (!Number.isFinite(delay)) return;

  retryTimers.set(
    camera,
    setTimeout(() => {
      retryTimers.delete(camera);

      if (current?.timestamp === seek.timestamp) decoders.get(camera)?.pump.seek(seek.seconds, seek.timestamp);
    }, delay),
  );
}

async function sendVision(camera: string, sample: VideoSample, seek: RecordedSeek) {
  if (!visionConnected) return;

  const now = performance.now();
  let retry = Infinity;
  let due = false;

  for (const assignment of assignments.filter((a) => a.camera === camera)) {
    const key = `${camera}:${assignment.modelId}`;
    const previous = sent.get(key);

    if (previous?.timestamp === seek.timestamp) continue;

    const wait = (previous?.at ?? -Infinity) + 1000 / Math.max(1, Math.min(30, assignment.fps)) - now;

    if (wait > 0) {
      retry = Math.min(retry, wait);

      continue;
    }

    sent.set(key, { at: now, timestamp: seek.timestamp });
    due = true;
  }

  if (due) await vision.send(camera, seek.timestamp, async () => sample.toVideoFrame(), now);

  retryVision(camera, seek, retry);
}

async function sendStreams(camera: string, sample: VideoSample, seek: RecordedSeek) {
  const now = performance.now();

  for (const stream of streams.values()) {
    if (stream.camera !== camera || now - stream.last < 1000 / stream.fps) continue;

    const bitmap = await createImageBitmap(sample.toCanvasImageSource(), {
      resizeWidth: stream.width,
      resizeHeight: stream.height,
    });

    if (closed || current?.timestamp !== seek.timestamp || !streams.has(stream.id)) {
      bitmap.close();

      continue;
    }

    stream.last = now;
    post({ type: 'stream', id: stream.id, bitmap, timestamp: seek.timestamp }, [bitmap]);
  }
}

async function emit(camera: string, sample: VideoSample, seek: RecordedSeek) {
  try {
    const bitmap = await createImageBitmap(sample.toCanvasImageSource());

    if (closed || current?.timestamp !== seek.timestamp) return bitmap.close();

    post({ type: 'frame', camera, bitmap, timestamp: seek.timestamp }, [bitmap]);

    await sendVision(camera, sample, seek);
    await sendStreams(camera, sample, seek);
  } finally {
    sample.close();
  }
}

async function videoSource(id: string, camera: string) {
  if (!IS_WEB_DEMO) return new UrlSource(recordedVideoUrl(id, camera));

  const blob = await readWebTryVideo(id, camera);

  if (!blob) throw new Error('Import the camera video again.');

  return new BlobSource(blob);
}

async function openVideo(stored: StoredTry, video: TryVideo) {
  let input: Input | null = null;

  try {
    input = new Input({ formats: ALL_FORMATS, source: await videoSource(stored.id, video.camera) });

    const track = await input.getPrimaryVideoTrack();

    if (!track || !(await track.canDecode())) throw new Error('Couldn’t decode the camera video.');

    if (closed || opened !== stored) return input.dispose();

    const sink = new VideoSampleSink(track);
    const pump = createRecordedFramePump({
      fps: 10,
      decode: async (seconds) => {
        const time = recordedVideoTime(video, stored.source, seconds);

        return time === null ? null : sink.getSample(time);
      },
      emit: (sample, seek) =>
        emit(video.camera, sample, seek).catch((error: unknown) => fail(video.camera, error, seek.timestamp)),
      fail: (error, seek) => fail(video.camera, error, seek.timestamp),
    });

    decoders.set(video.camera, { input, pump });

    if (current) pump.seek(current.seconds, current.timestamp);
  } catch (error) {
    input?.dispose();

    if (!closed && opened === stored) fail(video.camera, error);
  }
}

function close() {
  closed = true;
  opened = null;
  current = null;

  for (const { pump, input } of decoders.values()) {
    pump.close();
    input.dispose();
  }

  decoders.clear();
  sent.clear();

  for (const timer of retryTimers.values()) clearTimeout(timer);

  retryTimers.clear();
  streams.clear();
  vision.close();
  visionConnected = false;
}

function seekCurrent() {
  if (!current) return;

  for (const { pump } of decoders.values()) pump.seek(current.seconds, current.timestamp);
}

scope.onmessage = ({ data }: MessageEvent<RecordedCameraRequest>) => {
  if (data.type === 'close') return close();

  if (data.type === 'refresh') return seekCurrent();

  if (data.type === 'stream') {
    streams.set(data.id, { ...data, last: -Infinity });
    seekCurrent();

    return;
  }

  if (data.type === 'unstream') return void streams.delete(data.id);

  if (data.type === 'vision') {
    vision.connect(data.port);
    visionConnected = true;
    sent.clear();
    seekCurrent();

    return;
  }

  if (data.type === 'assignments') {
    assignments = data.assignments;
    vision.configure(assignments);

    seekCurrent();

    return;
  }

  if (data.type === 'seek') {
    current = { seconds: data.seconds, timestamp: data.timestamp };

    for (const { pump } of decoders.values()) pump.seek(data.seconds, data.timestamp);

    return;
  }

  opened = data.stored;
  closed = false;

  for (const video of data.stored.videos ?? []) void openVideo(data.stored, video);
};
