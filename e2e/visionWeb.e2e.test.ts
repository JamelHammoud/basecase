import { expect, inject, it } from 'vitest';
import type { VisionResult } from '../src/vision/protocol';
import { exposeTestHooks, launchChrome } from './harness';
import { visionScene } from './visionFixture';

interface WebVisionStudio {
  load: (scene: unknown) => void;
  visionTestModel: () => Promise<unknown>;
  simState: () => { status: string };
  visionState: () => { results: VisionResult[]; error: string | null };
}

it('runs See Objects in the web build with the same ONNX worker', async () => {
  const browser = await launchChrome();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  try {
    await exposeTestHooks(page);
    await page.route('**/gallery/*.json', (route) => route.fulfill({ status: 404, body: '' }));
    await page.goto(inject('webUrl'));
    await page.waitForFunction(() => Boolean((window as unknown as { __studio?: WebVisionStudio }).__studio));
    expect(
      await page.evaluate(() => (window as unknown as { __studio: WebVisionStudio }).__studio.simState().status),
    ).toBe('off');
    await page.evaluate(async (scene) => {
      const studio = (window as unknown as { __studio: WebVisionStudio }).__studio;

      await studio.visionTestModel();
      studio.load(scene);
    }, visionScene('#ffffff'));
    await expect.poll(() => page.getByTestId('vision-box').count()).toBeGreaterThan(0);
    expect(await page.getByTestId('vision-box').first().getAttribute('data-label')).toBe('person');
    expect(
      await page.evaluate(() => (window as unknown as { __studio: WebVisionStudio }).__studio.visionState().error),
    ).toBeNull();
    await page.evaluate(
      (scene) => (window as unknown as { __studio: WebVisionStudio }).__studio.load(scene),
      visionScene('#000000'),
    );
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { __studio: WebVisionStudio }).__studio.visionState().results[0]?.detections,
        ),
      )
      .toEqual([]);
    expect(await page.getByTestId('vision-box').count()).toBe(0);
  } finally {
    await browser.close();
  }
});
