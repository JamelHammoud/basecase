import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { VisionResult } from '../src/vision/protocol';
import { openApp, openPlayTab, shown, type App } from './harness';
import { visionScene, wristVisionScene } from './visionFixture';

let app: App;

type VisionStudio = {
  load: (scene: unknown) => void;
  visionTestModel: (label?: string) => Promise<unknown>;
  simState: () => { drive: string };
  visionState: () => { feeds: number; results: VisionResult[]; error: string | null };
};

beforeAll(async () => {
  app = await openApp();
  await app.page.evaluate(() => (window as unknown as { __studio: VisionStudio }).__studio.visionTestModel());
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('camera vision', () => {
  it('opens Pick Up a Block with a wrist camera and publishes detected object counts into its console', async () => {
    await app.page.evaluate(async (scene) => {
      const studio = (window as unknown as { __studio: VisionStudio }).__studio;

      await studio.visionTestModel('block');
      studio.load(scene);
    }, wristVisionScene());
    await openPlayTab(app.page, 'Cases');
    await app.page.locator(shown('[data-testid="cases-panel"] button'), { hasText: 'Pick Up a Block' }).first().click();
    await app.page.keyboard.press('Meta+k');
    await app.page.keyboard.type('Run Case');
    await app.page.locator(shown('button[data-idx="0"]'), { hasText: 'Run Case' }).waitFor();
    await app.page.keyboard.press('Enter');
    await app.page
      .locator(shown('button'), { hasText: /^Try It$/ })
      .first()
      .click();
    await expect
      .poll(() => app.page.evaluate(() => (window as unknown as { __studio: VisionStudio }).__studio.simState().drive))
      .toBe('on');
    await expect
      .poll(() => app.page.locator('[data-camera="wrist"] [data-testid="vision-box"]').count())
      .toBeGreaterThan(0);
    await expect.poll(() => app.page.locator('[data-signal="vision.wrist.block.count"]').innerText()).toBe('1');
    expect(
      (await app.page.evaluate(() => (window as unknown as { __studio: VisionStudio }).__studio.visionState())).feeds,
    ).toBe(1);
    await app.page.keyboard.press('Escape');
  });

  it('runs an image-dependent ONNX model on the rendered frame and overlays its detections', async () => {
    await app.page.evaluate(() => (window as unknown as { __studio: VisionStudio }).__studio.visionTestModel());
    await app.page.evaluate(
      (scene) => (window as unknown as { __studio: VisionStudio }).__studio.load(scene),
      visionScene('#ffffff'),
    );
    await expect.poll(() => app.page.getByTestId('vision-box').count()).toBeGreaterThan(0);
    expect(await app.page.getByTestId('vision-box').first().getAttribute('data-label')).toBe('person');

    const first = await app.page.evaluate(() =>
      (window as unknown as { __studio: VisionStudio }).__studio.visionState(),
    );

    expect(first.error).toBeNull();
    expect(first.results[0].camera).toBe('camera');
    expect(first.results[0].elapsedMs).toBeGreaterThan(0);
    await app.page.evaluate(
      (scene) => (window as unknown as { __studio: VisionStudio }).__studio.load(scene),
      visionScene('#000000'),
    );
    await expect
      .poll(() =>
        app.page.evaluate(
          () => (window as unknown as { __studio: VisionStudio }).__studio.visionState().results[0]?.detections,
        ),
      )
      .toEqual([]);
    expect(await app.page.getByTestId('vision-box').count()).toBe(0);
    expect(app.errors).toEqual([]);
  });
});
