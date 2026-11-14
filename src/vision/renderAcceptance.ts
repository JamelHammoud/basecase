import type { CameraTrainingFrame, CameraTrainingRequest, TrainingKeypoint } from '../cameras/trainingTypes';
import { cameraFeed, type CameraFeed } from '../cameras/viewsClient';
import type { CameraView } from '../cameras/views';
import { box } from '../sim/fixtures/parts';
import type { ScenePart } from '../types/robotics';
import { annotationFromInstances } from './imageMasks';
import { acceptanceBlock, acceptanceView, landmarkPlan } from './renderAcceptanceScene';
import { labelledFrame } from './trainingImages';

export interface TrainingAcceptanceResult {
  bounds?: Record<string, number[] | null>;
  depthSamples?: number[][];
  hiddenAnnotations?: number;
  points?: TrainingKeypoint[];
  annotatedInstances?: string[];
  identical?: { jpeg: boolean; instances: boolean; depth: boolean; keypoints: boolean };
  differentSeedChangesImage?: boolean;
}

export type TrainingAcceptanceKind = 'geometry' | 'fisheye' | 'keypoints' | 'repeatability';

const request = (seed = 17): CameraTrainingRequest => ({
  poses: null,
  key: acceptanceView.key,
  width: 640,
  height: 480,
  seed,
  keypoints: [],
});

async function capture(feed: CameraFeed, parts: ScenePart[], view = acceptanceView, job = request()) {
  await feed.load({ parts, world: [], model: null, views: [view] });

  return feed.training(job);
}

function annotation(raw: CameraTrainingFrame, instance: string) {
  const id = raw.instances.find((entry) => entry.instance === instance)?.id;

  return id ? annotationFromInstances({ ...raw, instance, instanceId: id, classId: 0 }) : null;
}

function bounds(raw: CameraTrainingFrame, instance = 'target'): number[] | null {
  const label = annotation(raw, instance);

  if (!label) return null;

  const [x, y, width, height] = label.box;

  return [x, y, x + width, y + height];
}

function depthSamples(frame: CameraTrainingFrame): number[][] {
  const id = frame.instances.find((entry) => entry.instance === 'target')!.id;

  return Array.from(frame.instanceIds).flatMap((value, pixel) =>
    value === id ? [[pixel % frame.width, Math.floor(pixel / frame.width), frame.depth[pixel]]] : [],
  );
}

async function geometry(feed: CameraFeed): Promise<TrainingAcceptanceResult> {
  const target = acceptanceBlock();
  const baseline = await capture(feed, [target]);
  const occluder = box('occluder', [-100, 150, 200], [200, 200, 100], 100);
  const partial = await capture(feed, [target, occluder]);
  const hidden = await capture(feed, [target, { ...occluder, position: [0, 150, 200] }]);

  return {
    bounds: { target: bounds(baseline), partial: bounds(partial), hidden: bounds(hidden) },
    depthSamples: depthSamples(baseline),
    hiddenAnnotations: annotation(hidden, target.id) ? 1 : 0,
  };
}

async function fisheye(feed: CameraFeed): Promise<TrainingAcceptanceResult> {
  const view: CameraView = { ...acceptanceView, lens: { model: 'fisheye', fovDeg: 180 } };
  const job = {
    ...request(),
    keypoints: [{ instance: 'target', name: 'front', position: [300, 150, 50] as [number, number, number] }],
  };
  const frame = await capture(feed, [acceptanceBlock(300)], view, job);

  return { bounds: { target: bounds(frame) }, points: frame.keypoints };
}

async function keypoints(feed: CameraFeed): Promise<TrainingAcceptanceResult> {
  const plan = landmarkPlan();

  await feed.load(plan);

  const raw = await feed.training({ ...request(), keypoints: plan.keypoints });
  const frame = await labelledFrame(plan, 0, raw);

  return { points: raw.keypoints, annotatedInstances: frame.annotations.map((label) => label.instance) };
}

function sameBytes(a: ArrayBufferView, b: ArrayBufferView): boolean {
  const left = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  const right = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);

  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function repeatability(feed: CameraFeed): Promise<TrainingAcceptanceResult> {
  await feed.load({ parts: [acceptanceBlock()], world: [], model: null, views: [acceptanceView] });

  const job = {
    ...request(),
    randomization: { lighting: 1, textures: 1, colors: 0.5, noise: 0.01, cameraPositionMm: 5, lensDeg: 2 },
    keypoints: [{ instance: 'target', name: 'front', position: [0, 150, 50] as [number, number, number] }],
  };
  const first = await feed.training(job);
  const other = await feed.training({ ...job, seed: 18 });
  const second = await feed.training(job);

  return {
    identical: {
      jpeg: sameBytes(first.jpeg, second.jpeg),
      instances: sameBytes(first.instanceIds, second.instanceIds),
      depth: sameBytes(first.depth, second.depth),
      keypoints: JSON.stringify(first.keypoints) === JSON.stringify(second.keypoints),
    },
    differentSeedChangesImage: !sameBytes(first.jpeg, other.jpeg),
  };
}

export async function trainingLabelFixture(kind: TrainingAcceptanceKind): Promise<TrainingAcceptanceResult> {
  const feed = cameraFeed();
  const cases = { geometry, fisheye, keypoints, repeatability };

  try {
    return await cases[kind](feed);
  } finally {
    feed.dispose();
  }
}
