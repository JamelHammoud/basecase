import type { Browser, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import type { ForgeHook } from '../src/forge/forgeHook';
import { launchChrome } from './harness';
import { ARENA_LINE } from './holdPose';

const BUDGET_MS = 15 * 60_000;
const GPU_ARGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'];

interface GalleryState {
  controller: string;
  skill: { hash: string; steps: number } | null;
}

const state = (page: Page) =>
  page.evaluate(() => (window as unknown as { __gallery: { state: () => GalleryState } }).__gallery.state());

const standRow = (page: Page) => page.getByTestId('gallery-card').getByTestId('skill-row').filter({ hasText: 'Stand' });

async function pressTrain(page: Page): Promise<void> {
  await page.getByTestId('gallery-card').getByRole('button', { name: 'Train', exact: true }).click({ timeout: 60000 });
  await standRow(page).waitFor({ timeout: 60000 });
}

let browser: Browser;

describe.runIf(process.platform === 'darwin')('Forge in a tab', () => {
  beforeAll(async () => {
    browser = await launchChrome(GPU_ARGS);
  }, 120000);

  afterAll(async () => {
    await browser?.close();
  });

  it(
    'forge tab trains Stand on WebGPU from the Case card to a passing Arena eval within 15 minutes',
    async () => {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const errors: string[] = [];

      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`${inject('webUrl')}/c/hexapod-reach-the-flag`);

      const started = Date.now();

      await pressTrain(page);
      await expect.poll(() => standRow(page).innerText(), { timeout: BUDGET_MS, interval: 2000 }).toMatch(ARENA_LINE);

      const elapsed = Date.now() - started;
      const events = await page.evaluate(() => (window as unknown as { __forge: ForgeHook }).__forge.events());
      const engine = events.find((e) => typeof e.message === 'string' && e.message.includes('WGSL engine'));

      await expect.poll(async () => (await state(page)).controller, { timeout: 30000 }).toBe('policy');

      const skill = (await state(page)).skill;

      console.log(
        JSON.stringify({ arena: await standRow(page).innerText(), steps: skill?.steps, elapsedS: elapsed / 1000 }),
      );

      expect(engine).toBeTruthy();
      expect(skill?.steps ?? 0).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(BUDGET_MS);
      expect(errors).toEqual([]);
      await page.close();
    },
    BUDGET_MS + 120000,
  );
});
