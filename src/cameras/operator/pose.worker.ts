/// <reference lib="webworker" />
import type { InputRobot } from '../../sim/inputTypes';
import { createGestureTap } from '../gestures/gestureTap';
import {
  FEED_FPS,
  wallClock,
  type FeedRequest,
  type LandmarkKind,
  type PoseEvent,
  type PoseRequest,
} from './poseProtocol';
import { playback, RUNNERS, type Picture, type Runner } from './runners';
import { createFrameQueue } from './workerFrames';

interface Lane {
  robot: InputRobot;
  runner: Runner | null;
  fed: boolean;
  feedTimer: ReturnType<typeof setTimeout> | null;
}

const scope = self as unknown as DedicatedWorkerGlobalScope;
const lanes = new Map<LandmarkKind, Lane>();

let lastTimestamp = 0;
let closed = false;
let fedUntil = 0;

const post = (event: PoseEvent) => scope.postMessage(event);

const gestures = createGestureTap(post);

const fail = (e: unknown, kind?: LandmarkKind) =>
  post({ type: 'error', ...(kind ? { kind } : {}), message: e instanceof Error ? e.message : String(e) });

const detecting = (lane: Lane): lane is Lane & { runner: Runner } => !!lane.runner && !lane.fed;

function detect(picture: Picture, seenAt: number) {
  lastTimestamp = Math.max(performance.now(), lastTimestamp + 1);

  for (const [kind, lane] of lanes) {
    if (!detecting(lane)) continue;

    try {
      const event = lane.runner.run(picture, lastTimestamp, seenAt);

      if (event) post(event);
    } catch (e) {
      fail(e, kind);
    }
  }
}

const frames = createFrameQueue({
  wanted: () => !closed && [...lanes.values()].some(detecting),
  detect,
  fail: (e) => fail(e),
});

function stopFeed(lane: Lane) {
  if (lane.feedTimer !== null) clearTimeout(lane.feedTimer);

  lane.feedTimer = null;
}

function leave({ kind }: { kind: LandmarkKind }) {
  const lane = lanes.get(kind);

  if (!lane) return;

  lanes.delete(kind);
  stopFeed(lane);
  lane.runner?.close();
}

function join({ kind, robot, standIn }: Extract<PoseRequest, { type: 'join' }>) {
  leave({ kind });

  const lane: Lane = { robot, runner: null, fed: !!standIn, feedTimer: null };

  lanes.set(kind, lane);

  if (lane.fed) return;

  RUNNERS[kind](robot, gestures.step).then(
    ({ runner, delegate }) => {
      if (closed || lanes.get(kind) !== lane || lane.fed) return runner.close();

      lane.runner = runner;
      post({ type: 'ready', kind, delegate });
    },
    (e) => fail(e, kind),
  );
}

function fedGestures(request: FeedRequest, interval: number) {
  if (request.kind !== 'body') return () => undefined;

  const { samples } = request;
  const from = Math.max(performance.now(), fedUntil) - (samples[0]?.t ?? 0);

  return (index: number) => {
    const { t, world } = samples[index];

    fedUntil = from + t + interval;
    gestures.step(world, from + t);
  };
}

function feed(request: FeedRequest) {
  const { kind } = request;
  const lane = lanes.get(kind);

  if (!lane) return fail(new Error('The camera is closed.'), kind);

  stopFeed(lane);
  lane.fed = true;
  lane.runner?.close();
  lane.runner = null;

  const played = playback(request, lane.robot);
  const interval = 1000 / (request.fps ?? FEED_FPS);
  const watch = fedGestures(request, interval);
  let next = 0;
  const step = () => {
    lane.feedTimer = null;

    if (closed || lanes.get(kind) !== lane) return;

    if (next >= played.count) return post({ type: 'fed', kind });

    const seenAt = wallClock();
    const index = next++;

    lane.feedTimer = setTimeout(step, interval);

    try {
      watch(index);
      post(played.at(index, seenAt));
    } catch (e) {
      fail(e, kind);
    }
  };

  step();
}

function close() {
  closed = true;
  [...lanes.keys()].forEach((kind) => leave({ kind }));
  frames.stop();
  gestures.stop();
  scope.close();
}

const handlers: { [K in PoseRequest['type']]: (msg: Extract<PoseRequest, { type: K }>) => void } = {
  open: ({ frames: stream }) => {
    if (stream) frames.pump(stream).catch((e: unknown) => fail(e));
  },
  join,
  leave,
  frame: ({ bitmap }) => frames.take(bitmap),
  feed: (request) => {
    try {
      feed(request);
    } catch (e) {
      fail(e, request.kind);
    }
  },
  gestures: ({ taught }) => gestures.teach(taught),
  record: ({ ms }) => gestures.record(ms),
  close,
};

scope.onmessage = (ev: MessageEvent<PoseRequest>) => {
  const msg = ev.data;

  (handlers[msg.type] as (m: PoseRequest) => void)(msg);
};
