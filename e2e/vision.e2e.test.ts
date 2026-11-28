import { afterEach, expect, it } from 'vitest';
import { raiseRightArm } from '../src/cameras/operator/fixtures/raiseRightArm';
import type { PoseSample } from '../src/cameras/operator/poseFollow';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import type { VisionManifest } from '../src/vision/manifest';
import { inputSensitiveDetectionOnnx } from '../src/vision/onnxFixture';
import { FAKE_CAMERA, openApp, type App } from './harness';
import { visionManifest as manifest } from './visionFixtures';
import { operatorOverlayState, type VisionState } from './visionOverlay';

let app: App;

interface Studio {
  load: (record: unknown) => void;
  configureVision: (manifest: VisionManifest, bytes: number[], cameras: string[]) => Promise<VisionState>;
  feedPose: (samples: PoseSample[]) => void;
  operatorCamera: () => { live: boolean };
}

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

  const overlay = await live.page.waitForFunction(operatorOverlayState, true, { timeout: 10000 });
  const observed = await overlay.jsonValue();

  await overlay.dispose();
  expect(observed).toMatchObject({
    vision: {
      signals: { 'vision.operator.face': 1 },
      models: { 'operator:yunet': { modelId: 'yunet', width: 640, height: 480 } },
    },
    visibleTiles: 1,
    visibleFaces: 1,
  });
  expect(live.errors).toEqual([]);
});
