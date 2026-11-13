import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ProjectSettings } from '../src/types/robotics';
import { deskArmFiles } from '../src/utils/robotImport/robotImport.fixtures';
import { openApp, type App } from './harness';

type Studio = { checkDots: () => number; sceneRecord: () => { project: ProjectSettings } };

const SO101 = 'https://raw.githubusercontent.com/TheRobotStudio/SO-ARM100/main/Simulation/SO101/';

let app: App;

const visible = (selector: string) => `${selector}:not([inert] *):visible`;

const dotCount = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.checkDots());

const jointCount = () =>
  app.page.evaluate(
    () => (window as unknown as { __studio: Studio }).__studio.sceneRecord().project.joints?.length ?? 0,
  );

const checks = () => app.page.locator(visible('section'), { hasText: /^Checks/ }).first();

const payloadRow = () => checks().locator('button', { hasText: /^Payload$/ });

async function serveSo101() {
  const files = deskArmFiles();
  const fileAt = (path: string) =>
    path === 'so101_new_calib.urdf' ? files['desk_arm/urdf/desk_arm.urdf'] : files[`desk_arm/urdf/${path}`];

  await app.page.route(`${SO101}**`, (route) => {
    const bytes = fileAt(decodeURIComponent(route.request().url().slice(SO101.length)));

    return bytes ? route.fulfill({ status: 200, body: Buffer.from(bytes) }) : route.fulfill({ status: 404 });
  });
}

beforeAll(async () => {
  app = await openApp();
  await serveSo101();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Payload', () => {
  it('shows how much an inserted arm lifts, and maps it on the canvas while expanded', async () => {
    await app.page.keyboard.press('Meta+k');
    await app.page.keyboard.type('Insert SO-101 Arm');
    await app.page.keyboard.press('Enter');
    await expect.poll(jointCount, { timeout: 30000 }).toBe(2);

    await app.page.locator(visible('[role=tab]'), { hasText: 'Build' }).first().click();
    await expect.poll(() => payloadRow().count(), { timeout: 60000 }).toBe(1);
    expect(await dotCount()).toBe(0);

    await payloadRow().click();
    await expect.poll(async () => (await checks().textContent()) ?? '').toMatch(/[\d.]+ k?g at full reach/);
    await expect.poll(dotCount).toBeGreaterThan(100);

    await payloadRow().click();
    await expect.poll(dotCount).toBe(0);
    expect(app.errors).toEqual([]);
  }, 150000);
});
