import { afterEach, describe, expect, inject, it } from 'vitest';
import { FIXTURE_COPYRIGHT, FIXTURE_GROUND_M, FIXTURE_SPOT } from '../src/earth/tileFixture';
import { loadFixtureRobot } from './driveChecks';
import { startFakeTiles, type FakeTiles } from './fakeTiles';
import { openApp, shown, type App } from './harness';

const KEY = 'fake-map-tiles-key-for-the-e2e-server';
const ROOT_CENTER_MM = [-700_000, 600_000];

interface EarthState {
  tiles: number;
  surfaceM: number | null;
  rootCenter: [number, number, number] | null;
}

interface EarthHooks {
  earth: () => EarthState | null;
  saveMapKey: (key: string) => Promise<{ saved: boolean }>;
}

let app: App | undefined;
let tiles: FakeTiles | undefined;

afterEach(async () => {
  await app?.close();
  await tiles?.close();
  app = undefined;
  tiles = undefined;
});

async function placeOnMap(page: App['page']) {
  await page.keyboard.press('Meta+k');
  await page.getByLabel('Search commands').fill('Place on Map');
  await page.keyboard.press('Enter');
}

describe('Place on Map', () => {
  it('opens Settings ▸ Accounts on the Map Tiles key when none is saved', async () => {
    app = await openApp({ 'earth-account': { saved: false } });
    await placeOnMap(app.page);

    await expect
      .poll(() => app!.page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
      .toBe('Map Tiles key');
  });

  it('streams the place’s tiles under the robot from pasted coordinates', async () => {
    tiles = await startFakeTiles({ key: KEY, port: inject('tilesPort') });
    app = await openApp({}, ['earth-']);

    const { page } = app;
    const earth = () => page.evaluate(() => (window as unknown as { __studio: EarthHooks }).__studio.earth());

    await loadFixtureRobot(page, 'rover-diff');
    await page.evaluate((key) => (window as unknown as { __studio: EarthHooks }).__studio.saveMapKey(key), KEY);
    await placeOnMap(page);
    await page.getByLabel('Place', { exact: true }).fill(`${FIXTURE_SPOT.lat}, ${FIXTURE_SPOT.lon}`);
    await page.locator(shown('button'), { hasText: /^Place$/ }).click();

    await expect.poll(async () => (await earth())?.surfaceM ?? 0).toBeCloseTo(FIXTURE_GROUND_M, 0);

    const state = await earth();

    expect(state?.tiles).toBeGreaterThan(0);
    expect(Math.abs((state?.surfaceM ?? 0) - FIXTURE_GROUND_M)).toBeLessThan(0.5);
    expect(state?.rootCenter?.[0]).toBeCloseTo(ROOT_CENTER_MM[0], -3);
    expect(state?.rootCenter?.[2]).toBeCloseTo(ROOT_CENTER_MM[1], -3);
    await expect.poll(() => page.getByTestId('map-attribution').textContent()).toBe(FIXTURE_COPYRIGHT);
    expect(tiles.requests.every((r) => r.key === KEY)).toBe(true);
    expect(app.errors).toEqual([]);
  });
});
