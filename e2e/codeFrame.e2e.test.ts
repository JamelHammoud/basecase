import { fileURLToPath } from 'node:url';
import type { Browser } from 'playwright-core';
import { build } from 'vite';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { FRAME_END_MS, HELLO_MS, PING_MS } from '../src/cases/console/codeProtocol';
import { launchChrome } from './harness';

let browser: Browser;
let script: string;

beforeAll(async () => {
  const bundle = await build({
    configFile: false,
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' },
    oxc: { jsx: { development: false } },
    build: {
      write: false,
      lib: {
        entry: fileURLToPath(new URL('./codeFrameFixture.jsx', import.meta.url)),
        formats: ['iife'],
        name: 'FrameTest',
      },
    },
  });
  const outputs = Array.isArray(bundle) ? bundle : [bundle];

  script = outputs
    .flatMap((output) => ('output' in output ? output.output : []))
    .filter((output) => output.type === 'chunk')
    .map((chunk) => chunk.code)
    .join('\n');
  browser = await launchChrome();
});

afterAll(async () => {
  await browser?.close();
});

it('keeps the page drawing and disposes an infinitely looping production CodeFrame without starting the studio', async () => {
  const page = await browser.newPage();
  const panelUrls: string[] = [];
  const errors: string[] = [];

  page.on('pageerror', (error) => errors.push(error.message));
  page.on('framenavigated', (frame) => {
    if (frame.parentFrame()) panelUrls.push(frame.url());
  });
  await page.route('http://code-frame.test/', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><div id="root"></div>' }),
  );

  try {
    await page.goto('http://code-frame.test/');
    await page.addScriptTag({ content: script });
    await page.locator('[data-testid="code-frame"]').waitFor({ state: 'attached' });

    const frames = page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let count = 0;
          const tick = () => {
            count++;

            if (document.querySelector('[data-testid="code-failed"]')) resolve(count);
            else requestAnimationFrame(tick);
          };

          requestAnimationFrame(tick);
        }),
    );

    await page.locator('[data-testid="code-failed"]').waitFor({ timeout: HELLO_MS + FRAME_END_MS + PING_MS });
    expect(await frames).toBeGreaterThan(3);
    expect(await page.locator('[data-testid="code-failed"]').textContent()).toBe(
      'Couldn’t run Spin. It didn’t answer.',
    );
    expect(await page.locator('iframe').count()).toBe(0);
    expect(panelUrls).toContain('about:blank');
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
});
