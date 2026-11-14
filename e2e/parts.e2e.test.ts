import type { Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ProjectSettings } from '../src/types/robotics';
import { deskArmFiles } from '../src/utils/robotImport/robotImport.fixtures';
import { PLAY_RAIL, openApp, shown, type App } from './harness';

let app: App;

const SO101 = 'https://raw.githubusercontent.com/TheRobotStudio/SO-ARM100/main/Simulation/SO101/';
const SIMREADY_SEARCH = 'https://nvidia-simready-central.hf.space/search';
const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const FR3 = 'https://huggingface.co/datasets/frankarobotics/franka-simready/blob/main/fr3/fr3.usd';

const jointCount = () =>
  app.page.evaluate(
    () =>
      (window as unknown as { __studio: { sceneRecord: () => { project: ProjectSettings } } }).__studio.sceneRecord()
        .project.joints?.length ?? 0,
  );

const railButton = (page: Page, name: string) =>
  page.locator(shown(`nav[aria-label="Sidebar views"] button[aria-label="${name}"]`)).first();

const searchField = (page: Page) => page.getByRole('textbox', { name: /^Search parts/ }).first();

async function showParts(page: Page) {
  const rail = railButton(page, 'Parts');

  if ((await rail.getAttribute('aria-pressed')) !== 'true') await rail.click();
}

async function sectionInView(page: Page, section: string) {
  const header = page.locator(shown(`[data-parts-section="${section}"]`)).first();

  await header.waitFor();

  return header.evaluate((el) => {
    const body = el.closest('.overflow-y-auto')!.getBoundingClientRect();
    const { top } = el.getBoundingClientRect();

    return top >= body.top - 1 && top < body.top + body.height / 2;
  });
}

async function serveSo101(page: Page) {
  const files = deskArmFiles('SO101');
  const fileAt = (path: string) =>
    path === 'so101_new_calib.urdf' ? files['SO101/urdf/desk_arm.urdf'] : files[`SO101/urdf/${path}`];

  await page.route(`${SO101}**`, (route) => {
    const bytes = fileAt(decodeURIComponent(route.request().url().slice(SO101.length)));

    return bytes ? route.fulfill({ status: 200, body: Buffer.from(bytes) }) : route.fulfill({ status: 404 });
  });
}

async function fakeSimReady(page: Page, searches: string[]) {
  const hit = {
    url: FR3,
    default_prims: [{ properties: { simready_metadata_asset_name: 'franka_fr3' } }],
  };

  await page.route(SIMREADY_SEARCH, (route) => {
    searches.push(route.request().postDataJSON().hybrid_text_query);

    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([hit]) });
  });
  await page.route('https://nvidia-simready-central.hf.space/images**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(PIXEL, 'base64') }),
  );
}

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Parts', () => {
  it('is one of four views in the rail, beside Play, Layers and Library', async () => {
    const labels = await app.page
      .locator('nav[aria-label="Sidebar views"] button')
      .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));

    expect(labels).toEqual(['Parts', 'Play', 'Layers', 'Library', 'Settings']);
  });

  it('opens on its Robots section from Browse Robots in Play', async () => {
    const { page } = app;

    await page.locator(shown(PLAY_RAIL)).first().click();
    await page.getByRole('button', { name: 'Browse Robots' }).first().click();

    await expect.poll(() => railButton(page, 'Parts').getAttribute('aria-pressed')).toBe('true');
    await expect.poll(() => sectionInView(page, 'Robots')).toBe(true);
    expect(await page.locator(shown('button'), { hasText: 'Quadrupeds' }).count()).toBe(1);
  });

  it('lists object categories in its home and opens one as a scoped search', async () => {
    const { page } = app;

    await showParts(page);

    const kitchen = page.locator('button:visible', { hasText: 'Mugs, pans, knives, cutting boards' });

    await kitchen.scrollIntoViewIfNeeded();
    await kitchen.click();
    await expect.poll(() => page.locator('input[placeholder="Search kitchen"]:visible').count()).toBe(1);

    await page.locator('input[placeholder="Search kitchen"]:visible').press('Escape');
    await expect.poll(() => searchField(page).getAttribute('placeholder')).toBe('Search parts');
  });

  it('lists a preset robot first for its name and inserts it with its joints on ⌘Enter', async () => {
    const { page } = app;

    await serveSo101(page);
    await showParts(page);

    const field = searchField(page);
    const before = await jointCount();

    await field.fill('so-101');
    await expect.poll(() => page.locator(shown('[data-result="0"]')).textContent()).toContain('SO-101 Arm');

    await field.press('ControlOrMeta+Enter');
    await expect.poll(jointCount, { timeout: 30000 }).toBe(before + 2);
    await field.fill('');
  });

  it('searches SimReady only on Enter and lists its results after the local matches', async () => {
    const { page } = app;
    const searches: string[] = [];

    await fakeSimReady(page, searches);
    await showParts(page);

    const field = searchField(page);

    await field.fill('franka');
    await expect.poll(() => page.locator(shown('[data-result="0"]')).textContent()).toContain('Franka Panda');
    expect(searches).toEqual([]);

    await field.press('Enter');

    const tile = page.locator(shown('button'), { hasText: 'Franka Fr3' }).first();

    await tile.waitFor({ timeout: 10000 });
    expect(searches).toEqual(['franka']);

    const local = await page.locator(shown('[data-result="0"]')).boundingBox();
    const simready = await tile.boundingBox();

    expect(simready!.y).toBeGreaterThan(local!.y);
    await field.fill('');
  });

  it('opens its Robots and Objects sections from Show Robots and Show Objects in ⌘K', async () => {
    const { page } = app;

    for (const section of ['Objects', 'Robots']) {
      await page.keyboard.press('Meta+k');
      await page.keyboard.type(`Show ${section}`);
      await page.locator(shown('button[data-idx="0"]'), { hasText: `Show ${section}` }).waitFor();
      await page.keyboard.press('Enter');

      await expect.poll(() => railButton(page, 'Parts').getAttribute('aria-pressed')).toBe('true');
      await expect.poll(() => sectionInView(page, section)).toBe(true);
    }

    expect(app.errors).toEqual([]);
  });
});
