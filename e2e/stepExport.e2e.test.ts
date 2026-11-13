import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openApp, partCount, type App } from './harness';

interface Studio {
  parts: () => Array<{ name: string; kind: string }>;
  lastDownload: () => { name: string; base64: string } | null;
}

let app: App;

const visible = (selector: string) => `${selector}:not([inert] *):visible`;

const kernelModule = (file: string) =>
  import(pathToFileURL(path.resolve('electron', 'cad-kernel', ...file.split('/'))).href);

async function exportInNodeHost(job: unknown) {
  const [{ createNodeKernel }, { exportStepFile }] = await Promise.all([
    kernelModule('nodeHost/client.mjs'),
    kernelModule('stepExport.mjs'),
  ]);
  const kernel = createNodeKernel();

  try {
    return await exportStepFile(kernel, job);
  } finally {
    kernel.stopKernels();
  }
}

const partNames = () =>
  app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.parts().map((p) => p.name));

const lastDownload = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.lastDownload());

const partsShown = () =>
  app.page.evaluate(() => {
    const aside = [...document.querySelectorAll('aside')].find((a) => !a.closest('[inert]'));

    return aside?.style.width !== '0px' && aside?.querySelector('h2')?.textContent === 'Parts';
  });

async function showParts() {
  if (!(await partsShown()))
    await app.page.locator(visible('nav[aria-label="Sidebar views"] button[aria-label="Parts"]')).click();

  await expect.poll(partsShown).toBe(true);
}

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('STEP export', () => {
  it('exports a box and a catalog servo from ⌘K as one STEP file that names both', async () => {
    await app.page.route('**/api/bridge/cad-export-step', async (route) =>
      route.fulfill({ json: await exportInNodeHost(route.request().postDataJSON()) }),
    );

    await app.page.keyboard.press('a');
    await app.page.getByRole('button', { name: /^Cube/ }).first().click();
    await showParts();
    await app.page.getByLabel('Search parts').fill('STS3215');

    const row = app.page.locator('[data-result]:visible', { hasText: 'Feetech STS3215' }).first();

    await row.hover();
    await row.getByRole('button', { name: 'Add' }).click();
    await expect.poll(() => partCount(app.page)).toBe(2);

    const names = await partNames();

    await app.page.keyboard.press('Escape');
    await app.page.keyboard.press('Meta+k');
    await app.page.keyboard.type('Export STEP');
    await app.page.keyboard.press('Enter');

    await expect.poll(async () => (await lastDownload())?.name, { timeout: 60000 }).toMatch(/\.step$/);

    const file = await lastDownload();
    const text = Buffer.from(file!.base64, 'base64').toString('utf8');

    expect(text.startsWith('ISO-10303-21;')).toBe(true);

    for (const name of names) expect(text).toContain(`PRODUCT('${name}'`);

    expect(app.errors).toEqual([]);
  }, 120000);
});
