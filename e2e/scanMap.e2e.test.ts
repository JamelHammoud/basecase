import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { corridorMcap } from '../src/dataLayers/mapFixtures';
import { loadFixtureRobot } from './driveChecks';
import { openApp, shown, type App } from './harness';

let app: App;

interface MapLayer {
  id: string;
  points: number;
}

interface DataState {
  dataLayers: MapLayer[];
  tries: Array<{ passed: boolean }>;
  timeline: { frame: number; frames: number } | null;
}

interface Studio {
  pickFiles: (files: Array<{ name: string; base64: string }>) => void;
  simState: () => DataState;
  mapMatching: () => boolean;
  mapWorldVerdict: () => Promise<{ seed: number; runs: number; passes: number } | null>;
  mapWorldState: () => Promise<{
    imported: { hash: string } | null;
    saved: boolean;
    pieces: number;
    reconstruction: { sourceTry: string; estimates: { floor: boolean } } | null;
  }>;
  project: () => { cases?: Array<{ world: { imported?: { hash: string } } }> };
}

const state = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState());

const mapLayer = async () => (await state()).dataLayers.find((layer) => layer.id === 'map');

const matching = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.mapMatching());

const mapRow = () => app.page.locator(shown('[data-layer-row="data:map"]')).first();

async function importCorridor() {
  const bytes = await corridorMcap();

  await app.page.evaluate((file) => (window as unknown as { __studio: Studio }).__studio.pickFiles([file]), {
    name: 'corridor.mcap',
    base64: Buffer.from(bytes).toString('base64'),
  });
  await app.page.keyboard.press('ControlOrMeta+k');
  await app.page.keyboard.type('Import');
  await app.page.locator(shown('button[data-idx]')).filter({ hasText: 'Import', hasNotText: 'Robot' }).click();
  await expect.poll(() => app.page.getByText('Imported 1 try', { exact: true }).count()).toBeGreaterThan(0);
  await app.page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Library"]')).click();
  await app.page.locator(shown('[data-testid="library-tries"] button')).first().click();
  await app.page.locator(shown('[data-testid="try-tile"]')).filter({ hasText: 'corridor.mcap' }).click();
  await expect.poll(async () => (await mapLayer())?.points ?? 0).toBeGreaterThan(360);
}

beforeEach(async () => {
  app = await openApp();
}, 120000);

afterEach(async () => {
  await app?.close();
});

describe('A robot run’s map', () => {
  it('rebuilds the displayed map when Scan Matching is turned off in Layers', async () => {
    await loadFixtureRobot(app.page, 'rover-diff');
    await importCorridor();

    const points = (await mapLayer())!.points;

    expect(await matching()).toBe(true);
    await app.page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Layers"]')).click();
    await mapRow().click({ button: 'right' });
    await app.page.getByRole('menuitem', { name: 'Scan Matching', exact: true }).click();
    await expect.poll(matching).toBe(false);
    await expect.poll(async () => (await mapLayer())?.points ?? 0).toBeGreaterThan(points);
    expect(app.errors).toEqual([]);
  });

  it('makes a saved corridor world through Layers and New Case and passes a seeded reference try', async () => {
    await loadFixtureRobot(app.page, 'rover-diff');
    await importCorridor();
    await app.page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Layers"]')).click();
    await mapRow().click({ button: 'right' });
    await app.page.getByRole('menuitem', { name: 'Make World', exact: true }).click();

    const card = app.page.locator(shown('[data-testid="new-case"]'));

    await expect.poll(() => card.count()).toBe(1);
    expect(await card.locator('[role=radio][aria-checked=true]', { hasText: 'Map' }).count()).toBe(1);
    await card.locator('[role=radio]', { hasText: 'Reach a Spot' }).click();

    for (const [label, value] of [
      ['Distance', '600'],
      ['Radius', '150'],
      ['Time', '8'],
    ]) {
      const input = card.locator('label', { hasText: label }).locator('input');

      await input.fill(value);
      await input.press('Enter');
    }

    await card.locator('button', { hasText: 'Make Case' }).click();

    const world = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.mapWorldState());

    await expect.poll(async () => (await world()).saved).toBe(true);

    const made = await world();

    expect(made.imported?.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(made.pieces).toBeGreaterThan(1);
    expect(made.pieces).toBeLessThanOrEqual(64);
    expect(made.reconstruction?.sourceTry).toBeTruthy();
    expect(made.reconstruction?.estimates.floor).toBe(true);
    await app.page.keyboard.press('Escape');
    await expect.poll(async () => (await state()).timeline).toBeNull();
    expect((await world()).imported?.hash).toBe(made.imported?.hash);
    expect((await world()).saved).toBe(true);
    expect(
      await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.mapWorldVerdict()),
    ).toMatchObject({ seed: 1, runs: 1, passes: 1 });
    expect(app.errors).toEqual([]);
  });
});
