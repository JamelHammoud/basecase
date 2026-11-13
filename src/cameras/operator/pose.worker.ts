/// <reference lib="webworker" />
import type { InputRobot } from '../../sim/inputTypes';
import { createPoseFollower, type PoseFollower, type PoseSample } from './poseFollow';
import { loadPoseEstimator, type PoseLandmarker } from './poseEstimator';
import { isSeen, type PoseLandmark } from './poseLandmarks';
import { FEED_FPS, wallClock, type PoseEvent, type PoseRequest, type SkeletonPoint } from './poseProtocol';

type Picture = VideoFrame | ImageBitmap;

const scope = self as unknown as DedicatedWorkerGlobalScope;

let robot: InputRobot | null = null;
let follower: PoseFollower | null = null;
let estimator: PoseLandmarker | null = null;
let reader: ReadableStreamDefaultReader<VideoFrame> | null = null;
let latest: { picture: Picture; seenAt: number } | null = null;
let scheduled = false;
let fed = false;
let feedTimer: ReturnType<typeof setTimeout> | null = null;
let lastTimestamp = 0;
let seenPerson = false;
let closed = false;
let loading = false;

const post = (event: PoseEvent) => scope.postMessage(event);

const fail = (e: unknown) => post({ type: 'error', message: e instanceof Error ? e.message : String(e) });

const skeleton = (marks: PoseLandmark[]): SkeletonPoint[] => marks.map((p) => [p.x, p.y, isSeen(p)]);

function dropLatest() {
  latest?.picture.close();
  latest = null;
}

function detect(picture: Picture, seenAt: number) {
  if (!estimator || !follower) return;

  lastTimestamp = Math.max(performance.now(), lastTimestamp + 1);

  const result = estimator.detectForVideo(picture, lastTimestamp);
  const world = result.worldLandmarks[0];
  const marks = result.landmarks[0];

  const lost = seenPerson && (!world || !marks);

  seenPerson = !!world && !!marks;

  if (lost) post({ type: 'pose', follow: null, image: null, seenAt });

  if (!world || !marks) return;

  post({
    type: 'pose',
    follow: follower.step({ t: lastTimestamp, world, image: marks }),
    image: skeleton(marks),
    seenAt,
  });
}

function detectLatest() {
  scheduled = false;

  const frame = latest;

  latest = null;

  if (!frame) return;

  try {
    if (!fed) detect(frame.picture, frame.seenAt);
  } catch (e) {
    fail(e);
  } finally {
    frame.picture.close();
  }
}

function loadEstimator() {
  loading = true;
  loadPoseEstimator().then(({ landmarker, delegate }) => {
    if (closed || fed) return landmarker.close();

    estimator = landmarker;
    post({ type: 'ready', delegate });
  }, fail);
}

function take(picture: Picture) {
  const seenAt = wallClock();

  if (!estimator && !fed && !loading) loadEstimator();

  if (fed || !estimator || closed) return picture.close();

  dropLatest();
  latest = { picture, seenAt };

  if (scheduled) return;

  scheduled = true;
  setTimeout(detectLatest, 0);
}

async function pump(frames: ReadableStream<VideoFrame>) {
  reader = frames.getReader();

  for (;;) {
    const { value, done } = await reader.read();

    if (done) return;

    take(value);
  }
}

function stopFeed() {
  if (feedTimer !== null) clearTimeout(feedTimer);

  feedTimer = null;
}

function feed(samples: PoseSample[], fps = FEED_FPS) {
  stopFeed();

  if (!robot) return fail(new Error('The camera is closed.'));

  fed = true;
  dropLatest();
  estimator?.close();
  estimator = null;

  const following = createPoseFollower(robot);
  let next = 0;
  const step = () => {
    const sample = samples[next++];

    feedTimer = null;

    if (!sample || closed) return;

    const seenAt = wallClock();

    feedTimer = setTimeout(step, 1000 / fps);

    try {
      post({
        type: 'pose',
        follow: following.step(sample),
        image: sample.image ? skeleton(sample.image) : null,
        seenAt,
      });
    } catch (e) {
      fail(e);
    }
  };

  follower = following;
  step();
}

function open(msg: Extract<PoseRequest, { type: 'open' }>) {
  robot = msg.robot;
  follower = createPoseFollower(msg.robot);

  if (msg.frames) pump(msg.frames).catch(fail);

  fed = !!msg.standIn;
}

function close() {
  closed = true;
  stopFeed();
  dropLatest();
  void reader?.cancel().catch(() => undefined);
  estimator?.close();
  estimator = null;
  scope.close();
}

const handlers: { [K in PoseRequest['type']]: (msg: Extract<PoseRequest, { type: K }>) => void } = {
  open,
  frame: ({ bitmap }) => take(bitmap),
  feed: ({ samples, fps }) => {
    try {
      feed(samples, fps);
    } catch (e) {
      fail(e);
    }
  },
  close,
};

scope.onmessage = (ev: MessageEvent<PoseRequest>) => {
  const msg = ev.data;

  (handlers[msg.type] as (m: PoseRequest) => void)(msg);
};
