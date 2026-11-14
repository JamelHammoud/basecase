import { useSyncExternalStore } from 'react';
import type { InputRobot } from '../../sim/inputTypes';
import { createLatencyLog, type LatencyStats } from './latencyLog';
import { frameSource, type FrameSource } from './operatorFrames';
import type { PoseFollow, PoseSample } from './poseFollow';
import { wallClock, type Delegate, type PoseEvent, type PoseRequest, type SkeletonPoint } from './poseProtocol';

export interface OperatorCameraState {
  open: boolean;
  stream: MediaStream | null;
  label: string | null;
  estimator: Delegate | null;
  error: string | null;
}

export const OPERATOR_KEY = 'operator';

export const CAMERA_REFUSAL = 'Couldn’t open the camera.';

const LATENCY_SAMPLES = 300;
const CLOSED: OperatorCameraState = { open: false, stream: null, label: null, estimator: null, error: null };

let state = CLOSED;
let session: { worker: Worker; frames: FrameSource; stream: MediaStream } | null = null;
let generation = 0;
let lastTrack: MediaStreamTrack | null = null;
let fresh: { follow: PoseFollow; seenAt: number; read: boolean } | null = null;
let points: SkeletonPoint[] | null = null;
let standIn: Extract<PoseRequest, { type: 'feed' }> | null = null;
let settleOpen: ((refusal: string | null) => void) | null = null;
const listeners = new Set<() => void>();
const pointListeners = new Set<(next: SkeletonPoint[] | null) => void>();
const latency = createLatencyLog(LATENCY_SAMPLES);

function set(next: Partial<OperatorCameraState>) {
  state = { ...state, ...next };
  listeners.forEach((notify) => notify());
}

function setPoints(next: SkeletonPoint[] | null) {
  points = next;
  pointListeners.forEach((draw) => draw(next));
}

function settle(refusal: string | null) {
  const resolve = settleOpen;

  settleOpen = null;
  resolve?.(refusal);
}

function fail(message: string) {
  settle(CAMERA_REFUSAL);
  set({ error: message });
}

function receive(event: PoseEvent) {
  if (event.type === 'error') return fail(event.message);

  if (event.type === 'ready') {
    settle(null);

    return set({ estimator: event.delegate });
  }

  fresh = event.follow && { follow: event.follow, seenAt: event.seenAt, read: false };
  setPoints(event.image);
}

const OPERATOR_SIZE = { width: 640, height: 480 };

export async function requestCameraStream(size = OPERATOR_SIZE): Promise<MediaStream | null> {
  const devices = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;

  if (!devices?.getUserMedia) return null;

  return devices.getUserMedia({ video: size, audio: false }).catch(() => null);
}

export const stopCameraStream = (stream: MediaStream) => stream.getTracks().forEach((track) => track.stop());

function start(stream: MediaStream, robot: InputRobot) {
  const [track] = stream.getVideoTracks();
  const worker = new Worker(new URL('./pose.worker.ts', import.meta.url), { type: 'module' });

  worker.onmessage = (ev: MessageEvent<PoseEvent>) => receive(ev.data);
  worker.onerror = (ev) => fail(ev.message || 'The pose worker stopped.');

  const frames = frameSource(stream, worker);
  const open: PoseRequest = { type: 'open', robot, frames: frames.frames, standIn: !!standIn };

  worker.postMessage(open, frames.frames ? [frames.frames] : []);

  if (standIn) worker.postMessage(standIn);

  standIn = null;
  session = { worker, frames, stream };
  lastTrack = track ?? null;
  latency.clear();
  set({ open: true, stream, label: track?.label || null, estimator: null, error: null });
}

export function closeOperatorCamera() {
  generation++;
  fresh = null;
  settle(null);

  if (!session) return;

  const { worker, frames, stream } = session;

  session = null;
  frames.stop();
  worker.postMessage({ type: 'close' } satisfies PoseRequest);
  worker.terminate();
  stopCameraStream(stream);
  setPoints(null);
  set(CLOSED);
}

export async function openOperatorCamera(robot: InputRobot): Promise<string | null> {
  closeOperatorCamera();

  const opening = generation;
  const stream = await requestCameraStream();

  if (!stream) return CAMERA_REFUSAL;

  if (opening !== generation) {
    stopCameraStream(stream);

    return null;
  }

  const waits = !standIn;
  const ready = new Promise<string | null>((resolve) => {
    settleOpen = resolve;
  });

  start(stream, robot);

  if (!waits) settle(null);

  const refusal = await ready;

  if (refusal && opening === generation) closeOperatorCamera();

  return refusal;
}

export function latestFollow(): PoseFollow | null {
  if (!fresh) return null;

  if (!fresh.read) latency.add(wallClock() - fresh.seenAt);

  fresh.read = true;

  return fresh.follow;
}

export function feedOperatorPose(samples: PoseSample[], fps?: number) {
  const feed: PoseRequest = { type: 'feed', samples, fps };

  if (!session) {
    standIn = feed;

    return;
  }

  session.worker.postMessage(feed);
  settle(null);
}

export const operatorLatency = (): LatencyStats | null => latency.stats();

export const operatorPoints = () => points;

export const operatorTrackState = () => lastTrack?.readyState ?? null;

export function onOperatorPoints(draw: (next: SkeletonPoint[] | null) => void) {
  pointListeners.add(draw);

  return () => {
    pointListeners.delete(draw);
  };
}

const subscribe = (notify: () => void) => {
  listeners.add(notify);

  return () => {
    listeners.delete(notify);
  };
};

export const operatorCameraSnapshot = () => state;

export const useOperatorCamera = () => useSyncExternalStore(subscribe, operatorCameraSnapshot);
