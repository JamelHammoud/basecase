import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { zipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { expect, it } from 'vitest';
import {
  connectRoboflow,
  holdRoboflowExport,
  importRoboflowLink,
  openRobotImport,
  withRoboflowApp,
} from './imageImportActions';
import { expectPanelReadable } from './appearanceLayout';
import { shown, type App } from './harness';
import { cocoImportFiles } from './imageImportFixture';

async function importCocoFolder(app: App, root: string) {
  for (const [name, bytes] of Object.entries(cocoImportFiles())) {
    const file = join(root, name);

    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, bytes);
  }

  await openRobotImport(app);
  await app.page.locator('input[webkitdirectory]').setInputFiles(join(root, 'coco-mugs'));
}

const datasets = (app: App) => app.page.locator(shown('[data-testid="library-datasets"]'));

async function showLibrary(app: App) {
  const library = app.page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Library"]'));

  if ((await library.getAttribute('aria-pressed')) !== 'true') await library.click();
}

it('imports a COCO folder and continues the resolved Roboflow version into Library with their image and class counts', async () => {
  await withRoboflowApp(
    {
      archive: zipSync(cocoImportFiles('new-version', ['new', 'different'])),
      versionArchives: { 2: zipSync(cocoImportFiles('roboflow-mugs', ['cup', 'plate'])) },
      exportReply: { status: 202, body: { progress: 25 } },
    },
    async (app, fake) => {
      const root = mkdtempSync(join(tmpdir(), 'image-import-'));

      try {
        await app.page.setViewportSize({ width: 1240, height: 720 });
        await importCocoFolder(app, root);
        await showLibrary(app);

        const coco = datasets(app).getByRole('button').filter({ hasText: 'coco-mugs' });

        await expect.poll(() => coco.textContent()).toContain('2 images, 2 classes');
        await coco.click();
        await expect.poll(() => app.page.getByTestId('dataset-pane').textContent()).toContain('2 images');
        expect(await app.page.getByTestId('dataset-pane').textContent()).toContain('2 classes');
        await app.page.keyboard.press('Escape');
        await connectRoboflow(app, fake);
        await importRoboflowLink(app);

        const dialog = app.page.getByRole('dialog', { name: 'Import Robot' });

        await dialog.getByRole('status').filter({ hasText: 'preparing version 2' }).waitFor();
        await expectPanelReadable(dialog);
        expect(fake.requests.filter((request) => request.path === '/archive.zip')).toHaveLength(0);
        expect(await datasets(app).getByRole('button').count()).toBe(1);
        fake.advance({ latest: 9, exportReply: undefined });
        await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
        await dialog.waitFor({ state: 'hidden' });
        await showLibrary(app);

        const roboflow = datasets(app).getByRole('button').filter({ hasText: 'project' });

        await expect.poll(() => roboflow.textContent()).toContain('2 images, 2 classes');
        expect(await datasets(app).getByRole('button').count()).toBe(2);
        expect(fake.requests).toContainEqual({ path: '/workspace/project/2/coco', key: 'roboflow_e2e_key' });
        expect(fake.requests).toContainEqual({ path: '/archive.zip', key: null });
        expect(JSON.stringify(await app.page.evaluate(() => localStorage))).not.toContain('roboflow_e2e_key');
        await roboflow.click();
        await expect.poll(() => app.page.getByTestId('dataset-pane').textContent()).toContain('2 classes');

        const imported = await app.page.evaluate(() =>
          (
            window as unknown as {
              __studio: { datasets: () => Array<{ name: string; imageMembers?: Array<{ classes?: string[] }> }> };
            }
          ).__studio.datasets(),
        );

        expect(imported.find((dataset) => dataset.name.includes('project'))?.imageMembers?.[0].classes).toEqual([
          'cup',
          'plate',
        ]);
        expect(fake.requests.map((request) => request.path)).toEqual([
          '/',
          '/workspace/project',
          '/workspace/project/2/coco',
          '/workspace/project/2/coco',
          '/archive.zip',
        ]);
        await app.page.keyboard.press('Escape');
        fake.advance({ latest: 2 });
        await importRoboflowLink(app);
        await dialog.waitFor({ state: 'hidden' });
        await showLibrary(app);
        await expect.poll(() => datasets(app).getByRole('button').count()).toBe(2);
        expect(app.errors).toEqual([]);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});

interface ImportWindow {
  __studioTabs: { list: () => { activeId: string }; select: (id: string) => void };
  __studio: { datasets: () => unknown[] };
}

it('cancels Roboflow checks with Escape and discards a late completion after switching scene tabs', async () => {
  await withRoboflowApp(
    {
      archive: zipSync(cocoImportFiles()),
      exportReply: { status: 202, body: { progress: 25 } },
    },
    async (app, fake) => {
      const page = app.page;
      const dialog = page.getByRole('dialog', { name: 'Import Robot' });
      let release = () => {};

      try {
        await page.setViewportSize({ width: 1240, height: 720 });
        await connectRoboflow(app, fake);
        await openRobotImport(app);
        expect(await dialog.getByRole('button', { name: 'Import', exact: true }).isEnabled()).toBe(false);
        expect(await dialog.getByRole('button', { name: 'Choose Folder' }).isVisible()).toBe(true);
        await expectPanelReadable(dialog);

        const cancelled = holdRoboflowExport(fake);

        release = cancelled.release;
        await page.getByLabel('Robot link').fill('https://universe.roboflow.com/workspace/project');
        await page.keyboard.press('Enter');
        await cancelled.requested;
        await dialog.locator('[class*="animate-spin"]').waitFor();
        expect(await dialog.getByRole('button', { name: 'Import', exact: true }).isEnabled()).toBe(false);
        expect(await dialog.getByRole('button', { name: 'Choose Folder' }).count()).toBe(0);
        await expectPanelReadable(dialog);

        const cancelledReply = page.waitForResponse((response) => response.url().endsWith('/roboflow-import'));

        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
        cancelled.release();
        await (await cancelledReply).finished();
        fake.advance({ beforeExport: undefined });
        await importRoboflowLink(app);
        await dialog.getByRole('status').filter({ hasText: 'preparing version 2' }).waitFor();
        await expectPanelReadable(dialog);

        const continued = holdRoboflowExport(fake);
        const original = await page.evaluate(() => (window as unknown as ImportWindow).__studioTabs.list().activeId);

        release = continued.release;
        fake.advance({ exportReply: undefined });
        await dialog.getByRole('button', { name: 'Continue', exact: true }).focus();
        await page.keyboard.press('Enter');
        await continued.requested;
        expect(await dialog.getByRole('button', { name: 'Continue', exact: true }).isEnabled()).toBe(false);
        await page.keyboard.press('ControlOrMeta+t');
        await expect
          .poll(() => page.evaluate(() => (window as unknown as ImportWindow).__studioTabs.list().activeId))
          .not.toBe(original);
        await dialog.waitFor({ state: 'hidden' });

        const completedReply = page.waitForResponse((response) => response.url().endsWith('/roboflow-import'));

        continued.release();
        await (await completedReply).finished();
        await page.evaluate((id) => (window as unknown as ImportWindow).__studioTabs.select(id), original);
        await dialog.waitFor();
        expect(await dialog.getByLabel('Robot link').inputValue()).toBe('');
        expect(await dialog.getByRole('status').count()).toBe(0);
        expect(await page.evaluate(() => (window as unknown as ImportWindow).__studio.datasets())).toEqual([]);
        expect(await page.getByTestId('dataset-pane').count()).toBe(0);
        expect(app.errors).toEqual([]);
      } finally {
        release();
      }
    },
  );
});
