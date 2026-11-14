import { useSyncExternalStore } from 'react';
import { GESTURE_EVENT } from '../../cases/gestures';
import { emitInputEvent } from '../../sim/inputEvents';
import type { InputRobot } from '../../sim/inputTypes';
import type { GestureExample } from '../gestures/gestureMatch';
import type { TaughtGesture } from '../gestures/gestureRecognizer';
import type { FaceFollow, FaceSample } from './faceFollow';
import type { HandFollow, HandSample } from './handFollow';
import { createLatencyLog, type LatencyStats } from './latencyLog';
import { frameSource, type FrameSource } from './operatorFrames';
import type { PoseFollow, PoseSample } from './poseFollow';
import {
  wallClock,
  type Delegate,
  type FeedRequest,
  type FollowEvent,
  type LandmarkKind,
  type PoseEvent,
  type PoseRequest,
  type SkeletonPoint,
} from './poseProtocol';

export type { FaceSample } from './faceFollow';
export type { HandSample } from './handFollow';
export type { LandmarkKind } from './poseProtocol';

export interface OperatorCameraState {
  open: boolean;
  stream: MediaStream | null;
  label: string | null;
  estimator: Delegate | null;
  error: string | null;
}

export const OPERATOR_KEY = 'operator';

export const CAMERA_REFUSAL = 'Couldn’t open the camera.';

interface Member {
  robot: InputRobot;
  joined: boolean;
  settle: ((refusal: string | null) => void) | null;
}

interface Session {
  worker: Worker;
  frames: FrameSource;
  stream: MediaStream;
}

interface Fresh<T> {
  follow: T;
  seenAt: number;
  read: boolean;
  marks: number[] | null;
}

interface Follows {
  body: PoseFollow;
  hand: HandFollow;
  face: FaceFollow;
}

const LATENCY_SAMPLES = 300;
const CLOSED: OperatorCameraState = { open: false, stream: null, label: null, estimator: null, error: null };

let state = CLOSED;
let session: Session | null = null;
let starting: Promise<Session | null> | null = null;
let lastTrack: MediaStreamTrack | null = null;
let points: SkeletonPoint[] | null = null;
let fresh: { [K in LandmarkKind]?: Fresh<Follows[K]> } = {};
let taught: TaughtGesture[] = [];
let settleExample: ((example: GestureExample | null) => void) | null = null;
const members = new Map<LandmarkKind, Member>();
const standIns = new Map<LandmarkKind, FeedRequest>();
const feeding = new Set<LandmarkKind>();
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

function settle(kind: LandmarkKind, refusal: string | null) {
  const member = members.get(kind);
  const resolve = member?.settle;

  if (member) member.settle = null;

  resolve?.(refusal);
}

function fail(message: string, kind?: LandmarkKind) {
  (kind ? [kind] : [...members.keys()]).forEach((k) => settle(k, CAMERA_REFUSAL));
  set({ error: message });
}

function example(next: GestureExample | null) {
  const resolve = settleExample;

  settleExample = null;
  resolve?.(next);
}

const entry = <T>(follow: T | null, { seenAt, marks }: FollowEvent): Fresh<T> | undefined =>
  follow ? { follow, seenAt, read: false, marks: marks ?? null } : undefined;

function keep(event: FollowEvent) {
  if (event.type === 'pose') {
    fresh.body = entry(event.follow, event);

    return setPoints(event.image);
  }

  if (event.type === 'hand') fresh.hand = entry(event.follow, event);

  if (event.type === 'face') fresh.face = entry(event.follow, event);
}

function receive(event: PoseEvent) {
  if (event.type === 'error') return fail(event.message, event.kind);

  if (event.type === 'gesture') return emitInputEvent(GESTURE_EVENT, event.name);

  if (event.type === 'example') return example(event.example);

  if (event.type === 'fed') {
    feeding.delete(event.kind);

    return;
  }

  if (event.type !== 'ready') return keep(event);

  settle(event.kind, null);
  set({ estimator: state.estimator ?? event.delegate });
}

const OPERATOR_SIZE = { width: 640, height: 480 };

export async function requestCameraStream(size = OPERATOR_SIZE): Promise<MediaStream | null> {
  const devices = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;

  if (!devices?.getUserMedia) return null;

  return devices.getUserMedia({ video: size, audio: false }).catch(() => null);
}

export const stopCameraStream = (stream: MediaStream) => stream.getTracks().forEach((track) => track.stop());

function start(stream: MediaStream): Session {
  const [track] = stream.getVideoTracks();
  const worker = new Worker(new URL('./pose.worker.ts', import.meta.url), { type: 'module' });

  worker.onmessage = (ev: MessageEvent<PoseEvent>) => receive(ev.data);
  worker.onerror = (ev) => fail(ev.message || 'The pose worker stopped.');

  const frames = frameSource(stream, worker);
  const open: PoseRequest = { type: 'open', frames: frames.frames };

  worker.postMessage(open, frames.frames ? [frames.frames] : []);
  worker.postMessage({ type: 'gestures', taught } satisfies PoseRequest);
  session = { worker, frames, stream };
  lastTrack = track ?? null;
  latency.clear();
  set({ open: true, stream, label: track?.label || null, estimator: null, error: null });

  return session;
}

async function openSession(): Promise<Session | null> {
  const stream = await requestCameraStream();

  if (!stream) return null;

  if (!members.size) {
    stopCameraStream(stream);

    return null;
  }

  return start(stream);
}

function liveSession(): Promise<Session | null> {
  if (session) return Promise.resolve(session);

  starting ??= openSession().finally(() => {
    starting = null;
  });

  return starting;
}

function endSession() {
  const live = session;

  session = null;
  fresh = {};
  feeding.clear();
  example(null);

  if (!live) return;

  live.frames.stop();
  live.worker.postMessage({ type: 'close' } satisfies PoseRequest);
  live.worker.terminate();
  stopCameraStream(live.stream);
  setPoints(null);
  set(CLOSED);
}

function enter(live: Session, kind: LandmarkKind, member: Member) {
  const feed = standIns.get(kind);

  standIns.delete(kind);
  live.worker.postMessage({ type: 'join', kind, robot: member.robot, standIn: !!feed } satisfies PoseRequest);
  member.joined = true;

  if (!feed) return;

  live.worker.postMessage(feed);
  settle(kind, null);
}

export function leaveOperatorCamera(kind: LandmarkKind) {
  const member = members.get(kind);

  if (!member) return;

  settle(kind, null);
  members.delete(kind);
  fresh[kind] = undefined;
  feeding.delete(kind);

  if (!members.size) return endSession();

  if (member.joined) session?.worker.postMessage({ type: 'leave', kind } satisfies PoseRequest);
}

export async function joinOperatorCamera(kind: LandmarkKind, robot: InputRobot): Promise<string | null> {
  leaveOperatorCamera(kind);

  const member: Member = { robot, joined: false, settle: null };
  const current = () => members.get(kind) === member;

  members.set(kind, member);

  const live = await liveSession();

  if (!current()) return null;

  if (!live) {
    members.delete(kind);

    return CAMERA_REFUSAL;
  }

  const ready = new Promise<string | null>((resolve) => {
    member.settle = resolve;
  });

  enter(live, kind, member);

  const refusal = await ready;

  if (refusal && current()) leaveOperatorCamera(kind);

  return refusal;
}

export function closeOperatorCamera() {
  [...members.keys()].forEach(leaveOperatorCamera);
  endSession();
}

function latest<K extends LandmarkKind>(kind: K): Follows[K] | null {
  const seen: Fresh<Follows[K]> | undefined = fresh[kind];

  if (!seen) return null;

  if (!seen.read) latency.add(wallClock() - seen.seenAt);

  seen.read = true;

  return seen.follow;
}

export const latestFollow = (): PoseFollow | null => latest('body');

export const latestHandFollow = (): HandFollow | null => latest('hand');

export const latestFaceFollow = (): FaceFollow | null => latest('face');

export const latestMarks = (kind: LandmarkKind): number[] | null => fresh[kind]?.marks ?? null;

export const handGrip = (): number | null => (members.has('hand') ? (fresh.hand?.follow.grip ?? null) : null);

function feedOperator(feed: FeedRequest) {
  feeding.add(feed.kind);

  if (!session || !members.get(feed.kind)?.joined) {
    standIns.set(feed.kind, feed);

    return;
  }

  session.worker.postMessage(feed);
  settle(feed.kind, null);
}

export const feedOperatorPose = (samples: PoseSample[], fps?: number) =>
  feedOperator({ type: 'feed', kind: 'body', samples, fps });

export const feedOperatorHand = (samples: HandSample[], fps?: number) =>
  feedOperator({ type: 'feed', kind: 'hand', samples, fps });

export const feedOperatorFace = (samples: FaceSample[], fps?: number) =>
  feedOperator({ type: 'feed', kind: 'face', samples, fps });

export function teachGestures(next: TaughtGesture[]) {
  taught = next;
  session?.worker.postMessage({ type: 'gestures', taught } satisfies PoseRequest);
}

export function recordGestureExample(ms: number): Promise<GestureExample | null> {
  example(null);

  if (!session) return Promise.resolve(null);

  const recorded = new Promise<GestureExample | null>((resolve) => {
    settleExample = resolve;
  });

  session.worker.postMessage({ type: 'record', ms } satisfies PoseRequest);

  return recorded;
}

export const operatorLatency = (): LatencyStats | null => latency.stats();

export const operatorPoints = () => points;

export const operatorFeeding = () => feeding.size > 0;

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

export const subscribeOperatorCamera = subscribe;

export const operatorCameraSnapshot = () => state;

export const useOperatorCamera = () => useSyncExternalStore(subscribe, operatorCameraSnapshot, operatorCameraSnapshot);
