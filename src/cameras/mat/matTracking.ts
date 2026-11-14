import { useSyncExternalStore } from 'react';
import type { CaseMat } from '../../cases/mat/matLayout';
import { CAMERA_REFUSAL, requestCameraStream, stopCameraStream } from '../operator/operatorCamera';
import { frameSource, type FrameSource } from '../operator/operatorFrames';
import type { MatSample } from './matTracker';
import type { MatFeed, TagsEvent, TagsRequest } from './tagsProtocol';

export interface MatTrackingState {
  open: boolean;
  latest: MatSample | null;
  refusal: string | null;
  error: string | null;
}

export const MAT_TRACKING_STOPPED = 'Mat tracking stopped. Try on Real Robot again.';

const TRACK_SIZE = { width: 1280, height: 720 };
const CLOSED: MatTrackingState = { open: false, latest: null, refusal: null, error: null };

let state = CLOSED;
let session: { worker: Worker; frames: FrameSource | null; stream: MediaStream | null } | null = null;
let generation = 0;
let standIn: MatFeed | null = null;
let settleOpen: ((refusal: string | null) => void) | null = null;
const listeners = new Set<() => void>();
const sampleListeners = new Set<(sample: MatSample) => void>();

function set(next: Partial<MatTrackingState>) {
  state = { ...state, ...next };
  listeners.forEach((notify) => notify());
}

function settle(refusal: string | null) {
  const resolve = settleOpen;

  settleOpen = null;
  resolve?.(refusal);
}

function receive(event: TagsEvent) {
  if (event.type === 'ready') return settle(null);

  if (event.type === 'error') {
    settle(MAT_TRACKING_STOPPED);

    return set({ error: event.message });
  }

  if (event.type === 'refused') return set({ refusal: event.message });

  set({ latest: event.sample });
  sampleListeners.forEach((listen) => listen(event.sample));
}

export function closeMatTracking() {
  generation++;
  settle(null);

  if (!session) return;

  const { worker, frames, stream } = session;

  session = null;
  frames?.stop();
  worker.postMessage({ type: 'close' } satisfies TagsRequest);
  worker.terminate();

  if (stream) stopCameraStream(stream);

  set(CLOSED);
}

function start(mat: CaseMat, stream: MediaStream | null) {
  const worker = new Worker(new URL('./tags.worker.ts', import.meta.url), { type: 'module' });
  const frames = stream ? frameSource(stream, worker) : null;
  const open: TagsRequest = { type: 'open', mat, frames: frames?.frames, standIn: !!standIn };

  worker.onmessage = (ev: MessageEvent<TagsEvent>) => receive(ev.data);
  worker.onerror = (ev) => receive({ type: 'error', message: ev.message || MAT_TRACKING_STOPPED });
  worker.postMessage(open, frames?.frames ? [frames.frames] : []);

  if (standIn) worker.postMessage({ type: 'feed', feed: standIn } satisfies TagsRequest);

  standIn = null;
  session = { worker, frames, stream };
  set({ ...CLOSED, open: true });
}

export async function openMatTracking(mat: CaseMat): Promise<string | null> {
  closeMatTracking();

  const opening = generation;
  const stream = standIn ? null : await requestCameraStream(TRACK_SIZE);

  if (!standIn && !stream) return CAMERA_REFUSAL;

  if (opening !== generation && stream) stopCameraStream(stream);

  if (opening !== generation) return null;

  const ready = new Promise<string | null>((resolve) => {
    settleOpen = resolve;
  });

  start(mat, stream);

  const refusal = await ready;

  if (refusal && opening === generation) closeMatTracking();

  return refusal;
}

export function feedMatFrames(feed: MatFeed) {
  if (!session) {
    standIn = feed;

    return;
  }

  session.worker.postMessage({ type: 'feed', feed } satisfies TagsRequest);
}

export function onMatSample(listen: (sample: MatSample) => void) {
  sampleListeners.add(listen);

  return () => {
    sampleListeners.delete(listen);
  };
}

const subscribe = (notify: () => void) => {
  listeners.add(notify);

  return () => {
    listeners.delete(notify);
  };
};

export const matTrackingSnapshot = () => state;

export const useMatTracking = () => useSyncExternalStore(subscribe, matTrackingSnapshot);
