import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { kitchenCollider, kitchenSplat } from '../src/cases/worldImportFixture';
import type { WorldImportFile } from '../src/cases/worldImportTypes';
import { loadFixtureRobot } from './driveChecks';
import type { SimState } from './driveStudio';
import { openApp, partCount, shown, type App } from './harness';

interface WorldState {
  hash: string | null;
  splat: boolean;
  meshes: number;
  pieces: number;
  loaded: boolean;
  renderedSplats: number;
}

interface Studio {
  dropFiles: (files: Array<{ name: string; base64: string }>) => void;
  simState: () => SimState;
  worldState: () => WorldState | null;
  cameraFrame: (key: string, floor?: boolean) => Promise<string | null>;
}

let app: App;

const simState = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState());
const worldState = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.worldState());

const framePixels = (image: string) =>
  sharp(Buffer.from(image.split(',')[1], 'base64'))
    .resize(128, 96)
    .ensureAlpha()
    .raw()
    .toBuffer();

async function tileDifference(baseline: Buffer) {
  const image = await app.page.evaluate(() =>
    (window as unknown as { __studio: Studio }).__studio.cameraFrame('scene'),
  );

  if (!image) return 0;

  const pixels = await framePixels(image);
  let changed = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    const difference =
      Math.abs(pixels[i] - baseline[i]) +
      Math.abs(pixels[i + 1] - baseline[i + 1]) +
      Math.abs(pixels[i + 2] - baseline[i + 2]);

    if (pixels[i + 3] === 255 && difference > 30) changed++;
  }

  return changed / (pixels.length / 4);
}

async function expectKitchenCamera() {
  await app.page.keyboard.press('Meta+k');
  await app.page.keyboard.type('Run Case');
  await app.page.keyboard.press('Enter');
  await expect.poll(() => app.page.locator(shown('[data-testid="camera-tile"][data-camera="scene"]')).count()).toBe(1);

  const floor = await app.page.evaluate(() =>
    (window as unknown as { __studio: Studio }).__studio.cameraFrame('scene', true),
  );

  expect(floor).toBeTruthy();

  const baseline = await framePixels(floor!);

  await expect.poll(() => tileDifference(baseline)).toBeGreaterThan(0.05);
}

async function dropFixtures(files: WorldImportFile[]) {
  const dropped = files.map(({ name, bytes }) => ({ name, base64: Buffer.from(bytes).toString('base64') }));

  await app.page.evaluate(
    (payload) => (window as unknown as { __studio: Studio }).__studio.dropFiles(payload),
    dropped,
  );
}

async function makeKitchen(files = [kitchenCollider(), kitchenSplat()]) {
  await dropFixtures(files);

  const card = app.page.locator(shown('[data-testid="new-case"]'));

  await expect.poll(() => card.count()).toBe(1);
  expect(await card.locator('[role=radio][aria-checked=true]', { hasText: 'Kitchen' }).count()).toBe(1);
  expect(await card.locator('[role=radio][aria-checked=true]', { hasText: 'Reach a Spot' }).count()).toBe(1);
  await card.locator('button', { hasText: 'Make Case' }).click();
  await expect.poll(async () => (await simState()).activeCase).toBe('reach-a-spot-in-kitchen');
  await expect.poll(async () => (await worldState())?.loaded).toBe(true);
}

afterEach(async () => {
  await app?.close();
});

describe('a captured world dropped on the canvas', () => {
  it('opens New Case with its splat and separate colliders without adding scene parts', async () => {
    app = await openApp();
    await loadFixtureRobot(app.page, 'rover-diff');

    const parts = await partCount(app.page);

    await makeKitchen();

    const world = (await worldState())!;

    expect(world.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(world.splat).toBe(true);
    await expect.poll(async () => (await worldState())?.renderedSplats ?? 0).toBeGreaterThan(0);
    expect(world.pieces).toBeGreaterThanOrEqual(2);
    expect(world.pieces).toBeLessThanOrEqual(64);
    expect(await partCount(app.page)).toBe(parts);

    await expectKitchenCamera();
    expect(app.errors).toEqual([]);
  });

  it('shows the mesh when the capture has no splat', async () => {
    app = await openApp();
    await loadFixtureRobot(app.page, 'rover-diff');
    await makeKitchen([kitchenCollider()]);

    const world = (await worldState())!;

    expect(world.splat).toBe(false);
    expect(world.meshes).toBeGreaterThan(0);
    expect(app.errors).toEqual([]);
  });

  it('refuses a splat dropped without a collider by naming the missing collider', async () => {
    app = await openApp();
    await dropFixtures([kitchenSplat()]);

    await expect
      .poll(() =>
        app.page
          .getByRole('status')
          .filter({ hasText: /collider/i })
          .count(),
      )
      .toBeGreaterThan(0);
    expect(await app.page.locator(shown('[data-testid="new-case"]')).count()).toBe(0);
    expect((await simState()).activeCase).toBeNull();
    expect(app.errors).toEqual([]);
  });
});
