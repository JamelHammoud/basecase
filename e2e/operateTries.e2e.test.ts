import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ARM } from './armFixture';
import { FAKE_DAEMON_SCRIPT } from './fakeDaemon';
import { openApp, openPlayTab, partCount, shown, type App } from './harness';

let app: App;

const ARM_JOINTS = ARM.project.joints.map((joint) => joint.id);
const COUNTS_PER_RAD = 4096 / (2 * Math.PI);

interface FakeLink {
  statuses: Array<Array<number | null>>;
  plantStall: (id: number) => boolean;
  robotDisconnect: () => Promise<unknown>;
}

type StudioWindow = {
  __studio: {
    attachRobot: (link: unknown) => void;
    load: (r: unknown) => void;
    drive: (command: { v: number[] } | null) => void;
    simState: () => { drive: string; activeCase: string | null };
    tryLanes: (id: string) => Promise<Record<string, number[]> | null>;
  };
  __fakeRobotLink: FakeLink;
};

const button = (name: string | RegExp) => app.page.locator(shown('button'), { hasText: name }).first();

const mode = () => app.page.locator(shown('[data-testid="robot-mode"]')).first().getAttribute('data-mode');

const simDrive = () => app.page.evaluate(() => (window as unknown as StudioWindow).__studio.simState().drive);

const drive = (v: number[] | null) =>
  app.page.evaluate((command) => (window as unknown as StudioWindow).__studio.drive(command), v && { v });

const operateTiles = () => app.page.locator(shown('[data-testid="try-tile"][data-try^="operate-"]'));

async function climbToTest() {
  await openPlayTab(app.page, 'Operate');

  if (await button(/^Disconnect$/).count()) await button(/^Disconnect$/).click();

  await button('Connect Emulated Robot').click();

  for (const rung of ['set_up', 'test']) {
    await app.page
      .locator(shown(`[data-robot-rung="${rung}"]`))
      .first()
      .click();
    await expect.poll(mode).toBe(rung);
  }
}

async function driveFor(ms: number) {
  await app.page.locator(shown('[role=tab]'), { hasText: 'Simulate' }).first().click();

  if ((await simDrive()) !== 'on') await button(/^Drive$/).click();

  await expect.poll(simDrive, { timeout: 60000 }).toBe('on');
  await drive([1, 0, 0]);
  await app.page.waitForTimeout(ms / 2);
  await drive([-1, 0, 0]);
  await app.page.waitForTimeout(ms / 2);
  await drive(null);
}

async function openTries() {
  await app.page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Library"]')).click();
  await app.page.locator(shown('[data-testid="library-tries"] button')).first().click();
}

beforeAll(async () => {
  app = await openApp();
  await app.page.addScriptTag({ content: FAKE_DAEMON_SCRIPT });
  await app.page.evaluate(() => {
    const w = window as unknown as StudioWindow;

    w.__studio.attachRobot(w.__fakeRobotLink);
  });
  await app.page.evaluate((r) => (window as unknown as StudioWindow).__studio.load(r), ARM);
  await vi.waitFor(async () => expect(await partCount(app.page)).toBe(ARM.parts.length), { timeout: 10000 });
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Operate tries', () => {
  it.skipIf(process.platform === 'win32')(
    'records a driven Test session as an Operate try whose lanes match the robot, and replays a stall from its try',
    async () => {
      const { page } = app;

      await climbToTest();
      await driveFor(5000);
      await openPlayTab(page, 'Operate');

      await page.locator(shown('[data-robot-rung="look"]')).first().click();
      await expect.poll(mode).toBe('look');
      await openTries();
      await expect.poll(() => operateTiles().count(), { timeout: 30000 }).toBe(1);
      expect(await operateTiles().first().textContent()).toContain('Operate');

      const id = (await operateTiles().first().getAttribute('data-try'))!;
      const lanes = await page.evaluate((tryId) => (window as unknown as StudioWindow).__studio.tryLanes(tryId), id);
      const statuses = await page.evaluate(() =>
        (window as unknown as StudioWindow).__fakeRobotLink.statuses.map((s) =>
          s.map((c) => (c === null ? 0 : c - 2048)),
        ),
      );

      expect(lanes).not.toBeNull();

      const frames = lanes![ARM_JOINTS[0]].length;

      expect(frames).toBeGreaterThan(50);
      ARM_JOINTS.forEach((joint, k) => {
        const gaps = lanes![joint].map((q, n) => Math.abs(q - statuses[n][k] / COUNTS_PER_RAD));

        expect(Math.max(...gaps)).toBeLessThan(0.001);
      });
      expect(Math.max(...lanes![ARM_JOINTS[0]]) - Math.min(...lanes![ARM_JOINTS[0]])).toBeGreaterThan(0.05);

      await page.keyboard.press('Escape');
      await climbToTest();
      await driveFor(3000);
      expect(await page.evaluate(() => (window as unknown as StudioWindow).__fakeRobotLink.plantStall(2))).toBe(true);
      await openPlayTab(page, 'Operate');
      await page.locator(shown('[data-robot-message="fault"] button'), { hasText: 'Replay in Sim' }).first().click();
      await expect
        .poll(
          async () => (await page.evaluate(() => (window as unknown as StudioWindow).__studio.simState())).activeCase,
        )
        .toMatch(/^fault-at-/);
      await openTries();
      await expect.poll(() => operateTiles().count(), { timeout: 30000 }).toBe(2);
      expect(app.errors).toEqual([]);
      await page.evaluate(() => (window as unknown as StudioWindow).__fakeRobotLink.robotDisconnect());
    },
    180000,
  );
});
