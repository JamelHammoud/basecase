import { afterEach, describe, expect, it } from 'vitest';
import type { FixedCamera } from '../src/cameras/fixed';
import { box } from '../src/sim/fixtures/parts';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import type { VisionManifest } from '../src/vision/manifest';
import { inputSensitiveDetectionOnnx } from '../src/vision/onnxFixture';
import type { VisionResult } from '../src/vision/types';
import { openApp, shown, type App } from './harness';
import { visionManifest } from './visionFixtures';

interface Studio {
  load: (scene: unknown) => void;
  configureVision: (manifest: VisionManifest, bytes: number[], cameras: string[]) => Promise<unknown>;
  cameraVisionState: () => { models: Record<string, VisionResult | null>; signals: Record<string, number> };
}

const camera: FixedCamera = {
  id: 'front',
  name: 'Front',
  position: [0, 1000, 1000],
  target: [0, 1000, 0],
  lens: { model: 'pinhole', hfovDeg: 20 },
};
const scene = (color: string) => ({
  id: 'rendered-vision',
  name: 'Rendered Vision',
  parts: [{ ...box('target', [0, 1000, 0], [1000, 1000, 1000], 100), color }],
  project: { ...DEFAULT_PROJECT, cameras: [camera] },
});

let app: App;

afterEach(async () => app?.close());

describe.each(['desktop', 'web'])('%s rendered camera inference', (platform) => {
  it('updates visible boxes and counts from rendered pixels when the part color changes', async () => {
    app = await openApp({}, [], { web: platform === 'web' });

    const bytes = inputSensitiveDetectionOnnx();
    const state = () =>
      app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.cameraVisionState());

    await app.page.evaluate(
      (record) => (window as unknown as { __studio: Studio }).__studio.load(record),
      scene('#ffffff'),
    );
    await app.page.evaluate(
      ({ manifest, bytes }) =>
        (window as unknown as { __studio: Studio }).__studio.configureVision(manifest, bytes, ['front']),
      { manifest: visionManifest(bytes), bytes: [...bytes] },
    );

    const tile = app.page.locator(shown('[data-camera="front"]')).first();

    await expect.poll(async () => (await state()).signals['vision.front.cup']).toBe(1);
    await expect.poll(() => tile.getByTestId('vision-box').count()).toBe(1);
    await tile.getByRole('button', { name: 'Front', exact: true }).click();

    const white = (await state()).models['front:rfdetr-nano']!;

    expect(white.width).toBeGreaterThan(0);
    expect(white.height).toBeGreaterThan(0);
    await app.page.evaluate(
      (record) => (window as unknown as { __studio: Studio }).__studio.load(record),
      scene('#000000'),
    );
    await expect
      .poll(async () => {
        const black = (await state()).models['front:rfdetr-nano'];

        return (
          black &&
          black.timestamp > white.timestamp &&
          (black.detections[0]?.score ?? 0) < white.detections[0].score - 0.1
        );
      })
      .toBe(true);

    const black = (await state()).models['front:rfdetr-nano']!;

    await expect.poll(() => tile.getByTestId('vision-box').count()).toBe(black.detections.length);
    expect((await state()).signals['vision.front.cup']).toBe(black.detections.length);
    expect(app.errors).toEqual([]);
  });
});
