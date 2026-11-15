import { useSyncExternalStore } from 'react';
import type { StoredTry } from '../cases/tryFile';
import { errorMessage } from '../utils/errorMessage';
import { recordedVideoTime } from './recordedFrames';
import type { RecordedCameraEvent, RecordedCameraRequest } from './recordedProtocol';
import {
  connectVisionFrames,
  ensureVisionCamera,
  invalidateVisionCamera,
  onVisionAssignments,
  registerVisionCameras,
  setCameraVisionError,
  visionAssignments,
} from './visionSession';
import type { CameraView } from './views';
import { streamFps, streamSize, type StreamAsk } from './streamPace';

const EMPTY: CameraView[] = [];
const listeners = new Set<() => void>();
const canvases = new Map<string, HTMLCanvasElement>();
const bitmaps = new Map<string, ImageBitmap>();
const errors = new Map<string, string>();
const streams = new Map<number, (bitmap: ImageBitmap) => void>();
let streamId = 0;
let views = EMPTY;
let stored: StoredTry | null = null;
let worker: Worker | null = null;
let unsubscribe: (() => void) | null = null;
let minimum = -Infinity;

const changed = () => listeners.forEach((listen) => listen());
const post = (message: RecordedCameraRequest, transfer: Transferable[] = []) => worker?.postMessage(message, transfer);

function failCameras(error: unknown) {
  for (const view of views) setCameraVisionError(view.key, errorMessage(error));
}

function show(camera: string, bitmap: ImageBitmap) {
  const context = canvases.get(camera)?.getContext('bitmaprenderer');

  if (context) return context.transferFromImageBitmap(bitmap);

  bitmaps.get(camera)?.close();
  bitmaps.set(camera, bitmap);
}

function receive(event: RecordedCameraEvent) {
  if (event.type !== 'error' && event.timestamp < minimum) return event.bitmap.close();

  if (event.type === 'error' && event.timestamp !== undefined && event.timestamp < minimum) return;

  if (event.type === 'stream') {
    const stream = streams.get(event.id);

    return stream ? stream(event.bitmap) : event.bitmap.close();
  }

  if (event.type === 'error') {
    errors.set(event.camera, event.message);
    setCameraVisionError(event.camera, event.message, event.timestamp);
    changed();

    return;
  }

  errors.delete(event.camera);
  show(event.camera, event.bitmap);
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

export function closeRecordedCameras() {
  unsubscribe?.();
  unsubscribe = null;
  post({ type: 'close' });
  worker?.terminate();
  worker = null;

  for (const bitmap of bitmaps.values()) bitmap.close();

  for (const view of views) invalidateVisionCamera(view.key);

  bitmaps.clear();
  errors.clear();
  streams.clear();
  stored = null;
  views = EMPTY;
  changed();
}

export function openRecordedCameras(manifest: StoredTry | null) {
  closeRecordedCameras();

  if (!manifest?.videos?.length || typeof Worker === 'undefined') return;

  stored = manifest;
  views = manifest.videos.map((video) => recordedView(video.camera));
  worker = new Worker(new URL('./recordedCamera.worker.ts', import.meta.url), { type: 'module' });

  const current = worker;
  const configure = () => post({ type: 'assignments', assignments: visionAssignments() });

  worker.onmessage = ({ data }: MessageEvent<RecordedCameraEvent>) => {
    if (worker === current) return receive(data);

    if (data.type !== 'error') data.bitmap.close();
  };
  worker.onerror = (event) => {
    if (worker === current) failCameras(event.message || 'Open the try again.');
  };

  post({ type: 'open', stored: manifest });

  const stopAssignments = onVisionAssignments(configure);
  const stopCameras = registerVisionCameras(
    current,
    views.map((view) => view.key),
  );

  unsubscribe = () => {
    stopAssignments();
    stopCameras();
  };
  configure();
  void connectVisionFrames()
    .then((port) => {
      if (worker !== current) return port.close();

      post({ type: 'vision', port }, [port]);
      configure();
    })
    .catch((error: unknown) => {
      if (worker === current) failCameras(error);
    });

  for (const view of views) void ensureVisionCamera(view.key).catch(() => undefined);

  changed();
}

export function seekRecordedCameras(seconds: number, invalidate = true): number {
  minimum = Math.max(performance.now(), minimum + 0.001);

  for (const video of stored?.videos ?? []) {
    const active = recordedVideoTime(video, stored!.source, seconds) !== null;

    if (invalidate || !active) invalidateVisionCamera(video.camera, minimum);

    if (active) continue;

    const canvas = canvases.get(video.camera);

    canvas?.getContext('bitmaprenderer')?.transferFromImageBitmap(null);

    bitmaps.get(video.camera)?.close();
    bitmaps.delete(video.camera);
  }

  post({ type: 'seek', seconds, timestamp: minimum });

  return minimum;
}

export function streamRecordedCamera(camera: string, ask: StreamAsk, onFrame: (bitmap: ImageBitmap) => void) {
  const id = ++streamId;
  const [width, height] = streamSize([ask.width, ask.height]);

  streams.set(id, onFrame);
  post({ type: 'stream', id, camera, width, height, fps: streamFps(ask.fps) });

  return () => {
    streams.delete(id);
    post({ type: 'unstream', id });
  };
}

export function recordedCanvasRef(camera: string, canvas: HTMLCanvasElement | null) {
  if (!canvas) return void canvases.delete(camera);

  canvases.set(camera, canvas);

  const bitmap = bitmaps.get(camera);

  bitmaps.delete(camera);

  if (bitmap) show(camera, bitmap);
  else post({ type: 'refresh' });
}

export const recordedCameraError = (camera: string) => errors.get(camera) ?? null;
export const recordedCameraViews = () => views;

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export const useRecordedCameraViews = () => useSyncExternalStore(subscribe, recordedCameraViews, recordedCameraViews);
