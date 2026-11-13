import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { KNOCK_COMMANDS, knockGame } from '../src/cases/fixtureGames';
import type { DriveCommand } from '../src/sim/driveTypes';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { openApp, partCount, type App } from './harness';

let app: App;

interface SimState {
  drive: string;
  stats: { time: number } | null;
  activeCase: string | null;
  tries: Array<{ passed: boolean }>;
  facts: Record<string, number | boolean | string> | null;
}

type Studio = {
  simState: () => SimState;
  load: (r: unknown) => void;
  addCase: (raw: unknown) => string;
  drive: (c: DriveCommand) => void;
};

const visible = (selector: string) => `${selector}:not([inert] *):visible`;

const simState = () =>
  app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState() as SimState);

async function loadFixture(id: string) {
  const robot = fixtureRobots().find((r) => r.id === id)!;

  await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
    name: id,
    parts: robot.parts,
    project: { ...DEFAULT_PROJECT, joints: robot.joints },
  });
  await expect.poll(() => partCount(app.page)).toBe(robot.parts.length);
}

const clickTab = (name: string) => app.page.locator(visible('[role=tab]'), { hasText: name }).first().click();

const button = (name: string | RegExp) => app.page.locator(visible('button'), { hasText: name }).first();

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

const itUnlessWindows = it.skipIf(process.platform === 'win32');

describe('Case logic', () => {
  itUnlessWindows(
    'scores a knock-the-blocks game from its Case logic and records the try as a pass',
    async () => {
      await loadFixture('arm-6dof');

      const id = await app.page.evaluate(
        (kase) => (window as unknown as { __studio: Studio }).__studio.addCase(kase),
        knockGame({ seconds: 9, target: 2 }),
      );

      await expect.poll(async () => (await simState()).activeCase).toBe(id);
      await clickTab('Simulate');
      await button('Try It').click();
      await expect.poll(async () => (await simState()).drive, { timeout: 60000 }).toBe('on');
      await expect.poll(async () => (await simState()).facts?.score, { timeout: 30000 }).toBe(0);

      const start = (await simState()).stats?.time ?? 0;

      for (const command of KNOCK_COMMANDS) {
        await expect
          .poll(async () => (await simState()).stats?.time ?? 0, { timeout: 30000, interval: 20 })
          .toBeGreaterThanOrEqual(start + command.at);
        await app.page.evaluate(
          (target) => (window as unknown as { __studio: Studio }).__studio.drive({ v: [0, 0, 0], target }),
          command.target!,
        );
      }

      await expect.poll(async () => (await simState()).facts?.score, { timeout: 30000 }).toBe(2);
      await expect.poll(async () => (await simState()).tries.length, { timeout: 60000 }).toBe(1);
      expect((await simState()).tries[0].passed).toBe(true);
      expect(app.errors).toEqual([]);
    },
    180000,
  );
});
