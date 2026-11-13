import type { Browser, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import type { ForgeHook } from '../src/forge/forgeHook';
import type { TabKitResult } from '../src/forge/tabTraining';
import { launchChrome } from './harness';

const BUDGET_MS = 15 * 60_000;
const GPU_ARGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'];

const RELOADED = /Execution context was destroyed|Target page, context or browser has been closed/;

async function train(page: Page, attempts = 3): Promise<TabKitResult> {
  await page.waitForFunction(() => Boolean((window as unknown as { __forge?: unknown }).__forge), null, {
    timeout: 60000,
  });

  try {
    return await page.evaluate(() =>
      (window as unknown as { __forge: ForgeHook }).__forge.train({ robot: 'quad-servo', entry: 'stand' }),
    );
  } catch (e) {
    if (attempts <= 1 || !RELOADED.test(String(e))) throw e;

    return train(page, attempts - 1);
  }
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
    'forge tab trains Stand on WebGPU to a passing Arena eval within 15 minutes',
    async () => {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const errors: string[] = [];

      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`${inject('webUrl')}/c/hexapod-reach-the-flag`);

      const started = Date.now();
      const result = await train(page);
      const events = await page.evaluate(() => (window as unknown as { __forge: ForgeHook }).__forge.events());
      const engine = events.find((e) => typeof e.message === 'string' && e.message.includes('WGSL engine'));
      const elapsed = Date.now() - started;

      console.log(
        JSON.stringify({ ...result, elapsedS: elapsed / 1000 } satisfies TabKitResult & { elapsedS: number }),
      );

      expect(engine).toBeTruthy();
      expect(result.passed, result.summary).toBe(true);
      expect(result.steps).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(BUDGET_MS);
      expect(errors).toEqual([]);
      await page.close();
    },
    BUDGET_MS + 120000,
  );
});
