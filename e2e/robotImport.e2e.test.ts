import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ProjectSettings } from '../src/types/robotics';
import { deskArmFiles, deskArmZip } from '../src/utils/robotImport/robotImport.fixtures';
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

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('robot import', () => {
  it('inserts the robot when its zip is dropped on the canvas', async () => {
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
  });

  it('lists the robots in a repo and imports the one picked', async () => {
    await serveRepo();

    const before = await jointCount();

    await app.page.keyboard.press('Meta+k');
    await app.page.keyboard.type('Import Robot');
    await app.page.keyboard.press('Enter');
    await app.page.getByPlaceholder('GitHub, URDF, MJCF or zip link').fill('github.com/me/arms');
    await app.page.keyboard.press('Enter');
    await app.page.getByRole('radio', { name: 'b/urdf/desk_arm.urdf' }).click({ timeout: 30000 });
    await app.page.getByRole('button', { name: 'Import', exact: true }).click();

    await expect.poll(jointCount, { timeout: 30000 }).toBe(before + 2);
  });
});
