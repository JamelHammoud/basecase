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
  '.png': 'image/png',
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

function imagesNamedBy(entryUrl: string) {
  const source = readFileSync(path.join('site/content', `${new URL(entryUrl).pathname}.md`), 'utf8');

  return (source.match(/^image:/m) ? 1 : 0) + (source.match(/!\[/g)?.length ?? 0);
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
    expect(await page.locator('nav a[href="/blog"]').count()).toBe(1);

    const entry = page.locator('main ol > li a').first();
    const title = await entry.locator('h2').innerText();

    await entry.click();
    await page.waitForURL(/\/changelog\/[a-z0-9-]+$/);
    expect(await page.locator('h1').innerText()).toBe(title);
    await expect.poll(() => page.locator('article img').count()).toBe(imagesNamedBy(page.url()));
    await expect
      .poll(() =>
        page
          .locator('article img')
          .evaluateAll((images) => images.every((i) => (i as HTMLImageElement).naturalWidth > 0)),
      )
      .toBe(true);

    await page.getByRole('link', { name: 'Changelog', exact: true }).last().click();
    await page.waitForURL(`${base}/changelog`);
    expect(errors).toEqual([]);
    await page.close();
  });

  it('goes from the changelog to a blog post and back', async () => {
    const { page, errors } = await open('/changelog');

    await page.locator('nav a[href="/blog"]').click();
    await page.waitForURL(`${base}/blog`);

    expect(await page.locator('h1').innerText()).toBe('Blog');
    expect(await page.locator('nav a[aria-current="page"]').innerText()).toBe('Blog');

    const post = page.locator('main ul h2 a').first();
    const title = await post.innerText();

    await post.click();
    await page.waitForURL(/\/blog\/[a-z0-9-]+$/);
    expect(await page.locator('article h1').innerText()).toBe(title);

    await page.getByRole('link', { name: 'Blog', exact: true }).last().click();
    await page.waitForURL(`${base}/blog`);
    expect(errors).toEqual([]);
    await page.close();
  });

  it('goes from the landing to a help article through a collection', async () => {
    const { page, errors } = await open('/');

    await page.getByRole('link', { name: 'Help', exact: true }).click();
    await page.waitForURL(`${base}/help`);

    const collection = page.locator('main section').first().locator('a').first();
    const collectionPath = await collection.getAttribute('href');

    await collection.click();
    await page.waitForURL(`${base}${collectionPath}`);
    await page.locator('main section a').first().click();
    await page.waitForURL(/\/help\/[a-z-]+$/);

    expect(await page.locator('nav[aria-label="Breadcrumb"] a').last().getAttribute('href')).toBe(collectionPath);
    expect(await page.locator('article ol > li').count()).toBeGreaterThan(0);
    expect(await fontWeight(page, 'article h1')).toBe('600');
    expect(errors).toEqual([]);
    await page.close();
  });

  it('searches help as you type, from any help page', async () => {
    const { page, errors } = await open('/help/share-a-scene');

    await page.keyboard.press('/');
    await page.keyboard.type('bench sequence');
    await expect
      .poll(() => page.getByRole('option').first().getAttribute('href'))
      .toBe('/help/calibrate-an-emulated-robot');
    await page.keyboard.press('Enter');
    await page.waitForURL(`${base}/help/calibrate-an-emulated-robot`);

    await page.locator('#help-search').fill('zzzz');
    await expect.poll(() => page.locator('#help-search-results').innerText()).toContain('No matches for');
    expect(await page.getByRole('option').first().getAttribute('href')).toMatch(/^\/help\/[a-z-]+$/);
    await page.keyboard.press('Escape');
    expect(await page.locator('#help-search-results').isHidden()).toBe(true);
    expect(errors).toEqual([]);
    await page.close();
  });
});
