import fs from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium, type Browser, type Page } from 'playwright-core';
import { preview, type PreviewServer } from 'vite';
import { expect } from 'vitest';
import { repoPath } from '../lib/need';
import { DRIVE_BARS, type ClockSample } from './driveJudge';
import { installTap, maxBodyTravelMm, renderedFrame, tapState, type Fault, type TapState } from './workerTap';

const WEB_OUT = 'verify/out/gallery-web';

interface GalleryState {
  status: string;
  drive: string;
  stats: { time: number } | null;
}

export interface GalleryHost {
  base: string;
  browser: Browser;
  close: () => Promise<void>;
}

export async function openGallery(): Promise<GalleryHost> {
  if (!fs.existsSync(repoPath(WEB_OUT, 'index.html')))
    throw new Error(`No web build in ${WEB_OUT}: the gate builds it before this test`);

  const server: PreviewServer = await preview({
    configFile: repoPath('vite.config.ts'),
    mode: 'web',
    build: { outDir: repoPath(WEB_OUT) },
    preview: { port: 0, strictPort: false },
    logLevel: 'silent',
  });
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });

  return {
    base: server.resolvedUrls!.local[0].replace(/\/$/, ''),
    browser,
    close: async () => {
      await browser.close();
      await server.close();
    },
  };
}

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

export interface GalleryDrive {
  samples: ClockSample[];
  movedMm: number;
  errors: string[];
  tap: TapState | null;
}

export async function driveGallery(host: GalleryHost, slug: string, fault: Fault = 'none'): Promise<GalleryDrive> {
  const page = await host.browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors: string[] = [];

  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(installTap, fault);
  await page.goto(`${host.base}/c/${slug}`);
  await expect.poll(() => page.getByTestId('gallery-card').count(), { timeout: 60000 }).toBe(1);
  await expect.poll(async () => (await state(page))?.status, { timeout: 60000 }).toBe('ready');
  await page.getByTestId('gallery-card').getByRole('button', { name: 'Drive', exact: true }).click();
  await expect.poll(async () => (await state(page))?.drive, { timeout: 60000 }).toBe('on');
  await page.mouse.click(900, 450);
  await page.keyboard.down('w');

  const before = await renderedFrame(page);
  const samples = await measure(page);
  const after = await renderedFrame(page);

  await page.keyboard.up('w');

  const tap = await tapState(page);

  await page.close();

  if (!before || !after) throw new Error(`setup: no sim frame reached the gallery page (${JSON.stringify(tap)})`);

  return { samples, movedMm: maxBodyTravelMm(before, after), errors, tap };
}

export const motionProblems = (movedMm: number) =>
  movedMm >= DRIVE_BARS.galleryMoveMm
    ? []
    : [`no simulated body moved ${DRIVE_BARS.galleryMoveMm} mm while W was held (most ${movedMm.toFixed(1)} mm)`];
