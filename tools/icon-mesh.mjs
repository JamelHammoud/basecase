#!/usr/bin/env node
/**
 * Renders the app icon's mesh-gradient background (build/icon/mesh.html) to a PNG.
 *
 *   node tools/icon-mesh.mjs [seed] [out.png] [palette]      (palette: grey, the default, or blue)
 *
 * Defaults to the chosen seed and Basecase.icon/Assets/background.png, the background layer of
 * the layered icon. Run `npm run icon` afterwards to recompile Assets.car and the .icns.
 */
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

// The seed picked for the shipped icon, in the grey palette (compared through macOS's own renderer)
const SEED = 7;

const seed = Number(process.argv[2] ?? SEED);
const out = path.resolve(process.argv[3] ?? 'build/icon/Basecase.icon/Assets/background.png');
const palette = process.argv[4] ?? 'grey';
const page_ = path.resolve('build/icon/mesh.html');

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
  await page.goto(`file://${page_}?seed=${seed}&palette=${palette}`);
  await page.waitForFunction(() => document.title === 'ready');
  await page.waitForTimeout(200);
  await page.screenshot({ path: out, omitBackground: false });
  console.log(`[icon-mesh] ${palette} seed ${seed} → ${path.relative(process.cwd(), out)}`);
} finally {
  await browser.close();
}
