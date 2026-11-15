import type { Page } from 'playwright-core';
import { afterEach, describe, beforeEach, expect, it } from 'vitest';
import type { StoredTry } from '../src/cases/tryFile';
import { raiseRightArm } from '../src/cameras/operator/fixtures/raiseRightArm';
import type { PoseSample } from '../src/cameras/operator/poseFollow';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import type { VisionManifest } from '../src/vision/manifest';
import { inputSensitiveDetectionOnnx } from '../src/vision/onnxFixture';
import type { VisionResult } from '../src/vision/types';
import { FAKE_CAMERA, openApp, shown, type App } from './harness';
import { blackWhiteVideo, recordedCameraFixture, visionManifest as manifest } from './visionFixtures';

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
  playCameraTry: (input: { stored: StoredTry; recording: number[]; video: number[] }) => Promise<boolean>;
  feedPose: (samples: PoseSample[]) => void;
  operatorCamera: () => { live: boolean };
}

const state = (page: Page = app.page) =>
  page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.cameraVisionState());

afterEach(async () => {
  await app?.close();
});

describe('desktop camera inference', () => {
  beforeEach(async () => {
    app = await openApp({}, [], { args: FAKE_CAMERA });
  });

  it('seeks a persisted camera MP4 through black and white frames and reruns ORT at the playhead', async () => {
    const fixture = await recordedCameraFixture();
    const video = await blackWhiteVideo(app.page);
    const bytes = inputSensitiveDetectionOnnx();

    await app.page.evaluate((scene) => (window as unknown as { __studio: Studio }).__studio.load(scene), fixture.scene);
    await app.page.evaluate(
      async ({ model, data }) => {
        await (window as unknown as { __studio: Studio }).__studio.configureVision(model, data, ['operator']);
      },
      { model: manifest(bytes, 'person'), data: [...bytes] },
    );

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
    await timeline.focus();
    await app.page.keyboard.press('Home');
    await expect.poll(async () => (await state()).models['operator:rfdetr-nano']?.detections.length).toBe(0);
    await expect.poll(() => tile.getByTestId('vision-box').count()).toBe(0);

    const before = (await state()).models['operator:rfdetr-nano']!.timestamp;

    await app.page.keyboard.press('End');
    await app.page.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await state()).signals['vision.operator.person']).toBe(1);
    await expect.poll(() => tile.getByTestId('vision-box').count()).toBe(1);
    expect((await state()).models['operator:rfdetr-nano']!.timestamp).toBeGreaterThan(before);
    await timeline.focus();
    await app.page.keyboard.press('Home');
    await expect.poll(async () => (await state()).models['operator:rfdetr-nano']?.detections.length).toBe(0);
    await expect.poll(async () => (await state()).signals['vision.operator.person']).toBe(0);
    expect(app.errors).toEqual([]);
  });

  it('runs Find Faces on real fake-camera pixels while the body estimator uses its pose fixture', async () => {
    const live = app;

    try {
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
    } finally {
      await live.page.keyboard.press('Escape');
    }
  });
});
