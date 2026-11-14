import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { glbOf, splatPlyOf } from '../src/cases/worldFixtureFiles';
import { garageMesh, kitchenMesh, splatOn } from '../src/cases/worldFixtures';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { openApp, partCount, type App } from './harness';

interface SimState {
  activeCase: string | null;
  tries: Array<{ passed: boolean }>;
}

type Studio = {
  simState: () => SimState;
  load: (r: unknown) => void;
  dropFiles: (files: Array<{ name: string; base64: string }>) => Promise<void>;
  worldLayer: () => { look: 'splat' | 'mesh' | null; pieces: number };
  referenceTry: () => Promise<void>;
};

let app: App;
let folder: string;

const visible = (selector: string) => `${selector}:not([inert] *):visible`;

const simState = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState());

const worldLayer = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.worldLayer());

const referenceTry = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.referenceTry());

async function loadRover() {
  const robot = fixtureRobots().find((r) => r.id === 'rover-diff')!;

  await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
    name: 'rover-diff',
    parts: robot.parts,
    project: { ...DEFAULT_PROJECT, joints: robot.joints },
  });
  await expect.poll(() => partCount(app.page)).toBe(robot.parts.length);
}

function written(name: string, bytes: Uint8Array): string {
  const path = join(folder, name);

  writeFileSync(path, bytes);

  return path;
}

async function drop(paths: string[]) {
  const files = paths.map((path) => ({
    name: path.split(/[\\/]/).at(-1)!,
    base64: readFileSync(path).toString('base64'),
  }));

  await app.page.evaluate((dropped) => (window as unknown as { __studio: Studio }).__studio.dropFiles(dropped), files);
}

async function makeReach(world: string, distanceMm: number) {
  const card = app.page.locator(visible('[data-testid="new-case"]'));

  await expect.poll(() => card.count(), { timeout: 60000 }).toBe(1);
  expect(await card.locator('[role=radio][aria-checked=true]', { hasText: world }).count()).toBe(1);
  await card.locator('[role=radio]', { hasText: 'Reach a Spot' }).click();

  const distance = card.locator('label', { hasText: 'Distance' }).locator('input');

  await distance.fill(String(distanceMm));
  await distance.press('Enter');
  await card.locator('button', { hasText: 'Make Case' }).click();
}

beforeAll(async () => {
  folder = mkdtempSync(join(tmpdir(), 'basecase-world-'));
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
  rmSync(folder, { recursive: true, force: true });
});

const itUnlessWindows = it.skipIf(process.platform === 'win32');

describe('a dropped 3D world', () => {
  it('refuses a splat dropped without its collider, naming the collider', async () => {
    await drop([written('Alone.ply', splatPlyOf(splatOn(kitchenMesh())))]);
    await expect
      .poll(() => app.page.getByRole('status').filter({ hasText: 'Drop Alone.ply with its collider mesh.' }).count())
      .toBeGreaterThan(0);
  });

  itUnlessWindows(
    'opens a Marble kitchen in New Case with its splat and collider, and the reference try passes',
    async () => {
      await loadRover();

      const parts = await partCount(app.page);

      await drop([
        written('Kitchen.glb', glbOf(kitchenMesh())),
        written('Kitchen.ply', splatPlyOf(splatOn(kitchenMesh()))),
      ]);
      await makeReach('Kitchen', 600);
      await expect.poll(async () => (await simState()).activeCase).toBe('reach-a-spot-in-kitchen');
      await expect.poll(async () => (await worldLayer()).look, { timeout: 60000 }).toBe('splat');

      const { pieces } = await worldLayer();

      expect(pieces).toBeGreaterThanOrEqual(2);
      expect(pieces).toBeLessThanOrEqual(64);
      expect(await partCount(app.page)).toBe(parts);

      await referenceTry();
      await expect.poll(async () => (await simState()).tries.length, { timeout: 60000 }).toBe(1);
      expect((await simState()).tries[0].passed).toBe(true);
      expect(app.errors).toEqual([]);
    },
    180000,
  );

  itUnlessWindows(
    'shows a garage capture with no splat as its own mesh',
    async () => {
      await loadRover();
      await drop([written('Garage.glb', glbOf(garageMesh()))]);
      await makeReach('Garage', 400);
      await expect.poll(async () => (await simState()).activeCase).toBe('reach-a-spot-in-garage');
      await expect.poll(async () => (await worldLayer()).look, { timeout: 60000 }).toBe('mesh');
      expect(app.errors).toEqual([]);
    },
    120000,
  );
});
