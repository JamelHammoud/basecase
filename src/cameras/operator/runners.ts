import type { InputRobot } from '../../sim/inputTypes';
import { createFaceFollower } from './faceFollow';
import { createHandFollower } from './handFollow';
import {
  loadFaceLandmarker,
  loadHandLandmarker,
  loadPoseLandmarker,
  type FaceLandmarker,
  type HandLandmarker,
  type PoseLandmarker,
} from './landmarkers';
import { createPoseFollower } from './poseFollow';
import { isSeen, type PoseLandmark } from './poseLandmarks';
import type { Delegate, FeedRequest, FollowEvent, LandmarkKind, SkeletonPoint } from './poseProtocol';

export type Picture = VideoFrame | ImageBitmap;

export interface Runner {
  run: (picture: Picture, timestamp: number, seenAt: number) => FollowEvent | null;
  close: () => void;
}

export interface Started {
  runner: Runner;
  delegate: Delegate;
}

export type WorldWatch = (world: PoseLandmark[] | null, timestamp: number) => void;

export interface Playback {
  count: number;
  at: (index: number, seenAt: number) => FollowEvent;
}

const skeleton = (marks: PoseLandmark[]): SkeletonPoint[] => marks.map((p) => [p.x, p.y, isSeen(p)]);

function sighting() {
  let seen = false;

  return (present: boolean) => {
    const lost = seen && !present;

    seen = present;

    return lost;
  };
}

function bodyRunner(landmarker: PoseLandmarker, robot: InputRobot, watch: WorldWatch): Runner {
  const follower = createPoseFollower(robot);
  const lost = sighting();

  return {
    run: (picture, timestamp, seenAt) => {
      const result = landmarker.detectForVideo(picture, timestamp);
      const world = result.worldLandmarks[0];
      const image = result.landmarks[0];

      watch(world ?? null, timestamp);

      if (!world || !image) return lost(false) ? { type: 'pose', follow: null, image: null, seenAt } : null;

      lost(true);

      return { type: 'pose', follow: follower.step({ t: timestamp, world, image }), image: skeleton(image), seenAt };
    },
    close: () => landmarker.close(),
  };
}

function handRunner(landmarker: HandLandmarker, robot: InputRobot): Runner {
  const follower = createHandFollower(robot);
  const lost = sighting();

  return {
    run: (picture, timestamp, seenAt) => {
      const result = landmarker.detectForVideo(picture, timestamp);
      const world = result.worldLandmarks[0];
      const image = result.landmarks[0];

      if (!world || !image) return lost(false) ? { type: 'hand', follow: null, seenAt } : null;

      lost(true);

      return { type: 'hand', follow: follower.step({ t: timestamp, image, world }), seenAt };
    },
    close: () => landmarker.close(),
  };
}

function faceRunner(landmarker: FaceLandmarker, robot: InputRobot): Runner {
  const follower = createFaceFollower(robot);
  const lost = sighting();

  return {
    run: (picture, timestamp, seenAt) => {
      const result = landmarker.detectForVideo(picture, timestamp);
      const image = result.faceLandmarks[0];

      if (!image) return lost(false) ? { type: 'face', follow: null, seenAt } : null;

      lost(true);

      const matrix = result.facialTransformationMatrixes?.[0]?.data ?? [];

      return { type: 'face', follow: follower.step({ t: timestamp, image, matrix }), seenAt };
    },
    close: () => landmarker.close(),
  };
}

export const RUNNERS: Record<LandmarkKind, (robot: InputRobot, watch: WorldWatch) => Promise<Started>> = {
  body: (robot, watch) =>
    loadPoseLandmarker().then(({ landmarker, delegate }) => ({
      runner: bodyRunner(landmarker, robot, watch),
      delegate,
    })),
  hand: (robot) =>
    loadHandLandmarker().then(({ landmarker, delegate }) => ({ runner: handRunner(landmarker, robot), delegate })),
  face: (robot) =>
    loadFaceLandmarker().then(({ landmarker, delegate }) => ({ runner: faceRunner(landmarker, robot), delegate })),
};

export function playback(feed: FeedRequest, robot: InputRobot): Playback {
  if (feed.kind === 'body') {
    const follower = createPoseFollower(robot);
    const { samples } = feed;

    return {
      count: samples.length,
      at: (i, seenAt) => {
        const sample = samples[i];

        return {
          type: 'pose',
          follow: follower.step(sample),
          image: sample.image ? skeleton(sample.image) : null,
          seenAt,
        };
      },
    };
  }

  if (feed.kind === 'hand') {
    const follower = createHandFollower(robot);

    return {
      count: feed.samples.length,
      at: (i, seenAt) => ({ type: 'hand', follow: follower.step(feed.samples[i]), seenAt }),
    };
  }

  const follower = createFaceFollower(robot);

  return {
    count: feed.samples.length,
    at: (i, seenAt) => ({ type: 'face', follow: follower.step(feed.samples[i]), seenAt }),
  };
}
