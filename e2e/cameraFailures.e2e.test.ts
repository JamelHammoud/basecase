import { afterEach, expect, it } from 'vitest';
import type { VisionManifest } from '../src/vision/manifest';
import { inputSensitiveDetectionOnnx } from '../src/vision/onnxFixture';
import { openApp, shown, type App } from './harness';
import { simulatedCameraFixture, visionManifest } from './visionFixtures';

let app: App;

interface FailureWindow {
  cameraFailureWorker: Worker;
  __studio: {
    load: (record: unknown) => void;
    configureVision: (manifest: VisionManifest, bytes: number[], cameras: string[]) => Promise<unknown>;
  };
}

afterEach(async () => {
  await app?.close();
});

it('keeps live-camera recovery text readable on a small hovered tile and preserves keyboard enlargement', async () => {
  app = await openApp();

  const page = app.page;

  await page.evaluate(() => {
    const OriginalWorker = window.Worker;

    window.Worker = class extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);

        if (!String(url).includes('feed.worker')) return;

        super.terminate();
        this.postMessage = () => {};
        (window as unknown as FailureWindow).cameraFailureWorker = this;
      }
    };
  });
  await page.evaluate((scene) => (window as unknown as FailureWindow).__studio.load(scene), simulatedCameraFixture());

  const tile = page.locator(shown('[data-testid="camera-tile"][data-camera="target_camera"]'));

  await tile.waitFor();

  const bytes = inputSensitiveDetectionOnnx();

  await page.evaluate(
    async ({ manifest, data }) => {
      const state = window as unknown as FailureWindow;

      await state.__studio.configureVision(manifest, data, ['target_camera']);
      state.cameraFailureWorker.dispatchEvent(new ErrorEvent('error'));
    },
    { manifest: visionManifest(bytes, 'block'), data: [...bytes] },
  );
  await expect.poll(() => tile.getByRole('status').textContent()).toBe('The camera stopped. Reopen the scene.');
  await tile.hover();

  const bounds = await tile.evaluate((element) => {
    const error = element.querySelector('[role="status"]')!;
    const label = [...element.querySelectorAll('span')].find((span) => span.textContent === 'Target Camera')!;
    const lens = [...element.querySelectorAll('span')].find((span) => span.textContent === '60°')!;
    const range = document.createRange();

    range.selectNodeContents(error);

    const tile = element.getBoundingClientRect();
    const text = range.getBoundingClientRect();

    return {
      width: tile.width,
      contained: text.left >= tile.left && text.right <= tile.right && text.bottom <= tile.bottom,
      separate: text.top >= label.getBoundingClientRect().bottom,
      lensHidden: !lens.checkVisibility({ visibilityProperty: true }),
    };
  });

  expect(bounds).toEqual({ width: 192, contained: true, separate: true, lensHidden: true });
  await tile.getByRole('button', { name: 'Target Camera', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await tile.boundingBox())?.width).toBe(384);
  expect(await tile.getByRole('status').textContent()).toBe('The camera stopped. Reopen the scene.');
  expect(app.errors).toEqual([]);
});
