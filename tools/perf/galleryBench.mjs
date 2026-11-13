import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { chromium } from 'playwright-core';
import { serveStatic } from './benchPage.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DIST = path.join(ROOT, 'node_modules/.cache/gallery-bench/dist');
const BUDGET = { compressedMb: 8, driveSeconds: 6, realTime: 0.97 };
const SLUGS = ['rover-reach-the-flag', 'hexapod-reach-the-flag', 'arm-touch-the-dots'];
const GPU_ARGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];
const TRAINING_FILES = /forge|galleryTrainer|skills\.worker/i;

const args = new Set(process.argv.slice(2));

if (!args.has('--no-build'))
  execFileSync('npx', ['vite', 'build', '--mode', 'web', '--outDir', DIST, '--emptyOutDir'], {
    cwd: ROOT,
    stdio: 'inherit',
  });

const state = (page) => page.evaluate(() => window.__gallery?.state() ?? null);

async function waitFor(page, test, timeoutMs) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const s = await state(page);

    if (s && test(s)) return s;

    await new Promise((r) => setTimeout(r, 50));
  }

  throw new Error('Timed out');
}

async function measure(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  let compressed = 0;
  const training = [];

  page.on('request', (request) => {
    if (TRAINING_FILES.test(new URL(request.url()).pathname)) training.push(request.url());
  });
  page.on('response', async (response) => {
    try {
      compressed += gzipSync(await response.body()).length;
    } catch {}
  });

  const started = Date.now();

  await page.goto(url);
  await waitFor(page, (s) => s.status === 'ready', 60000);
  await page.getByRole('button', { name: 'Drive', exact: true }).click();
  await waitFor(page, (s) => s.drive === 'on', 60000);

  const toDrive = (Date.now() - started) / 1000;

  await page.mouse.click(900, 450);
  await page.keyboard.down('w');
  await new Promise((r) => setTimeout(r, 4000));

  const driving = await state(page);

  await page.keyboard.up('w');
  await page.close();

  return { compressedMb: compressed / 1e6, toDrive, rtf: driving?.stats?.rtf ?? 0, training: training.length };
}

const server = await serveStatic(DIST);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: GPU_ARGS });
let ok = true;

for (const slug of SLUGS) {
  const r = await measure(browser, `${server.url}c/${slug}`);
  const pass =
    r.compressedMb <= BUDGET.compressedMb &&
    r.toDrive <= BUDGET.driveSeconds &&
    r.rtf >= BUDGET.realTime &&
    r.training === 0;

  ok &&= pass;
  console.log(
    `${slug.padEnd(24)} ${r.compressedMb.toFixed(2)} MB compressed, drive in ${r.toDrive.toFixed(1)} s, ${r.rtf.toFixed(2)}× real time, ${r.training} training files ${pass ? 'PASS' : 'FAIL'}`,
  );
}

await browser.close();
server.close();
process.exit(ok ? 0 : 1);
