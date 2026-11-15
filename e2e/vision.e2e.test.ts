import type { Page } from 'playwright-core';
import { expect, inject, it } from 'vitest';
import type { StoredTry } from '../src/cases/tryFile';
import { raiseRightArm } from '../src/cameras/operator/fixtures/raiseRightArm';
import type { PoseSample } from '../src/cameras/operator/poseFollow';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import type { VisionManifest } from '../src/vision/manifest';
import { inputSensitiveDetectionOnnx } from '../src/vision/onnxFixture';
import type { VisionResult } from '../src/vision/types';
import { FAKE_CAMERA, openApp, partCount, shown, type App } from './harness';
import {
  armWithWristCamera,
  blackWhiteVideo,
  recordedCameraFixture,
  visionManifest as manifest,
} from './visionFixtures';

interface VisionState {
  assignments: Array<{ camera: string; modelId: string; fps: number }>;
  signals: Record<string, number>;
  results: Record<string, VisionResult | null>;
  models: Record<string, VisionResult | null>;
}

interface Studio {
  load: (record: unknown) => void;
  configureVision: (manifest: VisionManifest, bytes: number[], cameras: string[]) => Promise<VisionState>;
  cameraVisionState: () => VisionState;
  runCase: (id: string) => void;
  playCameraTry: (input: { stored: StoredTry; recording: number[]; video: number[] }) => Promise<boolean>;
  feedPose: (samples: PoseSample[]) => void;
  operatorCamera: () => { live: boolean };
}

const state = (page: Page) =>
  page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.cameraVisionState());

async function inApp(options: Parameters<typeof openApp>[2], run: (app: App) => Promise<void>) {
  const app = await openApp({}, [], options);

  try {
    await app.page.route('https://huggingface.co/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/octet-stream',
        body: Buffer.from(inputSensitiveDetectionOnnx()),
      }),
    );
    await run(app);
  } finally {
    await app.close();
  }
}

async function configure(page: Page, label: string, cameras: string[], id = 'rfdetr-nano') {
  const bytes = inputSensitiveDetectionOnnx();

  await page.evaluate(
    async ({ model, data, cameras }) => {
      await (window as unknown as { __studio: Studio }).__studio.configureVision(model, data, cameras);
    },
    { model: manifest(bytes, label, id), data: [...bytes], cameras },
  );
}

it('opens a shared Case with its own camera scope in the web gallery', async () => {
  await inApp({ url: inject('webUrl') }, async (app) => {
    await app.page.goto(`${inject('webUrl')}/c/rover-reach-the-flag`);
    await expect
      .poll(() =>
        app.page.evaluate(
          () => (window as unknown as { __gallery?: { state: () => { status: string } } }).__gallery?.state().status,
        ),
      )
      .toBe('ready');
    expect(app.errors).toEqual([]);
  });
});

it.each(['desktop', 'web'])('runs See Objects with real ONNX inference on the %s wrist camera', async (build) => {
  await inApp(build === 'web' ? { url: inject('webUrl') } : {}, async (app) => {
    const scene = armWithWristCamera();

    await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), scene);
    await expect.poll(() => partCount(app.page)).toBe(scene.parts.length);
    await configure(app.page, 'block', ['scene', 'wrist_camera']);
    await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.runCase('pick-up-a-block'));
    await expect.poll(async () => (await state(app.page)).signals['vision.wrist_camera.block']).toBe(1);

    const tile = app.page.locator(shown('[data-camera="wrist_camera"]')).first();
    const box = tile.getByTestId('vision-box');

    await expect.poll(() => box.count()).toBe(1);
    expect(await box.getAttribute('data-label')).toBe('block');
    expect(Number(await box.getAttribute('data-score'))).toBeGreaterThan(0.25);
    expect(Number(await box.getAttribute('data-score'))).toBeLessThanOrEqual(1);

    const result = (await state(app.page)).results.wrist_camera!;

    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    result.detections[0].box.forEach((value, index) => expect(value).toBeCloseTo([0.1, 0.2, 0.3, 0.4][index]));
    expect(app.errors).toEqual([]);
  });
});

it('clears prior camera assignments and results when a replacement scene reuses the camera name', async () => {
  await inApp({}, async (app) => {
    const scene = armWithWristCamera();

    await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), scene);
    await expect.poll(() => partCount(app.page)).toBe(scene.parts.length);
    await configure(app.page, 'previous', ['wrist_camera'], 'previous-model');
    await expect.poll(async () => (await state(app.page)).signals['vision.wrist_camera.previous']).toBe(1);
    await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
      ...scene,
      name: 'Replacement Wrist Camera',
    });
    await expect
      .poll(async () => (await state(app.page)).assignments.some(({ modelId }) => modelId === 'previous-model'))
      .toBe(false);

    const cleared = await state(app.page);

    expect(cleared.models['wrist_camera:previous-model']).toBeUndefined();
    expect(cleared.signals['vision.wrist_camera.previous']).toBeUndefined();
    expect(cleared.results.wrist_camera?.detections.some(({ label }) => label === 'previous')).not.toBe(true);
    await configure(app.page, 'replacement', ['wrist_camera'], 'replacement-model');
    await expect.poll(async () => (await state(app.page)).signals['vision.wrist_camera.replacement']).toBe(1);

    const replacement = await state(app.page);

    expect(replacement.models['wrist_camera:replacement-model']?.detections.map(({ label }) => label)).toEqual([
      'replacement',
    ]);
    expect(replacement.signals['vision.wrist_camera.previous']).toBeUndefined();
    expect(app.errors).toEqual([]);
  });
});

it('seeks a persisted camera MP4 through black and white frames and reruns ORT at the playhead', async () => {
  await inApp({}, async (app) => {
    const fixture = await recordedCameraFixture();
    const video = await blackWhiteVideo(app.page);

    await app.page.evaluate((scene) => (window as unknown as { __studio: Studio }).__studio.load(scene), fixture.scene);
    expect(
      await app.page.evaluate((input) => (window as unknown as { __studio: Studio }).__studio.playCameraTry(input), {
        stored: fixture.stored,
        recording: fixture.recording,
        video: [...video],
      }),
    ).toBe(true);

    const timeline = app.page.getByTestId('try-timeline');
    const tile = app.page.locator(shown('[data-camera="operator"]')).first();

    await timeline.waitFor();
    await configure(app.page, 'person', ['operator']);
    await timeline.focus();
    await app.page.keyboard.press('Home');
    await expect.poll(async () => (await state(app.page)).models['operator:rfdetr-nano']?.detections.length).toBe(0);
    await expect.poll(() => tile.getByTestId('vision-box').count()).toBe(0);

    const before = (await state(app.page)).models['operator:rfdetr-nano']!.timestamp;

    await app.page.keyboard.press('End');
    await app.page.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await state(app.page)).signals['vision.operator.person']).toBe(1);
    await expect.poll(() => tile.getByTestId('vision-box').count()).toBe(1);
    expect((await state(app.page)).models['operator:rfdetr-nano']!.timestamp).toBeGreaterThan(before);
    await timeline.focus();
    await app.page.keyboard.press('Home');
    await expect.poll(async () => (await state(app.page)).models['operator:rfdetr-nano']?.detections.length).toBe(0);
    await expect.poll(async () => (await state(app.page)).signals['vision.operator.person']).toBe(0);
    expect(app.errors).toEqual([]);
  });
});

it('runs Find Faces on real fake-camera pixels while the body estimator uses its pose fixture', async () => {
  const live = await openApp({}, [], { args: FAKE_CAMERA });

  try {
    const robot = fixtureRobots().find((candidate) => candidate.id === 'arm-3dof')!;
    const bytes = inputSensitiveDetectionOnnx();

    await live.page.evaluate((scene) => (window as unknown as { __studio: Studio }).__studio.load(scene), {
      name: 'Live Faces',
      parts: robot.parts,
      project: { ...DEFAULT_PROJECT, joints: robot.joints },
    });
    await expect.poll(() => partCount(live.page)).toBe(robot.parts.length);
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
  } finally {
    await live.close();
  }
});
