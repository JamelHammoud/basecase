import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ARM } from './armFixture';
import { FAKE_DAEMON_SCRIPT } from './fakeDaemon';
import { openApp, openPlayTab, partCount, shown, type App } from './harness';

let app: App;

interface StoredTake {
  joints: string[];
  t: number[];
  position: number[];
}

type StudioWindow = {
  __studio: {
    load: (r: unknown) => void;
    attachRobot: (link: unknown) => void;
    drive: (command: { v: number[]; aux?: number[] }) => void;
    simState: () => { drive: string; activeCase: string | null };
    robotTake: (id: string) => Promise<StoredTake | null>;
  };
  __fakeRobotLink: {
    onRobotEvent: (listen: (event: { event: string; joints?: Array<{ position: number | null }> }) => void) => void;
    plantStall: (id: number) => boolean;
    robotDisconnect: () => Promise<unknown>;
  };
  __statuses: number[][];
};

const ARM_JOINTS = ARM.project.joints.map((joint) => joint.id);
const RAD_PER_COUNT = (2 * Math.PI) / 4096;

const button = (name: string | RegExp) => app.page.locator(shown('button'), { hasText: name }).first();

const simState = () => app.page.evaluate(() => (window as unknown as StudioWindow).__studio.simState());

const drive = (x: number) =>
  app.page.evaluate((v) => (window as unknown as StudioWindow).__studio.drive({ v: [v, 0, 0], aux: [0, 0] }), x);

const mode = () => app.page.locator(shown('[data-testid="robot-mode"]')).first().getAttribute('data-mode');

async function rung(name: string) {
  await app.page
    .locator(shown(`[data-robot-rung="${name}"]`))
    .first()
    .click();
  await expect.poll(mode).toBe(name);
}

async function driveInTest(seconds: number) {
  await openPlayTab(app.page, 'Operate');
  await rung('set_up');
  await rung('test');
  await app.page.locator(shown('[role=tab]'), { hasText: 'Simulate' }).first().click();

  if ((await simState()).drive !== 'on') await button(/^Drive$/).click();

  await expect.poll(async () => (await simState()).drive, { timeout: 60000 }).toBe('on');

  for (const v of [1, -1]) {
    await drive(v);
    await app.page.waitForTimeout((seconds * 1000) / 2);
  }

  await drive(0);
}

const tiles = () => app.page.locator(shown('[data-testid="try-tile"]'), { hasText: 'Operate' });

const near = (a: number[], b: number[]) => a.every((v, k) => Math.abs(v - b[k]) < 1e-4);

beforeAll(async () => {
  app = await openApp();
  await app.page.addScriptTag({ content: FAKE_DAEMON_SCRIPT });
  await app.page.evaluate(() => {
    const w = window as unknown as StudioWindow;

    w.__statuses = [];
    w.__fakeRobotLink.onRobotEvent((e) => {
      if (e.event === 'status') w.__statuses.push((e.joints ?? []).map((j) => j.position ?? NaN));
    });
    w.__studio.attachRobot(w.__fakeRobotLink);
  });
  await app.page.evaluate((r) => (window as unknown as StudioWindow).__studio.load(r), ARM);
  await vi.waitFor(async () => expect(await partCount(app.page)).toBe(ARM.parts.length), { timeout: 10000 });
  await openPlayTab(app.page, 'Operate');
  await button('Connect Emulated Robot').click();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Operate sessions as tries', () => {
  it.skipIf(process.platform === 'win32')(
    'keeps a driven Test session as an Operate try in Library ▸ Tries, and replays a stall from its try',
    async () => {
      const { page } = app;

      await driveInTest(5);
      await openPlayTab(page, 'Operate');
      await rung('look');
      await page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Library"]')).click();
      await page.locator(shown('[data-testid="library-tries"] button')).first().click();
      await expect.poll(() => tiles().count(), { timeout: 20000 }).toBe(1);

      const id = (await tiles().first().getAttribute('data-try')) ?? '';
      const take = await page.evaluate((tryId) => (window as unknown as StudioWindow).__studio.robotTake(tryId), id);
      const statuses = await page.evaluate(() => (window as unknown as StudioWindow).__statuses);
      const sent = statuses.map((row) => row.map((c) => (c - 2048) * RAD_PER_COUNT));
      const width = take!.joints.length;
      const rows = take!.t.map((_, n) => take!.position.slice(n * width, (n + 1) * width));

      expect(take!.joints).toEqual(ARM_JOINTS);
      expect(rows.length).toBeGreaterThan(30);
      expect(Math.max(...rows.map((row) => Math.abs(row[0] - rows[0][0])))).toBeGreaterThan(0.02);
      expect(rows.filter((row) => !sent.some((status) => near(row, status)))).toEqual([]);

      await tiles().first().click();
      await expect.poll(() => page.getByTestId('timeline-lane').count(), { timeout: 30000 }).toBeGreaterThan(0);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await expect.poll(() => page.getByTestId('tries-mode').count()).toBe(0);

      await driveInTest(2);
      expect(await page.evaluate(() => (window as unknown as StudioWindow).__fakeRobotLink.plantStall(2))).toBe(true);
      await openPlayTab(page, 'Operate');
      await page.locator(shown('[data-robot-message="fault"] button'), { hasText: 'Replay in Sim' }).first().click();
      await expect.poll(async () => (await simState()).activeCase).toMatch(/^fault-at-/);
      expect(app.errors).toEqual([]);
      await page.evaluate(() => (window as unknown as StudioWindow).__fakeRobotLink.robotDisconnect());
    },
    180000,
  );
});
