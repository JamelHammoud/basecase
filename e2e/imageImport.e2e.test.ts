import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { zipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { expect, inject, it } from 'vitest';
import { startFakeRoboflow } from './fakeRoboflow';
import { openApp, shown, type App } from './harness';
import { cocoImportFiles } from './imageImportFixture';

async function importCocoFolder(app: App, root: string) {
  for (const [name, bytes] of Object.entries(cocoImportFiles())) {
    const file = join(root, name);

    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, bytes);
  }

  await app.page.keyboard.press('ControlOrMeta+k');
  await app.page.keyboard.type('Import Robot');
  await app.page.keyboard.press('Enter');
  await app.page.locator('input[webkitdirectory]').setInputFiles(join(root, 'coco-mugs'));
}

async function importRoboflowLink(app: App) {
  await app.page.keyboard.press('ControlOrMeta+k');
  await app.page.keyboard.type('Import Robot');
  await app.page.keyboard.press('Enter');
  await app.page.getByLabel('Robot link').fill('https://universe.roboflow.com/workspace/project/dataset/2');
  await app.page.keyboard.press('Enter');
}

const datasets = (app: App) => app.page.locator(shown('[data-testid="library-datasets"]'));

async function showLibrary(app: App) {
  const library = app.page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Library"]'));

  if ((await library.getAttribute('aria-pressed')) !== 'true') await library.click();
}

it('imports a COCO folder and a Roboflow version into Library with their image and class counts', async () => {
  const fake = await startFakeRoboflow({
    key: 'roboflow_e2e_key',
    port: inject('roboflowPort'),
    archive: zipSync(cocoImportFiles('roboflow-mugs', ['cup', 'plate'])),
  });
  const app = await openApp({}, [], { roboflowUrl: fake.url });
  const root = mkdtempSync(join(tmpdir(), 'image-import-'));

  try {
    await importCocoFolder(app, root);
    await showLibrary(app);

    const coco = datasets(app).getByRole('button').filter({ hasText: 'coco-mugs' });

    await expect.poll(() => coco.textContent()).toContain('2 images, 2 classes');
    await coco.click();
    await expect.poll(() => app.page.getByTestId('dataset-pane').textContent()).toContain('2 images');
    expect(await app.page.getByTestId('dataset-pane').textContent()).toContain('2 classes');
    await app.page.keyboard.press('Escape');
    await importRoboflowLink(app);

    const key = app.page.locator(shown('input[aria-label="Roboflow API key"]'));

    await key.waitFor();
    expect(await key.evaluate((input) => input === document.activeElement)).toBe(true);
    expect(fake.requests).toEqual([]);
    await key.fill('roboflow_e2e_key');
    await key.press('Enter');
    await expect.poll(() => key.inputValue()).toBe('');
    await app.page.keyboard.press('Escape');
    await importRoboflowLink(app);
    await showLibrary(app);

    const roboflow = datasets(app).getByRole('button').filter({ hasText: 'project' });

    await expect.poll(() => roboflow.textContent()).toContain('2 images, 2 classes');
    expect(await datasets(app).getByRole('button').count()).toBe(2);
    expect(fake.requests).toContainEqual({ path: '/workspace/project/2/coco', key: 'roboflow_e2e_key' });
    expect(fake.requests).toContainEqual({ path: '/archive.zip', key: null });
    expect(JSON.stringify(await app.page.evaluate(() => localStorage))).not.toContain('roboflow_e2e_key');
    expect(app.errors).toEqual([]);
  } finally {
    await app.close();
    await fake.close();
    rmSync(root, { recursive: true, force: true });
  }
});
