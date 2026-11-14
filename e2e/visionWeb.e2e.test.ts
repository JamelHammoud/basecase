import { expect, inject, it } from 'vitest';
import { exposeTestHooks, launchChrome } from './harness';
import { visionScene } from './visionFixture';

interface WebVisionStudio {
  load: (scene: unknown) => void;
  visionTestModel: () => Promise<unknown>;
}

it('runs See Objects in the web build with the same ONNX worker', async () => {
  const browser = await launchChrome();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  try {
    await exposeTestHooks(page);
    await page.goto(inject('webUrl'));
    await page.waitForFunction(() => Boolean((window as unknown as { __studio?: WebVisionStudio }).__studio));
    await page.evaluate(async (scene) => {
      const studio = (window as unknown as { __studio: WebVisionStudio }).__studio;

      await studio.visionTestModel();
      studio.load(scene);
    }, visionScene('#ffffff'));
    await expect.poll(() => page.getByTestId('vision-box').count()).toBeGreaterThan(0);
    expect(await page.getByTestId('vision-box').first().getAttribute('data-label')).toBe('person');
  } finally {
    await browser.close();
  }
});
