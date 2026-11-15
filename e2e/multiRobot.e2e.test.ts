import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { openApp, openPlayTab, partCount, shown, type App } from './harness';

interface SimState {
  activeCase: string | null;
  guests: string[];
  world: string[];
}

interface Studio {
  simState: () => SimState;
  load: (r: unknown) => void;
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

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('two robots in one Case', () => {
  it('makes a physical Hand Off Case from gripper arms in two open tabs', async () => {
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
    await expect.poll(async () => (await simState()).world).toEqual(expect.arrayContaining(['block', 'spot']));
    expect(app.errors).toEqual([]);
  });
});
