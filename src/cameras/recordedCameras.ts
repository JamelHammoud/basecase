import { useSyncExternalStore } from 'react';
import type { StoredTry } from '../cases/tryFile';
import { errorMessage } from '../utils/errorMessage';
import { recordedVideoTime } from './recordedFrames';
import type { RecordedCameraEvent, RecordedCameraRequest } from './recordedProtocol';
import * as defaultVision from './visionSession';
import type { CameraVision } from './scopedVision';
import type { CameraView } from './views';
import { streamFps, streamSize, type StreamAsk } from './streamPace';

const EMPTY: CameraView[] = [];

interface RecordedState {
  vision: Pick<
    CameraVision,
    | 'setCameraVisionError'
    | 'invalidateVisionCamera'
    | 'visionAssignments'
    | 'onVisionAssignments'
    | 'registerVisionCameras'
    | 'connectVisionFrames'
    | 'ensureVisionCamera'
  >;
  listeners: Set<() => void>;
  canvases: Map<string, HTMLCanvasElement>;
  bitmaps: Map<string, ImageBitmap>;
  errors: Map<string, string>;
  streams: Map<number, (bitmap: ImageBitmap) => void>;
  streamId: number;
  views: CameraView[];
  stored: StoredTry | null;
  worker: Worker | null;
  unsubscribe: (() => void) | null;
  minimum: number;
}

const changed = (state: RecordedState) => state.listeners.forEach((listen) => listen());
const post = (state: RecordedState, message: RecordedCameraRequest, transfer: Transferable[] = []) =>
  state.worker?.postMessage(message, transfer);

function failCameras(state: RecordedState, error: unknown) {
  for (const view of state.views) state.vision.setCameraVisionError(view.key, errorMessage(error));
}

function show(state: RecordedState, camera: string, bitmap: ImageBitmap) {
  const context = state.canvases.get(camera)?.getContext('bitmaprenderer');

  if (context) return context.transferFromImageBitmap(bitmap);

  state.bitmaps.get(camera)?.close();
  state.bitmaps.set(camera, bitmap);
}

function receive(state: RecordedState, event: RecordedCameraEvent) {
  if (event.type !== 'error' && event.timestamp < state.minimum) return event.bitmap.close();

  if (event.type === 'error' && event.timestamp !== undefined && event.timestamp < state.minimum) return;

  if (event.type === 'stream') {
    const stream = state.streams.get(event.id);

    return stream ? stream(event.bitmap) : event.bitmap.close();
  }

  if (event.type === 'error') {
    state.errors.set(event.camera, event.message);
    state.vision.setCameraVisionError(event.camera, event.message, event.timestamp);
    changed(state);

    return;
  }

  state.errors.delete(event.camera);
  show(state, event.camera, event.bitmap);
}

const recordedView = (camera: string): CameraView => ({
  key: camera,
  label: camera,
  part: null,
  recorded: true,
  position: [0, 0, 0],
  target: [0, 0, -1],
  up: [0, 1, 0],
  fovDeg: 60,
  lens: { model: 'pinhole', hfovDeg: 70 },
});

function closeRecordedCamerasIn(state: RecordedState) {
  state.unsubscribe?.();
  state.unsubscribe = null;
  post(state, { type: 'close' });
  state.worker?.terminate();
  state.worker = null;

  for (const bitmap of state.bitmaps.values()) bitmap.close();

  for (const view of state.views) state.vision.invalidateVisionCamera(view.key);

  state.bitmaps.clear();
  state.errors.clear();
  state.streams.clear();
  state.stored = null;
  state.views = EMPTY;
  changed(state);
}

function openRecordedCamerasIn(state: RecordedState, manifest: StoredTry | null) {
  closeRecordedCamerasIn(state);

  if (!manifest?.videos?.length || typeof Worker === 'undefined') return;

  state.stored = manifest;
  state.views = manifest.videos.map((video) => recordedView(video.camera));
  state.worker = new Worker(new URL('./recordedCamera.worker.ts', import.meta.url), { type: 'module' });

  const current = state.worker;
  const configure = () => post(state, { type: 'assignments', assignments: state.vision.visionAssignments() });

  state.worker.onmessage = ({ data }: MessageEvent<RecordedCameraEvent>) => {
    if (state.worker === current) return receive(state, data);

    if (data.type !== 'error') data.bitmap.close();
  };
  state.worker.onerror = (event) => {
    if (state.worker === current) failCameras(state, event.message || 'Open the try again.');
  };

  post(state, { type: 'open', stored: manifest });

  const stopAssignments = state.vision.onVisionAssignments(configure);
  const stopCameras = state.vision.registerVisionCameras(
    current,
    state.views.map((view) => view.key),
  );

  state.unsubscribe = () => {
    stopAssignments();
    stopCameras();
  };
  configure();
  void state.vision
    .connectVisionFrames()
    .then((port) => {
      if (state.worker !== current) return port.close();

      post(state, { type: 'vision', port }, [port]);
      configure();
    })
    .catch((error: unknown) => {
      if (state.worker === current) failCameras(state, error);
    });

  for (const view of state.views) void state.vision.ensureVisionCamera(view.key).catch(() => undefined);

  changed(state);
}

function seekRecordedCamerasIn(state: RecordedState, seconds: number, invalidate = true): number {
  state.minimum = Math.max(performance.now(), state.minimum + 0.001);

  for (const video of state.stored?.videos ?? []) {
    const active = recordedVideoTime(video, state.stored!.source, seconds) !== null;

    if (invalidate || !active) state.vision.invalidateVisionCamera(video.camera, state.minimum);

    if (active) continue;

    const canvas = state.canvases.get(video.camera);

    canvas?.getContext('bitmaprenderer')?.transferFromImageBitmap(null);

    state.bitmaps.get(video.camera)?.close();
    state.bitmaps.delete(video.camera);
  }

  post(state, { type: 'seek', seconds, timestamp: state.minimum });

  return state.minimum;
}

function streamRecordedCameraIn(
  state: RecordedState,
  camera: string,
  ask: StreamAsk,
  onFrame: (bitmap: ImageBitmap) => void,
) {
  const id = ++state.streamId;
  const [width, height] = streamSize([ask.width, ask.height]);

  state.streams.set(id, onFrame);
  post(state, { type: 'stream', id, camera, width, height, fps: streamFps(ask.fps) });

  return () => {
    state.streams.delete(id);
    post(state, { type: 'unstream', id });
  };
}

function recordedCanvasRefIn(state: RecordedState, camera: string, canvas: HTMLCanvasElement | null) {
  if (!canvas) return void state.canvases.delete(camera);

  state.canvases.set(camera, canvas);

  const bitmap = state.bitmaps.get(camera);

  state.bitmaps.delete(camera);

  if (bitmap) show(state, camera, bitmap);
  else post(state, { type: 'refresh' });
}

const recordedCameraErrorIn = (state: RecordedState, camera: string) => state.errors.get(camera) ?? null;
const recordedCameraViewsIn = (state: RecordedState) => state.views;

function subscribeIn(state: RecordedState, listener: () => void) {
  state.listeners.add(listener);

  return () => {
    state.listeners.delete(listener);
  };
}

export function createRecordedCameras(vision: RecordedState['vision'] = defaultVision) {
  const state: RecordedState = {
    vision,
    listeners: new Set(),
    canvases: new Map(),
    bitmaps: new Map(),
    errors: new Map(),
    streams: new Map(),
    streamId: 0,
    views: EMPTY,
    stored: null,
    worker: null,
    unsubscribe: null,
    minimum: -Infinity,
  };
  const snapshot = () => recordedCameraViewsIn(state);

  return {
    closeRecordedCameras: () => closeRecordedCamerasIn(state),
    openRecordedCameras: (manifest: StoredTry | null) => openRecordedCamerasIn(state, manifest),
    seekRecordedCameras: (seconds: number, invalidate = true) => seekRecordedCamerasIn(state, seconds, invalidate),
    streamRecordedCamera: (camera: string, ask: StreamAsk, onFrame: (bitmap: ImageBitmap) => void) =>
      streamRecordedCameraIn(state, camera, ask, onFrame),
    recordedCanvasRef: (camera: string, canvas: HTMLCanvasElement | null) => recordedCanvasRefIn(state, camera, canvas),
    recordedCameraError: (camera: string) => recordedCameraErrorIn(state, camera),
    recordedCameraViews: snapshot,
    useRecordedCameraViews: () => useSyncExternalStore((listen) => subscribeIn(state, listen), snapshot, snapshot),
  };
}

export const {
  closeRecordedCameras,
  openRecordedCameras,
  seekRecordedCameras,
  streamRecordedCamera,
  recordedCanvasRef,
  recordedCameraError,
  recordedCameraViews,
  useRecordedCameraViews,
} = createRecordedCameras();
