import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { raiseRightArm } from '../src/cameras/operator/fixtures/raiseRightArm';
import type { PoseSample } from '../src/cameras/operator/poseFollow';
import { FAKE_DAEMON_SCRIPT } from './fakeDaemon';
import { g1Humanoid } from './g1Fixture';
import { FAKE_CAMERA, openApp, openPlayTab, partCount, shown, type App } from './harness';

type StudioWindow = {
  __studio: {
    load: (record: unknown) => void;
    attachRobot: (link: unknown) => void;
    feedPose: (samples: PoseSample[]) => void;
    simState: () => { drive: string };
    operatorCamera: () => { open: boolean; live: boolean };
    robotGhost: () => { measured: Record<string, number | null> | null };
  };
  __fakeRobotLink: { robotDisconnect: () => Promise<unknown> };
};

interface PlayedVideo {
  width: number;
  duration: number;
  time: number;
}

const G1 = g1Humanoid();
const RAISED_DEG = -10;
const VIDEO = '[data-testid="try-video"]';

let app: App;

const simState = () => app.page.evaluate(() => (window as unknown as StudioWindow).__studio.simState());

const mode = () => app.page.locator(shown('[data-testid="robot-mode"]')).first().getAttribute('data-mode');

const measuredShoulder = async () =>
  (await app.page.evaluate(() => (window as unknown as StudioWindow).__studio.robotGhost())).measured
    ?.right_shoulder_pitch_joint ?? 0;

const keptVideos = () =>
  fs
    .readdirSync(app.triesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(app.triesDir, entry.name, 'video.mp4')));

const played = () =>
  app.page.evaluate((selector): PlayedVideo | null => {
    const video = document.querySelector<HTMLVideoElement>(selector);

    return video && { width: video.videoWidth, duration: video.duration, time: video.currentTime };
  }, VIDEO);

async function rung(name: string) {
  await app.page
    .locator(shown(`[data-robot-rung="${name}"]`))
    .first()
    .click();
  await expect.poll(mode).toBe(name);
}

async function command(label: string) {
  await app.page.keyboard.press('Meta+k');
  await app.page.keyboard.type(label);
  await app.page.locator(shown('button[data-idx="0"]'), { hasText: label }).waitFor();
  await app.page.keyboard.press('Enter');
}

beforeAll(async () => {
  app = await openApp({}, [], { args: FAKE_CAMERA });
  await app.page.addScriptTag({ content: FAKE_DAEMON_SCRIPT });
  await app.page.evaluate(() => {
    const w = window as unknown as StudioWindow;

    w.__studio.attachRobot(w.__fakeRobotLink);
  });
  await app.page.evaluate((record) => (window as unknown as StudioWindow).__studio.load(record), G1);
  await vi.waitFor(async () => expect(await partCount(app.page)).toBe(G1.parts.length), { timeout: 10000 });
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('the operator camera’s video on an Operate try', () => {
  it.skipIf(process.platform === 'win32')(
    'keeps the camera’s video with a G1 session driven by camera, and plays it in step with the try timeline',
    async () => {
      const { page } = app;

      await openPlayTab(page, 'Operate');
      await page.locator(shown('button'), { hasText: 'Connect Emulated Robot' }).first().click();
      await rung('set_up');
      await rung('test');
      await page.evaluate((samples) => (window as unknown as StudioWindow).__studio.feedPose(samples), raiseRightArm());
      await command('Drive with Camera');
      await expect.poll(async () => (await simState()).drive, { timeout: 60000 }).toBe('on');
      expect(await page.evaluate(() => (window as unknown as StudioWindow).__studio.operatorCamera())).toMatchObject({
        open: true,
        live: true,
      });
      await expect.poll(measuredShoulder, { timeout: 30000 }).toBeLessThan(RAISED_DEG);

      await page.mouse.click(720, 450);
      await page.keyboard.press('Escape');
      await expect.poll(async () => (await simState()).drive).toBe('off');
      await openPlayTab(page, 'Operate');
      await rung('look');
      await expect.poll(() => keptVideos().length, { timeout: 30000 }).toBe(1);

      await page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Library"]')).click();
      await page.locator(shown('[data-testid="library-tries"] button')).first().click();
      await page.locator(shown('[data-testid="try-tile"]'), { hasText: 'Operate' }).first().click({ timeout: 20000 });
      await expect.poll(async () => (await played())?.width ?? 0, { timeout: 30000 }).toBeGreaterThan(0);
      expect((await played())!.duration).toBeGreaterThan(2);

      await page.keyboard.press('Home');
      await page.keyboard.press('Shift+ArrowRight');
      await page.keyboard.press('Shift+ArrowRight');
      await expect.poll(async () => (await played())!.time).toBeCloseTo(2, 1);
      expect(app.errors).toEqual([]);
      await page.evaluate(() => (window as unknown as StudioWindow).__fakeRobotLink.robotDisconnect());
    },
    180000,
  );
});
