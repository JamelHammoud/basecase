import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ProjectSettings } from '../src/types/robotics';
import { deskArmFiles, deskArmZip, hubListing } from '../src/utils/robotImport/robotImport.fixtures';
import { fusionArmFiles } from '../src/utils/robotImport/xacro.fixtures';
import { openApp, type App } from './harness';

let app: App;

const jointCount = () =>
  app.page.evaluate(
    () =>
      (window as unknown as { __studio: { sceneRecord: () => { project: ProjectSettings } } }).__studio.sceneRecord()
        .project.joints?.length ?? 0,
  );

async function serveRepo() {
  const files = { ...deskArmFiles('a'), ...deskArmFiles('b') };
  const tree = Object.keys(files).map((path) => ({ path, type: 'blob' }));
  const raw = 'https://raw.githubusercontent.com/me/arms/HEAD/';

  await app.page.route('https://api.github.com/repos/me/arms/git/trees/HEAD?recursive=1', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tree }) }),
  );
  await app.page.route(`${raw}**`, (route) => {
    const bytes = files[decodeURIComponent(route.request().url().slice(raw.length))];

    return bytes ? route.fulfill({ status: 200, body: Buffer.from(bytes) }) : route.fulfill({ status: 404 });
  });
}

async function serveHub() {
  const files = deskArmFiles('desk_arm_description');
  const resolve = 'https://huggingface.co/me/desk-arm/resolve/main/';

  await app.page.route('https://huggingface.co/api/models/me/desk-arm/tree/main?recursive=true', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: hubListing(files) }),
  );
  await app.page.route(`${resolve}**`, (route) => {
    const bytes = files[decodeURIComponent(route.request().url().slice(resolve.length))];

    return bytes ? route.fulfill({ status: 200, body: Buffer.from(bytes) }) : route.fulfill({ status: 404 });
  });
}

async function openImportRobot() {
  await app.page.keyboard.press('Meta+k');
  await app.page.keyboard.type('Import Robot');
  await app.page.keyboard.press('Enter');
}

async function importLink(link: string) {
  await openImportRobot();
  await app.page.getByLabel('Robot link').fill(link);
  await app.page.keyboard.press('Enter');
}

function folderOf(files: Record<string, Uint8Array>): string {
  const root = mkdtempSync(join(tmpdir(), 'basecase-xacro-'));

  for (const [path, bytes] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), bytes);
  }

  return root;
}

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('robot import', () => {
  it('inserts a zip dropped on the canvas at once, without a sheet', async () => {
    const zip = Buffer.from(deskArmZip()).toString('base64');
    const before = await jointCount();

    await app.page.evaluate((b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dataTransfer = new DataTransfer();
      const target = document.querySelector('main canvas') ?? document.querySelector('main')!;
      const box = target.getBoundingClientRect();
      const at = { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 };

      dataTransfer.items.add(new File([bytes], 'desk_arm.zip', { type: 'application/zip' }));

      for (const type of ['dragenter', 'dragover', 'drop']) {
        target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer, ...at }));
      }
    }, zip);

    await expect.poll(jointCount, { timeout: 30000 }).toBe(before + 2);
    expect(await app.page.getByRole('dialog', { name: 'Import Robot' }).count()).toBe(0);
  });

  it('imports a fusion2urdf xacro package from Choose Folder', async () => {
    const root = folderOf(fusionArmFiles());
    const before = await jointCount();

    try {
      await openImportRobot();
      await app.page.locator('input[webkitdirectory]').setInputFiles(join(root, 'desk_arm_description'));

      await expect.poll(jointCount, { timeout: 30000 }).toBe(before + 2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('lists the robots in a repo and imports the one picked', async () => {
    await serveRepo();

    const before = await jointCount();

    await importLink('github.com/me/arms');
    await app.page.getByRole('radio', { name: 'b/urdf/desk_arm.urdf' }).click({ timeout: 30000 });
    await app.page.getByRole('button', { name: 'Import', exact: true }).click();

    await expect.poll(jointCount, { timeout: 30000 }).toBe(before + 2);
  });

  it('imports a robot from a Hugging Face Hub repo link', async () => {
    await serveHub();

    const before = await jointCount();

    await importLink('huggingface.co/me/desk-arm');

    await expect.poll(jointCount, { timeout: 30000 }).toBe(before + 2);
  });
});
