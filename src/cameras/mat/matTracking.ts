import { useSyncExternalStore } from 'react';
import type { CaseMat } from '../../cases/mat/matLayout';
import { CAMERA_REFUSAL, requestCameraStream, stopCameraStream } from '../operator/operatorCamera';
import { frameSource, type FrameSource } from '../operator/operatorFrames';
import type { MatSample } from './matTracker';
import type { MatFeed, TagsEvent, TagsRequest } from './tagsProtocol';

export interface MatTrackingState {
  owner: number;
  open: boolean;
  latest: MatSample | null;
  refusal: string | null;
  error: string | null;
}

export const MAT_TRACKING_STOPPED = 'Mat tracking stopped. Try on Real Robot again.';

const TRACK_SIZE = { width: 1280, height: 720 };
const CLOSED: MatTrackingState = { owner: 0, open: false, latest: null, refusal: null, error: null };

let state = CLOSED;
let session: { worker: Worker; frames: FrameSource | null; stream: MediaStream | null } | null = null;
let lastOwner = 0;
let standIn: MatFeed | null = null;
let settleOpen: ((refusal: string | null) => void) | null = null;
const listeners = new Set<() => void>();
const sampleListeners = new Map<(sample: MatSample) => void, number>();

function set(next: Partial<MatTrackingState>) {
  state = { ...state, ...next };
  listeners.forEach((notify) => notify());
}

function settle(refusal: string | null) {
  const resolve = settleOpen;

  settleOpen = null;
  resolve?.(refusal);
}

function receive(owner: number, event: TagsEvent) {
  if (owner !== state.owner) return;

  if (event.type === 'ready') return settle(null);

  if (event.type === 'error') {
    settle(MAT_TRACKING_STOPPED);

    return set({ error: event.message });
  }

  if (event.type === 'refused') return set({ refusal: event.message });

  set({ latest: event.sample });
  sampleListeners.forEach((listening, listen) => {
    if (listening === owner) listen(event.sample);
  });
}

export function claimMatTracking(): number {
  if (state.owner) return 0;

  lastOwner++;
  set({ ...CLOSED, owner: lastOwner });

  return lastOwner;
}

function endSession() {
  if (!session) return;

  const { worker, frames, stream } = session;

  session = null;
  frames?.stop();
  worker.postMessage({ type: 'close' } satisfies TagsRequest);
  worker.terminate();

  if (stream) stopCameraStream(stream);
}

export function closeMatTracking(owner: number) {
  if (!owner || owner !== state.owner) return;

  settle(null);
  endSession();
  set(CLOSED);
}

function start(owner: number, mat: CaseMat, stream: MediaStream | null) {
  const worker = new Worker(new URL('./tags.worker.ts', import.meta.url), { type: 'module' });
  const frames = stream ? frameSource(stream, worker) : null;
  const open: TagsRequest = { type: 'open', mat, frames: frames?.frames, standIn: !!standIn };

  worker.onmessage = (ev: MessageEvent<TagsEvent>) => receive(owner, ev.data);
  worker.onerror = (ev) => receive(owner, { type: 'error', message: ev.message || MAT_TRACKING_STOPPED });
  worker.postMessage(open, frames?.frames ? [frames.frames] : []);

  if (standIn) worker.postMessage({ type: 'feed', feed: standIn } satisfies TagsRequest);

  standIn = null;
  session = { worker, frames, stream };
  set({ open: true });
}

export async function openMatTracking(owner: number, mat: CaseMat): Promise<string | null> {
  if (!owner || owner !== state.owner || session) return null;

  const stream = standIn ? null : await requestCameraStream(TRACK_SIZE);

  if (!standIn && !stream) {
    closeMatTracking(owner);

    return CAMERA_REFUSAL;
  }

  const held = owner === state.owner;

  if (!held && stream) stopCameraStream(stream);

  if (!held) return null;

  const ready = new Promise<string | null>((resolve) => {
    settleOpen = resolve;
  });

  start(owner, mat, stream);

  const refusal = await ready;

  if (refusal) closeMatTracking(owner);

  return refusal;
}

export function feedMatFrames(feed: MatFeed) {
  if (!session) {
    standIn = feed;

    return;
  }

  session.worker.postMessage({ type: 'feed', feed } satisfies TagsRequest);
}

export function onMatSample(owner: number, listen: (sample: MatSample) => void) {
  sampleListeners.set(listen, owner);

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
