import { readFileSync } from 'node:fs';
import type { Locator } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { builderRobot } from '../src/cases/caseBuilder';
import { FIXTURE_FLOOR_M, FIXTURE_TABLE, FIXTURE_TAP_MM, fixtureRoom } from '../src/cases/roomFixture';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { buildRig } from '../src/utils/kinematics';
import { openApp, partCount, type App } from './harness';

interface SimState {
  drive: string;
  stats: { robots: Array<{ forward: number }> } | null;
  world: string[];
  activeCase: string | null;
  tries: Array<{ passed: boolean; margin: number }>;
}

type Studio = {
  simState: () => SimState;
  load: (r: unknown) => void;
  dropFiles: (files: Array<{ name: string; base64: string }>) => void;
  worldAt: () => Record<string, number[]>;
};

const DISTANCE_MM = 2000;
const FACING_THE_TABLE = { start: [FIXTURE_TABLE.center[0], FIXTURE_FLOOR_M, -1.6], heading: 0 };
const UNDER_TABLE_MM = (FIXTURE_TABLE.center[2] + 1.6) * 1000;

let app: App;

const visible = (selector: string) => `${selector}:not([inert] *):visible`;

const simState = () =>
  app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState() as SimState);

const button = (name: string | RegExp) => app.page.locator(visible('button'), { hasText: name }).first();

const rover = () => fixtureRobots().find((r) => r.id === 'rover-diff')!;

async function loadRover() {
  const robot = rover();

  await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
    name: 'rover-diff',
    parts: robot.parts,
    project: { ...DEFAULT_PROJECT, joints: robot.joints },
  });
  await expect.poll(() => partCount(app.page)).toBe(robot.parts.length);
}

async function dropFile(name: string, text: string) {
  await app.page.evaluate(
    (files) => (window as unknown as { __studio: Studio }).__studio.dropFiles(files),
    [{ name, base64: Buffer.from(text).toString('base64') }],
  );
}

async function fill(card: Locator, label: string, value: number) {
  const input = card.locator('label', { hasText: label }).locator('input');

  await input.fill(String(value));
  await input.press('Enter');
}

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

const itUnlessWindows = it.skipIf(process.platform === 'win32');

describe('a scanned room', () => {
  it('refuses a broken room file with a toast', async () => {
    await dropFile('Broken.json', '{"walls": [{"dimensions": [NaN, 2, 0]}]}');
    await expect
      .poll(() => app.page.getByRole('status').filter({ hasText: 'Couldn’t import Broken.json.' }).count())
      .toBeGreaterThan(0);
  });

  itUnlessWindows(
    'opens as the world of a new Case, and a rover drives through its doorway to pass Reach a Spot',
    async () => {
      await loadRover();

      const parts = await partCount(app.page);

      await dropFile('Fixture Flat.json', JSON.stringify(fixtureRoom()));

      const card = app.page.locator(visible('[data-testid="new-case"]'));

      await expect.poll(() => card.count()).toBe(1);
      expect(await card.locator('[role=radio][aria-checked=true]', { hasText: 'Fixture Flat' }).count()).toBe(1);

      await card.locator('[role=radio]', { hasText: 'Reach a Spot' }).click();
      await fill(card, 'Distance', DISTANCE_MM);
      await fill(card, 'Radius', 250);
      await fill(card, 'Time', 60);
      await card.locator('button', { hasText: 'Make Case' }).click();

      await expect.poll(async () => (await simState()).activeCase).toBe('reach-a-spot-in-fixture-flat');
      expect((await simState()).world).toEqual(expect.arrayContaining(['spot', 'table-1', 'sofa-1', 'chair-1']));
      expect(await partCount(app.page)).toBe(parts);

      await button('Try It').click();
      await expect.poll(async () => (await simState()).drive, { timeout: 60000 }).toBe('on');
      await app.page.mouse.click(720, 450);
      await app.page.keyboard.down('w');
      await expect
        .poll(async () => (await simState()).stats?.robots[0].forward ?? 0, { timeout: 60000, interval: 50 })
        .toBeGreaterThan((DISTANCE_MM - 60) / 1000);
      await app.page.keyboard.up('w');
      await app.page.waitForTimeout(1500);
      await button('Stop Try').click();

      await expect.poll(async () => (await simState()).tries.length, { timeout: 30000 }).toBe(1);
      expect((await simState()).tries[0].passed).toBe(true);
      expect(app.errors).toEqual([]);
    },
    180000,
  );

  itUnlessWindows(
    'makes Reach a Spot under the table from New Case, and a rover driven under it passes',
    async () => {
      await loadRover();
      await dropFile('Fixture Flat.json', JSON.stringify(fixtureRoom({ basecase: FACING_THE_TABLE })));

      const card = app.page.locator(visible('[data-testid="new-case"]'));

      await expect.poll(() => card.count()).toBe(1);
      await card.locator('[role=radio]', { hasText: 'Reach a Spot' }).click();
      await card.locator('[role=radio]', { hasText: 'Under Table' }).click();
      expect(await card.locator('label', { hasText: 'Distance' }).count()).toBe(0);
      expect(await card.getByTestId('new-case-brief').innerText()).toBe(
        'Reach the spot under the Table and stop on it.',
      );
      await fill(card, 'Time', 60);
      await card.locator('button', { hasText: 'Make Case' }).click();
      await expect.poll(async () => (await simState()).activeCase).toMatch(/^reach-a-spot-in-fixture-flat/);

      await button('Try It').click();
      await expect.poll(async () => (await simState()).drive, { timeout: 60000 }).toBe('on');
      await app.page.mouse.click(720, 450);
      await app.page.keyboard.down('w');
      await expect
        .poll(async () => (await simState()).stats?.robots[0].forward ?? 0, { timeout: 60000, interval: 50 })
        .toBeGreaterThan((UNDER_TABLE_MM - 60) / 1000);
      await app.page.keyboard.up('w');
      await app.page.waitForTimeout(1500);
      await button('Stop Try').click();

      await expect.poll(async () => (await simState()).tries.length, { timeout: 30000 }).toBe(1);
      expect((await simState()).tries[0].passed).toBe(true);
      expect(app.errors).toEqual([]);
    },
    180000,
  );

  it('starts the robot where the scan app’s file says, facing its heading', async () => {
    const robot = rover();
    const { pivot } = builderRobot(buildRig(robot.joints, robot.parts), robot.parts);
    const [x, , z] = FIXTURE_TABLE.center.map((m) => m * 1000);
    const fromTap = [x - FIXTURE_TAP_MM[0], z - FIXTURE_TAP_MM[2]];

    await loadRover();
    await dropFile('Scanned Room.json', readFileSync('e2e/fixtures/scanned-room.json', 'utf8'));

    const card = app.page.locator(visible('[data-testid="new-case"]'));

    await expect.poll(() => card.count()).toBe(1);
    await card.locator('[role=radio]', { hasText: 'Reach a Spot' }).click();
    await fill(card, 'Distance', 600);
    await fill(card, 'Radius', 150);
    await card.locator('button', { hasText: 'Make Case' }).click();
    await expect.poll(async () => (await simState()).activeCase).toBe('reach-a-spot-in-scanned-room');

    const table = await app.page.evaluate(
      () => (window as unknown as { __studio: Studio }).__studio.worldAt()['table-1'],
    );

    expect(Math.abs(table[0] - (pivot[0] - fromTap[1]))).toBeLessThan(10);
    expect(Math.abs(table[2] - (pivot[2] + fromTap[0]))).toBeLessThan(10);
    expect(app.errors).toEqual([]);
  }, 120000);
});
