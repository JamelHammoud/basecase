import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { openApp, partCount, type App } from './harness';

let app: App;

interface SimState {
  status: string;
  drive: string;
  driveClass: string | null;
  note: string | null;
  stats: { time: number; robots: Array<{ forward: number; travelled: number; fellAt: number | null }> } | null;
  world: string[];
  bodies: Array<{ parts: string[]; world: string[] }>;
  activeCase: string | null;
  tries: Array<{ passed: boolean; margin: number }>;
}

type Studio = { simState: () => SimState; load: (r: unknown) => void };

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

async function startDriving(id: string) {
  await loadFixture(id);
  await clickTab('Simulate');
  await button(/^Drive$/).click();
  await expect.poll(async () => (await simState()).drive, { timeout: 60000 }).toBe('on');
  await expect.poll(() => app.page.getByTestId('drive-banner').count()).toBeGreaterThan(0);
}

async function holdKey(key: string, ms: number) {
  await app.page.mouse.click(720, 450);
  await app.page.keyboard.down(key);
  await app.page.waitForTimeout(ms);
  await app.page.keyboard.up(key);
}

async function stopDriving() {
  await app.page.keyboard.press('Escape');
  await expect.poll(async () => (await simState()).drive).toBe('off');
}

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('live drive', () => {
  it('drives a rover forward with W, and S, F and Backspace never edit parts', async () => {
    await startDriving('rover-diff');

    const before = await partCount(app.page);

    await holdKey('w', 2500);
    await expect.poll(async () => (await simState()).stats?.robots[0].forward ?? 0).toBeGreaterThan(0.1);

    for (const key of ['s', 'f', 'Backspace', 'Meta+z']) await app.page.keyboard.press(key);

    const after = await simState();

    expect(await partCount(app.page)).toBe(before);
    expect(after.status).toBe('ready');
    expect(after.drive).toBe('on');
    await stopDriving();
  });

  it('drives an arm with W', async () => {
    await startDriving('arm-6dof');
    expect((await simState()).driveClass).toBe('arm');
    await holdKey('w', 800);
    await expect.poll(async () => (await simState()).stats?.time ?? 0).toBeGreaterThan(1);
    expect((await simState()).stats?.robots[0].fellAt ?? null).toBeNull();
    await stopDriving();
  });

  it('walks a hexapod after its fall check, and says plainly why a biped cannot drive', async () => {
    await startDriving('hexapod');
    await holdKey('w', 3000);
    await expect.poll(async () => (await simState()).stats?.robots[0].forward ?? 0).toBeGreaterThan(0.1);
    await stopDriving();

    await loadFixture('biped-servo');
    await clickTab('Simulate');
    await button(/^Drive$/).click();
    await expect.poll(async () => (await simState()).note ?? '').toMatch(/Two-legged/);
    expect((await simState()).drive).toBe('refused');
  });

  it('asks for the canvas while a text field has focus', async () => {
    await startDriving('rover-diff');
    await app.page.evaluate(() => {
      const field = document.createElement('textarea');

      field.id = 'drive-test-field';
      document.body.append(field);
      field.focus();
    });
    await expect
      .poll(() => app.page.getByTestId('drive-banner').filter({ hasText: 'Click the canvas to drive' }).count())
      .toBe(1);
    await app.page.evaluate(() => document.getElementById('drive-test-field')?.remove());
    await stopDriving();
    expect(app.errors).toEqual([]);
  });
});

describe('Cases', () => {
  it('starts Touch the Dots on an arm, keeps the dots out of parts, and records a try', async () => {
    await loadFixture('arm-3dof');
    await app.page.locator(visible('nav[aria-label="Sidebar views"] button[aria-label="Cases"]')).click();
    await button('Touch the Dots').click();
    await expect.poll(async () => (await simState()).activeCase).toBe('touch-the-dots');
    await expect.poll(() => app.page.getByTestId('case-brief').count()).toBe(1);
    expect(await app.page.getByTestId('case-brief').innerText()).not.toContain('simulation only');

    const partsBefore = await partCount(app.page);

    await button('Try It').click();
    await expect.poll(async () => (await simState()).drive, { timeout: 60000 }).toBe('on');

    const state = await simState();

    expect(state.world).toHaveLength(3);
    expect(state.bodies.flatMap((b) => b.parts)).not.toContain('dot0');
    expect(state.bodies.flatMap((b) => b.world)).toContain('dot0');
    expect(await partCount(app.page)).toBe(partsBefore);

    const clashes = await app.page.evaluate(async () =>
      JSON.stringify(
        await (window as unknown as { __studio: { interference: () => Promise<unknown> } }).__studio.interference(),
      ),
    );

    expect(clashes).not.toContain('dot0');

    await button('End Try').click();
    await expect.poll(async () => (await simState()).tries.length, { timeout: 30000 }).toBe(1);
    expect((await simState()).tries[0].passed).toBe(false);
    await expect.poll(() => app.page.getByTestId('try-row').count()).toBe(1);

    await button('Check Fit').click();
    await expect.poll(() => app.page.getByTestId('robot-fit').innerText(), { timeout: 60000 }).toContain('Compiles');
    expect(app.errors).toEqual([]);
  });
});
