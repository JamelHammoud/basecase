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
  world: string[];
  timeline: { frame: number; sought: number | null } | null;
  tries: Array<{ passed: boolean; margin: number }>;
}

interface Evidence {
  dt: number;
  signals: Record<string, number[]>;
  positions: V3[];
  spot: V3;
}

interface Studio {
  simState: () => SimState;
  load: (r: unknown) => void;
  referenceTry: () => Promise<void>;
  handoffEvidence: () => Promise<Evidence | null>;
  worldAt: () => Record<string, V3>;
}

interface Tabs {
  list: () => { ids: string[]; activeId: string };
  open: () => void;
}

let app: App;

const simState = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState());
const worldAt = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.worldAt());
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

async function scrubTo(frame: number, position: V3) {
  await app.page
    .getByTestId('try-timeline')
    .locator('input[type=range]')
    .evaluate((input, value) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;

      set.call(input, String(value));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, frame);
  await expect.poll(async () => (await simState()).timeline?.sought).toBe(frame);
  await expect.poll(async () => travel((await worldAt()).block, position)).toBeLessThan(0.1);
}

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('two robots in one Case', () => {
  it('hands a physical object between two open tabs, places it, and scrubs the saved try', async () => {
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
    await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.referenceTry());
    await expect.poll(async () => (await simState()).drive, { timeout: 60000 }).toBe('on');
    expect((await simState()).robots).toHaveLength(2);
    await expect.poll(async () => (await simState()).tries.length, { timeout: 60000, interval: 100 }).toBe(1);
    expect((await simState()).tries[0].passed).toBe(true);

    const evidence = await app.page.evaluate(() =>
      (window as unknown as { __studio: Studio }).__studio.handoffEvidence(),
    );
    const { signals, positions, spot } = evidence!;
    const lifted = signals.donorGrip.findIndex(
      (v, i) => v > 0.5 && signals.recipientContact[i] < 0.5 && positions[i][1] > positions[0][1] + 35,
    );
    const shared = signals.donorGrip.findIndex((v, i) => v > 0.5 && signals.recipientGrip[i] > 0.5);
    const carried = signals.recipientGrip.findIndex(
      (v, i) => v > 0.5 && signals.donorGrip[i] < 0.5 && signals.donorGap[i] > 100 && signals.recipientContact[i] > 0.5,
    );

    expect(lifted).toBeGreaterThan(0);
    expect(shared).toBeGreaterThan(lifted);
    expect(carried).toBeGreaterThan(shared);
    expect(Math.max(...positions.map((p) => p[1])) - positions[0][1]).toBeGreaterThan(35);
    expect(travel(positions.at(-1)!, spot)).toBeLessThan(20);
    await app.page.locator(shown('[data-testid="try-row"]')).first().click();
    await expect.poll(async () => (await simState()).timeline).not.toBeNull();

    await scrubTo(lifted, positions[lifted]);
    await scrubTo(shared, positions[shared]);
    await scrubTo(carried, positions[carried]);

    const timeline = app.page.getByTestId('try-timeline');

    await timeline.focus();
    await app.page.keyboard.press('End');
    await expect.poll(async () => (await simState()).timeline?.sought).toBe(positions.length - 1);
    await expect.poll(async () => travel((await worldAt()).block, positions.at(-1)!)).toBeLessThan(0.1);
    await app.page.keyboard.press('Home');
    await expect.poll(async () => (await simState()).timeline?.sought).toBe(0);
    await expect.poll(async () => travel((await worldAt()).block, positions[0])).toBeLessThan(0.1);
    expect(app.errors).toEqual([]);
  });
});
