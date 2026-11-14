import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lensPoint, type Lens } from '../src/cameras/lens';
import type { ScenePart } from '../src/types/robotics';
import type { V3 } from '../src/utils/kinematics';
import {
  restoreFrame,
  type StoredVisionFrame,
  type VisionAnnotation,
  type VisionFrameSet,
} from '../src/vision/frameSet';
import type { MakeImagesJob } from '../src/vision/makeImages';
import { box } from '../src/sim/fixtures/parts';
import { openApp, type App } from './harness';
import { resolveImageScene } from '../src/vision/imageScene';
import {
  boxTrainingJob,
  hexapodTrainingJob,
  meshTrainingJob,
  roverPersonTrainingJob,
  trainingView,
} from './trainingImageFixtures';

let app: App;

type RenderedSet = Omit<VisionFrameSet, 'frames'> & { frames: StoredVisionFrame[] };

type Studio = { renderTrainingFixture: (job: MakeImagesJob) => Promise<RenderedSet> };

beforeAll(async () => {
  app = await openApp();
}, 120000);
afterAll(async () => {
  await app?.close();
});

const render = (job: MakeImagesJob) =>
  app.page.evaluate(
    async (input) =>
      (await (window as unknown as { __studio: Studio }).__studio.renderTrainingFixture(input)) as RenderedSet,
    job,
  );

function pixel(point: V3, frame: Pick<StoredVisionFrame, 'camera' | 'width' | 'height'>): [number, number] {
  const camera = new THREE.PerspectiveCamera();

  camera.position.set(...frame.camera.position);
  camera.up.set(...frame.camera.up);
  camera.lookAt(...frame.camera.target);
  camera.updateMatrixWorld();

  const local = new THREE.Vector3(...point).applyMatrix4(camera.matrixWorldInverse);
  const image = lensPoint(frame.camera.lens, local.toArray() as V3, frame.width / frame.height)!;

  return [((image[0] + 1) * frame.width) / 2, ((1 - image[1]) * frame.height) / 2];
}

function maskAt(annotation: VisionAnnotation, x: number, y: number): number {
  const target = Math.floor(x) * annotation.mask.size[0] + Math.floor(y);
  let cursor = 0;

  for (const [index, run] of annotation.mask.counts.entries()) {
    cursor += run;

    if (target < cursor) return index % 2;
  }

  return 0;
}

function projectedBox(part: ScenePart, frame: Pick<StoredVisionFrame, 'camera' | 'width' | 'height'>): number[] {
  const points = [-1, 1].flatMap((x) =>
    [-1, 1].flatMap((y) =>
      [-1, 1].map((z) =>
        pixel(
          [
            part.position[0] + (x * part.dimensions.width) / 2,
            part.position[1] + (y * part.dimensions.height) / 2,
            part.position[2] + (z * part.dimensions.depth) / 2,
          ],
          frame,
        ),
      ),
    ),
  );

  return [
    Math.min(...points.map((p) => p[0])),
    Math.min(...points.map((p) => p[1])),
    Math.max(...points.map((p) => p[0])),
    Math.max(...points.map((p) => p[1])),
  ];
}

describe('training image rendering', () => {
  it('keeps all 500 visible box bounds within one pixel of independent corner projection', async () => {
    const job = boxTrainingJob();
    const set = await render(job);
    const frame = set.frames[0];

    expect(frame.annotations).toHaveLength(500);

    for (const part of job.parts) {
      const label = frame.annotations.find((annotation) => annotation.partId === part.id)!;
      const [x, y, w, h] = label.bbox;
      const actual = [x, y, x + w, y + h];
      const expected = projectedBox(part, frame);

      actual.forEach((value, index) => expect(Math.abs(value - expected[index])).toBeLessThanOrEqual(1));
    }
  });

  it.each<Lens>([
    { model: 'pinhole', hfovDeg: 60 },
    { model: 'fisheye', fovDeg: 180 },
  ])(
    'captures mesh holes, person silhouettes, leg tips, occlusion and millimetre depth through $model',
    async (lens) => {
      const { job, points } = meshTrainingJob();
      const invisible = { ...box('invisible', [-279, 1000, 150], [150, 150, 80], 1), visible: false };
      const hidden = box('occluded', [-650, 1000, 0], [70, 70, 70], 1);
      const blocker = box('blocker', [-650, 1000, 100], [180, 180, 80], 1);
      const partial = box('partial', [650, 1000, 0], [120, 120, 80], 1);
      const cover = box('cover', [710, 1000, 100], [120, 180, 80], 1);
      const input = {
        ...job,
        parts: [...job.parts, invisible, hidden, blocker, partial, cover],
        views: [{ ...trainingView, lens }],
      };
      const set = await render(input);
      const stored = set.frames[0];
      const frame = restoreFrame(stored);
      const byPart = new Map(frame.annotations.map((annotation) => [annotation.partId, annotation]));
      const cup = byPart.get('mug')!;
      const person = byPart.get('person')!;

      expect(byPart.has('occluded')).toBe(false);
      expect(byPart.has('invisible')).toBe(false);
      expect(byPart.get('partial')!.bbox[2]).toBeLessThan(
        projectedBox(partial, stored)[2] - projectedBox(partial, stored)[0],
      );
      expect(maskAt(cup, ...pixel(points.mug.hole, stored))).toBe(0);
      expect(maskAt(cup, ...pixel(points.mug.handle, stored))).toBe(1);
      expect(maskAt(person, ...pixel(points.person.gap, stored))).toBe(0);
      expect(maskAt(person, ...pixel(points.person.toe, stored))).toBe(1);
      expect(person.keypoints.head.visibility).toBe(2);
      expect(person.keypoints.hidden.visibility).toBe(1);
      expect(person.keypoints.toe.visibility).toBe(2);
      expect(cup.polygons.length).toBeGreaterThan(1);
      expect(cup.keypoints.handle.visibility).toBe(2);

      const handle = pixel(points.mug.handle, stored);

      expect(Math.abs(cup.keypoints.handle.x - handle[0])).toBeLessThanOrEqual(1);
      expect(Math.abs(cup.keypoints.handle.y - handle[1])).toBeLessThanOrEqual(1);

      const [px, py] = pixel(points.mug.body, stored);
      const depth = frame.depth[Math.floor(py) * frame.width + Math.floor(px)];
      const expectedDepth = new THREE.Vector3(...points.mug.body).distanceTo(
        new THREE.Vector3(...frame.camera.position),
      );

      expect(Math.abs(depth - expectedDepth)).toBeLessThanOrEqual(5);

      const repeated = await render(input);

      expect(repeated.id).toBe(set.id);
      expect(repeated.frames[0].image).toBe(stored.image);
      expect(repeated.frames[0].depth).toBe(stored.depth);
      expect(repeated.frames[0].annotations).toEqual(stored.annotations);
    },
  );

  it('labels a person from a rover front camera and all six hexapod foot tips from overhead', async () => {
    const rover = await render(roverPersonTrainingJob());

    expect(rover.frames[0].camera.key).toBe('front');
    expect(rover.frames[0].annotations).toHaveLength(1);
    expect(rover.frames[0].annotations[0].partId).toBe('person');

    const job = hexapodTrainingJob();
    const hexapod = await render(job);
    const frame = hexapod.frames[0];
    const tips = frame.annotations.filter((annotation) => annotation.keypoints.tip);
    const expected = resolveImageScene(job).instances.filter((instance) => instance.keypoints.tip);

    expect(tips).toHaveLength(6);

    for (const tip of tips) {
      const point = expected.find((instance) => instance.partId === tip.partId)!.keypoints.tip;
      const projected = pixel(point, frame);

      expect(tip.keypoints.tip.visibility).toBe(1);
      expect(Math.abs(tip.keypoints.tip.x - projected[0])).toBeLessThanOrEqual(1);
      expect(Math.abs(tip.keypoints.tip.y - projected[1])).toBeLessThanOrEqual(1);
    }
  });
});
