import type { Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { galleryBundles } from '../src/gallery/galleryEntries';
import { exposeTestHooks, launchChrome, openApp, partCount, shown, type App } from './harness';

interface SimState {
  status: string;
  drive: string;
  activeCase: string | null;
  stats: { time: number; robots: Array<{ forward: number }> } | null;
}

interface SavedScene {
  id: string;
  name: string;
  parts: unknown[];
}

const rover = galleryBundles().find((b) => b.slug === 'rover-reach-the-flag')!;

let app: App;

const simState = (page: Page) =>
  page.evaluate(() => (window as unknown as { __studio: { simState: () => SimState } }).__studio.simState());

const forward = async (page: Page) => (await simState(page)).stats?.robots[0]?.forward ?? 0;

const sceneWrites = () => app.posts.filter((p) => p.route.startsWith('save-scene'));

async function showLayers(page: Page) {
  const rail = page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Layers"]'));

  if ((await rail.getAttribute('aria-pressed')) !== 'true') await rail.click();
}

beforeAll(async () => {
  app = await openApp({ scenes: [] });
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('first launch', () => {
  it('opens on the rover, already driving to its flag, without saving it', async () => {
    const { page } = app;

    await expect.poll(() => partCount(page), { timeout: 30000 }).toBe(rover.robot.parts.length);
    await showLayers(page);

    for (const part of rover.robot.parts)
      await expect.poll(() => page.locator(shown(`[data-layer-row="part:${part.id}"]`)).count()).toBe(1);

    await expect.poll(async () => (await simState(page)).drive, { timeout: 60000 }).toBe('on');

    const running = await simState(page);

    expect(running.status).toBe('ready');
    expect(running.activeCase).toBe(rover.case.id);
    expect(await page.locator(shown('[role=tab][aria-selected="true"]'), { hasText: 'Simulate' }).count()).toBe(1);
    await expect.poll(() => forward(page), { timeout: 20000 }).toBeGreaterThan(0.1);
    expect((await simState(page)).stats!.time).toBeGreaterThan(running.stats?.time ?? 0);
    expect(sceneWrites()).toEqual([]);
  }, 120000);

  it('moves the base forward while W is held', async () => {
    const { page } = app;

    await page.mouse.click(720, 450);

    const from = await forward(page);

    await page.keyboard.down('w');
    await expect.poll(async () => (await forward(page)) - from, { timeout: 3000, interval: 100 }).toBeGreaterThan(0.2);
    await page.keyboard.up('w');
    expect(sceneWrites()).toEqual([]);
  });

  it('opens the saved scene instead after a relaunch', async () => {
    const { page } = app;

    await page.locator(shown('button[aria-label="New scene"]')).first().click();
    await expect.poll(() => partCount(page)).toBe(0);
    await page.mouse.click(720, 450);
    await page.keyboard.press('a');
    await page.getByRole('button', { name: /^Cube/ }).first().click();
    await expect.poll(() => sceneWrites().length, { timeout: 10000 }).toBeGreaterThan(0);

    const scene = app.posts.filter((p) => p.route === 'save-scene').at(-1)!.body as SavedScene;

    expect(new Set(sceneWrites().map((p) => (p.body as SavedScene).id))).toEqual(new Set([scene.id]));
    expect(scene.parts).toHaveLength(1);

    await page.route('**/api/bridge/scenes', (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ ...scene, partCount: 1 }]) }),
    );
    await page.route(
      (url) => url.pathname === '/api/bridge/scene',
      (route) => {
        const id = new URL(route.request().url()).searchParams.get('id');

        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(id === scene.id ? scene : null) });
      },
    );
    await page.reload();
    await page.waitForFunction(() => Boolean((window as unknown as { __studio?: unknown }).__studio), null, {
      timeout: 60000,
    });
    await expect.poll(() => partCount(page), { timeout: 30000 }).toBe(1);

    const after = await simState(page);

    expect(after.activeCase).toBeNull();
    expect(after.status).toBe('off');
    expect(app.errors).toEqual([]);
  }, 120000);
});

describe('first visit to the web studio', () => {
  it('opens on the rover driving to its flag', async () => {
    const browser = await launchChrome();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    try {
      await exposeTestHooks(page);
      await page.goto(inject('webUrl'));
      await page.waitForFunction(() => Boolean((window as unknown as { __studio?: unknown }).__studio), null, {
        timeout: 60000,
      });
      await expect.poll(() => partCount(page), { timeout: 30000 }).toBe(rover.robot.parts.length);
      await expect.poll(async () => (await simState(page)).drive, { timeout: 60000 }).toBe('on');
      expect((await simState(page)).activeCase).toBe(rover.case.id);
    } finally {
      await browser.close();
    }
  }, 120000);
});
