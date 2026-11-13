import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ProjectSettings } from '../src/types/robotics';
import { fakeArm, ONSHAPE_LINK, signedIn } from './fakeOnshape';
import { openApp, type App } from './harness';

let app: App;

const project = () =>
  app.page.evaluate(
    () =>
      (window as unknown as { __studio: { sceneRecord: () => { project: ProjectSettings } } }).__studio.sceneRecord()
        .project,
  );

async function recordedImport() {
  const account = await signedIn(fakeArm());
  const { model, files } = await account.importAssembly({ link: ONSHAPE_LINK });

  return {
    model,
    files: Object.fromEntries(
      Object.entries(files as Record<string, Uint8Array>).map(([k, v]) => [k, Buffer.from(v).toString('base64')]),
    ),
  };
}

beforeAll(async () => {
  app = await openApp({ 'onshape-import': await recordedImport() });
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Onshape import', () => {
  it('imports an assembly from its link as a rig whose hinge Pose moves', async () => {
    await app.page.keyboard.press('Meta+k');
    await app.page.keyboard.type('Import Robot');
    await app.page.keyboard.press('Enter');
    await app.page.getByLabel('Robot link').fill(ONSHAPE_LINK);
    await app.page.getByRole('button', { name: 'Import', exact: true }).click();

    await expect.poll(async () => (await project()).joints?.length ?? 0, { timeout: 30000 }).toBe(1);
    expect(app.posts.find((p) => p.route === 'onshape-import')?.body).toMatchObject({ arg: { link: ONSHAPE_LINK } });

    const [hinge] = (await project()).joints!;

    expect(hinge.type).toBe('revolute');

    await app.page.getByRole('status').getByRole('button', { name: 'Pose', exact: true }).click();

    const slider = app.page.locator(`[data-joint="${hinge.id}"] input[type="range"]`);

    await slider.focus();

    for (let i = 0; i < 5; i++) await slider.press('ArrowRight');

    await expect.poll(async () => (await project()).pose?.values[hinge.id] ?? 0, { timeout: 10000 }).toBe(5);
  });
});
