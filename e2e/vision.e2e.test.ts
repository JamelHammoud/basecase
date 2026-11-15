import type { Page } from 'playwright-core';
import { afterEach, expect, inject, it } from 'vitest';
import { raiseRightArm } from '../src/cameras/operator/fixtures/raiseRightArm';
import type { PoseSample } from '../src/cameras/operator/poseFollow';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import type { VisionManifest } from '../src/vision/manifest';
import { inputSensitiveDetectionOnnx } from '../src/vision/onnxFixture';
import type { VisionResult } from '../src/vision/types';
import { FAKE_CAMERA, exposeTestHooks, launchChrome, openApp, partCount, shown, type App } from './harness';
import { simulatedCameraFixture, visionManifest as manifest } from './visionFixtures';

let app: App;

interface VisionState {
  signals: Record<string, number>;
  results: Record<string, VisionResult | null>;
  models: Record<string, VisionResult | null>;
}

interface Studio {
  load: (record: unknown) => void;
  configureVision: (manifest: VisionManifest, bytes: number[], cameras: string[]) => Promise<VisionState>;
  cameraVisionState: () => VisionState;
  feedPose: (samples: PoseSample[]) => void;
  operatorCamera: () => { live: boolean };
}

const state = (page: Page = app.page) =>
  page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.cameraVisionState());

afterEach(async () => {
  await app?.close();
});

it('runs Find Faces on real fake-camera pixels while the body estimator uses its pose fixture', async () => {
  const live = await openApp({}, [], { args: FAKE_CAMERA });

  app = live;

  const robot = fixtureRobots().find((candidate) => candidate.id === 'arm-3dof')!;
  const bytes = inputSensitiveDetectionOnnx();

  await live.page.evaluate((scene) => (window as unknown as { __studio: Studio }).__studio.load(scene), {
    name: 'Live Faces',
    parts: robot.parts,
    project: { ...DEFAULT_PROJECT, joints: robot.joints },
  });
  await live.page.evaluate(
    async ({ model, data, samples }) => {
      const studio = (window as unknown as { __studio: Studio }).__studio;

      await studio.configureVision(model, data, ['operator']);
      studio.feedPose(samples);
    },
    { model: manifest(bytes, 'face', 'yunet'), data: [...bytes], samples: raiseRightArm() },
  );
  await live.page.keyboard.press('ControlOrMeta+k');
  await live.page.keyboard.type('Drive with Camera');
  await live.page.keyboard.press('Enter');
  await expect
    .poll(async () =>
      live.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.operatorCamera().live),
    )
    .toBe(true);
  await expect.poll(async () => (await state(live.page)).signals['vision.operator.face']).toBe(1);

  const result = (await state(live.page)).models['operator:yunet']!;

  expect(result.modelId).toBe('yunet');
  expect(result.width).toBe(640);
  expect(result.height).toBe(480);
  await expect
    .poll(() =>
      live.page.locator(shown('[data-camera="operator"] [data-testid="vision-box"][data-label="face"]')).count(),
    )
    .toBe(1);
  expect(live.errors).toEqual([]);
});

it('publishes rendered camera detections, boxes and signals in the web studio', async () => {
  const browser = await launchChrome();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors: string[] = [];

  app = { page, errors, posts: [], requests: [], close: () => browser.close() };
  page.on('pageerror', (error) => errors.push(error.message));
  await exposeTestHooks(page);
  await page.goto(inject('webUrl'));
  await page.waitForFunction(() => Boolean((window as unknown as { __studio?: unknown }).__studio));

  const scene = simulatedCameraFixture();
  const bytes = inputSensitiveDetectionOnnx();

  await page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), scene);
  await expect.poll(() => partCount(page)).toBe(scene.parts.length);
  await page.evaluate(
    async ({ model, data }) => {
      await (window as unknown as { __studio: Studio }).__studio.configureVision(model, data, ['target_camera']);
    },
    { model: manifest(bytes, 'block'), data: [...bytes] },
  );
  await expect.poll(async () => (await state(page)).signals['vision.target_camera.block']).toBe(1);

  const box = page.locator(shown('[data-camera="target_camera"]')).first().getByTestId('vision-box');

  await expect.poll(() => box.count()).toBe(1);
  expect(await box.getAttribute('data-label')).toBe('block');
  expect(Number(await box.getAttribute('data-score'))).toBeGreaterThan(0.25);
  expect(Number(await box.getAttribute('data-score'))).toBeLessThanOrEqual(1);

  const result = (await state(page)).results.target_camera!;

  expect(result.width).toBeGreaterThan(0);
  expect(result.height).toBeGreaterThan(0);
  result.detections[0].box.forEach((value, index) => expect(value).toBeCloseTo([0.1, 0.2, 0.3, 0.4][index]));
  expect(errors).toEqual([]);
});
