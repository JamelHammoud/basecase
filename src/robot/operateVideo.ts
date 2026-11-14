export interface VideoSegment {
  bytes: Uint8Array;
  seconds: number;
  startedAt?: number;
}

export type VideoRequest =
  | { type: 'start'; id: number; frames: ReadableStream<VideoFrame> }
  | { type: 'cut'; id: number; cut: number }
  | { type: 'stop'; id: number };

export interface VideoReply {
  type: 'segment';
  id: number;
  cut: number;
  segment: VideoSegment | null;
}

export interface VideoWorker {
  postMessage: (message: VideoRequest, transfer?: Transferable[]) => void;
  addEventListener: (type: 'message', listener: (event: MessageEvent<VideoReply>) => void) => void;
}

export type VideoWorkerFactory = () => VideoWorker;

type TrackProcessor = new (init: { track: MediaStreamTrack }) => { readable: ReadableStream<VideoFrame> };

interface Recording {
  id: number;
  stream: MediaStream;
  track: MediaStreamTrack;
  segmentAt: number;
  worker: VideoWorker;
  cuts: Map<number, (segment: VideoSegment | null) => void>;
  stopping: boolean;
}

const trackProcessor = () =>
  (globalThis as unknown as { MediaStreamTrackProcessor?: TrackProcessor }).MediaStreamTrackProcessor;

const canEncode = () => typeof (globalThis as { VideoEncoder?: unknown }).VideoEncoder === 'function';

const defaultWorker: VideoWorkerFactory = () =>
  new Worker(new URL('./operateVideo.worker.ts', import.meta.url), { type: 'module' }) as VideoWorker;

export class OperateVideoRecorder {
  private recording: Recording | null = null;

  private ids = 0;

  private cuts = 0;

  private readonly makeWorker: VideoWorkerFactory;

  constructor(makeWorker: VideoWorkerFactory) {
    this.makeWorker = makeWorker;
  }

  get active() {
    return this.recording !== null;
  }

  start(stream: MediaStream): boolean {
    const Processor = trackProcessor();
    const [track] = stream.getVideoTracks();

    if (!Processor || !canEncode() || !track) return false;

    if (this.recording?.stream === stream) return true;

    this.stop();

    const copy = track.clone();
    const recording: Recording = {
      id: ++this.ids,
      stream,
      track: copy,
      segmentAt: Date.now(),
      worker: this.makeWorker(),
      cuts: new Map(),
      stopping: false,
    };
    const frames = new Processor({ track: copy }).readable;

    recording.worker.addEventListener('message', (event) => this.settle(recording, event.data));
    recording.worker.postMessage({ type: 'start', id: recording.id, frames }, [frames as unknown as Transferable]);
    this.recording = recording;

    return true;
  }

  cut(): Promise<VideoSegment | null> {
    const recording = this.recording;

    if (!recording) return Promise.resolve(null);

    const cut = ++this.cuts;
    const startedAt = recording.segmentAt;

    recording.segmentAt = Date.now();

    return new Promise((resolve) => {
      recording.cuts.set(cut, (segment) => resolve(segment && { ...segment, startedAt }));
      recording.worker.postMessage({ type: 'cut', id: recording.id, cut });
    });
  }

  release() {
    this.recording?.track.stop();
  }

  stop() {
    const recording = this.recording;

    if (!recording) return;

    this.recording = null;
    recording.track.stop();
    recording.stopping = true;

    if (!recording.cuts.size) recording.worker.postMessage({ type: 'stop', id: recording.id });
  }

  private settle(recording: Recording, reply: VideoReply) {
    const resolve = reply.id === recording.id ? recording.cuts.get(reply.cut) : undefined;

    if (!resolve) return;

    recording.cuts.delete(reply.cut);
    resolve(reply.segment);

    if (recording.stopping && !recording.cuts.size) recording.worker.postMessage({ type: 'stop', id: recording.id });
  }
}

let recorder = new OperateVideoRecorder(defaultWorker);

export function setOperateVideoWorker(factory: VideoWorkerFactory) {
  recorder.stop();
  recorder = new OperateVideoRecorder(factory);
}

export const startOperateVideo = (stream: MediaStream): boolean => recorder.start(stream);

export const cutOperateVideo = (): Promise<VideoSegment | null> => recorder.cut();

export const stopOperateVideo = (): void => recorder.stop();

export const releaseOperateVideo = (): void => recorder.release();

export const operateVideoRecording = () => recorder.active;
