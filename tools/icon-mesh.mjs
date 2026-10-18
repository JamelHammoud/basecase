#!/usr/bin/env node
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

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
