import { chromium, type Browser, type Page } from 'playwright-core';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.xml': 'application/xml',
  '.json': 'application/json',
};

let outDir: string;
let server: Server;
let browser: Browser;
let base: string;

const isFile = (file: string) => statSync(file, { throwIfNoEntry: false })?.isFile() ?? false;

function assetFor(urlPath: string): string | undefined {
  const local = path.join(outDir, path.normalize(decodeURIComponent(urlPath)));

  if (!local.startsWith(outDir)) return undefined;

  return [local, path.join(local, 'index.html'), `${local}.html`].find(isFile);
}

const serveLikeWorkers = () =>
  createServer((request, response) => {
    const file = assetFor(new URL(request.url ?? '/', 'http://site').pathname);

    if (!file) {
      response.writeHead(404).end();

      return;
    }

    response.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    response.end(readFileSync(file));
  });

async function open(urlPath: string) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors: string[] = [];

  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`${base}${urlPath}`);

  return { page, errors };
}

const fontWeight = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((element) => getComputedStyle(element).fontWeight);

beforeAll(async () => {
  outDir = mkdtempSync(path.join(tmpdir(), 'basecase-site-'));
  await build({ configFile: 'site/vite.config.ts', logLevel: 'silent', build: { outDir } });
  server = serveLikeWorkers();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
}, 120000);

afterAll(async () => {
  await browser?.close();
  server?.close();
  rmSync(outDir, { recursive: true, force: true });
});

describe('basecase.so', () => {
  it('goes from the landing to the changelog', async () => {
    const { page, errors } = await open('/');

    await page.getByRole('link', { name: 'Changelog', exact: true }).click();
    await page.waitForURL(`${base}/changelog`);

    await expect.poll(() => page.locator('main ol > li').count()).toBeGreaterThan(0);
    expect(await page.locator('h1').innerText()).toBe('Changelog');
    expect(await fontWeight(page, 'h1')).toBe('600');
    expect(await page.locator('nav a[aria-current="page"]').innerText()).toBe('Changelog');
    expect(await page.locator('nav a[href="/blog"]').count()).toBe(0);

    const entry = page.locator('main ol > li a').first();
    const title = await entry.locator('h2').innerText();

    await entry.click();
    await page.waitForURL(/\/changelog\/[a-z0-9-]+$/);
    expect(await page.locator('h1').innerText()).toBe(title);

    await page.getByRole('link', { name: 'Changelog', exact: true }).last().click();
    await page.waitForURL(`${base}/changelog`);
    expect(errors).toEqual([]);
    await page.close();
  });

  it('goes from the landing to a help article', async () => {
    const { page, errors } = await open('/');

    await page.getByRole('link', { name: 'Help', exact: true }).click();
    await page.waitForURL(`${base}/help`);

    const article = page.locator('main ul h2 a').first();
    const title = await article.innerText();

    await article.click();
    await page.waitForURL(/\/help\/[a-z-]+$/);

    expect(await page.locator('article h1').innerText()).toBe(title);
    expect(await page.locator('article ol > li').count()).toBeGreaterThan(0);
    expect(await fontWeight(page, 'article h1')).toBe('600');
    expect(errors).toEqual([]);
    await page.close();
  });
});
