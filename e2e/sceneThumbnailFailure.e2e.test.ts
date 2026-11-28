import { afterEach, expect, it } from 'vitest';
import { box } from '../src/sim/fixtures/parts';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { decodeSceneFile } from '../src/utils/sceneFile';
import { openApp, partCount, shown, type App } from './harness';
import { contactCommand } from './selfContactScene';

interface ThumbnailFailureWindow {
  thumbnailEncodes: number;
  refusedThumbnailWorkers: number;
  __studio: {
    load: (record: unknown) => void;
    lastDownload: () => { name: string; base64: string } | null;
  };
}

let app: App;

afterEach(async () => {
  await app?.close();
});

it('downloads a complete scene when thumbnail workers cannot start without encoding on the page', async () => {
  app = await openApp();

  const { page } = app;

  await page.addInitScript(() => {
    const state = window as unknown as ThumbnailFailureWindow;
    const OriginalWorker = window.Worker;
    const encode = HTMLCanvasElement.prototype.toBlob;

    state.thumbnailEncodes = 0;
    state.refusedThumbnailWorkers = 0;
    window.Worker = class extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        if (String(url).includes('thumbnail.worker')) {
          state.refusedThumbnailWorkers++;

          throw new Error('Seeded thumbnail worker refusal');
        }

        super(url, options);
      }
    };
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      state.thumbnailEncodes++;
      encode.call(this, callback, type, quality);
    };
  });
  await page.reload();
  await page.waitForFunction(() => Boolean((window as unknown as ThumbnailFailureWindow).__studio));
  await page.locator(shown('.canvas-cursor canvas')).waitFor();

  const parts = [box('Portable carrier', [0, 10, 0], [40, 20, 30], 50)];

  await page.evaluate((record) => (window as unknown as ThumbnailFailureWindow).__studio.load(record), {
    name: 'Portable carrier',
    parts,
    project: { ...DEFAULT_PROJECT, budgetUsd: 37 },
  });
  await expect.poll(() => partCount(page)).toBe(1);
  await contactCommand(app, 'Export Scene');

  const download = () => page.evaluate(() => (window as unknown as ThumbnailFailureWindow).__studio.lastDownload());

  await expect.poll(download).toMatchObject({ name: expect.stringMatching(/\.basecase$/) });

  const file = (await download())!;
  const restored = await decodeSceneFile(new Uint8Array(Buffer.from(file.base64, 'base64')));
  const state = await page.evaluate(() => {
    const { thumbnailEncodes, refusedThumbnailWorkers } = window as unknown as ThumbnailFailureWindow;

    return { thumbnailEncodes, refusedThumbnailWorkers };
  });

  expect(restored.parts).toEqual(parts);
  expect(restored.project?.budgetUsd).toBe(37);
  expect(restored.sizeMm).toEqual([40, 20, 30]);
  expect(restored.previewDataUrl).toBeUndefined();
  expect(state.refusedThumbnailWorkers).toBeGreaterThan(0);
  expect(state.thumbnailEncodes).toBe(0);
  expect(app.errors).toEqual([]);
});
