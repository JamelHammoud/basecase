#!/usr/bin/env node
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const template = path.resolve('tools/site/og.html');
const out = path.resolve(process.argv[2] ?? 'site/public/og.png');

const browser = await chromium.launch({ channel: 'chrome', headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, colorScheme: 'dark' });

  await page.goto(`file://${template}`);
  await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0));
  await page.screenshot({ path: out });
  console.log(`[og-image] → ${path.relative(process.cwd(), out)}`);
} finally {
  await browser.close();
}
