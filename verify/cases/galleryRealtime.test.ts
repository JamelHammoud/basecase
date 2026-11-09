import fs from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium, type Browser, type Page } from 'playwright-core';
import { preview, type PreviewServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { galleryIndex } from '../../src/gallery/galleryEntries';
import { repoPath } from '../lib/need';
import { DRIVE_BARS, realtimeProblems, type ClockSample } from './driveJudge';

const WEB_OUT = 'verify/out/gallery-web';

interface GalleryState {
  status: string;
  drive: string;
  stats: { time: number } | null;
}

let server: PreviewServer;
let browser: Browser;
let base: string;

const state = (page: Page) =>
  page.evaluate(() => (window as unknown as { __gallery?: { state: () => GalleryState } }).__gallery?.state() ?? null);

async function clock(page: Page): Promise<ClockSample> {
  return page.evaluate(() => ({
    wallS: performance.now() / 1000,
    simS:
      (window as unknown as { __gallery: { state: () => GalleryState } }).__gallery.state().stats?.time ?? Number.NaN,
  }));
}

async function measure(page: Page): Promise<ClockSample[]> {
  const samples = [await clock(page)];
  const until = samples[0].wallS + DRIVE_BARS.realtimeSeconds;

  while (samples.at(-1)!.wallS < until) {
    await sleep(1000);
    samples.push(await clock(page));
  }

  return samples;
}

beforeAll(async () => {
  if (!fs.existsSync(repoPath(WEB_OUT, 'index.html')))
    throw new Error(`No web build in ${WEB_OUT}: the gate builds it before this test`);

  server = await preview({
    configFile: repoPath('vite.config.ts'),
    mode: 'web',
    build: { outDir: repoPath(WEB_OUT) },
    preview: { port: 0, strictPort: false },
    logLevel: 'silent',
  });
  base = server.resolvedUrls!.local[0].replace(/\/$/, '');
  browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
}, 180000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

describe('gallery links from the production web build run at 1.0x real time in a headless browser', () => {
  for (const { slug } of galleryIndex()) {
    it(`/c/${slug} loads, drives and keeps real time`, async () => {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const errors: string[] = [];

      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`${base}/c/${slug}`);
      await expect.poll(() => page.getByTestId('gallery-card').count(), { timeout: 60000 }).toBe(1);
      await expect.poll(async () => (await state(page))?.status, { timeout: 60000 }).toBe('ready');
      await page.getByTestId('gallery-card').getByRole('button', { name: 'Drive', exact: true }).click();
      await expect.poll(async () => (await state(page))?.drive, { timeout: 60000 }).toBe('on');
      await page.mouse.click(900, 450);
      await page.keyboard.down('w');

      const samples = await measure(page);

      await page.keyboard.up('w');
      expect(realtimeProblems(samples)).toEqual([]);
      expect(errors).toEqual([]);
      await page.close();
    }, 240000);
  }
});
