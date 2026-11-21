import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Browser } from 'playwright-core';
import { launchChrome } from './harness';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { captureArticle } from '../tools/site/capture.mjs';
import { imageProblem } from '../tools/site/imageHealth.mjs';

let browser: Browser;
let directory: string;

beforeAll(async () => {
  browser = await launchChrome();
  directory = await mkdtemp(path.join(os.tmpdir(), 'basecase-article-capture-'));
});

afterAll(async () => {
  await browser?.close();
  await rm(directory, { recursive: true, force: true });
});

it('waits for the boot overlay, exit state and requested content before saving', async () => {
  const page = await browser.newPage();

  try {
    await page.setContent(
      '<html class="booting"><body><div id="boot">Loading</div><button hidden>Kit</button></body></html>',
    );
    await page.evaluate(() => {
      setTimeout(() => {
        document.querySelector('button')!.hidden = false;
        document.getElementById('boot')!.remove();
        document.documentElement.className = 'boot-leaving';
        setTimeout(() => document.documentElement.classList.remove('boot-leaving'), 50);
      }, 100);
    });

    const destination = path.join(directory, 'nested', 'menu.png');

    await captureArticle(page, { path: destination, ready: page.getByRole('button', { name: 'Kit' }) });
    expect(await page.locator('#boot').count()).toBe(0);
    expect(await page.locator('html').getAttribute('class')).toBe('');
    expect(await imageProblem(await readFile(destination))).toBeNull();
  } finally {
    await page.close();
  }
});

it('refuses a lingering boot screen without replacing an existing image', async () => {
  const page = await browser.newPage();
  const destination = path.join(directory, 'existing.png');

  try {
    await writeFile(destination, 'original');
    await page.setContent('<div id="boot">Loading</div><button>Kit</button>');
    page.setDefaultTimeout(100);
    await expect(
      captureArticle(page, { path: destination, ready: page.getByRole('button', { name: 'Kit' }) }),
    ).rejects.toThrow('Timeout');
    expect(await readFile(destination, 'utf8')).toBe('original');
  } finally {
    await page.close();
  }
});

it('rejects a blank rendered capture without replacing the published image', async () => {
  const page = await browser.newPage();
  const destination = path.join(directory, 'blank.png');

  try {
    await writeFile(destination, 'original');
    await page.setContent('<body style="margin:0;background:#121212;height:100vh"></body>');
    await expect(captureArticle(page, { path: destination, ready: page.locator('body') })).rejects.toThrow('is blank');
    expect(await readFile(destination, 'utf8')).toBe('original');
  } finally {
    await page.close();
  }
});
