import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { openApp, openPlayTab, partCount, shown, type App } from './harness';

type V3 = [number, number, number];

interface SimState {
  drive: string;
  activeCase: string | null;
  robots: string[];
  guests: string[];
  effectors: V3[] | null;
  tries: Array<{ passed: boolean; margin: number }>;
}

interface Studio {
  simState: () => SimState;
  load: (r: unknown) => void;
  referenceTry: () => Promise<void>;
}

interface Tabs {
  list: () => { ids: string[]; activeId: string };
  open: () => void;
}

let app: App;

const simState = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState());

const activeTab = () =>
  app.page.evaluate(() => (window as unknown as { __studioTabs: Tabs }).__studioTabs.list().activeId);

async function loadArm() {
  const arm = fixtureRobots().find((r) => r.id === 'arm-6dof')!;

  await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
    name: 'Arm',
    parts: arm.parts,
    project: { ...DEFAULT_PROJECT, joints: arm.joints },
  });
  await expect.poll(() => partCount(app.page)).toBe(arm.parts.length);
}

const travel = (from: V3, to: V3) => Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('two robots in one Case', () => {
  it.skipIf(process.platform === 'win32')(
    'hands off to a spot between the arms in two open tabs, and both arms move',
    async () => {
      await loadArm();

      const first = await activeTab();

      await app.page.evaluate(() => (window as unknown as { __studioTabs: Tabs }).__studioTabs.open());
      await expect.poll(activeTab).not.toBe(first);
      await expect.poll(() => partCount(app.page)).toBe(0);
      await loadArm();
      await openPlayTab(app.page, 'Cases');
      await app.page.locator(shown('button'), { hasText: 'New Case' }).first().click();

      const card = app.page.locator(shown('[data-testid="new-case"]'));

      await card.locator('[role=radio]', { hasText: 'Hand Off to a Spot' }).click();
      await card.locator('button', { hasText: 'Make Case' }).click();
      await expect.poll(async () => (await simState()).activeCase).toBe('hand-off-to-a-spot');
      expect((await simState()).guests.length).toBeGreaterThan(0);

      await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.referenceTry());
      await expect.poll(async () => (await simState()).drive, { timeout: 60000 }).toBe('on');
      expect((await simState()).robots).toHaveLength(2);

      const start = (await simState()).effectors!;
      const moved = [0, 0];

      await expect
        .poll(
          async () => {
            const { effectors, tries } = await simState();

            effectors?.forEach((at, i) => (moved[i] = Math.max(moved[i], travel(start[i], at))));

            return tries.length;
          },
          { timeout: 60000, interval: 100 },
        )
        .toBe(1);

      expect((await simState()).tries[0].passed).toBe(true);
      expect(moved[0]).toBeGreaterThan(100);
      expect(moved[1]).toBeGreaterThan(100);
      expect(app.errors).toEqual([]);
    },
    180000,
  );
});
