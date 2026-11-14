import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { corridorMcap } from '../src/dataLayers/mapFixtures';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { loadFixtureRobot } from './driveChecks';
import { openApp, shown, type App } from './harness';

let app: App;

interface MapLayer {
  id: string;
  visible: boolean;
  points: number;
  missing: string | null;
}

interface DataState {
  dataLayers: MapLayer[];
  dataPlayhead: number | null;
  timeline: { frame: number; frames: number } | null;
}

interface Studio {
  pickFiles: (files: Array<{ name: string; base64: string }>) => void;
  simState: () => DataState;
  mapMatching: () => boolean;
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

async function toggleMatching() {
  await mapRow().click({ button: 'right' });
  await app.page.getByRole('menuitem', { name: 'Scan Matching', exact: true }).click();
}

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('A robot run’s map', () => {
  it('fuses every corridor scan, keeps the complete map while scrubbing, and controls it from Layers', async () => {
    const rover = fixtureRobots().find((robot) => robot.id === 'rover-diff')!;

    await loadFixtureRobot(app.page, rover);
    await importCorridor();

    const points = (await mapLayer())!.points;
    const frames = (await state()).timeline!.frames;

    expect((await mapLayer())!.missing).toBeNull();
    await app.page.keyboard.press('End');
    await expect.poll(async () => (await state()).timeline?.frame).toBe(frames - 1);
    expect((await state()).dataPlayhead).toBeGreaterThan(60);
    expect((await mapLayer())!.points).toBe(points);
    await app.page.keyboard.press('Home');
    await expect.poll(async () => (await state()).timeline?.frame).toBe(0);
    await expect.poll(async () => (await state()).dataPlayhead).toBe(0);
    expect((await mapLayer())!.points).toBe(points);
    await app.page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Layers"]')).click();
    await mapRow().hover();
    await mapRow().getByRole('button', { name: 'Hide', exact: true }).click();
    await expect.poll(async () => (await mapLayer())?.visible).toBe(false);
    expect((await mapLayer())!.points).toBe(0);
    await mapRow().getByRole('button', { name: 'Show', exact: true }).click();
    await expect.poll(async () => (await mapLayer())?.points).toBe(points);
    expect(await matching()).toBe(true);
    await toggleMatching();
    await expect.poll(matching).toBe(false);
    await expect.poll(async () => (await mapLayer())?.points ?? 0).toBeGreaterThan(360);
    await expect.poll(async () => (await mapLayer())?.points).not.toBe(points);
    await toggleMatching();
    await expect.poll(matching).toBe(true);
    await expect.poll(async () => (await mapLayer())?.points).toBe(points);
    expect(app.errors).toEqual([]);
  });
});
